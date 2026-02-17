import { supabase, isSupabaseConfigured } from '../../lib/supabase.js';
import { countTokens } from '../../lib/tokens.js';

/** Minimal message shape for conversation history */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Create a new chat session.
 * Returns a temporary ID if Supabase is not configured.
 */
export async function createSession(): Promise<string> {
  if (!isSupabaseConfigured()) {
    return `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  const { data, error } = await supabase!
    .from('chat_sessions')
    .insert({ messages: [], token_usage: { input: 0, output: 0 } })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return data.id;
}

/**
 * Load session history from DB.
 * Returns empty array if Supabase is not configured or session is temporary.
 */
export async function loadSessionHistory(
  sessionId: string,
  maxMessages = 20
): Promise<HistoryMessage[]> {
  if (!isSupabaseConfigured() || sessionId.startsWith('temp_')) {
    return [];
  }

  const { data, error } = await supabase!
    .from('chat_sessions')
    .select('messages')
    .eq('id', sessionId)
    .single();

  if (error) {
    console.warn(`Failed to load session ${sessionId}:`, error.message);
    return [];
  }

  const messages = (data?.messages || []) as HistoryMessage[];
  return messages.slice(-maxMessages);
}

/**
 * Save new messages to a session in the DB.
 * No-op if Supabase is not configured.
 */
export async function saveSessionMessages(
  sessionId: string,
  newMessages: HistoryMessage[],
  tokenUsage?: { input: number; output: number }
): Promise<void> {
  if (!isSupabaseConfigured() || sessionId.startsWith('temp_')) {
    return;
  }

  const { data } = await supabase!
    .from('chat_sessions')
    .select('messages, token_usage')
    .eq('id', sessionId)
    .single();

  const existingMessages = (data?.messages || []) as HistoryMessage[];
  const existingTokens = (data?.token_usage || { input: 0, output: 0 }) as {
    input: number;
    output: number;
  };

  const updatedMessages = [...existingMessages, ...newMessages];
  const updatedTokens = tokenUsage
    ? {
        input: existingTokens.input + tokenUsage.input,
        output: existingTokens.output + tokenUsage.output,
      }
    : existingTokens;

  const { error } = await supabase!
    .from('chat_sessions')
    .update({
      messages: updatedMessages,
      token_usage: updatedTokens,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error(`Failed to save session ${sessionId}:`, error.message);
  }
}

/**
 * Trim history to fit within a token budget.
 * Keeps the most recent messages that fit.
 */
export function trimHistoryToTokenBudget(
  messages: HistoryMessage[],
  maxTokens: number
): HistoryMessage[] {
  let totalTokens = 0;
  const result: HistoryMessage[] = [];

  // Process from newest to oldest, keep what fits
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const tokens = countTokens(msg.content || '');

    if (totalTokens + tokens > maxTokens) {
      break;
    }

    totalTokens += tokens;
    result.push(msg);
  }

  return result.reverse();
}
