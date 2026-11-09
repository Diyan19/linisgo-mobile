import { FirebaseWebConfig } from './environment';

export const environment = {
  production: true,
  appName: 'LinisGo Finder',
  firebase: {
    apiKey: '',
    authDomain: 'linisgo-mobile.firebaseapp.com',
    projectId: 'linisgo-mobile',
    storageBucket: 'linisgo-mobile.firebasestorage.app',
    messagingSenderId: '932812492190',
    appId: '1:932812492190:web:20c4c8982f8c6adfa5da8f',
  } satisfies FirebaseWebConfig,
  apiBaseUrl: '/api',
  localDirectApiBaseUrl: 'https://localhost:3001/api',
};
