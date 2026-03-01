import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService, EmbeddingResult } from '../src/embeddings/EmbeddingService';
import { EmbeddingIndexer } from '../src/embeddings/EmbeddingIndexer';
import { getDatabase } from '../src/db/database';

describe('EmbeddingService (US2)', () => {
  describe('serialize/deserialize', () => {
    it('should serialize and deserialize embeddings correctly', () => {
      const embedding = [0.1, 0.2, 0.3, -0.4, 0.5];
      
      const buffer = EmbeddingService.serializeEmbedding(embedding);
      const deserialized = EmbeddingService.deserializeEmbedding(buffer);
      
      expect(deserialized.length).toBe(embedding.length);
      for (let i = 0; i < embedding.length; i++) {
        expect(deserialized[i]).toBeCloseTo(embedding[i], 6);
      }
    });

    it('should handle empty embeddings', () => {
      const embedding: number[] = [];
      
      const buffer = EmbeddingService.serializeEmbedding(embedding);
      const deserialized = EmbeddingService.deserializeEmbedding(buffer);
      
      expect(deserialized).toEqual([]);
    });

    it('should handle large embeddings', () => {
      const embedding = Array(1000).fill(0).map((_, i) => i * 0.001);
      
      const buffer = EmbeddingService.serializeEmbedding(embedding);
      const deserialized = EmbeddingService.deserializeEmbedding(buffer);
      
      expect(deserialized.length).toBe(embedding.length);
      expect(deserialized[0]).toBeCloseTo(0, 6);
      expect(deserialized[999]).toBeCloseTo(0.999, 6);
    });
  });

  describe('generateEmbedding', () => {
    it('should call Ollama API and return embedding', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          embedding: [0.1, 0.2, 0.3],
        }),
      });
      global.fetch = mockFetch;

      const service = new EmbeddingService('http://localhost:30068', 'test-model');
      const result = await service.generateEmbedding('test text');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:30068/api/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('test text'),
        })
      );
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe('test-model');
    });

    it('should throw on API error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      global.fetch = mockFetch;

      const service = new EmbeddingService();
      
      await expect(service.generateEmbedding('test')).rejects.toThrow('Embedding API error');
    });

    it('should throw on invalid response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invalid: 'response' }),
      });
      global.fetch = mockFetch;

      const service = new EmbeddingService();
      
      await expect(service.generateEmbedding('test')).rejects.toThrow('Invalid embedding response');
    });
  });

  describe('generateEmbeddings', () => {
    it('should process multiple texts', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          embedding: [0.1, 0.2],
        }),
      });
      global.fetch = mockFetch;

      const service = new EmbeddingService('http://localhost:30068', 'test-model');
      const results = await service.generateEmbeddings(['text1', 'text2', 'text3']);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.embedding.length === 2)).toBe(true);
    });

    it('should handle failures gracefully', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({ ok: false, status: 500, statusText: 'Error' });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ embedding: [0.1] }),
        });
      });
      global.fetch = mockFetch;

      const service = new EmbeddingService();
      const results = await service.generateEmbeddings(['text1', 'text2']);

      expect(results).toHaveLength(2);
      expect(results[0].embedding.length).toBe(1);
      expect(results[1].embedding).toEqual([]); // Failed embedding
    });
  });

  describe('getModel', () => {
    it('should return the model name', () => {
      const service = new EmbeddingService('http://test', 'my-model');
      expect(service.getModel()).toBe('my-model');
    });
  });
});

