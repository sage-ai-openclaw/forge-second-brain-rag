import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from '../src/search/SearchService';
import { EmbeddingService } from '../src/embeddings/EmbeddingService';
import { getDatabase } from '../src/db/database';

describe('SearchService (US3)', () => {
  let mockEmbeddingService: EmbeddingService;
  let searchService: SearchService;

  beforeEach(() => {
    mockEmbeddingService = {
      generateEmbedding: vi.fn(),
      generateEmbeddings: vi.fn(),
      getModel: vi.fn().mockReturnValue('test-model'),
    } as unknown as EmbeddingService;
    
    searchService = new SearchService(mockEmbeddingService);
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      expect(SearchService.cosineSimilarity(a, b)).toBeCloseTo(1, 6);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      expect(SearchService.cosineSimilarity(a, b)).toBeCloseTo(-1, 6);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(SearchService.cosineSimilarity(a, b)).toBeCloseTo(0, 6);
    });

    it('should handle 2D vectors correctly', () => {
      const a = [1, 1];
      const b = [1, 0];
      // cos(45°) = √2/2 ≈ 0.707
      expect(SearchService.cosineSimilarity(a, b)).toBeCloseTo(0.7071, 3);
    });

    it('should handle 3D vectors correctly', () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      // dot = 1*4 + 2*5 + 3*6 = 32
      // normA = √(1+4+9) = √14
      // normB = √(16+25+36) = √77
      // similarity = 32 / (√14 * √77) ≈ 0.9746
      expect(SearchService.cosineSimilarity(a, b)).toBeCloseTo(0.9746, 3);
    });

    it('should throw error for different dimensions', () => {
      const a = [1, 2];
      const b = [1, 2, 3];
      expect(() => SearchService.cosineSimilarity(a, b)).toThrow('Vector dimensions don\'t match');
    });

    it('should return 0 for empty vectors', () => {
      const a: number[] = [];
      const b: number[] = [];
      expect(SearchService.cosineSimilarity(a, b)).toBe(0);
    });

    it('should return 0 for zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      expect(SearchService.cosineSimilarity(a, b)).toBe(0);
    });

    it('should handle negative values', () => {
      const a = [-1, -2, -3];
      const b = [1, 2, 3];
      // Vectors point in opposite directions
      expect(SearchService.cosineSimilarity(a, b)).toBeCloseTo(-1, 6);
    });

    it('should handle high-dimensional vectors', () => {
      const a = Array(768).fill(0).map((_, i) => Math.sin(i * 0.1));
      const b = Array(768).fill(0).map((_, i) => Math.sin(i * 0.1));
      expect(SearchService.cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });
  });

  describe('search', () => {
    it('should return empty array when no chunks have embeddings', async () => {
      (mockEmbeddingService.generateEmbedding as any).mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
        model: 'test-model',
      });

      const results = await searchService.search('test query');
      expect(results).toEqual([]);
    });

    it('should throw error when embedding generation fails', async () => {
      (mockEmbeddingService.generateEmbedding as any).mockResolvedValue({
        embedding: [],
        model: 'test-model',
      });

      await expect(searchService.search('test')).rejects.toThrow('Failed to generate embedding for query');
    });

    it('should return results sorted by relevance', async () => {
      const db = await getDatabase();

      // Insert test documents and chunks
      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES 
          ('/doc1.md', 'doc1.md', '.md', 'content1', 8, 'hash1'),
          ('/doc2.md', 'doc2.md', '.md', 'content2', 8, 'hash2'),
          ('/doc3.md', 'doc3.md', '.md', 'content3', 8, 'hash3')
      `);

      const docIds = await db.all('SELECT id FROM documents ORDER BY id');

      // Insert chunks with embeddings
      // doc1 chunk: very similar to query [1, 0, 0]
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES (?, 'chunk 1', 0, ?)
      `, [docIds[0].id, EmbeddingService.serializeEmbedding([0.99, 0.1, 0.1])]);

      // doc2 chunk: somewhat similar to query [1, 0, 0]
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES (?, 'chunk 2', 0, ?)
      `, [docIds[1].id, EmbeddingService.serializeEmbedding([0.7, 0.7, 0])]);

      // doc3 chunk: not similar to query [1, 0, 0]
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES (?, 'chunk 3', 0, ?)
      `, [docIds[2].id, EmbeddingService.serializeEmbedding([0, 0, 1])]);

      (mockEmbeddingService.generateEmbedding as any).mockResolvedValue({
        embedding: [1, 0, 0],
        model: 'test-model',
      });

      const results = await searchService.search('test query', 5);

      expect(results).toHaveLength(3);
      expect(results[0].chunkId).toBe(1); // doc1 chunk - highest similarity
      expect(results[1].chunkId).toBe(2); // doc2 chunk - medium similarity
      expect(results[2].chunkId).toBe(3); // doc3 chunk - lowest similarity

      // Check scores are sorted descending
      expect(results[0].relevanceScore).toBeGreaterThan(results[1].relevanceScore);
      expect(results[1].relevanceScore).toBeGreaterThan(results[2].relevanceScore);
    });

    it('should return only top K results', async () => {
      const db = await getDatabase();

      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES ('/doc.md', 'doc.md', '.md', 'content', 7, 'hash')
      `);

      const docId = (await db.get('SELECT id FROM documents')).id;

      // Insert 5 chunks
      for (let i = 0; i < 5; i++) {
        await db.run(`
          INSERT INTO chunks (document_id, content, chunk_index, embedding)
          VALUES (?, ?, 0, ?)
        `, [docId, `chunk ${i}`, EmbeddingService.serializeEmbedding([i * 0.2, 0, 1])]);
      }

      (mockEmbeddingService.generateEmbedding as any).mockResolvedValue({
        embedding: [0, 0, 1],
        model: 'test-model',
      });

      const results = await searchService.search('test', 3);

      expect(results).toHaveLength(3);
    });

    it('should include document info in results', async () => {
      const db = await getDatabase();

      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES ('/path/to/test.md', 'test.md', '.md', 'content', 7, 'hash')
      `);

      const docId = (await db.get('SELECT id FROM documents')).id;

      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES (?, 'test chunk content', 0, ?)
      `, [docId, EmbeddingService.serializeEmbedding([1, 0, 0])]);

      (mockEmbeddingService.generateEmbedding as any).mockResolvedValue({
        embedding: [1, 0, 0],
        model: 'test-model',
      });

      const results = await searchService.search('test');

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        chunkId: expect.any(Number),
        documentId: docId,
        content: 'test chunk content',
        documentPath: '/path/to/test.md',
        documentFilename: 'test.md',
        relevanceScore: expect.any(Number),
        chunkIndex: 0,
      });
    });

    it('should skip chunks with empty embeddings', async () => {
      const db = await getDatabase();

      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES ('/doc.md', 'doc.md', '.md', 'content', 7, 'hash')
      `);

      const docId = (await db.get('SELECT id FROM documents')).id;

      // Insert chunk with valid embedding
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES (?, 'valid chunk', 0, ?)
      `, [docId, EmbeddingService.serializeEmbedding([1, 0, 0])]);

      // Insert chunk with empty (failed) embedding
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES (?, 'failed chunk', 1, ?)
      `, [docId, Buffer.from(new Float32Array(0).buffer)]);

      (mockEmbeddingService.generateEmbedding as any).mockResolvedValue({
        embedding: [1, 0, 0],
        model: 'test-model',
      });

      const results = await searchService.search('test');

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('valid chunk');
    });

    it('should calculate relevance scores between -1 and 1', async () => {
      const db = await getDatabase();

      await db.run(`
        INSERT INTO documents (path, filename, extension, content, size_bytes, last_indexed_hash)
        VALUES ('/doc.md', 'doc.md', '.md', 'content', 7, 'hash')
      `);

      const docId = (await db.get('SELECT id FROM documents')).id;

      // Insert chunks with varying similarity
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index, embedding)
        VALUES 
          (?, 'same dir', 0, ?),
          (?, 'opposite', 1, ?),
          (?, 'orthogonal', 2, ?)
      `, [
        docId, EmbeddingService.serializeEmbedding([1, 0, 0]),
        docId, EmbeddingService.serializeEmbedding([-1, 0, 0]),
        docId, EmbeddingService.serializeEmbedding([0, 1, 0]),
      ]);

      (mockEmbeddingService.generateEmbedding as any).mockResolvedValue({
        embedding: [1, 0, 0],
        model: 'test-model',
      });

      const results = await searchService.search('test');

      expect(results).toHaveLength(3);
      
      // All scores should be between -1 and 1
      results.forEach(r => {
        expect(r.relevanceScore).toBeGreaterThanOrEqual(-1);
        expect(r.relevanceScore).toBeLessThanOrEqual(1);
      });

      // Same direction should be close to 1
      expect(results[0].relevanceScore).toBeCloseTo(1, 5);
    });
  });

  describe('getEmbeddingService', () => {
    it('should return the embedding service instance', () => {
      const service = searchService.getEmbeddingService();
      expect(service).toBe(mockEmbeddingService);
    });
  });
});
