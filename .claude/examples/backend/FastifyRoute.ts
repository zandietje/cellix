/**
 * Fastify Route - Example Implementation
 *
 * Pattern for creating API routes with Fastify.
 * Includes validation, error handling, and streaming.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AIService } from '@/services/ai/AIService';
import { ExcelContext } from '@/types';

// =============================================================================
// Request/Response Schemas
// =============================================================================

/**
 * Chat request schema (Zod for validation)
 */
const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  context: z.object({
    selection: z.object({
      address: z.string(),
      values: z.array(z.array(z.unknown())),
      headers: z.array(z.string()),
    }),
    activeSheet: z.string(),
    allSheets: z.array(z.string()),
  }),
  sessionId: z.string().uuid().optional(),
});

type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * Chat response type (for non-streaming)
 */
interface ChatResponse {
  message: string;
  toolCalls?: Array<{
    name: string;
    parameters: Record<string, unknown>;
  }>;
  sessionId: string;
}

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Register chat routes.
 */
export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  const aiService = new AIService();

  /**
   * POST /api/chat - Send a chat message (streaming)
   */
  fastify.post<{
    Body: ChatRequest;
  }>(
    '/chat',
    {
      schema: {
        body: {
          type: 'object',
          required: ['message', 'context'],
          properties: {
            message: { type: 'string' },
            context: { type: 'object' },
            sessionId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      // Validate with Zod
      const parseResult = chatRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          details: parseResult.error.issues,
        });
      }

      const { message, context, sessionId } = parseResult.data;

      // Set headers for SSE streaming
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Session-Id': sessionId || crypto.randomUUID(),
      });

      try {
        // Stream response
        const stream = aiService.streamChat(message, context as ExcelContext);

        for await (const chunk of stream) {
          const data = JSON.stringify(chunk);
          reply.raw.write(`data: ${data}\n\n`);
        }

        // Send completion signal
        reply.raw.write('data: [DONE]\n\n');
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        reply.raw.write(
          `data: ${JSON.stringify({ error: errorMessage })}\n\n`
        );
      }

      reply.raw.end();
    }
  );

  /**
   * POST /api/chat/sync - Send a chat message (non-streaming)
   * Useful for simpler integrations.
   */
  fastify.post<{
    Body: ChatRequest;
  }>(
    '/chat/sync',
    {
      schema: {
        body: {
          type: 'object',
          required: ['message', 'context'],
          properties: {
            message: { type: 'string' },
            context: { type: 'object' },
            sessionId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const parseResult = chatRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          details: parseResult.error.issues,
        });
      }

      const { message, context, sessionId } = parseResult.data;

      try {
        const response = await aiService.chat(message, context as ExcelContext);

        return reply.send({
          message: response.message,
          toolCalls: response.toolCalls,
          sessionId: sessionId || crypto.randomUUID(),
        } as ChatResponse);
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({
          error: 'Failed to process chat message',
        });
      }
    }
  );

  /**
   * GET /api/chat/history/:sessionId - Get chat history
   */
  fastify.get<{
    Params: { sessionId: string };
  }>('/chat/history/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;

    try {
      const history = await aiService.getHistory(sessionId);
      return reply.send({ history });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        error: 'Failed to fetch chat history',
      });
    }
  });
}

// =============================================================================
// Health Check Route
// =============================================================================

/**
 * Register health check route.
 */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.0.0',
    });
  });

  fastify.get('/ready', async (_request, reply) => {
    // Check dependencies
    const checks = {
      database: await checkDatabase(),
      openai: await checkOpenAI(),
    };

    const allHealthy = Object.values(checks).every((c) => c.status === 'ok');

    return reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'ok' : 'degraded',
      checks,
    });
  });
}

async function checkDatabase(): Promise<{ status: 'ok' | 'error'; message?: string }> {
  try {
    // Placeholder - implement actual check
    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkOpenAI(): Promise<{ status: 'ok' | 'error'; message?: string }> {
  try {
    // Placeholder - implement actual check
    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
