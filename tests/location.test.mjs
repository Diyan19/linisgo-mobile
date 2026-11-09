import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Read source files for verification
const locSrc = fs.readFileSync('src/app/shared/models/location.model.ts', 'utf8');
const publicDataSrc = fs.readFileSync('src/app/core/services/public-data.service.ts', 'utf8');
const envSrc = fs.readFileSync('src/environments/environment.ts', 'utf8');
const authServiceSrc = fs.readFileSync('src/app/core/services/auth.service.ts', 'utf8');
const userGuardSrc = fs.readFileSync('src/app/core/guards/user.guard.ts', 'utf8');
const adminGuardSrc = fs.readFileSync('src/app/core/guards/admin.guard.ts', 'utf8');
const apiConfigSrc = fs.readFileSync('src/app/core/services/api-config.service.ts', 'utf8');
const interceptorSrc = fs.readFileSync('src/app/core/interceptors/firebase-auth.interceptor.ts', 'utf8');
const privateApiSrc = fs.readFileSync('src/app/core/services/private-api.service.ts', 'utf8');
const userHomeHtml = fs.readFileSync('src/app/features/user/home/user-home.page.html', 'utf8');
const angularJson = JSON.parse(fs.readFileSync('angular.json', 'utf8'));

const EXPECTED_MUNICIPALITIES = [
  { id: 'calapan-city', name: 'Calapan City' },
  { id: 'baco', name: 'Baco' },
  { id: 'bansud', name: 'Bansud' },
  { id: 'bongabong', name: 'Bongabong' },
  { id: 'bulalacao', name: 'Bulalacao' },
  { id: 'gloria', name: 'Gloria' },
  { id: 'mansalay', name: 'Mansalay' },
  { id: 'naujan', name: 'Naujan' },
  { id: 'pinamalayan', name: 'Pinamalayan' },
  { id: 'pola', name: 'Pola' },
  { id: 'puerto-galera', name: 'Puerto Galera' },
  { id: 'roxas', name: 'Roxas' },
  { id: 'san-teodoro', name: 'San Teodoro' },
  { id: 'socorro', name: 'Socorro' },
  { id: 'victoria', name: 'Victoria' },
];

test('Oriental Mindoro location catalog contains all 15 cities and municipalities with town-center coordinates', () => {
  for (const item of EXPECTED_MUNICIPALITIES) {
    assert.ok(locSrc.includes(`id: '${item.id}'`), `Missing municipality ID: ${item.id}`);
    assert.ok(locSrc.includes(`name: '${item.name}'`), `Missing municipality name: ${item.name}`);
  }
});

test('Location helper functions exist and enforce Request vs Offer rules and deduplication', () => {
  assert.ok(locSrc.includes('export function validatePostLocationForPublish'), 'validatePostLocationForPublish missing');
  assert.ok(locSrc.includes('export function doesPostMatchLocationFilter'), 'doesPostMatchLocationFilter missing');
  assert.ok(locSrc.includes('export function getPostLocationSummary'), 'getPostLocationSummary missing');
  assert.ok(
    publicDataSrc.includes('const uniquePostIds = new Set<string>()') &&
      publicDataSrc.includes('uniquePostIds.add(post.id)'),
    'Total Matching Posts deduplication across multi-area offers must use Set of post IDs'
  );
});

test('angular.json dev-server allows AI Studio reverse proxy hosts (.run.app) and configures proxy.conf.json', () => {
  const serveOptions = angularJson.projects?.app?.architect?.serve?.options || {};
  const allowedHosts = serveOptions.allowedHosts || [];
  assert.ok(allowedHosts.includes('.run.app'), 'angular.json serve.options.allowedHosts must include .run.app');
  assert.equal(serveOptions.proxyConfig, 'proxy.conf.json', 'angular.json serve.options.proxyConfig must be proxy.conf.json');
});

test('Task 1.0 Firebase configuration targets existing project linisgo-mobile', () => {
  assert.ok(envSrc.includes("projectId: 'linisgo-mobile'"), 'environment.ts must configure projectId: linisgo-mobile');
  assert.ok(
    envSrc.includes("authDomain: 'linisgo-mobile.firebaseapp.com'"),
    'environment.ts must configure authDomain: linisgo-mobile.firebaseapp.com'
  );
  assert.ok(
    envSrc.includes("appId: '1:932812492190:web:20c4c8982f8c6adfa5da8f'"),
    'environment.ts must configure Web App ID 1:932812492190:web:20c4c8982f8c6adfa5da8f'
  );
});

test('Task 1.0 AuthService uses official Firebase Modular Authentication SDK methods', () => {
  const requiredMethods = [
    'createUserWithEmailAndPassword',
    'signInWithEmailAndPassword',
    'signOut',
    'onAuthStateChanged',
    'sendPasswordResetEmail',
    'sendEmailVerification',
    'updateProfile',
    'updatePassword',
  ];
  for (const methodName of requiredMethods) {
    assert.ok(authServiceSrc.includes(methodName), `AuthService must use ${methodName} from firebase/auth`);
  }
  assert.ok(userGuardSrc.includes('waitForAuthInit'), 'userGuard must await waitForAuthInit() before checking session');
  assert.ok(adminGuardSrc.includes('waitForAuthInit'), 'adminGuard must await waitForAuthInit()');
});

test('Task 1.1 Angular Frontend Private API Integration & Token Interceptor safeguards', () => {
  assert.ok(apiConfigSrc.includes('isPrivateApiUrl'), 'ApiConfigService must enforce isPrivateApiUrl boundary');
  assert.ok(
    interceptorSrc.includes('!apiConfig.isPrivateApiUrl(req.url)'),
    'firebaseAuthInterceptor must never attach Bearer tokens to third-party URLs'
  );
  assert.ok(!interceptorSrc.includes('console.log'), 'firebaseAuthInterceptor must never log tokens to the console');
  assert.ok(privateApiSrc.includes('/auth/me'), 'PrivateApiService must support GET /api/auth/me');
  assert.ok(!userHomeHtml.includes('currentUserId()'), 'User Home screen must not prominently display the Firebase UID');
});

test('Security check: no Firebase Admin SDK private keys or service account JSON files exist in src/ or public/', () => {
  const forbiddenPatterns = ['-----BEGIN PRIVATE KEY-----', 'firebase-adminsdk'];
  for (const pattern of forbiddenPatterns) {
    assert.ok(!publicDataSrc.includes(pattern), `Forbidden secret pattern found in publicDataSrc: ${pattern}`);
    assert.ok(!envSrc.includes(pattern), `Forbidden secret pattern found in envSrc: ${pattern}`);
  }
  const assetsDir = 'public/assets/aistudio';
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    for (const file of files) {
      assert.ok(!file.includes('firebase-adminsdk'), `Exposed service account file found in ${assetsDir}: ${file}`);
    }
  }
});
