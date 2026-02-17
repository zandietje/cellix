/**
 * Chat API routes with Server-Sent Events streaming.
 *
 * Uses a three-stage AI architecture:
 * 1. Planner: Fast intent detection and tool selection (gpt-4o-mini)
 * 2. Router: Selects optimal model tier based on planner output (rule-based, free)
 * 3. Executor: Forced tool execution or question answering (tier-selected model)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getAIProvider,
  SYSTEM_PROMPT,
  buildContextText,
  ensurePromptFitsTokenBudget,
  planToolCall,
  isValidToolPlan,
  classifyTier,
  classifyContinuationTier,
  MODEL_TIERS,
} from '../services/ai/index.js';
import type { ToolChoice, Message } from '../services/ai/types.js';
import { TOOL_DEFINITIONS, READ_TOOL_DEFINITIONS } from '../services/tools/index.js';
import { TOKEN_LIMITS, countTokens } from '../lib/tokens.js';
import { setSseHeaders, writeSseEvent } from '../lib/sse.js';
import { CHAT_CONFIG } from '../lib/constants.js';
import {
  createSession,
  loadSessionHistory,
  saveSessionMessages,
  trimHistoryToTokenBudget,
} from '../services/chat/sessionManager.js';
import type { HistoryMessage } from '../services/chat/sessionManager.js';
import type { ExcelContextFull, ExcelContextWithProfile } from '@cellix/shared';

/** Type guard: checks if a Zod-parsed context is the profile-first shape */
function isProfileContext(ctx: unknown): ctx is ExcelContextWithProfile {
  return !!ctx && typeof ctx === 'object' && 'profile' in ctx && 'inventory' in ctx;
}

/** Type guard: checks if a Zod-parsed context is the legacy shape */
function isLegacyContext(ctx: unknown): ctx is ExcelContextFull {
  return !!ctx && typeof ctx === 'object' && 'selection' in ctx && !('profile' in ctx);
}

/** Schema for a history message sent from the frontend (fallback when no DB) */
const historyMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

/** Validates either profile-first or legacy Excel context */
const excelContextSchema = z.union([
  // Profile-first context (Phase 5C)
  z.object({
    profile: z.object({ sheetName: z.string() }).passthrough(),
    inventory: z.object({}).passthrough(),
    selection: z.object({ address: z.string().optional() }).passthrough().optional(),
  }),
  // Legacy full context
  z.object({
    activeSheet: z.string().optional(),
    selection: z.object({ address: z.string() }).passthrough().optional(),
    sheets: z.array(z.string()).optional(),
  }).passthrough(),
]).optional();

/** Request body schema */
const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000, 'Message too long'),
  sessionId: z.string()
    .regex(/^(temp_[\w-]+|[0-9a-f-]{36})$/i, 'Invalid session ID format')
    .optional(),
  history: z.array(historyMessageSchema).optional(),
  excelContext: excelContextSchema,
});

type ChatRequestBody = z.infer<typeof chatRequestSchema>;

/** Request body schema for continuation after tool execution */
const chatContinueSchema = z.object({
  message: z.string().min(1, 'Original message is required'),
  sessionId: z.string()
    .regex(/^(temp_[\w-]+|[0-9a-f-]{36})$/i, 'Invalid session ID format')
    .optional(),
  history: z.array(historyMessageSchema).optional(),
  excelContext: excelContextSchema,
  assistantContent: z.string().nullable(),
  toolCalls: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      arguments: z.string(),
    })
  ),
  toolResults: z.array(
    z.object({
      toolCallId: z.string().min(1),
      content: z.string().max(50000, 'Tool result too large'),
    })
  ),
  allowTools: z.boolean().default(true),
});

type ChatContinueBody = z.infer<typeof chatContinueSchema>;

/**
 * Build the base message array (system prompt + context + trimmed history + user message).
 * Shared across all chat endpoints to avoid duplication.
 */
