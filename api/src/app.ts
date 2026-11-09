import cors from 'cors';
import express, { Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { envConfig } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createFirestorePreparedRouter } from './routes/firestore-prepared.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import {
  defaultFirestoreRepositories,
  FirestoreRepositoryBundle,
} from './repositories/firestore.repository.js';
import { defaultTokenVerifier } from './services/auth-verification.service.js';
import {
  defaultFirestoreUserRestService,
  FirestoreUserRestService,
} from './services/firestore-user-rest.service.js';
import { TokenVerifier } from './types/auth.types.js';

export interface CreateAppOptions {
  tokenVerifier?: TokenVerifier;
  firestoreRepositories?: FirestoreRepositoryBundle;
  firestoreUserRestService?: FirestoreUserRestService;
  allowedOrigins?: string[];
  enableRateLimit?: boolean;
}

/**
 * Creates the Express REST API application with Helmet security headers,
 * restricted CORS, JSON body size limits, rate limiting, and centralized error handling.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const verifier = options.tokenVerifier ?? defaultTokenVerifier;
  const repos = options.firestoreRepositories ?? defaultFirestoreRepositories;
  const userRestService = options.firestoreUserRestService ?? defaultFirestoreUserRestService;
  const allowedOrigins = options.allowedOrigins ?? envConfig.allowedOrigins;
  const enableRateLimit = options.enableRateLimit ?? true;

  // Trust proxy for reverse-proxy deployments (e.g., Cloud Run / Google AI Studio / Nginx)
  // so Express and express-rate-limit correctly identify clients behind proxies
  app.set('trust proxy', 1);

  // Disable X-Powered-By and apply Helmet security headers
  app.disable('x-powered-by');
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // Restricted CORS configuration — only explicitly configured origins are permitted
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin / server-to-server / proxy requests without an Origin header
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS_ORIGIN_DENIED: ${origin}`));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
      maxAge: 600,
    })
  );

  // Strict JSON body parsing limit
  app.use(express.json({ limit: '64kb' }));

  // Rate limiting for /api/* routes
  if (enableRateLimit) {
    const apiLimiter = rateLimit({
      windowMs: envConfig.rateLimitWindowMs,
      max: envConfig.rateLimitMaxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      validate: {
        xForwardedForHeader: false,
        forwardedHeader: false,
      },
      message: {
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests to the LinisGo Finder API. Please wait and try again.',
        timestamp: new Date().toISOString(),
      },
    });
    app.use('/api', apiLimiter);
  }

  // API Routes
  app.use('/api/health', createHealthRouter());
  app.use('/api/auth', createAuthRouter(verifier));
  app.use('/api', createFirestorePreparedRouter(verifier, repos, userRestService));

  // 404 & Centralized Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
