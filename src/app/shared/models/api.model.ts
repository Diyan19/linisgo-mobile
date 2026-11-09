export type CapabilityStatus = 'working' | 'blocked';

export interface ApiCapabilitiesReport {
  apiServerReachable: boolean;
  firebaseProjectIdConfigured: boolean;
  publicSigningKeysAccessible: boolean;
  basicIdTokenVerification: CapabilityStatus;
  tokenRevocationChecking: CapabilityStatus;
  privilegedFirebaseAdminAccess: CapabilityStatus;
  firestoreServerOperations: CapabilityStatus;
}

export interface HealthApiResponse {
  status: 'ok';
  service: string;
  timestamp: string;
  runtime: {
    nodeVersion: string;
    environment: string;
    uptimeSeconds: number;
  };
  capabilities: ApiCapabilitiesReport;
  firebaseAdmin: {
    projectId: string;
    sdkInitialized: boolean;
    publicSigningKeysAccessible: boolean;
    basicIdTokenVerification: CapabilityStatus;
    tokenRevocationChecking: CapabilityStatus;
    privilegedAdminAccess: CapabilityStatus;
    firestoreServerOperations: CapabilityStatus;
    credentialsAvailable: boolean;
    connectionValidated: boolean;
    status: 'basic_jwt_ready_privileged_blocked' | 'full_privileged_ready' | 'blocked';
    message: string;
  };
  firebaseWebSdk?: {
    projectId: string;
    authDomain: string;
    appId: string;
    storageBucket: string;
    messagingSenderId: string;
    apiKeyConfigured: boolean;
    apiKey?: string;
  };
}

export interface AuthMeApiResponse {
  status: 'ok';
  authenticated: true;
  user: {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
  };
  verification: {
    mode: 'public_certs_basic' | 'privileged_revocation_checked';
    revocationChecked: boolean;
    privilegedAdminAccess: CapabilityStatus;
  };
  authorizationBoundary: {
    role: 'user' | 'admin';
    accountStateEnforced: boolean;
    privilegedOperationsBlocked: boolean;
    note: string;
  };
}

export interface ApiErrorResponse {
  status: 'error';
  code: string;
  message: string;
  timestamp: string;
}

export interface AuthIntegrationDiagnosticResult {
  testedAt: string;
  endpointTested: string;
  apiReachable: boolean;
  healthData: HealthApiResponse | null;
  tokenVerificationStatus:
    | 'verified'
    | 'sign_in_required'
    | 'unauthorized_401'
    | 'blocked_missing_backend_credentials_503'
    | 'unreachable'
    | 'error';
  httpStatusCode: number | null;
  errorCode: string | null;
  message: string;
  uidMatchesFrontendUser: boolean | null;
  authenticatedUser: {
    displayName: string | null;
    email: string | null;
    emailVerified: boolean | null;
  } | null;
}
