import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGService } from '../src/rag/RAGService';
import { SearchService } from '../src/search/SearchService';

// Mock the SearchService
vi.mock('../src/search/SearchService');

describe('RAGService (US4)', () => {
  let ragService: RAGService;

  beforeEach(() => {
    vi.clearAllMocks();
    ragService = new RAGService();
  });

  describe('query', () => {
    it('should return answer and sources when documents found', async () => {
      const mockResults = [
        {
          chunkId: 1,
          documentPath: '/docs/test.md',
          content: 'Test content about machine learning',
          similarity: 0.95,
        },
      ];

      vi.mocked(SearchService.prototype.search).mockResolvedValue(mockResults);

      // Mock Ollama response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: 'Machine learning is a subset of AI.' }),
      });

      const result = await ragService.query('What is machine learning?');

      expect(result.answer).toBe('Machine learning is a subset of AI.');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].documentPath).toBe('/docs/test.md');
      expect(result.model).toBe('llama3.2');
    });

    it('should return no documents message when no results found', async () => {
      vi.mocked(SearchService.prototype.search).mockResolvedValue([]);

      const result = await ragService.query('Unknown topic');

      expect(result.answer).toBe('No relevant documents found to answer this question.');
      expect(result.sources).toHaveLength(0);
    });

    it('should handle Ollama API errors gracefully', async () => {
      const mockResults = [
        {
          chunkId: 1,
          documentPath: '/docs/test.md',
          content: 'Test content',
          similarity: 0.95,
        },
      ];

      vi.mocked(SearchService.prototype.search).mockResolvedValue(mockResults);

      // Mock failed Ollama response
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await ragService.query('Test question');

      expect(result.answer).toContain('Error:');
      expect(result.sources).toHaveLength(1);
    });

    it('should respect topK parameter', async () => {
      const mockResults = Array(10).fill(null).map((_, i) => ({
        chunkId: i,
        documentPath: `/docs/doc${i}.md`,
        content: `Content ${i}`,
        similarity: 0.9 - i * 0.01,
      }));

      vi.mocked(SearchService.prototype.search).mockResolvedValue(mockResults);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: 'Answer' }),
      });

      await ragService.query('Test', 3);

      expect(SearchService.prototype.search).toHaveBeenCalledWith('Test', 3);
    });
  });
});
