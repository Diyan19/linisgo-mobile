import { app } from './app.js';
import { envConfig } from './config/env.js';
import { getFirebaseAdminDiagnostics } from './config/firebase-admin.js';

async function startServer(): Promise<void> {
  const diagnostics = await getFirebaseAdminDiagnostics();

  const server = app.listen(envConfig.port, envConfig.host, () => {
    console.log(
      `[LinisGo Finder Private API] Listening on http://${envConfig.host}:${envConfig.port}/api (env: ${envConfig.nodeEnv})`
    );
    console.log(
      `[LinisGo Finder Private API] Firebase Admin Status (${diagnostics.projectId}): ${diagnostics.status}`
    );
  });

  const shutdown = (signal: string) => {
    console.log(`[LinisGo Finder Private API] Received ${signal}. Shutting down cleanly...`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch(err => {
  console.error(
    '[LinisGo Finder Private API] Fatal startup error:',
    err instanceof Error ? err.message : 'Unknown error'
  );
  process.exit(1);
});
