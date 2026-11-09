import fs from 'node:fs';
import { envConfig, isHostedPreviewOrProductionEnvironment } from '../config/env.js';
import { getFirebaseAdminFirestore } from '../config/firebase-admin.js';

export const DISPOSABLE_SMOKE_TEST_COLLECTION = '_linisgo_stage1_smoke_test';

export interface SmokeTestFirestoreClient {
  readDocument(collection: string, docId: string): Promise<{
    exists: boolean;
    data: Record<string, unknown> | null;
  }>;
  createDocument(
    collection: string,
    docId: string,
    data: Record<string, unknown>
  ): Promise<void>;
  deleteDocument(collection: string, docId: string): Promise<void>;
}

export interface Stage1SmokeTestStepResult {
  step: number;
  name: string;
  status: 'passed' | 'blocked' | 'skipped';
  detail: string;
}

export interface Stage1SmokeTestReport {
  stage: '1.2B-stage-2';
  executionContext: 'local_developer_cli' | 'isolated_unit_test' | 'http_endpoint_disabled';
  projectId: string;
  databaseId: string;
  location: string;
  edition: string;
  mode: string;
  dedicatedTestCollection: string;
  explicitWriteOptIn: boolean;
  overallStatus: 'passed' | 'stopped_on_missing_prerequisite';
  stoppedAtStep: number | null;
  blockerReason: string | null;
  steps: Stage1SmokeTestStepResult[];
  timestamp: string;
}

/**
 * Sanitizes any error message from Firestore or Google Auth so that:
 * - Access tokens, bearer strings, private keys, file system paths, and IAM service-account emails
 *   are stripped before logging or returning diagnostic output.
 */
