import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../dist/app.js';
import { ApiHttpError } from '../dist/types/auth.types.js';

function startTestServer(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise(res => server.close(() => res())),
      });
    });
    server.on('error', reject);
  });
}

function buildJwtSegment(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

// ============================================================================
// PART A: LIVE EXPRESS SERVER & PRODUCTION FIREBASE ADMIN VERIFIER TESTS
// ============================================================================

test('Live Backend Test 1 & 2: Express server starts independently and GET /api/health reports all 7 separated capabilities', async () => {
  const app = createApp();
  const { baseUrl, close } = await startTestServer(app);

  try {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200, 'GET /api/health must return HTTP 200');

    // Verify Helmet security headers
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);

    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'linisgo-finder-private-api');
    assert.equal(typeof body.timestamp, 'string');
    assert.equal(body.firebaseAdmin.projectId, 'linisgo-mobile');

    // Verify separated capabilities object
    assert.equal(body.capabilities.apiServerReachable, true);
    assert.equal(body.capabilities.firebaseProjectIdConfigured, true);
    assert.equal(body.capabilities.publicSigningKeysAccessible, true);
    assert.equal(body.capabilities.basicIdTokenVerification, 'working');
    assert.equal(body.capabilities.tokenRevocationChecking, 'blocked');
    assert.equal(body.capabilities.privilegedFirebaseAdminAccess, 'blocked');
    assert.equal(body.capabilities.firestoreServerOperations, 'blocked');
    assert.equal(body.firebaseAdmin.status, 'basic_jwt_ready_privileged_blocked');
  } finally {
    await close();
  }
});

test('Live Backend Test 3: GET /api/auth/me without token returns HTTP 401', async () => {
  const app = createApp();
  const { baseUrl, close } = await startTestServer(app);

  try {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(res.status, 401, 'Missing Authorization header must return HTTP 401');
    const body = await res.json();
    assert.equal(body.status, 'error');
    assert.equal(body.code, 'MISSING_AUTH_HEADER');
  } finally {
    await close();
  }
});

test('Live Backend Test 4: GET /api/auth/me with invalid token returns HTTP 401', async () => {
  const app = createApp();
  const { baseUrl, close } = await startTestServer(app);

  try {
    // Case 4a: Non-JWT random string
    const res1 = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer not-a-valid-jwt-token' },
    });
    assert.equal(res1.status, 401, 'Malformed JWT string must return HTTP 401');
    const body1 = await res1.json();
    assert.equal(body1.status, 'error');
    assert.equal(body1.code, 'INVALID_TOKEN');

    // Case 4b: Forged 3-part JWT with future exp but invalid RS256 signature
    const nowSec = Math.floor(Date.now() / 1000);
    const forgedJwt = [
      buildJwtSegment({ alg: 'RS256', typ: 'JWT', kid: 'fake-kid' }),
      buildJwtSegment({
        iss: 'https://securetoken.google.com/linisgo-mobile',
        aud: 'linisgo-mobile',
        sub: 'forged-uid-123',
        iat: nowSec - 60,
        exp: nowSec + 3600,
      }),
      'forgedSignatureBytes12345',
    ].join('.');

    const res2 = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${forgedJwt}` },
    });
    assert.equal(res2.status, 401, 'Forged RS256 JWT must return HTTP 401');
    const body2 = await res2.json();
    assert.equal(body2.status, 'error');
    assert.equal(body2.code, 'INVALID_TOKEN');
  } finally {
    await close();
  }
});

test('Live Backend Test 5: GET /api/auth/me with expired token returns HTTP 401', async () => {
  const app = createApp();
  const { baseUrl, close } = await startTestServer(app);

  try {
    const pastSec = Math.floor(Date.now() / 1000) - 7200;
    const expiredJwt = [
      buildJwtSegment({ alg: 'RS256', typ: 'JWT', kid: 'expired-kid' }),
      buildJwtSegment({
        iss: 'https://securetoken.google.com/linisgo-mobile',
        aud: 'linisgo-mobile',
        sub: 'user-uid-expired',
        iat: pastSec - 3600,
        exp: pastSec,
      }),
      'expiredSignatureBytes',
    ].join('.');

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${expiredJwt}` },
    });
    assert.equal(res.status, 401, 'Expired Firebase ID token must return HTTP 401');
    const body = await res.json();
    assert.equal(body.status, 'error');
    assert.equal(body.code, 'TOKEN_EXPIRED');
  } finally {
    await close();
  }
});

test('Live Backend Test 6: GET /api/auth/me rejects tokens from another Firebase project with HTTP 401', async () => {
  const app = createApp();
  const { baseUrl, close } = await startTestServer(app);

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const wrongProjectJwt = [
      buildJwtSegment({ alg: 'RS256', typ: 'JWT', kid: 'other-project-kid' }),
      buildJwtSegment({
        iss: 'https://securetoken.google.com/other-firebase-project',
        aud: 'other-firebase-project',
        sub: 'other-project-uid-99',
        iat: nowSec - 60,
        exp: nowSec + 3600,
      }),
      'someSignatureBytes',
    ].join('.');

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${wrongProjectJwt}` },
    });
    assert.equal(res.status, 401, 'Token from another Firebase project must be rejected with HTTP 401');
    const body = await res.json();
    assert.equal(body.status, 'error');
    assert.equal(body.code, 'WRONG_PROJECT_TOKEN');
  } finally {
    await close();
  }
});

test('Live Backend Test 7: Error responses never leak private data, stack traces, or tokens; restricted CORS rejects unauthorized origins', async () => {
  const app = createApp({
    allowedOrigins: ['http://localhost:3000'],
  });
  const { baseUrl, close } = await startTestServer(app);

  try {
    const secretToken = 'secret-test-token-value-do-not-echo';
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${secretToken}` },
    });
    assert.equal(res.status, 401);
    const rawText = await res.text();
    assert.ok(!rawText.includes(secretToken), 'Error response must never echo back raw Bearer token');
    assert.ok(!rawText.includes('PRIVATE KEY'), 'Error response must never contain private keys');
    assert.ok(!rawText.includes('at authenticateMiddleware'), 'Error response must never expose stack traces');

    // Verify restricted CORS rejects unauthorized Origin header
    const corsRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://malicious-site.example.com' },
    });
    assert.equal(corsRes.status, 403, 'Unauthorized CORS origin must be rejected with HTTP 403');
  } finally {
    await close();
  }
});

