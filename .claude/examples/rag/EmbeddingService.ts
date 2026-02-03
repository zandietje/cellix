/**
 * Embedding Service - Example Implementation
 *
 * Generates embeddings using OpenAI text-embedding-3-small.
 * Handles batching and error recovery.
 */

import OpenAI from 'openai';

// =============================================================================
// Configuration
// =============================================================================

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 100; // OpenAI allows up to 2048, but smaller is safer
const MAX_INPUT_TOKENS = 8191; // Model limit

// =============================================================================
// Client
// =============================================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =============================================================================
// Types
// =============================================================================

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  totalTokens: number;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Generate embedding for a single text.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  // Truncate if too long (rough estimate: 1 token ≈ 4 chars)
  const maxChars = MAX_INPUT_TOKENS * 4;
  const truncatedText = text.length > maxChars ? text.slice(0, maxChars) : text;

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncatedText,
  });

  return {
    embedding: response.data[0].embedding,
    tokenCount: response.usage?.total_tokens ?? 0,
  };
}

/**
 * Generate embeddings for multiple texts.
 * Handles batching automatically.
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0 };
  }

  const allEmbeddings: number[][] = [];
  let totalTokens = 0;

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    // Truncate each text if needed
    const maxChars = MAX_INPUT_TOKENS * 4;
    const truncatedBatch = batch.map((text) =>
      text.length > maxChars ? text.slice(0, maxChars) : text
    );

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: truncatedBatch,
    });

    // Extract embeddings in order
    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }

    totalTokens += response.usage?.total_tokens ?? 0;

    // Small delay between batches to avoid rate limits
    if (i + MAX_BATCH_SIZE < texts.length) {
      await sleep(100);
    }
  }

  return {
    embeddings: allEmbeddings,
    totalTokens,
  };
}

/**
 * Calculate cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find most similar embeddings from a list.
 */
export function findMostSimilar(
  queryEmbedding: number[],
  candidates: Array<{ id: string; embedding: number[] }>,
  topK: number = 5,
  threshold: number = 0.7
): Array<{ id: string; similarity: number }> {
  const similarities = candidates
    .map((candidate) => ({
      id: candidate.id,
      similarity: cosineSimilarity(queryEmbedding, candidate.embedding),
    }))
    .filter((item) => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return similarities;
}

// =============================================================================
// Text Processing Utilities
// =============================================================================

/**
 * Estimate token count for a text.
 * Uses rough approximation: 1 token ≈ 4 characters.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks suitable for embedding.
 */
export function splitForEmbedding(
  text: string,
  maxTokens: number = 500,
  overlap: number = 100
): string[] {
  const maxChars = maxTokens * 4;
  const overlapChars = overlap * 4;

  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + maxChars / 2) {
        end = breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());

    // Move start with overlap
    start = end - overlapChars;
  }

  return chunks;
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Exports
// =============================================================================

export const embeddingService = {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  findMostSimilar,
  estimateTokenCount,
  splitForEmbedding,
  EMBEDDING_DIMENSIONS,
};
