import { Database } from 'sqlite';
import { getDatabase } from '../db/database';
import { EmbeddingService } from '../embeddings/EmbeddingService';

export interface SearchResult {
  chunkId: number;
  documentId: number;
  content: string;
  documentPath: string;
  documentFilename: string;
  relevanceScore: number;
  chunkIndex: number;
}

export class SearchService {
  private embeddingService: EmbeddingService;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService || new EmbeddingService();
  }

  /**
   * Calculate cosine similarity between two vectors
   * Returns a value between -1 and 1, where 1 means identical direction
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimensions don't match: ${a.length} vs ${b.length}`);
    }

    if (a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Search for chunks similar to the query
   * Returns top K results sorted by relevance score
   */
  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    const db = await getDatabase();

    // Generate embedding for the query
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    if (!queryEmbedding.embedding || queryEmbedding.embedding.length === 0) {
      throw new Error('Failed to generate embedding for query');
    }

    // Get all chunks with embeddings from the database
    const chunks = await db.all(`
      SELECT 
        c.id as chunkId,
        c.document_id as documentId,
        c.content,
        c.chunk_index as chunkIndex,
        c.embedding,
        d.path as documentPath,
        d.filename as documentFilename
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.embedding IS NOT NULL
    `);

    if (!chunks || chunks.length === 0) {
      return [];
    }

    // Calculate similarity for each chunk
    const results: SearchResult[] = [];

    for (const chunk of chunks) {
      // Skip empty embeddings (failed embeddings are stored as empty buffers)
      if (!chunk.embedding || chunk.embedding.byteLength === 0) {
        continue;
      }

      const chunkEmbedding = EmbeddingService.deserializeEmbedding(chunk.embedding);
      
      // Skip empty embeddings
      if (chunkEmbedding.length === 0) {
        continue;
      }

      const similarity = SearchService.cosineSimilarity(
        queryEmbedding.embedding,
        chunkEmbedding
      );

      results.push({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        content: chunk.content,
        documentPath: chunk.documentPath,
        documentFilename: chunk.documentFilename,
        relevanceScore: similarity,
        chunkIndex: chunk.chunkIndex,
      });
    }

    // Sort by relevance score (descending) and take top K
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results.slice(0, topK);
  }

  /**
   * Get the embedding service instance
   */
  getEmbeddingService(): EmbeddingService {
    return this.embeddingService;
  }
}
