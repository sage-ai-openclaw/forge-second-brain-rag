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
export declare class SearchService {
    private embeddingService;
    constructor(embeddingService?: EmbeddingService);
    /**
     * Calculate cosine similarity between two vectors
     * Returns a value between -1 and 1, where 1 means identical direction
     */
    static cosineSimilarity(a: number[], b: number[]): number;
    /**
     * Search for chunks similar to the query
     * Returns top K results sorted by relevance score
     */
    search(query: string, topK?: number): Promise<SearchResult[]>;
    /**
     * Get the embedding service instance
     */
    getEmbeddingService(): EmbeddingService;
}
