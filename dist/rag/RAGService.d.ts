import { SearchService } from '../search/SearchService';
import { EmbeddingService } from '../embeddings/EmbeddingService';
export interface RAGSource {
    chunkId: number;
    documentId: number;
    documentPath: string;
    documentFilename: string;
    content: string;
    relevanceScore: number;
}
export interface RAGQueryRequest {
    query: string;
    topK?: number;
    model?: string;
    temperature?: number;
    systemPrompt?: string;
}
export interface RAGQueryResult {
    answer: string;
    sources: RAGSource[];
    model: string;
    responseTime: number;
    tokensUsed?: {
        prompt: number;
        completion: number;
        total: number;
    };
}
export interface OllamaGenerateRequest {
    model: string;
    prompt: string;
    stream?: boolean;
    options?: {
        temperature?: number;
        num_predict?: number;
    };
}
export interface OllamaGenerateResponse {
    model: string;
    response: string;
    done: boolean;
    prompt_eval_count?: number;
    eval_count?: number;
}
export interface RAGHealthCheck {
    ok: boolean;
    error?: string;
}
export declare class RAGService {
    private searchService;
    private embeddingService;
    private defaultModel;
    private defaultTemperature;
    constructor(searchService?: SearchService, embeddingService?: EmbeddingService, defaultModel?: string, defaultTemperature?: number);
    /**
     * Query documents using RAG (Retrieval Augmented Generation)
     * Legacy method - kept for compatibility
     */
    query(question: string, topK?: number): Promise<{
        answer: string;
        sources: {
            chunkId: number;
            documentPath: string;
            content: string;
            relevance: number;
        }[];
        model: string;
        promptTokens?: number;
        responseTokens?: number;
    }>;
    /**
     * Ask a question using RAG with full options
     */
    ask(request: RAGQueryRequest): Promise<RAGQueryResult>;
    /**
     * Check if Ollama is available
     */
    healthCheck(): Promise<RAGHealthCheck>;
    /**
     * Build the prompt with context
     */
    private buildPrompt;
    /**
     * Query Ollama API
     */
    private queryOllama;
}
