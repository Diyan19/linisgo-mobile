import { NextFunction, Request, Response } from 'express';
import { ApiErrorResponse, ApiHttpError } from '../types/auth.types.js';

/**
 * 404 Not Found handler for undefined API routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  const payload: ApiErrorResponse = {
    status: 'error',
    code: 'ROUTE_NOT_FOUND',
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  };
  res.status(404).json(payload);
}

/**
 * Centralized Express error handler.
 * Guarantees that private keys, stack traces, environment secrets, and raw tokens
 * are never exposed in HTTP responses.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const timestamp = new Date().toISOString();

  if (err instanceof ApiHttpError) {
    const payload: ApiErrorResponse = {
      status: 'error',
      code: err.code,
      message: err.message,
      timestamp,
    };
    res.status(err.statusCode).json(payload);
    return;
  }

  if (err instanceof Error && err.message.startsWith('CORS_ORIGIN_DENIED')) {
    const payload: ApiErrorResponse = {
      status: 'error',
      code: 'CORS_ORIGIN_DENIED',
      message: 'Origin is not permitted by API CORS policy.',
      timestamp,
    };
    res.status(403).json(payload);
    return;
  }

  const payload: ApiErrorResponse = {
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected server error occurred while processing the request.',
    timestamp,
  };
  res.status(500).json(payload);
}
