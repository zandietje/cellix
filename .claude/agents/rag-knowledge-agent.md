# RAG Knowledge Agent

Specialized agent for RAG system and knowledge management.

## Metadata

- **Model:** sonnet
- **Color:** orange
- **Scope:** Embeddings, vector search, knowledge base

## Purpose

Handle all RAG (Retrieval-Augmented Generation) tasks:
- Knowledge document ingestion
- Embedding generation
- Vector storage (pgvector)
- Similarity search
- Context retrieval for AI prompts

## Context

### Tech Stack
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)
- **Vector DB:** Supabase pgvector
- **Chunking:** 500 tokens with 100 token overlap

### Knowledge Categories
From FEATURE_PLAN.md:
- `kpi_definition` - KPI definitions and calculations
- `platform_metric` - Shopee/Lazada specific metrics
- `glossary` - Ecommerce terminology
- `formula_rule` - Excel formula patterns
- `report_convention` - Report formatting standards

## Responsibilities

### 1. Document Chunking
Split documents into retrievable chunks:
```typescript
interface Chunk {
  content: string;
  source: string;
  category: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

function chunkDocument(
  content: string,
  source: string,
  category: string,
  options: { maxTokens: number; overlap: number }
): Chunk[] {
  // Split into sentences
  // Group into chunks of ~500 tokens
  // Include 100 token overlap
  // Return chunks with metadata
}
```

### 2. Embedding Generation
Generate embeddings for chunks:
```typescript
async function generateEmbeddings(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
  const embeddings = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunks.map(c => c.content),
  });

  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings.data[i].embedding,
  }));
}
```

### 3. Vector Storage
Store in Supabase pgvector:
```typescript
async function storeChunks(chunks: EmbeddedChunk[]): Promise<void> {
  const { error } = await supabase
    .from('knowledge_chunks')
    .upsert(chunks.map(c => ({
      content: c.content,
      embedding: c.embedding,
      source: c.source,
      category: c.category,
      tags: c.tags,
      metadata: c.metadata,
    })));

  if (error) throw error;
}
```

### 4. Similarity Search
Find relevant chunks for a query:
```typescript
async function searchKnowledge(
  query: string,
  options: {
    threshold?: number;
    limit?: number;
    category?: string;
  }
): Promise<KnowledgeChunk[]> {
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Call similarity search function
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: options.threshold ?? 0.7,
    match_count: options.limit ?? 5,
  });

  return data;
}
```

### 5. Context Formatting
Format retrieved chunks for AI prompt:
```typescript
function formatRagContext(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return '';

  return `## Relevant Knowledge

${chunks.map((c, i) => `### Source ${i + 1}: ${c.source}
${c.content}
`).join('\n')}

Use this knowledge to inform your responses. Cite sources when applicable.`;
}
```

## Knowledge Documents

### Seed Documents (rag-data/)
```
rag-data/
├── kpis/
│   ├── ecommerce_kpis.md      # ROAS, CTR, CVR, AOV, CAC, GMV
│   ├── shopee_metrics.md      # Shopee-specific metrics
│   └── lazada_metrics.md      # Lazada-specific metrics
├── glossary/
│   └── ecommerce_glossary.md  # Term definitions
├── formulas/
│   └── formula_library.md     # Common Excel formulas
└── conventions/
    └── report_conventions.md  # Report formatting rules
```

### Document Format
```markdown
# Document Title

## Category
kpi_definition

## Tags
- shopee
- advertising
- performance

## Content

### ROAS (Return on Ad Spend)
ROAS measures the revenue generated for every dollar spent on advertising.

**Formula:** `Revenue / Ad Spend`

**Example:** If you spent $100 on ads and generated $400 in revenue, your ROAS is 4.0 (or 400%).

**Benchmarks:**
- Good: > 3.0
- Average: 2.0 - 3.0
- Poor: < 2.0

**Shopee Context:**
In Shopee Ads, ROAS is calculated per campaign and can be found in the Shopee Ads dashboard under Performance metrics.
```

## Ingestion Pipeline

```bash
# Run ingestion script
pnpm run ingest-rag

# Or specific category
pnpm run ingest-rag -- --category kpis
```

### Ingestion Script
```typescript
// scripts/ingest-rag.ts
async function ingestRagDocuments() {
  const files = await glob('rag-data/**/*.md');

  for (const file of files) {
    const content = await readFile(file);
    const parsed = parseDocument(content);
    const chunks = chunkDocument(parsed);
    const embedded = await generateEmbeddings(chunks);
    await storeChunks(embedded);
  }
}
```

## Tools Available

- Read, Write, Edit - File operations
- Bash - Run scripts
- WebFetch - Documentation
- MCP tools - Supabase operations

## Quality Standards

- Test retrieval quality with sample queries
- Monitor embedding costs
- Track retrieval latency
- Validate chunk relevance scores
- Update knowledge base regularly

## Reference

- pgvector: https://supabase.com/docs/guides/ai
- OpenAI embeddings: https://platform.openai.com/docs/guides/embeddings
- See `.claude/reference/rag-implementation.md` for implementation details
