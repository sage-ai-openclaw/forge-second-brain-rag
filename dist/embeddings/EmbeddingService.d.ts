export interface EmbeddingResult {
    embedding: number[];
    model: string;
}
export interface EmbeddingStats {
    totalChunks: number;
    embeddedChunks: number;
    pendingChunks: number;
    failedChunks: number;
}
export declare class EmbeddingService {
    private baseUrl;
    private model;
    constructor(baseUrl?: string, model?: string);
    /**
     * Generate embedding for a single text
     */
    generateEmbedding(text: string): Promise<EmbeddingResult>;
    /**
     * Generate embeddings for multiple texts in batches
     */
    generateEmbeddings(texts: string[], batchSize?: number): Promise<EmbeddingResult[]>;
    /**
     * Serialize embedding array to Buffer for storage
     */
    static serializeEmbedding(embedding: number[]): Buffer;
    /**
     * Deserialize Buffer back to embedding array
     */
    static deserializeEmbedding(buffer: Buffer): number[];
    getModel(): string;
}
