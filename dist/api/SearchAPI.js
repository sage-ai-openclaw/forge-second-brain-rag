"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchAPI = void 0;
const SearchService_1 = require("../search/SearchService");
const database_1 = require("../db/database");
const http_1 = __importDefault(require("http"));
const url_1 = __importDefault(require("url"));
class SearchAPI {
    searchService;
    port;
    server = null;
    constructor(searchService, port = 3456) {
        this.searchService = searchService || new SearchService_1.SearchService();
        this.port = port;
    }
    /**
     * Start the API server
     */
    async start() {
        // Initialize database
        await (0, database_1.initializeDatabase)();
        this.server = http_1.default.createServer((req, res) => {
            this.handleRequest(req, res);
        });
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, () => {
                console.log(`🚀 Search API server running on http://localhost:${this.port}`);
                resolve();
            });
            this.server.on('error', (err) => {
                reject(err);
            });
        });
    }
    /**
     * Stop the API server
     */
    async stop() {
        await (0, database_1.closeDatabase)();
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    resolve();
                });
            });
        }
    }
    /**
     * Handle incoming HTTP requests
     */
    async handleRequest(req, res) {
        const parsedUrl = url_1.default.parse(req.url || '', true);
        const path = parsedUrl.pathname;
        const method = req.method;
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        // Health check endpoint
        if (path === '/health' && method === 'GET') {
            this.sendJSON(res, 200, { status: 'ok' });
            return;
        }
        // Search endpoint
        if (path === '/api/search' && method === 'POST') {
            await this.handleSearch(req, res);
            return;
        }
        // 404 for unknown endpoints
        this.sendJSON(res, 404, { error: 'Not found' });
    }
    /**
     * Handle POST /api/search
     */
    async handleSearch(req, res) {
        try {
            const body = await this.parseBody(req);
            const searchRequest = JSON.parse(body);
            // Validate request
            if (!searchRequest.query || typeof searchRequest.query !== 'string') {
                this.sendJSON(res, 400, { error: 'Query is required and must be a string' });
                return;
            }
            const topK = searchRequest.topK && searchRequest.topK > 0
                ? Math.min(searchRequest.topK, 50) // Max 50 results
                : 5;
            const results = await this.searchService.search(searchRequest.query, topK);
            const response = {
                results,
                query: searchRequest.query,
                totalResults: results.length,
            };
            this.sendJSON(res, 200, response);
        }
        catch (error) {
            console.error('Search error:', error);
            const message = error instanceof Error ? error.message : 'Internal server error';
            this.sendJSON(res, 500, { error: message });
        }
    }
    /**
     * Parse request body
     */
    parseBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk) => {
                body += chunk.toString();
            });
            req.on('end', () => {
                resolve(body);
            });
            req.on('error', reject);
        });
    }
    /**
     * Send JSON response
     */
    sendJSON(res, statusCode, data) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }
}
exports.SearchAPI = SearchAPI;
// Start server if this file is run directly
if (require.main === module) {
    const api = new SearchAPI();
    api.start().catch((err) => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=SearchAPI.js.map