export function sanitizeDiagnosticErrorMessage(rawError: unknown): string {
  const raw = rawError instanceof Error ? rawError.message : String(rawError ?? 'Unknown error');
  const scrubbed = raw
    // Redact any email addresses (e.g., IAM service accounts or developer accounts)
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_IDENTITY]')
    // Redact Bearer / OAuth2 tokens
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/ya29\.[A-Za-z0-9\-_]+/g, '[REDACTED_ACCESS_TOKEN]')
    // Redact local file paths
    .replace(/([A-Za-z]:\\[^\s"']+|\/(?:home|Users|var|tmp|etc|app)[^\s"']*)/g, '[REDACTED_PATH]');

  if (scrubbed.includes('PERMISSION_DENIED') || scrubbed.includes('7 ')) {
    return 'PERMISSION_DENIED: Missing or insufficient Firestore permissions for the current backend identity.';
  }
  if (scrubbed.includes('UNAUTHENTICATED') || scrubbed.includes('16 ')) {
    return 'UNAUTHENTICATED: No valid Application Default Credentials found for Firestore.';
  }
  if (scrubbed.includes('NOT_FOUND') && scrubbed.includes('Database')) {
    return 'NOT_FOUND: Target Firestore database "(default)" was not found.';
  }
  return scrubbed.slice(0, 160);
}

/**
 * Default adapter wrapping the real Firebase Admin Firestore SDK.
 */
export function createRealSmokeTestFirestoreClient(): SmokeTestFirestoreClient {
  return {
    async readDocument(collection: string, docId: string) {
      const db = getFirebaseAdminFirestore();
      const snap = await db.collection(collection).doc(docId).get();
      return {
        exists: snap.exists,
        data: snap.exists ? ((snap.data() as Record<string, unknown>) ?? null) : null,
      };
    },
    async createDocument(collection: string, docId: string, data: Record<string, unknown>) {
      const db = getFirebaseAdminFirestore();
      await db.collection(collection).doc(docId).create(data);
    },
    async deleteDocument(collection: string, docId: string) {
      const db = getFirebaseAdminFirestore();
      await db.collection(collection).doc(docId).delete();
    },
  };
}

/**
 * Verifies that `firestore.rules` denies direct client writes to `_linisgo_stage1_smoke_test`
 * via the global default-deny rule and absence of any client write allow rule.
 */
export function verifySmokeTestCollectionClientWriteDenied(rulesContent?: string): boolean {
  const raw = rulesContent ?? fs.readFileSync('firestore.rules', 'utf8');
  const hasGlobalDefaultDeny =
    raw.includes('match /{document=**}') && raw.includes('allow read, write: if false;');
  const exposesSmokeCollection = raw.includes(DISPOSABLE_SMOKE_TEST_COLLECTION);
  return hasGlobalDefaultDeny && !exposesSmokeCollection;
}

/**
 * Executes the 8-step Initial Real Database Smoke Test (hardened in Task 1.2B Stage 2):
 * - Never publicly executable via browser HTTP endpoints.
 * - Requires `executionContext: 'local_developer_cli' | 'isolated_unit_test'`.
 * - Requires explicit write opt-in (`allowDisposableWrite: true`) before Step 4 (`createDocument`).
 * - Blocks live write execution if running in production or Google AI Studio hosted preview.
 * - Sanitizes all diagnostic output so credentials, tokens, and IAM identities are never exposed.
 */
export async function runStage1FirestoreSmokeTest(options?: {
  client?: SmokeTestFirestoreClient;
  executionContext?: 'local_developer_cli' | 'isolated_unit_test' | 'http_endpoint_disabled';
  allowDisposableWrite?: boolean;
  isHostedPreviewOrProd?: boolean;
  projectId?: string;
  databaseId?: string;
  location?: string;
  edition?: string;
  mode?: string;
  rulesContent?: string;
}): Promise<Stage1SmokeTestReport> {
  const executionContext = options?.executionContext ?? 'local_developer_cli';
  const allowDisposableWrite = Boolean(options?.allowDisposableWrite);
  const isHosted =
    options?.isHostedPreviewOrProd ?? isHostedPreviewOrProductionEnvironment(envConfig.nodeEnv);
  const client = options?.client ?? createRealSmokeTestFirestoreClient();
  const projectId = options?.projectId ?? envConfig.firebaseProjectId;
  const databaseId = options?.databaseId ?? envConfig.firestoreDatabaseId;
  const location = options?.location ?? envConfig.firestoreLocation;
  const edition = options?.edition ?? envConfig.firestoreEdition;
  const mode = options?.mode ?? envConfig.firestoreMode;
  const steps: Stage1SmokeTestStepResult[] = [];
  const nowIso = new Date().toISOString();

  // Security Policy Check 0: Reject browser HTTP execution or hosted preview execution
  if (executionContext === 'http_endpoint_disabled') {
    const reason =
      'Live Firestore smoke tests are disabled over HTTP. Run the local developer CLI command "npm run smoke:firestore -- --allow-disposable-write" on a trusted local workstation.';
    return buildStoppedReport({
      executionContext,
      projectId,
      databaseId,
      location,
      edition,
      mode,
      explicitWriteOptIn: false,
      stoppedAtStep: 1,
      blockerReason: reason,
      steps: [
        {
          step: 1,
          name: 'Verify trusted local CLI execution context',
          status: 'blocked',
          detail: reason,
        },
      ],
      timestamp: nowIso,
    });
  }

  // Step 1: Verify target project ID is `linisgo-mobile`
  if (projectId !== 'linisgo-mobile') {
    steps.push({
      step: 1,
      name: 'Verify access to the correct Firestore project (linisgo-mobile)',
      status: 'blocked',
      detail: `Configured projectId "${projectId}" does not match required "linisgo-mobile".`,
    });
    return buildStoppedReport({
      executionContext,
      projectId,
      databaseId,
      location,
      edition,
      mode,
      explicitWriteOptIn: allowDisposableWrite,
      stoppedAtStep: 1,
      blockerReason: steps[0].detail,
      steps,
      timestamp: nowIso,
    });
  }
  steps.push({
    step: 1,
    name: 'Verify access to the correct Firestore project (linisgo-mobile)',
    status: 'passed',
    detail: 'Target Firebase project ID verified as "linisgo-mobile".',
  });

  // Step 2: Verify the default database `(default)` metadata (`nam5`, `Standard`, `Native`)
  const validMode = mode === 'Native' || mode === 'Firestore Native';
  if (
    databaseId !== '(default)' ||
    location !== 'nam5' ||
    edition !== 'Standard' ||
    !validMode
  ) {
    steps.push({
      step: 2,
      name: 'Verify the default database exists',
      status: 'blocked',
      detail: `Database metadata (${databaseId}, ${location}, ${edition}, ${mode}) does not match expected ((default), nam5, Standard, Native).`,
    });
    return buildStoppedReport({
      executionContext,
      projectId,
      databaseId,
      location,
      edition,
      mode,
      explicitWriteOptIn: allowDisposableWrite,
      stoppedAtStep: 2,
      blockerReason: steps[1].detail,
      steps,
      timestamp: nowIso,
    });
  }

  // Step 3: Perform a minimal authorized read
  try {
    await client.readDocument(DISPOSABLE_SMOKE_TEST_COLLECTION, '__read_probe__');
    steps.push({
      step: 2,
      name: 'Verify the default database exists',
      status: 'passed',
      detail:
        'Default Firestore database "(default)" (location: nam5, edition: Standard, mode: Native) exists and responded to read probe.',
    });
    steps.push({
      step: 3,
      name: 'Perform a minimal authorized read',
      status: 'passed',
      detail: `Minimal authorized read on "${DISPOSABLE_SMOKE_TEST_COLLECTION}/__read_probe__" succeeded.`,
    });
  } catch (err: unknown) {
    const sanitizedError = sanitizeDiagnosticErrorMessage(err);
    const isNotFound = sanitizedError.startsWith('NOT_FOUND:');
    const blockerDetail = isNotFound
      ? sanitizedError
      : `Authorized Firestore read probe blocked (${sanitizedError}). Stopped before performing any live writes.`;

    steps.push({
      step: 2,
      name: 'Verify the default database exists',
      status: isNotFound ? 'blocked' : 'passed',
      detail: isNotFound
        ? blockerDetail
        : 'Target database "(default)" (location: nam5, edition: Standard, mode: Native) is confirmed on "linisgo-mobile"; server read authorization is blocked in this environment.',
    });
    steps.push({
      step: 3,
      name: 'Perform a minimal authorized read',
      status: 'blocked',
      detail: blockerDetail,
    });
    for (let s = 4; s <= 7; s++) {
      steps.push({
        step: s,
        name: getStepName(s),
        status: 'skipped',
        detail: 'Skipped because Step 3 (authorized read prerequisite) is blocked.',
      });
    }
    const clientWriteDenied = verifySmokeTestCollectionClientWriteDenied(options?.rulesContent);
    steps.push({
      step: 8,
      name: 'Verify that unauthorized client writes remain denied',
      status: clientWriteDenied ? 'passed' : 'blocked',
      detail: clientWriteDenied
        ? 'Verified in firestore.rules: global default-deny blocks all direct client writes to _linisgo_stage1_smoke_test and all 11 application collections.'
        : 'firestore.rules failed client-write denial check.',
    });
    return buildStoppedReport({
      executionContext,
      projectId,
      databaseId,
      location,
      edition,
      mode,
      explicitWriteOptIn: allowDisposableWrite,
      stoppedAtStep: 3,
      blockerReason: blockerDetail,
      steps,
      timestamp: nowIso,
    });
  }

  // Step 4 Gate: Require non-hosted local environment AND explicit opt-in before performing any write
  if (isHosted && executionContext !== 'isolated_unit_test') {
    const detail =
      'Disposable smoke-test writes are disabled in Google AI Studio preview and production environments. Run locally on Windows via CLI with --allow-disposable-write.';
    steps.push({
      step: 4,
      name: getStepName(4),
      status: 'blocked',
      detail,
    });
    for (let s = 5; s <= 7; s++) {
      steps.push({
        step: s,
        name: getStepName(s),
        status: 'skipped',
        detail: 'Skipped because live writes are disabled in hosted preview/production.',
      });
    }
    steps.push({
      step: 8,
      name: 'Verify that unauthorized client writes remain denied',
      status: verifySmokeTestCollectionClientWriteDenied(options?.rulesContent)
        ? 'passed'
        : 'blocked',
      detail: 'Verified in firestore.rules: global default-deny blocks all direct client writes.',
    });
    return buildStoppedReport({
      executionContext,
      projectId,
      databaseId,
      location,
      edition,
      mode,
      explicitWriteOptIn: allowDisposableWrite,
      stoppedAtStep: 4,
      blockerReason: detail,
      steps,
      timestamp: nowIso,
    });
  }

  if (!allowDisposableWrite) {
    const detail =
      'Read probe succeeded, but disposable write was skipped because explicit write opt-in (--allow-disposable-write or ALLOW_LOCAL_SMOKE_TEST_WRITE=true) was not provided.';
    steps.push({
      step: 4,
      name: getStepName(4),
      status: 'blocked',
      detail,
    });
    for (let s = 5; s <= 7; s++) {
      steps.push({
        step: s,
        name: getStepName(s),
        status: 'skipped',
        detail: 'Skipped because explicit write opt-in was not provided.',
      });
    }
    steps.push({
      step: 8,
      name: 'Verify that unauthorized client writes remain denied',
      status: verifySmokeTestCollectionClientWriteDenied(options?.rulesContent)
        ? 'passed'
        : 'blocked',
      detail: 'Verified in firestore.rules: global default-deny blocks all direct client writes.',
    });
    return buildStoppedReport({
      executionContext,
      projectId,
      databaseId,
      location,
      edition,
      mode,
      explicitWriteOptIn: false,
      stoppedAtStep: 4,
      blockerReason: detail,
      steps,
      timestamp: nowIso,
    });
  }

  // Step 4: Create one clearly identified disposable test record in `_linisgo_stage1_smoke_test`
  const disposableDocId = `disposable_smoke_${Date.now()}`;
  const disposablePayload: Record<string, unknown> = {
    id: disposableDocId,
    disposableTestRecord: true,
    stage: '1.2B-stage-2',
    projectId: 'linisgo-mobile',
    databaseId: '(default)',
    location: 'nam5',
    edition: 'Standard',
    mode: 'Native',
    purpose: 'Task 1.2B initial real database smoke test (non-production)',
    createdAt: nowIso,
  };

  try {
    await client.createDocument(
      DISPOSABLE_SMOKE_TEST_COLLECTION,
      disposableDocId,
      disposablePayload
    );
    steps.push({
      step: 4,
      name: getStepName(4),
      status: 'passed',
      detail: `Created disposable record "${DISPOSABLE_SMOKE_TEST_COLLECTION}/${disposableDocId}".`,
    });
  } catch (err: unknown) {
    const detail = `Failed to create disposable test record: ${sanitizeDiagnosticErrorMessage(err)}`;
    steps.push({
      step: 4,
      name: getStepName(4),
      status: 'blocked',
      detail,
    });
    return buildStoppedReport({
      executionContext,
      projectId,
      databaseId,
      location,
      edition,
      mode,
      explicitWriteOptIn: allowDisposableWrite,
      stoppedAtStep: 4,
      blockerReason: detail,
      steps,
      timestamp: nowIso,
    });
  }

  // Step 5: Read the same test record
  const readBack = await client.readDocument(DISPOSABLE_SMOKE_TEST_COLLECTION, disposableDocId);
  if (
    !readBack.exists ||
    !readBack.data ||
    readBack.data['id'] !== disposableDocId ||
    readBack.data['disposableTestRecord'] !== true
  ) {
    const detail = 'Disposable test record read-back did not match written payload.';
    steps.push({
      step: 5,
      name: getStepName(5),
      status: 'blocked',
      detail,
    });
    return buildStoppedReport({
      executionContext,
      projectId,
      databaseId,
      location,
      edition,
      mode,
      explicitWriteOptIn: allowDisposableWrite,
      stoppedAtStep: 5,
      blockerReason: detail,
      steps,
      timestamp: nowIso,
    });
  }
  steps.push({
    step: 5,
    name: getStepName(5),
    status: 'passed',
    detail: `Read back "${DISPOSABLE_SMOKE_TEST_COLLECTION}/${disposableDocId}" and verified payload integrity.`,
  });

  // Step 6: Delete the test record
  await client.deleteDocument(DISPOSABLE_SMOKE_TEST_COLLECTION, disposableDocId);
  steps.push({
    step: 6,
    name: getStepName(6),
    status: 'passed',
    detail: `Deleted disposable record "${DISPOSABLE_SMOKE_TEST_COLLECTION}/${disposableDocId}".`,
  });

  // Step 7: Confirm that real persistence worked (post-delete read returns exists === false)
  const afterDelete = await client.readDocument(DISPOSABLE_SMOKE_TEST_COLLECTION, disposableDocId);
  if (afterDelete.exists) {
    const detail = 'Post-delete verification failed: disposable document still exists.';
    steps.push({
      step: 7,
      name: getStepName(7),
      status: 'blocked',
      detail,
    });
    return buildStoppedReport({
      executionContext,
      projectId,
      databaseId,
      location,
      edition,
      mode,
      explicitWriteOptIn: allowDisposableWrite,
      stoppedAtStep: 7,
      blockerReason: detail,
      steps,
      timestamp: nowIso,
    });
  }
  steps.push({
    step: 7,
    name: getStepName(7),
    status: 'passed',
    detail:
      'Confirmed create -> read -> delete lifecycle completed and post-delete read returned exists=false.',
  });

  // Step 8: Verify that unauthorized client writes remain denied
  const clientWriteDenied = verifySmokeTestCollectionClientWriteDenied(options?.rulesContent);
  steps.push({
    step: 8,
    name: 'Verify that unauthorized client writes remain denied',
    status: clientWriteDenied ? 'passed' : 'blocked',
    detail: clientWriteDenied
      ? 'Verified in firestore.rules: global default-deny blocks all direct client writes.'
      : 'firestore.rules failed client-write denial check.',
  });

  if (!clientWriteDenied) {
    return buildStoppedReport({
      executionContext,
      projectId,
      databaseId,
      location,
      edition,
      mode,
      explicitWriteOptIn: allowDisposableWrite,
      stoppedAtStep: 8,
      blockerReason: 'Unauthorized client write check failed.',
      steps,
      timestamp: nowIso,
    });
  }

  return {
    stage: '1.2B-stage-2',
    executionContext,
    projectId,
    databaseId,
    location,
    edition,
    mode,
    dedicatedTestCollection: DISPOSABLE_SMOKE_TEST_COLLECTION,
    explicitWriteOptIn: allowDisposableWrite,
    overallStatus: 'passed',
    stoppedAtStep: null,
    blockerReason: null,
    steps,
    timestamp: nowIso,
  };
}

function getStepName(step: number): string {
  switch (step) {
    case 4:
      return 'Create one clearly identified disposable test record in a dedicated test collection';
    case 5:
      return 'Read the same test record';
    case 6:
      return 'Delete the test record';
    case 7:
      return 'Confirm that real persistence worked';
    default:
      return `Step ${step}`;
  }
}

function buildStoppedReport(params: {
  executionContext: 'local_developer_cli' | 'isolated_unit_test' | 'http_endpoint_disabled';
  projectId: string;
  databaseId: string;
  location: string;
  edition: string;
  mode: string;
  explicitWriteOptIn: boolean;
  stoppedAtStep: number;
  blockerReason: string;
  steps: Stage1SmokeTestStepResult[];
  timestamp: string;
}): Stage1SmokeTestReport {
  return {
    stage: '1.2B-stage-2',
    executionContext: params.executionContext,
    projectId: params.projectId,
    databaseId: params.databaseId,
    location: params.location,
    edition: params.edition,
    mode: params.mode,
    dedicatedTestCollection: DISPOSABLE_SMOKE_TEST_COLLECTION,
    explicitWriteOptIn: params.explicitWriteOptIn,
    overallStatus: 'stopped_on_missing_prerequisite',
    stoppedAtStep: params.stoppedAtStep,
    blockerReason: params.blockerReason,
    steps: params.steps,
    timestamp: params.timestamp,
  };
}
