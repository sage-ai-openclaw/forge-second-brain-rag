import { SearchService, SearchResult } from '../search/SearchService';
export interface SearchRequest {
    query: string;
    topK?: number;
}
export interface SearchResponse {
    results: SearchResult[];
    query: string;
    totalResults: number;
}
export interface ErrorResponse {
    error: string;
}
export declare class SearchAPI {
    private searchService;
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
     * Handle POST /api/search
     */
    private handleSearch;
    /**
     * Parse request body
     */
    private parseBody;
    /**
     * Send JSON response
     */
    private sendJSON;
}
