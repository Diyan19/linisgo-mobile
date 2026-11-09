export interface HealthApiResponse {
  status: 'ok';
  service: string;
  timestamp: string;
  runtime: {
    nodeVersion: string;
    environment: string;
    uptimeSeconds: number;
  };
  firebaseAdmin: {
    projectId: string;
    sdkInitialized: boolean;
    credentialsAvailable: boolean;
    connectionValidated: boolean;
    status: 'connected' | 'blocked_missing_credentials' | 'error';
    message: string;
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
  authorizationBoundary: {
    role: 'user' | 'admin';
    accountStateEnforced: boolean;
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
    | 'unauthorized_401'
    | 'blocked_missing_backend_credentials_503'
    | 'unreachable'
    | 'error';
  httpStatusCode: number | null;
  errorCode: string | null;
  message: string;
  authenticatedUser: {
    displayName: string | null;
    email: string | null;
    emailVerified: boolean | null;
  } | null;
}
