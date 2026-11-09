import { runStage1FirestoreSmokeTest } from '../services/firestore-smoke-test.service.js';

/**
 * Local Developer CLI Runner for Task 1.2B Firestore Smoke Test.
 *
 * Usage on Windows PowerShell:
 *   # Read-only prerequisite & connectivity probe (Steps 1-3 + Step 8):
 *   npx tsx api/src/scripts/run-firestore-smoke-test.ts
 *
 *   # Full 8-step disposable create -> read -> delete smoke test (requires explicit opt-in):
 *   npx tsx api/src/scripts/run-firestore-smoke-test.ts --allow-disposable-write
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const allowDisposableWrite =
    args.includes('--allow-disposable-write') ||
    process.env['ALLOW_LOCAL_SMOKE_TEST_WRITE'] === 'true';

  const report = await runStage1FirestoreSmokeTest({
    executionContext: 'local_developer_cli',
    allowDisposableWrite,
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.overallStatus !== 'passed') {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Smoke test CLI failed: ${msg}\n`);
  process.exitCode = 1;
});
