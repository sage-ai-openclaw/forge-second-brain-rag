import { SearchService, SearchResult } from '../search/SearchService';
import { RAGService, RAGQueryRequest, RAGQueryResult } from '../rag/RAGService';
import { initializeDatabase, closeDatabase } from '../db/database';
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';

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

export class SearchAPI {
  private searchService: SearchService;
  private ragService: RAGService;
  private port: number;
  private server: http.Server | null = null;

  constructor(
    searchService?: SearchService,
    port: number = 3456
  ) {
    this.searchService = searchService || new SearchService();
    this.ragService = new RAGService(this.searchService);
    this.port = port;
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    // Initialize database
    await initializeDatabase();

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, () => {
        console.log(`🚀 Search API server running on http://localhost:${this.port}`);
        console.log(`🌐 Web UI: http://localhost:${this.port}`);
        console.log(`📡 API endpoints:`);
        console.log(`   POST http://localhost:${this.port}/api/search`);
        console.log(`   POST http://localhost:${this.port}/api/ask`);
        resolve();
      });

      this.server!.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    await closeDatabase();
    
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          resolve();
        });
      });
    }
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname;
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
    if (pathname === '/health' && method === 'GET') {
      this.sendJSON(res, 200, { status: 'ok' });
      return;
    }

    // Search endpoint
    if (pathname === '/api/search' && method === 'POST') {
      await this.handleSearch(req, res);
      return;
    }

    // RAG Ask endpoint
    if (pathname === '/api/ask' && method === 'POST') {
      await this.handleAsk(req, res);
      return;
    }

    // Static files
    if (method === 'GET') {
      await this.serveStaticFile(req, res, pathname || '/');
      return;
    }

    // 404 for unknown endpoints
    this.sendJSON(res, 404, { error: 'Not found' });
  }

  /**
   * Serve static files from the public directory
   */
  private async serveStaticFile(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string
  ): Promise<void> {
    // Default to index.html for root path
    let filePath = pathname === '/' ? '/index.html' : pathname;
    
    // Prevent directory traversal attacks
    if (filePath.includes('..')) {
      this.sendJSON(res, 403, { error: 'Forbidden' });
      return;
    }

    // Resolve the full path
    const publicDir = path.join(__dirname, '..', '..', '..', 'public');
    const fullPath = path.join(publicDir, filePath);

    // Check if file exists
    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        // Try serving index.html for SPA routing
        const indexPath = path.join(publicDir, 'index.html');
        await this.sendFile(res, indexPath, 'text/html');
        return;
      }

      // Determine content type
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = this.getContentType(ext);

      await this.sendFile(res, fullPath, contentType);
    } catch (error) {
      // File not found - serve index.html for SPA
      try {
        const indexPath = path.join(publicDir, 'index.html');
        await this.sendFile(res, indexPath, 'text/html');
      } catch {
        this.sendJSON(res, 404, { error: 'Not found' });
      }
    }
  }

  /**
   * Send a file as response
   */
  private async sendFile(
    res: http.ServerResponse,
    filePath: string,
    contentType: string
  ): Promise<void> {
    const content = await fs.promises.readFile(filePath);
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(content);
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * Handle POST /api/search
   */
  private async handleSearch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.parseBody(req);
      const searchRequest: SearchRequest = JSON.parse(body);

      // Validate request
      if (!searchRequest.query || typeof searchRequest.query !== 'string') {
        this.sendJSON(res, 400, { error: 'Query is required and must be a string' });
        return;
      }

      const topK = searchRequest.topK && searchRequest.topK > 0 
        ? Math.min(searchRequest.topK, 50) // Max 50 results
        : 5;

      const results = await this.searchService.search(searchRequest.query, topK);

      const response: SearchResponse = {
        results,
        query: searchRequest.query,
        totalResults: results.length,
      };

      this.sendJSON(res, 200, response);
    } catch (error) {
      console.error('Search error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      this.sendJSON(res, 500, { error: message });
    }
  }

  /**
   * Handle POST /api/ask
   */
  private async handleAsk(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.parseBody(req);
      const askRequest: RAGRequest = JSON.parse(body);

      // Validate request
      if (!askRequest.query || typeof askRequest.query !== 'string') {
        this.sendJSON(res, 400, { error: 'Query is required and must be a string' });
        return;
      }

      const topK = askRequest.topK && askRequest.topK > 0
        ? Math.min(askRequest.topK, 20) // Max 20 results for RAG
        : 5;

      const temperature = askRequest.temperature !== undefined
        ? Math.max(0, Math.min(1, askRequest.temperature))
        : 0.7;

      const result = await this.ragService.ask({
        query: askRequest.query,
        topK,
        model: askRequest.model,
        temperature,
        systemPrompt: askRequest.systemPrompt,
      });

      const response: RAGResponse = {
        ...result,
        success: true,
      };

      this.sendJSON(res, 200, response);
    } catch (error) {
      console.error('RAG ask error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      this.sendJSON(res, 500, { error: message });
    }
  }

  /**
   * Parse request body
   */
  private parseBody(req: http.IncomingMessage): Promise<string> {
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
  private sendJSON(res: http.ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const api = new SearchAPI();
  api.start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
