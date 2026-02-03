/**
 * Knowledge Retriever - Example Implementation
 *
 * Retrieves relevant knowledge from Supabase pgvector.
 * Formats results for AI prompt injection.
 */

import { supabase } from '@/lib/supabase';
import { generateEmbedding } from './EmbeddingService';

// =============================================================================
// Types
// =============================================================================

export type KnowledgeCategory =
  | 'kpi_definition'
  | 'platform_metric'
  | 'glossary'
  | 'formula_rule'
  | 'report_convention';

export interface KnowledgeChunk {
  id: string;
  content: string;
  source: string;
  category: KnowledgeCategory;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface RetrievalOptions {
  /** Minimum similarity score (0-1). Default: 0.7 */
  threshold?: number;
  /** Maximum number of results. Default: 5 */
  limit?: number;
  /** Filter by category */
  category?: KnowledgeCategory;
  /** Filter by tags */
  tags?: string[];
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Retrieve knowledge chunks relevant to a query.
 */
export async function retrieveKnowledge(
  query: string,
  options: RetrievalOptions = {}
): Promise<KnowledgeChunk[]> {
  const {
    threshold = 0.7,
    limit = 5,
    category,
  } = options;

  // Generate query embedding
  const { embedding: queryEmbedding } = await generateEmbedding(query);

  // Call Supabase RPC function for similarity search
  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    filter_category: category ?? null,
  });

  if (error) {
    console.error('Knowledge retrieval error:', error);
    throw new Error(`Failed to retrieve knowledge: ${error.message}`);
  }

  return (data ?? []) as KnowledgeChunk[];
}

/**
 * Retrieve knowledge with automatic query expansion.
 * Useful for complex queries that might benefit from multiple perspectives.
 */
export async function retrieveWithExpansion(
  query: string,
  options: RetrievalOptions = {}
): Promise<KnowledgeChunk[]> {
  // Extract key terms for expanded search
  const keyTerms = extractKeyTerms(query);

  // Run parallel searches
  const searches = [
    retrieveKnowledge(query, options),
    ...keyTerms.map((term) =>
      retrieveKnowledge(term, { ...options, limit: 2 })
    ),
  ];

  const results = await Promise.all(searches);

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: KnowledgeChunk[] = [];

  for (const chunks of results) {
    for (const chunk of chunks) {
      if (!seen.has(chunk.id)) {
        seen.add(chunk.id);
        merged.push(chunk);
      }
    }
  }

  // Sort by similarity and limit
  return merged
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.limit ?? 5);
}

/**
 * Search knowledge by specific category.
 */
export async function searchByCategory(
  category: KnowledgeCategory,
  query: string,
  limit: number = 5
): Promise<KnowledgeChunk[]> {
  return retrieveKnowledge(query, {
    category,
    limit,
    threshold: 0.6, // Lower threshold for category-specific search
  });
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format retrieved chunks for injection into AI prompt.
 */
export function formatForPrompt(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) {
    return '';
  }

  const formattedChunks = chunks.map((chunk, index) => {
    const confidencePercent = Math.round(chunk.similarity * 100);
    const categoryLabel = formatCategory(chunk.category);

    return `### Reference ${index + 1}: ${categoryLabel}
**Source:** ${chunk.source}
**Relevance:** ${confidencePercent}%

${chunk.content}`;
  }).join('\n\n---\n\n');

  return `## Domain Knowledge

The following information is relevant to the user's query. Use it to provide accurate, grounded responses.

${formattedChunks}

---

**Guidelines:**
- Cite sources when providing specific definitions, formulas, or metrics
- If the knowledge doesn't fully answer the question, acknowledge limitations
- Use the user's Excel context in combination with this knowledge`;
}

/**
 * Format a single chunk for display.
 */
export function formatChunk(chunk: KnowledgeChunk): string {
  return `[${formatCategory(chunk.category)}] ${chunk.content.slice(0, 200)}...`;
}

/**
 * Format category for display.
 */
function formatCategory(category: KnowledgeCategory): string {
  const labels: Record<KnowledgeCategory, string> = {
    kpi_definition: 'KPI Definition',
    platform_metric: 'Platform Metric',
    glossary: 'Glossary',
    formula_rule: 'Formula',
    report_convention: 'Convention',
  };
  return labels[category] || category;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Extract key terms from a query for expanded search.
 */
function extractKeyTerms(query: string): string[] {
  // Simple extraction: look for capitalized terms and quoted phrases
  const terms: string[] = [];

  // Extract quoted phrases
  const quoted = query.match(/"([^"]+)"/g);
  if (quoted) {
    terms.push(...quoted.map((q) => q.replace(/"/g, '')));
  }

  // Extract capitalized terms (likely KPIs or proper nouns)
  const capitalized = query.match(/\b[A-Z]{2,}\b/g);
  if (capitalized) {
    terms.push(...capitalized);
  }

  // Extract potential KPI names
  const kpiPatterns = [
    /\b(ROAS|CTR|CVR|AOV|CAC|GMV|CPC|CPM)\b/gi,
    /\b(conversion rate|click rate|return on)\b/gi,
  ];
  for (const pattern of kpiPatterns) {
    const matches = query.match(pattern);
    if (matches) {
      terms.push(...matches);
    }
  }

  // Deduplicate and limit
  return [...new Set(terms)].slice(0, 3);
}

/**
 * Check if knowledge base has relevant content for a query.
 * Useful for deciding whether to include RAG context.
 */
export async function hasRelevantKnowledge(
  query: string,
  threshold: number = 0.75
): Promise<boolean> {
  const chunks = await retrieveKnowledge(query, {
    threshold,
    limit: 1,
  });
  return chunks.length > 0;
}

// =============================================================================
// Exports
// =============================================================================

export const knowledgeRetriever = {
  retrieve: retrieveKnowledge,
  retrieveWithExpansion,
  searchByCategory,
  formatForPrompt,
  formatChunk,
  hasRelevantKnowledge,
};
