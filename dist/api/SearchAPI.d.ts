import { SearchService, SearchResult } from '../search/SearchService';
import { RAGQueryResult } from '../rag/RAGService';
export interface SearchRequest {
    query: string;
    topK?: number;
}
export interface SearchResponse {
    results: SearchResult[];
    query: string;
    totalResults: number;
}
export interface RAGRequest {
    query: string;
    topK?: number;
    model?: string;
    temperature?: number;
    systemPrompt?: string;
}
export interface RAGResponse extends RAGQueryResult {
    success: boolean;
}
export interface ErrorResponse {
    error: string;
}
export declare class SearchAPI {
    private searchService;
    private ragService;
    private port;
    private server;
    constructor(searchService?: SearchService, port?: number);
    /**
     * Start the API server
     */
    start(): Promise<void>;
    /**
     * Stop the API server
     */
    stop(): Promise<void>;
    /**
     * Handle incoming HTTP requests
     */
    private handleRequest;
    /**
     * Serve static files from the public directory
     */
    private serveStaticFile;
    /**
     * Send a file as response
     */
    private sendFile;
    /**
     * Get content type based on file extension
     */
    private getContentType;
    /**
     * Handle POST /api/search
     */
    private handleSearch;
    /**
     * Handle POST /api/ask
     */
    private handleAsk;
    /**
     * Parse request body
     */
    private parseBody;
    /**
     * Send JSON response
     */
    private sendJSON;
}
