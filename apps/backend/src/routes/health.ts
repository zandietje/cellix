import { FastifyInstance } from 'fastify';
import type { HealthResponse, ReadyResponse } from '@cellix/shared';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Health check endpoint
   * Returns basic server health status
   */
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.0.1',
    });
  });

  /**
   * Readiness check endpoint
   * Returns detailed status of all dependencies
   */
  fastify.get<{ Reply: ReadyResponse }>('/ready', async (_request, reply) => {
    // For Phase 1, just return ok
    // In later phases, check database, OpenAI, etc.
    const checks: ReadyResponse['checks'] = {
      server: { status: 'ok' },
      // Phase 3+: Add database check
      // database: await checkDatabase(),
      // Phase 3+: Add AI check
      // ai: await checkAI(),
    };

    const allOk = Object.values(checks).every((check) => check.status === 'ok');

    return reply.send({
      status: allOk ? 'ok' : 'not_ready',
      checks,
    });
  });
}
