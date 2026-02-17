import { buildServer } from './server.js';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { env } from './lib/env.js';

async function main() {
  const server = await buildServer();

  // Register routes
  await server.register(healthRoutes, { prefix: '/api' });
  await server.register(chatRoutes, { prefix: '/api' });

  // Graceful shutdown
  const signals = ['SIGTERM', 'SIGINT'] as const;
  for (const signal of signals) {
    process.on(signal, async () => {
      server.log.info(`${signal} received, shutting down gracefully`);
      await server.close();
      process.exit(0);
    });
  }

  // Start server
  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`Server running at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
