import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DocumentIndexer } from '../src/indexer/DocumentIndexer';
import { getDatabase } from '../src/db/database';

describe('DocumentIndexer (US1)', () => {
  async function createTempDir(): Promise<string> {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'sbrain-test-'));
  }

  async function cleanupTempDir(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true });
  }

  describe('indexDirectory', () => {
    it('should index markdown files', async () => {
      const tempDir = await createTempDir();
      
      // Create test files
      await fs.writeFile(
        path.join(tempDir, 'note1.md'),
        '# Hello World\n\nThis is a test note.'
      );
      await fs.writeFile(
        path.join(tempDir, 'note2.md'),
        '# Second Note\n\nMore content here.'
      );

      const indexer = new DocumentIndexer();
      const result = await indexer.indexDirectory(tempDir);

      expect(result.indexed).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify in database
      const db = await getDatabase();
      const docs = await db.all('SELECT * FROM documents');
      expect(docs).toHaveLength(2);
      expect(docs[0].filename).toMatch(/note\d\.md/);

      await cleanupTempDir(tempDir);
    });

    it('should skip unsupported files', async () => {
      const tempDir = await createTempDir();
      
      await fs.writeFile(path.join(tempDir, 'valid.md'), '# Valid');
      await fs.writeFile(path.join(tempDir, 'invalid.exe'), 'binary');
      await fs.writeFile(path.join(tempDir, 'image.png'), 'image');

      const indexer = new DocumentIndexer();
      const result = await indexer.indexDirectory(tempDir);

      expect(result.indexed).toBe(1);

      await cleanupTempDir(tempDir);
    });

    it('should ignore node_modules', async () => {
      const tempDir = await createTempDir();
      
      await fs.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'valid.md'), '# Valid');
      await fs.writeFile(path.join(tempDir, 'node_modules', 'bad.md'), '# Bad');

      const indexer = new DocumentIndexer();
      const result = await indexer.indexDirectory(tempDir);

      expect(result.indexed).toBe(1);

      const db = await getDatabase();
      const docs = await db.all('SELECT * FROM documents');
      expect(docs[0].filename).toBe('valid.md');

      await cleanupTempDir(tempDir);
    });

    it('should update changed files', async () => {
      const tempDir = await createTempDir();
      const filePath = path.join(tempDir, 'note.md');
      
      // First index
      await fs.writeFile(filePath, 'Original content');
      const indexer = new DocumentIndexer();
      await indexer.indexDirectory(tempDir);

      // Update file
      await new Promise(r => setTimeout(r, 100)); // Ensure different timestamp
      await fs.writeFile(filePath, 'Updated content');
      
      const result = await indexer.indexDirectory(tempDir);
      expect(result.updated).toBe(1);
      expect(result.indexed).toBe(0);

      await cleanupTempDir(tempDir);
    });

    it('should remove deleted files', async () => {
      const tempDir = await createTempDir();
      const filePath = path.join(tempDir, 'to-delete.md');
      
      // First index
      await fs.writeFile(filePath, 'Content');
      const indexer = new DocumentIndexer();
      await indexer.indexDirectory(tempDir);

      // Delete file
      await fs.unlink(filePath);
      
      const result = await indexer.indexDirectory(tempDir);
      expect(result.removed).toBe(1);

      const db = await getDatabase();
      const docs = await db.all('SELECT * FROM documents');
      expect(docs).toHaveLength(0);

      await cleanupTempDir(tempDir);
    });
  });

  describe('createChunks', () => {
    it('should create chunks for long documents', async () => {
      const tempDir = await createTempDir();
      
      // Create a long file
      const longContent = 'Word '.repeat(1000);
      await fs.writeFile(path.join(tempDir, 'long.md'), longContent);

      const indexer = new DocumentIndexer();
      await indexer.indexDirectory(tempDir);

      const db = await getDatabase();
      const chunks = await db.all('SELECT * FROM chunks');
      expect(chunks.length).toBeGreaterThan(1);

      await cleanupTempDir(tempDir);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const tempDir = await createTempDir();
      
      await fs.writeFile(path.join(tempDir, 'file1.md'), 'Content 1');
      await fs.writeFile(path.join(tempDir, 'file2.md'), 'Content 2');

      const indexer = new DocumentIndexer();
      await indexer.indexDirectory(tempDir);

      const stats = await indexer.getStats();
      expect(stats.documents).toBe(2);
      expect(stats.chunks).toBeGreaterThan(0);
      expect(stats.totalSize).toBeGreaterThan(0);

      await cleanupTempDir(tempDir);
    });
  });
});