describe('EmbeddingIndexer (US2)', () => {
  let indexer: EmbeddingIndexer;

  beforeEach(() => {
    const mockService = {
      generateEmbedding: vi.fn().mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
        model: 'test-model',
      }),
      generateEmbeddings: vi.fn(),
      getModel: vi.fn().mockReturnValue('test-model'),
    };
    indexer = new EmbeddingIndexer(mockService as unknown as EmbeddingService);
  });

  describe('getStats', () => {
    it('should return correct stats', async () => {
      const db = await getDatabase();
      
      // Create test data
      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES ('/test.md', 'test.md', '.md', 'content', 7, 'hash')
      `);
      const docId = (await db.get('SELECT id FROM documents')).id;
      
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index)
        VALUES (?, 'chunk1', 0), (?, 'chunk2', 1)
      `, [docId, docId]);

      const stats = await indexer.getStats();
      
      expect(stats.totalChunks).toBe(2);
      expect(stats.embeddedChunks).toBe(0);
      expect(stats.pendingChunks).toBe(2);
    });
  });

  describe('getPendingChunks', () => {
    it('should return only chunks without embeddings', async () => {
      const db = await getDatabase();
      
      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES ('/test.md', 'test.md', '.md', 'content', 7, 'hash')
      `);
      const docId = (await db.get('SELECT id FROM documents')).id;
      
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES (?, 'chunk1', 0, NULL), (?, 'chunk2', 1, ?)
      `, [docId, docId, EmbeddingService.serializeEmbedding([0.1])]);

      const pending = await indexer.getPendingChunks();
      
      expect(pending).toHaveLength(1);
      expect(pending[0].content).toBe('chunk1');
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate and store embeddings', async () => {
      const db = await getDatabase();
      
      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES ('/test.md', 'test.md', '.md', 'content', 7, 'hash')
      `);
      const docId = (await db.get('SELECT id FROM documents')).id;
      
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index)
        VALUES (?, 'test chunk content', 0)
      `, [docId]);

      const progress = await indexer.generateEmbeddings();
      
      expect(progress.total).toBe(1);
      expect(progress.processed).toBe(1);
      expect(progress.success).toBe(1);
      expect(progress.failed).toBe(0);

      // Verify in DB
      const chunk = await db.get('SELECT * FROM chunks');
      expect(chunk.embedding).toBeTruthy();
    });

    it('should handle empty pending chunks', async () => {
      const progress = await indexer.generateEmbeddings();
      
      expect(progress.total).toBe(0);
      expect(progress.processed).toBe(0);
    });
  });

  describe('regenerateAllEmbeddings', () => {
    it('should reset and regenerate all embeddings', async () => {
      const db = await getDatabase();
      
      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES ('/test.md', 'test.md', '.md', 'content', 7, 'hash')
      `);
      const docId = (await db.get('SELECT id FROM documents')).id;
      
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES (?, 'chunk', 0, ?)
      `, [docId, EmbeddingService.serializeEmbedding([0.5])]);

      const progress = await indexer.regenerateAllEmbeddings();
      
      expect(progress.total).toBe(1);
      expect(progress.processed).toBe(1);
    });
  });

  describe('getEmbedding', () => {
    it('should return embedding for a chunk', async () => {
      const db = await getDatabase();
      
      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES ('/test.md', 'test.md', '.md', 'content', 7, 'hash')
      `);
      const docId = (await db.get('SELECT id FROM documents')).id;
      
      const originalEmbedding = [0.1, 0.2, 0.3];
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES (?, 'chunk', 0, ?)
      `, [docId, EmbeddingService.serializeEmbedding(originalEmbedding)]);

      const chunk = await db.get('SELECT id FROM chunks');
      const retrieved = await indexer.getEmbedding(chunk.id);
      
      expect(retrieved).toHaveLength(3);
      expect(retrieved![0]).toBeCloseTo(0.1, 6);
      expect(retrieved![1]).toBeCloseTo(0.2, 6);
      expect(retrieved![2]).toBeCloseTo(0.3, 6);
    });

    it('should return null for non-existent chunk', async () => {
      const result = await indexer.getEmbedding(999);
      expect(result).toBeNull();
    });

    it('should return null for failed embedding', async () => {
      const db = await getDatabase();
      
      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES ('/test.md', 'test.md', '.md', 'content', 7, 'hash')
      `);
      const docId = (await db.get('SELECT id FROM documents')).id;
      
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES (?, 'chunk', 0, ?)
      `, [docId, Buffer.from(new Float32Array(0).buffer)]);

      const chunk = await db.get('SELECT id FROM chunks');
      const result = await indexer.getEmbedding(chunk.id);
      
      expect(result).toBeNull();
    });
  });
});
