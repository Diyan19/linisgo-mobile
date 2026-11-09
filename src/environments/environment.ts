export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export const environment = {
  production: false,
  appName: 'LinisGo Finder',
  /**
   * Official Firebase Web SDK configuration for the existing LinisGo Finder project:
   * - Project ID: linisgo-mobile
   * - Auth Domain: linisgo-mobile.firebaseapp.com
   * - Web App ID: 1:932812492190:web:20c4c8982f8c6adfa5da8f
   * - Billing Plan: Spark Free Plan Only
   *
   * Note: Only public Firebase Web SDK identifiers belong here.
   * Never place Firebase Admin SDK private keys or backend secrets in frontend files.
   */
  firebase: {
    apiKey: '',
    authDomain: 'linisgo-mobile.firebaseapp.com',
    projectId: 'linisgo-mobile',
    storageBucket: 'linisgo-mobile.firebasestorage.app',
    messagingSenderId: '932812492190',
    appId: '1:932812492190:web:20c4c8982f8c6adfa5da8f',
  } satisfies FirebaseWebConfig,
  /**
   * Task 1.1 Private REST API Configuration:
   * - `apiBaseUrl`: '/api' (proxied by Angular dev server on port 3000 -> http://127.0.0.1:3001/api)
   * - `localDirectApiBaseUrl`: 'http://localhost:3001/api' (direct local Node.js Express server URL)
   */
  apiBaseUrl: '/api',
  localDirectApiBaseUrl: 'http://localhost:3001/api',
};
