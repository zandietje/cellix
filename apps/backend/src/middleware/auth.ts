import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../lib/env.js';

/**
 * API key authentication middleware.
 * Skips health check endpoint. Disabled when API_SECRET_KEY is not set (development).
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Skip health check
  if (request.url === '/api/health') return;

  // Skip auth if no secret key configured (development mode)
  if (!env.API_SECRET_KEY) return;

  const apiKey =
    request.headers['x-api-key'] ||
    request.headers.authorization?.replace('Bearer ', '');

  if (!apiKey || apiKey !== env.API_SECRET_KEY) {
    reply.code(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
    });
  }
}