function buildBaseMessages(
  excelContext: unknown,
  message: string,
  history: HistoryMessage[]
): { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; trimmedHistory: HistoryMessage[] } {
  const contextText = buildContextText(excelContext);
  const systemPromptContent = ensurePromptFitsTokenBudget(SYSTEM_PROMPT);
  const contextContent = contextText ? ensurePromptFitsTokenBudget(contextText) : '';

  const systemTokens = countTokens(systemPromptContent) + (contextContent ? countTokens(contextContent) : 0);
  const maxHistoryTokens = TOKEN_LIMITS.MAX_INPUT_TOKENS - systemTokens - countTokens(message) - CHAT_CONFIG.MESSAGE_TOKEN_RESERVE;
  const trimmedHistory = trimHistoryToTokenBudget(history, Math.max(maxHistoryTokens, 0));

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPromptContent },
    ...(contextContent ? [{ role: 'system' as const, content: contextContent }] : []),
    ...trimmedHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ];

  return { messages, trimmedHistory };
}

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

      const { message, sessionId, history: frontendHistory, excelContext } = parseResult.data;

      // Create or reuse session
      const activeSessionId = sessionId || await createSession();

      // Load conversation history: DB first, then frontend fallback
      let history: HistoryMessage[];
      if (sessionId) {
        const dbHistory = await loadSessionHistory(sessionId);
        history = dbHistory.length > 0 ? dbHistory : (frontendHistory || []);
      } else {
        history = frontendHistory || [];
      }

      const { messages, trimmedHistory } = buildBaseMessages(excelContext, message, history);

      if (trimmedHistory.length > 0) {
        fastify.log.info({ msg: 'Including conversation history', messageCount: trimmedHistory.length });
      }

      // Set SSE headers - use raw response for streaming
      setSseHeaders(reply);

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

      if (isProfileContext(excelContext)) {
        excelContextForPlanner = {
          selection: excelContext.selection?.address,
          rows: excelContext.selection?.size?.rows,
          cols: excelContext.selection?.size?.cols,
          sheet: excelContext.profile?.sheetName,
          hasData: !!excelContext.selection?.data,
        };
      } else if (isLegacyContext(excelContext)) {
        excelContextForPlanner = {
          selection: excelContext.selection?.address,
          rows: excelContext.selection?.rowCount,
          cols: excelContext.selection?.columnCount,
          sheet: excelContext.activeSheet,
          hasData: (excelContext.selection?.values?.length ?? 0) > 0,
        };
      }

      let plan;
      try {
        plan = await planToolCall(message, excelContextForPlanner, trimmedHistory);
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
        writeSseEvent(reply, { type: 'text', content: clarifyText });
        writeSseEvent(reply, { type: 'done' });
        reply.raw.end();
        return;
      }

      // ═══════════════════════════════════════════════════════════
      // STAGE 2: EXECUTOR - Execute based on plan + router
      // ═══════════════════════════════════════════════════════════
      const provider = getAIProvider();

      // Determine tool choice based on plan
      let toolChoice: ToolChoice | undefined;
      let tools = TOOL_DEFINITIONS;

      if (plan.intent === 'action' && plan.tool && isValidToolPlan(plan.tool)) {
        toolChoice = { type: 'function', function: { name: plan.tool } };
        fastify.log.info({ msg: 'Forcing write tool call', tool: plan.tool });
      } else if (plan.intent === 'analysis' && plan.tool && isValidToolPlan(plan.tool)) {
        toolChoice = { type: 'function', function: { name: plan.tool } };
        tools = READ_TOOL_DEFINITIONS;
        fastify.log.info({ msg: 'Analysis mode - forcing read tool', tool: plan.tool });
      } else if (plan.intent === 'analysis') {
        toolChoice = 'auto';
        tools = READ_TOOL_DEFINITIONS;
        fastify.log.info({ msg: 'Analysis mode - auto read tools' });
      } else if (plan.intent === 'question') {
        toolChoice = 'none';
        tools = [];
        fastify.log.info({ msg: 'Question mode - no tools' });
      }

      // Router: select optimal model tier based on planner output
      const tier = classifyTier(plan);
      const tierConfig = MODEL_TIERS[tier];

      fastify.log.info({
        msg: 'Router decision',
        tier,
        model: tierConfig.model,
        intent: plan.intent,
        tool: plan.tool,
        confidence: plan.confidence,
      });

      // Send session ID and tier info to client
      writeSseEvent(reply, {
        type: 'session',
        sessionId: activeSessionId,
        tier,
        model: tierConfig.model,
      });

      let fullResponseContent = '';

      try {
        for await (const event of provider.chat({
          messages,
          tools,
          toolChoice,
          temperature: tierConfig.temperature,
          model: tierConfig.model,
        })) {
          if (!writeSseEvent(reply, event)) break; // Client disconnected

          if (event.type === 'text' && event.content) {
            fullResponseContent += event.content;
          }

          if (event.type === 'tool_call_end' && event.toolCall) {
            fastify.log.info({
              msg: 'Tool call executed',
              toolName: event.toolCall.name,
              toolId: event.toolCall.id,
            });
          }

          if (event.type === 'error') {
            fastify.log.error({ msg: 'AI stream error', error: event.error });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        fastify.log.error({ msg: 'Chat stream failed', error: errorMessage });
        writeSseEvent(reply, { type: 'error', error: errorMessage });
      }

      // Save conversation to session (fire-and-forget, don't block response)
      if (fullResponseContent) {
        saveSessionMessages(activeSessionId, [
          { role: 'user', content: message },
          { role: 'assistant', content: fullResponseContent },
        ]).catch(err => {
          fastify.log.warn({ msg: 'Failed to save session messages', error: String(err) });
        });
      }

      // End the stream
      reply.raw.end();
    }
  );

  /**
   * Continue chat after tool execution.
   * The frontend executes tools locally (Office.js context) and sends results back.
   * This endpoint rebuilds the message array with tool results and streams the AI's analysis.
   *
   * POST /api/chat/continue
   */
  fastify.post<{ Body: ChatContinueBody }>(
    '/chat/continue',
    async (request: FastifyRequest<{ Body: ChatContinueBody }>, reply: FastifyReply) => {
      const parseResult = chatContinueSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.errors[0]?.message || 'Invalid request',
          },
        });
      }

      const { message, sessionId, history: frontendHistory, excelContext, assistantContent, toolCalls, toolResults, allowTools } =
        parseResult.data;

      // Load conversation history for continuation context
      let history: HistoryMessage[] = [];
      if (sessionId) {
        const dbHistory = await loadSessionHistory(sessionId);
        history = dbHistory.length > 0 ? dbHistory : (frontendHistory || []);
      } else {
        history = frontendHistory || [];
      }

      // Build base messages, then append tool call/result messages for continuation
      const { messages: baseMessages } = buildBaseMessages(excelContext, message, history);
      const messages = [
        ...baseMessages,
        // Assistant message with tool_calls
        {
          role: 'assistant' as const,
          content: assistantContent,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        },
        // Tool result messages
        ...toolResults.map((tr) => ({
          role: 'tool' as const,
          tool_call_id: tr.toolCallId,
          content: tr.content,
        })),
      ];

      setSseHeaders(reply);

      const provider = getAIProvider();

      // Determine tool availability based on allowTools flag
      const tools = allowTools ? TOOL_DEFINITIONS : [];
      const toolChoice: ToolChoice | undefined = allowTools ? 'auto' : 'none';

      // Router: select model tier based on tool result complexity
      const continuationTier = classifyContinuationTier(toolResults);
      const continuationTierConfig = MODEL_TIERS[continuationTier];

      fastify.log.info({
        msg: 'Continuation router decision',
        tier: continuationTier,
        model: continuationTierConfig.model,
      });

      try {
        for await (const event of provider.chat({
          messages: messages as Message[],
          tools,
          toolChoice,
          temperature: continuationTierConfig.temperature,
          model: continuationTierConfig.model,
        })) {
          if (!writeSseEvent(reply, event)) break;

          if (event.type === 'tool_call_end' && event.toolCall) {
            fastify.log.info({
              msg: 'Continuation tool call',
              toolName: event.toolCall.name,
              toolId: event.toolCall.id,
            });
          }

          if (event.type === 'error') {
            fastify.log.error({ msg: 'Continuation stream error', error: event.error });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        fastify.log.error({ msg: 'Continuation stream failed', error: errorMessage });
        writeSseEvent(reply, { type: 'error', error: errorMessage });
      }

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

      const { messages } = buildBaseMessages(excelContext, message, []);

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
