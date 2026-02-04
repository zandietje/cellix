/**
 * Chat API routes with Server-Sent Events streaming.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getAIProvider, SYSTEM_PROMPT, formatExcelContext } from '../services/ai/index.js';
import { TOOL_DEFINITIONS } from '../services/tools/index.js';
import { TOKEN_LIMITS, countTokens, truncateToTokenLimit } from '../lib/tokens.js';
import type { ExcelContextFull } from '@cellix/shared';

/** Request body schema */
const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000, 'Message too long'),
  sessionId: z.string().optional(),
  excelContext: z.any().optional(), // ExcelContextFull - loosely validated
});

type ChatRequestBody = z.infer<typeof chatRequestSchema>;

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Chat endpoint with SSE streaming
   * POST /api/chat
   */
  fastify.post<{ Body: ChatRequestBody }>(
    '/chat',
    async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply: FastifyReply) => {
      // Validate request body
      const parseResult = chatRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.errors[0]?.message || 'Invalid request',
          },
        });
      }

      const { message, excelContext } = parseResult.data;

      // Build system prompt with Excel context
      const contextText = formatExcelContext(excelContext as ExcelContextFull | undefined);
      let systemContent = SYSTEM_PROMPT + contextText;

      // Check token limits and truncate if needed
      const systemTokens = countTokens(systemContent);
      if (systemTokens > TOKEN_LIMITS.MAX_INPUT_TOKENS - 1000) {
        // Leave room for user message
        systemContent = truncateToTokenLimit(
          systemContent,
          TOKEN_LIMITS.MAX_INPUT_TOKENS - 1500
        );
        fastify.log.warn('System prompt truncated due to token limit');
      }

      // Build messages array
      const messages = [
        { role: 'system' as const, content: systemContent },
        { role: 'user' as const, content: message },
      ];

      // Log request (without full context for brevity)
      fastify.log.info({
        msg: 'Chat request',
        messageLength: message.length,
        hasExcelContext: !!excelContext,
        systemTokens,
      });

      // Set SSE headers - use raw response for streaming
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Access-Control-Allow-Origin': '*', // CORS for SSE
      });

      // Stream AI response
      const provider = getAIProvider();

      try {
        for await (const event of provider.chat({ messages, tools: TOOL_DEFINITIONS })) {
          // Send each event as SSE
          const data = JSON.stringify(event);
          reply.raw.write(`data: ${data}\n\n`);

          // Log tool calls for debugging
          if (event.type === 'tool_call_end' && event.toolCall) {
            fastify.log.info({
              msg: 'Tool call',
              toolName: event.toolCall.name,
              toolId: event.toolCall.id,
            });
          }

          // Log errors
          if (event.type === 'error') {
            fastify.log.error({ msg: 'AI stream error', error: event.error });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        fastify.log.error({ msg: 'Chat stream failed', error: errorMessage });

        // Send error event to client
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
      }

      // End the stream
      reply.raw.end();
    }
  );

  /**
   * Non-streaming chat endpoint for testing
   * POST /api/chat/sync
   */
  fastify.post<{ Body: ChatRequestBody }>(
    '/chat/sync',
    async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply: FastifyReply) => {
      const parseResult = chatRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.errors[0]?.message || 'Invalid request',
          },
        });
      }

      const { message, excelContext } = parseResult.data;

      // Build messages
      const contextText = formatExcelContext(excelContext as ExcelContextFull | undefined);
      const systemContent = SYSTEM_PROMPT + contextText;

      const messages = [
        { role: 'system' as const, content: systemContent },
        { role: 'user' as const, content: message },
      ];

      const provider = getAIProvider();

      try {
        let fullContent = '';
        const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

        for await (const event of provider.chat({ messages, tools: TOOL_DEFINITIONS })) {
          if (event.type === 'text' && event.content) {
            fullContent += event.content;
          }
          if (event.type === 'tool_call_end' && event.toolCall) {
            toolCalls.push({
              id: event.toolCall.id,
              name: event.toolCall.name,
              arguments: event.toolCall.arguments,
            });
          }
          if (event.type === 'error') {
            return reply.status(500).send({
              success: false,
              error: {
                code: 'AI_ERROR',
                message: event.error || 'AI request failed',
              },
            });
          }
        }

        return reply.send({
          success: true,
          data: {
            content: fullContent,
            toolCalls: toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              parameters: JSON.parse(tc.arguments || '{}'),
            })),
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: errorMessage,
          },
        });
      }
    }
  );
}
