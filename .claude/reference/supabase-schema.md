# Supabase Schema Reference

## Database Tables

### platform_connections
Stores OAuth connections to Shopee and Lazada.

```sql
CREATE TABLE platform_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('shopee', 'lazada')),
  shop_id text NOT NULL,
  shop_name text,
  access_token text,  -- Encrypted
  refresh_token text, -- Encrypted
  token_expires_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id, platform, shop_id)
);

-- Indexes
CREATE INDEX idx_platform_connections_user ON platform_connections(user_id);
CREATE INDEX idx_platform_connections_platform ON platform_connections(platform);

-- RLS
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
  ON platform_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own connections"
  ON platform_connections FOR ALL
  USING (auth.uid() = user_id);
```

### knowledge_chunks
RAG knowledge base with pgvector embeddings.

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small
  source text NOT NULL,    -- File path or document name
  category text NOT NULL CHECK (category IN (
    'kpi_definition',
    'platform_metric',
    'glossary',
    'formula_rule',
    'report_convention'
  )),
  tags text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Vector similarity index (IVFFlat)
CREATE INDEX idx_knowledge_chunks_embedding
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Category index
CREATE INDEX idx_knowledge_chunks_category ON knowledge_chunks(category);

-- Similarity search function
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  source text,
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.content,
    k.source,
    k.category,
    1 - (k.embedding <=> query_embedding) as similarity
  FROM knowledge_chunks k
  WHERE
    1 - (k.embedding <=> query_embedding) > match_threshold
    AND (filter_category IS NULL OR k.category = filter_category)
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### alerts
Anomaly detection alerts.

```sql
CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text CHECK (platform IN ('shopee', 'lazada', NULL)),
  shop_id text,
  alert_type text NOT NULL CHECK (alert_type IN (
    'ad_spend_anomaly',
    'conversion_drop',
    'zero_sales',
    'roas_threshold',
    'refund_spike',
    'stock_out'
  )),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL,
  message text NOT NULL,
  metric_name text,
  current_value numeric,
  threshold_value numeric,
  metadata jsonb DEFAULT '{}',
  acknowledged_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_alerts_user ON alerts(user_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX idx_alerts_unacknowledged
  ON alerts(user_id, created_at DESC)
  WHERE acknowledged_at IS NULL;

-- RLS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts"
  ON alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can acknowledge own alerts"
  ON alerts FOR UPDATE
  USING (auth.uid() = user_id);
```

### chat_sessions
Chat history for context.

```sql
CREATE TABLE chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  messages jsonb NOT NULL DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- RLS
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sessions"
  ON chat_sessions FOR ALL
  USING (auth.uid() = user_id);
```

### templates
Report and sheet templates.

```sql
CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'campaign_tracking',
    'performance_analysis',
    'financial',
    'inventory',
    'planning'
  )),
  description text,
  schema jsonb NOT NULL,  -- Template definition
  preview_url text,       -- Screenshot URL
  is_system boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  usage_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_system ON templates(is_system);

-- RLS (public read for system templates)
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system templates"
  ON templates FOR SELECT
  USING (is_system = true);

CREATE POLICY "Users can view own templates"
  ON templates FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can manage own templates"
  ON templates FOR ALL
  USING (auth.uid() = created_by);
```

### audit_log
Tool execution audit trail.

```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  session_id uuid,
  action text NOT NULL,
  tool_name text,
  parameters jsonb,
  result text CHECK (result IN ('success', 'error', 'cancelled', 'preview')),
  error_message text,
  affected_range text,
  cell_count int,
  execution_time_ms int,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_tool ON audit_log(tool_name);

-- Partition by month (for large-scale)
-- CREATE TABLE audit_log_y2024m01 PARTITION OF audit_log
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit log"
  ON audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- Insert only (no updates/deletes)
CREATE POLICY "System can insert audit log"
  ON audit_log FOR INSERT
  WITH CHECK (true);
```

## TypeScript Types

Generate types with:
```bash
supabase gen types typescript --local > packages/shared/src/database.types.ts
```

Example generated types:
```typescript
export interface Database {
  public: {
    Tables: {
      platform_connections: {
        Row: {
          id: string;
          user_id: string;
          platform: 'shopee' | 'lazada';
          shop_id: string;
          shop_name: string | null;
          access_token: string | null;
          refresh_token: string | null;
          token_expires_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: { ... };
        Update: { ... };
      };
      // ... other tables
    };
    Functions: {
      match_knowledge_chunks: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
          filter_category?: string;
        };
        Returns: {
          id: string;
          content: string;
          source: string;
          category: string;
          similarity: number;
        }[];
      };
    };
  };
}
```

## Migrations

Create migrations in `supabase/migrations/`:

```bash
# Create new migration
supabase migration new add_platform_connections

# Apply migrations
supabase db push

# Reset database (dev only)
supabase db reset
```

Migration file naming: `{timestamp}_{description}.sql`

Example:
```
20240101120000_initial_schema.sql
20240115090000_add_alerts_table.sql
20240120150000_add_knowledge_chunks.sql
```
