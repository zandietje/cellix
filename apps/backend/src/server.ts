import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './lib/env.js';

export async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // CORS for Office.js
  await fastify.register(cors, {
    origin: [
      'https://localhost:3000',
      // Office.js domains
      /\.officeapps\.live\.com$/,
      /\.office\.com$/,
      /\.office365\.com$/,
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Request logging
  fastify.addHook('onRequest', async (request) => {
    request.log.info(
      { url: request.url, method: request.method },
      'incoming request'
    );
  });

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    reply.status(error.statusCode || 500).send({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message:
          env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : error.message,
      },
    });
  });

  return fastify;
}
