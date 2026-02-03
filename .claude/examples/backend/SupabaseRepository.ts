/**
 * Supabase Repository - Example Implementation
 *
 * Pattern for data access using Supabase client.
 * Includes type safety and error handling.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// =============================================================================
// Client Setup
// =============================================================================

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

// Typed client
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseKey
);

// =============================================================================
// Types
// =============================================================================

type PlatformConnection = Database['public']['Tables']['platform_connections']['Row'];
type PlatformConnectionInsert = Database['public']['Tables']['platform_connections']['Insert'];

type Alert = Database['public']['Tables']['alerts']['Row'];
type AlertInsert = Database['public']['Tables']['alerts']['Insert'];

type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];

type AuditLog = Database['public']['Tables']['audit_log']['Insert'];

// =============================================================================
// Platform Connections Repository
// =============================================================================

export const platformConnectionsRepo = {
  /**
   * Get all connections for a user.
   */
  async getByUserId(userId: string): Promise<PlatformConnection[]> {
    const { data, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Get a specific connection.
   */
  async getById(id: string): Promise<PlatformConnection | null> {
    const { data, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data;
  },

  /**
   * Get connection by platform and shop.
   */
  async getByPlatformAndShop(
    userId: string,
    platform: 'shopee' | 'lazada',
    shopId: string
  ): Promise<PlatformConnection | null> {
    const { data, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .eq('shop_id', shopId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Create or update a connection.
   */
  async upsert(connection: PlatformConnectionInsert): Promise<PlatformConnection> {
    const { data, error } = await supabase
      .from('platform_connections')
      .upsert(connection, {
        onConflict: 'user_id,platform,shop_id',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update tokens for a connection.
   */
  async updateTokens(
    id: string,
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('platform_connections')
      .update({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: tokens.expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Delete a connection.
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('platform_connections')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// Alerts Repository
// =============================================================================

export const alertsRepo = {
  /**
   * Get unacknowledged alerts for a user.
   */
  async getUnacknowledged(
    userId: string,
    limit: number = 20
  ): Promise<Alert[]> {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .is('acknowledged_at', null)
      .or('snoozed_until.is.null,snoozed_until.lt.now()')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  /**
   * Get alerts by severity.
   */
  async getBySeverity(
    userId: string,
    severity: 'info' | 'warning' | 'critical'
  ): Promise<Alert[]> {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .eq('severity', severity)
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Create a new alert.
   */
  async create(alert: AlertInsert): Promise<Alert> {
    const { data, error } = await supabase
      .from('alerts')
      .insert(alert)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Acknowledge an alert.
   */
  async acknowledge(id: string): Promise<void> {
    const { error } = await supabase
      .from('alerts')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Snooze an alert.
   */
  async snooze(id: string, until: Date): Promise<void> {
    const { error } = await supabase
      .from('alerts')
      .update({ snoozed_until: until.toISOString() })
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// Chat Sessions Repository
// =============================================================================

export const chatSessionsRepo = {
  /**
   * Get a session by ID.
   */
  async getById(id: string): Promise<ChatSession | null> {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Get recent sessions for a user.
   */
  async getRecent(userId: string, limit: number = 10): Promise<ChatSession[]> {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  /**
   * Create a new session.
   */
  async create(
    userId: string,
    title?: string
  ): Promise<ChatSession> {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: userId,
        title: title || 'New Chat',
        messages: [],
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Append a message to a session.
   */
  async appendMessage(
    id: string,
    message: { role: 'user' | 'assistant'; content: string }
  ): Promise<void> {
    // Get current messages
    const session = await this.getById(id);
    if (!session) throw new Error('Session not found');

    const messages = session.messages as unknown[];
    messages.push(message);

    const { error } = await supabase
      .from('chat_sessions')
      .update({
        messages,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// Audit Log Repository
// =============================================================================

export const auditLogRepo = {
  /**
   * Log a tool execution.
   */
  async logToolExecution(log: AuditLog): Promise<void> {
    const { error } = await supabase.from('audit_log').insert(log);

    if (error) {
      // Don't throw - audit logging shouldn't break main flow
      console.error('Failed to log audit entry:', error);
    }
  },

  /**
   * Get audit logs for a user.
   */
  async getByUserId(
    userId: string,
    options: {
      limit?: number;
      toolName?: string;
      result?: 'success' | 'error' | 'cancelled';
    } = {}
  ): Promise<AuditLog[]> {
    let query = supabase
      .from('audit_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options.toolName) {
      query = query.eq('tool_name', options.toolName);
    }
    if (options.result) {
      query = query.eq('result', options.result);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as AuditLog[];
  },
};
