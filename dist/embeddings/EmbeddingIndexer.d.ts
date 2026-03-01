import { EmbeddingService, EmbeddingStats } from './EmbeddingService';
export interface EmbeddingProgress {
    total: number;
    processed: number;
    success: number;
    failed: number;
}
export declare class EmbeddingIndexer {
    private embeddingService;
    constructor(embeddingService?: EmbeddingService);
    /**
     * Get statistics about chunks and their embedding status
     */
    getStats(): Promise<EmbeddingStats>;
    /**
     * Get all chunks that need embeddings (NULL or empty embedding)
     */
    getPendingChunks(batchSize?: number): Promise<Array<{
        id: number;
        content: string;
    }>>;
    /**
     * Generate and store embeddings for pending chunks
     */
    generateEmbeddings(batchSize?: number): Promise<EmbeddingProgress>;
    /**
     * Store embedding in the database
     */
    private storeEmbedding;
    /**
     * Mark a chunk as failed (with empty embedding buffer)
     */
    private markChunkAsFailed;
    /**
     * Regenerate embeddings for all chunks (useful when changing models)
     */
    regenerateAllEmbeddings(): Promise<EmbeddingProgress>;
    /**
     * Get embedding for a specific chunk
     */
    getEmbedding(chunkId: number): Promise<number[] | null>;
}
