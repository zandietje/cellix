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
  formatProfileContext,
  planToolCall,
  isValidToolPlan,
} from '../services/ai/index.js';
import type { ToolChoice } from '../services/ai/types.js';
import { TOOL_DEFINITIONS } from '../services/tools/index.js';
import { TOKEN_LIMITS, countTokens, truncateToTokenLimit } from '../lib/tokens.js';
import type { ExcelContextFull, ExcelContextWithProfile } from '@cellix/shared';

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
      // Detect which context type and format accordingly (profile-first vs legacy)
      let contextText: string;
      if (excelContext?.profile && excelContext?.inventory) {
        // New profile-first context (Phase 5C)
        contextText = formatProfileContext(excelContext as ExcelContextWithProfile);
      } else if (excelContext?.selection) {
        // Legacy full context (backwards compatible)
        contextText = formatExcelContext(excelContext as ExcelContextFull);
      } else {
        contextText = '';
      }

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
      // Build planner context from either profile-first or legacy context
      let excelContextForPlanner:
        | {
            selection?: string;
            rows?: number;
            cols?: number;
            sheet?: string;
            hasData?: boolean;
          }
        | undefined;

      if (excelContext?.profile && excelContext?.inventory) {
        // Profile-first context
        const profileCtx = excelContext as ExcelContextWithProfile;
        excelContextForPlanner = {
          selection: profileCtx.selection?.address,
          rows: profileCtx.selection?.size?.rows,
          cols: profileCtx.selection?.size?.cols,
          sheet: profileCtx.profile?.sheetName,
          hasData: !!profileCtx.selection?.data,
        };
      } else if (excelContext?.selection) {
        // Legacy context
        const legacyCtx = excelContext as ExcelContextFull;
        excelContextForPlanner = {
          selection: legacyCtx.selection?.address,
          rows: legacyCtx.selection?.rowCount,
          cols: legacyCtx.selection?.columnCount,
          sheet: legacyCtx.activeSheet,
          hasData: (legacyCtx.selection?.values?.length ?? 0) > 0,
        };
      }

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

      // Build messages - detect context type
      let contextText: string;
      if (excelContext?.profile && excelContext?.inventory) {
        contextText = formatProfileContext(excelContext as ExcelContextWithProfile);
      } else if (excelContext?.selection) {
        contextText = formatExcelContext(excelContext as ExcelContextFull);
      } else {
        contextText = '';
      }
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
