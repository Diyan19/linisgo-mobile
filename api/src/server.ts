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
      `[LinisGo Finder Private API] Firebase Status (${diagnostics.projectId}): ${diagnostics.status}`
    );
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.log(
        `[LinisGo Finder Private API] Port ${envConfig.port} is already in use by an active API instance.`
      );
      process.exit(0);
    }
    console.error('[LinisGo Finder Private API] Server error:', err.message);
    process.exit(1);
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
