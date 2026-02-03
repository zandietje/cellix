# RAG Implementation Reference

## Overview

Cellix uses Retrieval-Augmented Generation (RAG) to ground AI responses in ecommerce domain knowledge. This ensures accurate KPI definitions, formula suggestions, and platform-specific guidance.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Knowledge  │────▶│  Embedding  │────▶│  Supabase   │
│  Documents  │     │  Pipeline   │     │  pgvector   │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User       │────▶│  Query      │────▶│  Similarity │
│  Query      │     │  Embedding  │     │  Search     │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Retrieved  │
                                        │  Chunks     │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Augmented  │
                                        │  Prompt     │
                                        └─────────────┘
```

## Components

### 1. Document Chunking

Split documents into retrievable pieces:

```typescript
// apps/backend/src/services/rag/chunker.ts

interface ChunkOptions {
  maxTokens: number;     // ~500 tokens per chunk
  overlapTokens: number; // ~100 tokens overlap
  preserveMarkdown: boolean;
}

interface Chunk {
  content: string;
  source: string;
  category: KnowledgeCategory;
  tags: string[];
  metadata: {
    heading?: string;
    position: number;
    totalChunks: number;
  };
}

function chunkDocument(
  content: string,
  source: string,
  category: KnowledgeCategory,
  options: ChunkOptions = { maxTokens: 500, overlapTokens: 100, preserveMarkdown: true }
): Chunk[] {
  // Split by markdown headings first
  const sections = splitByHeadings(content);

  const chunks: Chunk[] = [];
  let position = 0;

  for (const section of sections) {
    const sectionChunks = splitIntoChunks(section.content, options);

    for (const chunkContent of sectionChunks) {
      chunks.push({
        content: chunkContent,
        source,
        category,
        tags: extractTags(section.heading, chunkContent),
        metadata: {
          heading: section.heading,
          position: position++,
          totalChunks: 0, // Updated after processing
        },
      });
    }
  }

  // Update total chunks
  chunks.forEach(c => c.metadata.totalChunks = chunks.length);

  return chunks;
}

function splitIntoChunks(text: string, options: ChunkOptions): string[] {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = countTokens(sentence);

    if (currentTokens + sentenceTokens > options.maxTokens && currentChunk.length > 0) {
      // Save current chunk
      chunks.push(currentChunk.join(' '));

      // Start new chunk with overlap
      const overlapSentences = getOverlapSentences(currentChunk, options.overlapTokens);
      currentChunk = overlapSentences;
      currentTokens = countTokens(overlapSentences.join(' '));
    }

    currentChunk.push(sentence);
    currentTokens += sentenceTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}
```

### 2. Embedding Generation

Generate embeddings using OpenAI:

```typescript
// apps/backend/src/services/rag/embedder.ts

import OpenAI from 'openai';

const openai = new OpenAI();

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

async function generateEmbeddings(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
  // Batch embedding generation (max 2048 inputs per request)
  const batchSize = 100;
  const embeddedChunks: EmbeddedChunk[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.content);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    for (let j = 0; j < batch.length; j++) {
      embeddedChunks.push({
        ...batch[j],
        embedding: response.data[j].embedding,
      });
    }
  }

  return embeddedChunks;
}
```

### 3. Vector Storage

Store embeddings in Supabase pgvector:

```typescript
// apps/backend/src/services/rag/storage.ts

import { supabase } from '@/lib/supabase';

async function storeChunks(chunks: EmbeddedChunk[]): Promise<void> {
  const records = chunks.map(chunk => ({
    content: chunk.content,
    embedding: chunk.embedding,
    source: chunk.source,
    category: chunk.category,
    tags: chunk.tags,
    metadata: chunk.metadata,
  }));

  const { error } = await supabase
    .from('knowledge_chunks')
    .upsert(records, {
      onConflict: 'source,metadata->position',
    });

  if (error) throw error;
}

async function deleteChunksBySource(source: string): Promise<void> {
  const { error } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('source', source);

  if (error) throw error;
}
```

### 4. Similarity Search

Find relevant chunks for a query:

```typescript
// apps/backend/src/services/rag/retriever.ts

interface RetrievalOptions {
  threshold?: number;     // Minimum similarity (0-1)
  limit?: number;         // Max chunks to return
  category?: KnowledgeCategory;
  tags?: string[];
}

interface RetrievedChunk {
  id: string;
  content: string;
  source: string;
  category: string;
  similarity: number;
}

async function retrieveKnowledge(
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievedChunk[]> {
  const {
    threshold = 0.7,
    limit = 5,
    category,
  } = options;

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Call Supabase RPC function
  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    filter_category: category,
  });

  if (error) throw error;

  return data as RetrievedChunk[];
}
```

### 5. Context Formatting

Format retrieved chunks for AI prompt:

```typescript
// apps/backend/src/services/rag/formatter.ts

function formatRagContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return '';
  }

  const formattedChunks = chunks.map((chunk, index) => {
    return `### Reference ${index + 1} (${chunk.category})
Source: ${chunk.source}
Relevance: ${(chunk.similarity * 100).toFixed(0)}%

${chunk.content}`;
  }).join('\n\n---\n\n');

  return `## Domain Knowledge

The following information is relevant to the user's query. Use it to provide accurate responses.

${formattedChunks}

---

When using this knowledge, cite the source if providing specific definitions or formulas.`;
}
```

### 6. Integration with AI Service

Integrate RAG into chat flow:

```typescript
// apps/backend/src/services/ai/promptBuilder.ts

async function buildSystemPrompt(
  excelContext: ExcelContext,
  userMessage: string
): Promise<string> {
  // Retrieve relevant knowledge
  const knowledge = await retrieveKnowledge(userMessage, {
    threshold: 0.7,
    limit: 5,
  });

  const ragContext = formatRagContext(knowledge);

  return `You are Cellix, an AI assistant specialized in ecommerce analytics for Shopee and Lazada.

## Your Capabilities
- Read and write Excel data using tools
- Explain ecommerce KPIs and metrics
- Help with data analysis and reporting
- Provide platform-specific insights

## Current Excel Context
${formatExcelContext(excelContext)}

${ragContext}

## Rules
1. Be precise with numbers and calculations
2. Always explain your reasoning
3. For write operations, explain what you're changing and why
4. If unsure, ask for clarification
5. Cite sources when using domain knowledge`;
}
```

## Knowledge Documents

### Document Format

```markdown
# Document Title

## Metadata
- Category: kpi_definition | platform_metric | glossary | formula_rule | report_convention
- Tags: shopee, lazada, advertising, performance, financial

## Content

### Section Heading

Content goes here...

### Another Section

More content...
```

### Document Categories

| Category | Description | Example Topics |
|----------|-------------|----------------|
| `kpi_definition` | KPI definitions and calculations | ROAS, CTR, CVR, AOV |
| `platform_metric` | Platform-specific metrics | Shopee Ads, Lazada Sponsored |
| `glossary` | Ecommerce terminology | GMV, SKU, MOQ |
| `formula_rule` | Excel formula patterns | SUMIF, VLOOKUP |
| `report_convention` | Report formatting standards | Number formats, colors |

### Seed Documents

```
rag-data/
├── kpis/
│   ├── ecommerce_kpis.md        # Core KPI definitions
│   ├── shopee_metrics.md        # Shopee-specific metrics
│   └── lazada_metrics.md        # Lazada-specific metrics
├── glossary/
│   └── ecommerce_glossary.md    # Term definitions
├── formulas/
│   └── formula_library.md       # Excel formulas
└── conventions/
    └── report_conventions.md    # Formatting rules
```

## Ingestion Pipeline

### Manual Ingestion

```typescript
// scripts/ingest-rag.ts

import { glob } from 'glob';
import { readFile } from 'fs/promises';

async function ingestRagDocuments(pattern: string = 'rag-data/**/*.md') {
  const files = await glob(pattern);

  for (const file of files) {
    console.log(`Processing: ${file}`);

    const content = await readFile(file, 'utf-8');
    const { metadata, body } = parseMarkdownDocument(content);

    // Delete existing chunks from this source
    await deleteChunksBySource(file);

    // Chunk and embed
    const chunks = chunkDocument(body, file, metadata.category);
    const embedded = await generateEmbeddings(chunks);
    await storeChunks(embedded);

    console.log(`  Created ${chunks.length} chunks`);
  }

  console.log('Done!');
}
```

### Run Ingestion

```bash
# All documents
pnpm run ingest-rag

# Specific category
pnpm run ingest-rag -- --pattern "rag-data/kpis/**/*.md"
```

## Quality Metrics

### Retrieval Quality

Test retrieval with sample queries:

```typescript
const TEST_QUERIES = [
  { query: 'What is ROAS?', expectedCategory: 'kpi_definition' },
  { query: 'Shopee Ads CPC', expectedCategory: 'platform_metric' },
  { query: 'How to calculate profit margin', expectedCategory: 'formula_rule' },
];

async function testRetrieval() {
  for (const test of TEST_QUERIES) {
    const chunks = await retrieveKnowledge(test.query);
    const topChunk = chunks[0];

    console.log(`Query: ${test.query}`);
    console.log(`  Top result: ${topChunk?.source} (${topChunk?.similarity})`);
    console.log(`  Expected: ${test.expectedCategory}`);
    console.log(`  Match: ${topChunk?.category === test.expectedCategory}`);
  }
}
```

### Performance Monitoring

Track:
- Embedding generation latency
- Similarity search latency
- Token costs (embeddings)
- Retrieval relevance scores
