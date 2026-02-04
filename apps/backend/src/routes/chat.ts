/**
 * Chat API routes with Server-Sent Events streaming.
 *
 * Uses a two-stage AI architecture:
 * 1. Planner: Fast intent detection and tool selection (gpt-4o-mini)
 * 2. Executor: Forced tool execution or question answering (gpt-4o)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getAIProvider,
  SYSTEM_PROMPT,
  formatExcelContext,
  planToolCall,
  isValidToolPlan,
} from '../services/ai/index.js';
import type { ToolChoice } from '../services/ai/types.js';
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

      // Set SSE headers - use raw response for streaming
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Access-Control-Allow-Origin': '*', // CORS for SSE
      });

      // ═══════════════════════════════════════════════════════════
      // STAGE 1: PLANNER - Detect intent and select tool
      // ═══════════════════════════════════════════════════════════
      const typedContext = excelContext as ExcelContextFull | undefined;
      const excelContextForPlanner = typedContext
        ? {
            selection: typedContext.selection?.address,
            rows: typedContext.selection?.rowCount,
            cols: typedContext.selection?.columnCount,
            sheet: typedContext.activeSheet,
            hasData: (typedContext.selection?.values?.length ?? 0) > 0,
          }
        : undefined;

      let plan;
      try {
        plan = await planToolCall(message, excelContextForPlanner);
        fastify.log.info({
          msg: 'Planner result',
          intent: plan.intent,
          tool: plan.tool,
          confidence: plan.confidence,
          reasoning: plan.reasoning,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Planner failed';
        fastify.log.error({ msg: 'Planner failed', error: errorMessage });
        // Fall back to auto mode
        plan = { intent: 'question' as const, confidence: 0.5, reasoning: 'Planner error' };
      }

      // ═══════════════════════════════════════════════════════════
      // Handle clarify intent - ask user for more info
      // ═══════════════════════════════════════════════════════════
      if (plan.intent === 'clarify') {
        const clarifyText = plan.clarifyQuestion || 'Could you please clarify what you would like me to do?';
        reply.raw.write(`data: ${JSON.stringify({ type: 'text', content: clarifyText })}\n\n`);
        reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        reply.raw.end();
        return;
      }

      // ═══════════════════════════════════════════════════════════
      // STAGE 2: EXECUTOR - Execute based on plan
      // ═══════════════════════════════════════════════════════════
      const provider = getAIProvider();

      // Determine tool choice based on plan
      let toolChoice: ToolChoice | undefined;
      let tools = TOOL_DEFINITIONS;

      if (plan.intent === 'action' && plan.tool && isValidToolPlan(plan.tool)) {
        // FORCE the specific tool - this is the key fix!
        toolChoice = { type: 'function', function: { name: plan.tool } };
        fastify.log.info({ msg: 'Forcing tool call', tool: plan.tool });
      } else if (plan.intent === 'question') {
        // No tools for questions - pure conversation
        toolChoice = 'none';
        tools = [];
        fastify.log.info({ msg: 'Question mode - no tools' });
      }

      try {
        for await (const event of provider.chat({
          messages,
          tools,
          toolChoice,
          temperature: plan.intent === 'action' ? 0.2 : 0.7, // Low temp for actions
        })) {
          // Send each event as SSE
          const data = JSON.stringify(event);
          reply.raw.write(`data: ${data}\n\n`);

          // Log tool calls for debugging
          if (event.type === 'tool_call_end' && event.toolCall) {
            fastify.log.info({
              msg: 'Tool call executed',
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
