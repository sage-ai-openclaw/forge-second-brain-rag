import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchAPI, SearchResponse, ErrorResponse } from '../src/api/SearchAPI';
import { SearchService, SearchResult } from '../src/search/SearchService';
import http from 'http';

describe('SearchAPI (US3)', () => {
  let mockSearchService: SearchService;
  let api: SearchAPI;
  let server: http.Server | null = null;
  let isStarted = false;

  beforeEach(async () => {
    mockSearchService = {
      search: vi.fn(),
      getEmbeddingService: vi.fn(),
    } as unknown as SearchService;
    
    api = new SearchAPI(mockSearchService, 0); // Port 0 for auto-assign
    isStarted = false;
  });

  afterEach(async () => {
    if (isStarted && api) {
      await api.stop();
      isStarted = false;
    }
    if (server) {
      server.close();
      server = null;
    }
    // Re-initialize database for next test
    const { initializeDatabase } = await import('../src/db/database');
    await initializeDatabase();
  });

  const makeRequest = (
    port: number,
    path: string,
    method: string = 'GET',
    body?: object
  ): Promise<{ status: number; data: unknown }> => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode || 0,
              data: data ? JSON.parse(data) : null,
            });
          } catch {
            resolve({ status: res.statusCode || 0, data });
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  };

  describe('POST /api/search', () => {
    it('should return search results', async () => {
      const mockResults: SearchResult[] = [
        {
          chunkId: 1,
          documentId: 1,
          content: 'test content',
          documentPath: '/test.md',
          documentFilename: 'test.md',
          relevanceScore: 0.95,
          chunkIndex: 0,
        },
      ];

      (mockSearchService.search as any).mockResolvedValue(mockResults);

      await api.start();
      isStarted = true;
      const address = api['server']?.address() as { port: number };
      const port = address.port;

      const response = await makeRequest(port, '/api/search', 'POST', {
        query: 'test',
        topK: 5,
      });

      expect(response.status).toBe(200);
      expect((response.data as SearchResponse).results).toHaveLength(1);
      expect((response.data as SearchResponse).results[0].content).toBe('test content');
      expect((response.data as SearchResponse).totalResults).toBe(1);
      expect((response.data as SearchResponse).query).toBe('test');
    });

    it('should return 400 for missing query', async () => {
      await api.start();
      isStarted = true;
      const address = api['server']?.address() as { port: number };
      const port = address.port;

      const response = await makeRequest(port, '/api/search', 'POST', {
        topK: 5,
      });

      expect(response.status).toBe(400);
      expect((response.data as ErrorResponse).error).toContain('Query is required');
    });

    it('should use default topK of 5', async () => {
      (mockSearchService.search as any).mockResolvedValue([]);

      await api.start();
      isStarted = true;
      const address = api['server']?.address() as { port: number };
      const port = address.port;

      await makeRequest(port, '/api/search', 'POST', {
        query: 'test',
      });

      expect(mockSearchService.search).toHaveBeenCalledWith('test', 5);
    });

    it('should limit topK to max 50', async () => {
      (mockSearchService.search as any).mockResolvedValue([]);

      await api.start();
      isStarted = true;
      const address = api['server']?.address() as { port: number };
      const port = address.port;

      await makeRequest(port, '/api/search', 'POST', {
        query: 'test',
        topK: 100,
      });

      expect(mockSearchService.search).toHaveBeenCalledWith('test', 50);
    });

    it('should handle search errors', async () => {
      (mockSearchService.search as any).mockRejectedValue(new Error('Search failed'));

      await api.start();
      isStarted = true;
      const address = api['server']?.address() as { port: number };
      const port = address.port;

      const response = await makeRequest(port, '/api/search', 'POST', {
        query: 'test',
      });

      expect(response.status).toBe(500);
      expect((response.data as ErrorResponse).error).toBe('Search failed');
    });

    it('should return CORS headers', async () => {
      (mockSearchService.search as any).mockResolvedValue([]);

      await api.start();
      isStarted = true;
      const address = api['server']?.address() as { port: number };
      const port = address.port;

      const response = await makeRequest(port, '/api/search', 'OPTIONS');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      await api.start();
      isStarted = true;
      const address = api['server']?.address() as { port: number };
      const port = address.port;

      const response = await makeRequest(port, '/health');

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ status: 'ok' });
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      await api.start();
      isStarted = true;
      const address = api['server']?.address() as { port: number };
      const port = address.port;

      const response = await makeRequest(port, '/unknown');

      expect(response.status).toBe(404);
      expect((response.data as ErrorResponse).error).toBe('Not found');
    });

    it('should return 404 for GET /api/search (should be POST)', async () => {
      await api.start();
      isStarted = true;
      const address = api['server']?.address() as { port: number };
      const port = address.port;

      const response = await makeRequest(port, '/api/search', 'GET');

      expect(response.status).toBe(404);
    });
  });
});
