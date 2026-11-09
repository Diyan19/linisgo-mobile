import { FirebaseApp, getApp, getApps, initializeApp, deleteApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { environment, FirebaseWebConfig } from '../../../environments/environment';

export const FIREBASE_RUNTIME_CONFIG_STORAGE_KEY = 'linisgo_firebase_web_config_v1';

let firebaseAppInstance: FirebaseApp | null = null;
let firebaseAuthInstance: Auth | null = null;

/**
 * Resolves the active Firebase Web SDK configuration for `linisgo-mobile`.
 * Automatically loads the Firebase Web API key during application initialization from:
 * 1. `environment.firebase.apiKey`
 * 2. Global `FIREBASE_WEB_API_KEY` (if defined)
 * 3. Browser `localStorage` (`linisgo_firebase_web_config_v1`, or synced from `/api/health`)
 * Keeps `projectId`, `authDomain`, and `appId` pinned to the existing `linisgo-mobile` project.
 */
export function getResolvedFirebaseConfig(): FirebaseWebConfig {
  const base: FirebaseWebConfig = {
    ...environment.firebase,
  };

  if (
    !base.apiKey &&
    typeof FIREBASE_WEB_API_KEY !== 'undefined' &&
    typeof FIREBASE_WEB_API_KEY === 'string' &&
    FIREBASE_WEB_API_KEY.trim().startsWith('AIza')
  ) {
    base.apiKey = FIREBASE_WEB_API_KEY.trim();
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(FIREBASE_RUNTIME_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FirebaseWebConfig>;
        if (parsed.apiKey && typeof parsed.apiKey === 'string' && parsed.apiKey.trim().startsWith('AIza')) {
          base.apiKey = parsed.apiKey.trim();
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }

  // Strictly pin to existing project linisgo-mobile
  base.projectId = 'linisgo-mobile';
  base.authDomain = 'linisgo-mobile.firebaseapp.com';
  base.appId = '1:932812492190:web:20c4c8982f8c6adfa5da8f';
  base.storageBucket = 'linisgo-mobile.firebasestorage.app';
  base.messagingSenderId = '932812492190';

  return base;
}

/**
 * Checks whether the public Firebase Web API Key (`AIza...`) is present and formatted.
 */
export function hasConfiguredFirebaseApiKey(): boolean {
  const cfg = getResolvedFirebaseConfig();
  return Boolean(cfg.apiKey && cfg.apiKey.trim().startsWith('AIza') && cfg.apiKey.trim().length >= 30);
}

/**
 * Parses either a raw Firebase Web API key (`AIza...`) or a full `firebaseConfig` object/snippet
 * and stores only the safe public Web SDK fields in localStorage.
 * Rejects any service-account private key JSON to enforce frontend security rules.
 */
export function saveRuntimeFirebaseWebConfig(input: string): {
  valid: boolean;
  error?: string;
  config?: FirebaseWebConfig;
} {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Please paste your Firebase Web API Key (starts with AIza...) or firebaseConfig snippet.' };
  }

  // Strictly reject service account private keys
  if (
    trimmed.includes('PRIVATE_KEY') ||
    trimmed.includes('private_key') ||
    trimmed.includes('firebase-adminsdk') ||
    trimmed.includes('service_account')
  ) {
    return {
      valid: false,
      error: 'Security Violation Blocked: Never paste a Firebase Admin SDK service-account private key in the frontend. Only use the public Web SDK apiKey (starts with AIza...).',
    };
  }

  const current = getResolvedFirebaseConfig();

  // Case 1: Raw AIza... Web API key
  if (/^AIza[0-9A-Za-z_-]{30,50}$/.test(trimmed)) {
    const updated: FirebaseWebConfig = {
      ...current,
      apiKey: trimmed,
    };
    try {
      localStorage.setItem(FIREBASE_RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    return { valid: true, config: updated };
  }

  // Case 2: Pasted firebaseConfig snippet or JSON
  const apiKeyMatch = trimmed.match(/apiKey\s*:\s*['"]([^'"]+)['"]/) || trimmed.match(/"apiKey"\s*:\s*"([^"]+)"/);
  if (apiKeyMatch && apiKeyMatch[1]?.trim().startsWith('AIza')) {
    const authDomainMatch =
      trimmed.match(/authDomain\s*:\s*['"]([^'"]+)['"]/) || trimmed.match(/"authDomain"\s*:\s*"([^"]+)"/);
    const projectIdMatch =
      trimmed.match(/projectId\s*:\s*['"]([^'"]+)['"]/) || trimmed.match(/"projectId"\s*:\s*"([^"]+)"/);
    const appIdMatch =
      trimmed.match(/appId\s*:\s*['"]([^'"]+)['"]/) || trimmed.match(/"appId"\s*:\s*"([^"]+)"/);

    const updated: FirebaseWebConfig = {
      ...current,
      apiKey: apiKeyMatch[1].trim(),
      authDomain: authDomainMatch?.[1]?.trim() || current.authDomain,
      projectId: projectIdMatch?.[1]?.trim() || current.projectId,
      appId: appIdMatch?.[1]?.trim() || current.appId,
    };

    try {
      localStorage.setItem(FIREBASE_RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    return { valid: true, config: updated };
  }

  return {
    valid: false,
    error: 'Invalid format. Please provide a valid Firebase Web API Key (starting with "AIza") or a firebaseConfig object containing apiKey.',
  };
}

/**
 * Initializes the Firebase App singleton once using the official modular SDK.
 */
export function getOrInitializeFirebaseApp(): FirebaseApp | null {
  if (firebaseAppInstance) {
    return firebaseAppInstance;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseAppInstance = getApp();
    return firebaseAppInstance;
  }

  const config = getResolvedFirebaseConfig();
  if (!config.apiKey || !config.apiKey.trim()) {
    return null;
  }

  firebaseAppInstance = initializeApp(config);
  return firebaseAppInstance;
}

/**
 * Initializes and returns the Firebase Authentication singleton instance.
 */
export function getOrInitializeFirebaseAuth(): Auth | null {
  if (firebaseAuthInstance) {
    return firebaseAuthInstance;
  }

  const app = getOrInitializeFirebaseApp();
  if (!app) {
    return null;
  }

  firebaseAuthInstance = getAuth(app);
  return firebaseAuthInstance;
}

/**
 * Re-initializes Firebase App & Auth if the runtime Web API key is updated.
 */
export async function reinitializeFirebaseWithUpdatedConfig(): Promise<Auth | null> {
  try {
    if (firebaseAppInstance) {
      await deleteApp(firebaseAppInstance);
    } else if (getApps().length > 0) {
      await deleteApp(getApp());
    }
  } catch {
    // Ignore cleanup errors
  }
  firebaseAppInstance = null;
  firebaseAuthInstance = null;
  return getOrInitializeFirebaseAuth();
}