// ============================================================================
// PART B: ISOLATED MIDDLEWARE & CONTROLLER UNIT TESTS (INJECTED TEST DOUBLE)
// ============================================================================

test('Isolated Unit Test 8: GET /api/auth/me with injected TokenVerifier returns HTTP 200, reports privilegedOperationsBlocked: true, and ignores client-supplied UID', async () => {
  const mockVerifier = {
    isBackendCredentialReady: () => true,
    async verifyBearerToken(idToken) {
      if (idToken === 'valid-mock-firebase-token') {
        return {
          uid: 'verified-firebase-uid-999',
          email: 'maria.santos@linisgo.ph',
          emailVerified: true,
          displayName: 'Maria Santos',
          claims: { role: 'user', admin: false },
          verificationMode: 'public_certs_basic',
        };
      }
      throw new ApiHttpError('INVALID_TOKEN', 'Invalid token in unit test', 401);
    },
  };

  const app = createApp({ tokenVerifier: mockVerifier });
  const { baseUrl, close } = await startTestServer(app);

  try {
    // Attempt to spoof uid via query string (?uid=spoofed-uid)
    const res = await fetch(`${baseUrl}/api/auth/me?uid=spoofed-uid`, {
      headers: { Authorization: 'Bearer valid-mock-firebase-token' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.authenticated, true);
    assert.equal(body.user.uid, 'verified-firebase-uid-999', 'Must use UID from verified token, never query param');
    assert.equal(body.user.email, 'maria.santos@linisgo.ph');
    assert.equal(body.user.emailVerified, true);
    assert.equal(body.user.displayName, 'Maria Santos');
    assert.equal(body.verification.mode, 'public_certs_basic');
    assert.equal(body.verification.revocationChecked, false);
    assert.equal(body.verification.privilegedAdminAccess, 'blocked');
    assert.equal(body.authorizationBoundary.role, 'user');
    assert.equal(body.authorizationBoundary.accountStateEnforced, false);
    assert.equal(body.authorizationBoundary.privilegedOperationsBlocked, true);
  } finally {
    await close();
  }
});

test('Isolated Unit Test 9: requireAdmin middleware denies regular authenticated user (HTTP 403) and allows verified custom-claim admin (HTTP 200)', async () => {
  const mockVerifier = {
    isBackendCredentialReady: () => true,
    async verifyBearerToken(idToken) {
      if (idToken === 'regular-user-token') {
        return {
          uid: 'regular-uid-1',
          email: 'user@linisgo.ph',
          emailVerified: true,
          displayName: 'Regular User',
          claims: { tag: 'provider' },
          verificationMode: 'public_certs_basic',
        };
      }
      if (idToken === 'trusted-admin-claim-token') {
        return {
          uid: 'admin-uid-1',
          email: 'admin@linisgo.ph',
          emailVerified: true,
          displayName: 'System Admin',
          claims: { admin: true, role: 'admin' },
          verificationMode: 'privileged_revocation_checked',
        };
      }
      throw new ApiHttpError('INVALID_TOKEN', 'Invalid token', 401);
    },
  };

  const app = createApp({ tokenVerifier: mockVerifier });
  const { baseUrl, close } = await startTestServer(app);

  try {
    const userRes = await fetch(`${baseUrl}/api/auth/admin-check`, {
      headers: { Authorization: 'Bearer regular-user-token' },
    });
    assert.equal(userRes.status, 403, 'Regular user without admin custom claim must receive HTTP 403');

    const adminRes = await fetch(`${baseUrl}/api/auth/admin-check`, {
      headers: { Authorization: 'Bearer trusted-admin-claim-token' },
    });
    assert.equal(adminRes.status, 200, 'Verified admin custom claim must receive HTTP 200');
  } finally {
    await close();
  }
});

test('Live Backend Test 10: Environment configuration matches Task 1.1 values and permits Google AI Studio preview origin via CORS', async () => {
  const { envConfig } = await import('../dist/config/env.js');
  assert.equal(envConfig.host, '0.0.0.0');
  assert.equal(envConfig.port, 3001);
  assert.equal(envConfig.firebaseProjectId, 'linisgo-mobile');
  assert.equal(envConfig.rateLimitWindowMs, 900_000);
  assert.equal(envConfig.rateLimitMaxRequests, 100);
  assert.ok(
    envConfig.allowedOrigins.includes('https://ais-dev-wjmg4lrpgdcyxp2jlqp5km-332623356276.asia-east1.run.app'),
    'allowedOrigins must include Google AI Studio development preview origin'
  );

  const app = createApp();
  const { baseUrl, close } = await startTestServer(app);
  try {
    const aiStudioOrigin = 'https://ais-dev-wjmg4lrpgdcyxp2jlqp5km-332623356276.asia-east1.run.app';
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: aiStudioOrigin },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), aiStudioOrigin);
  } finally {
    await close();
  }
});
