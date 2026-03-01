import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import crypto from 'crypto';
import { getDatabase } from '../db/database';

export interface DocumentInfo {
  path: string;
  filename: string;
  extension: string;
  content: string;
  size: number;
  modifiedAt: Date;
}

export interface IndexResult {
  indexed: number;
  updated: number;
  removed: number;
  errors: string[];
}

const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.js', '.ts', '.jsx', '.tsx', '.json', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.html', '.css', '.sql', '.yaml', '.yml'];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.openclaw/**',
  '**/data/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/package-lock.json',
  '**/yarn.lock',
];

export class DocumentIndexer {
  async indexDirectory(dirPath: string): Promise<IndexResult> {
    const result: IndexResult = { indexed: 0, updated: 0, removed: 0, errors: [] };
    
    try {
      // Find all supported files
      const pattern = path.join(dirPath, '**/*');
      const files = await glob(pattern, {
        ignore: IGNORE_PATTERNS,
        nodir: true,
        absolute: true,
      });

      const supportedFiles = files.filter(f => 
        SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase())
      );

      // Get currently indexed documents
      const db = await getDatabase();
      const indexedDocs = await db.all('SELECT path, last_indexed_hash FROM documents');
      const indexedPaths = new Map(indexedDocs.map(d => [d.path, d.last_indexed_hash]));

      // Index new/updated files
      for (const filePath of supportedFiles) {
        try {
          const stat = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          const hash = this.computeHash(content);

          const existingHash = indexedPaths.get(filePath);
          
          if (!existingHash) {
            // New document
            await this.insertDocument({
              path: filePath,
              filename: path.basename(filePath),
              extension: path.extname(filePath),
              content,
              size: stat.size,
              modifiedAt: stat.mtime,
            }, hash);
            result.indexed++;
          } else if (existingHash !== hash) {
            // Updated document
            await this.updateDocument(filePath, content, hash, stat.mtime);
            result.updated++;
          }

          // Remove from map to track deletions
          indexedPaths.delete(filePath);
        } catch (err) {
          result.errors.push(`Failed to index ${filePath}: ${err}`);
        }
      }

      // Remove deleted documents
      for (const deletedPath of indexedPaths.keys()) {
        await this.deleteDocument(deletedPath);
        result.removed++;
      }

    } catch (err) {
      result.errors.push(`Failed to scan directory: ${err}`);
    }

    return result;
  }

  private computeHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private async insertDocument(doc: DocumentInfo, hash: string): Promise<void> {
    const db = await getDatabase();
    const result = await db.run(`
      INSERT INTO documents (path, filename, extension, content, size_bytes, modified_at, last_indexed_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      doc.path,
      doc.filename,
      doc.extension,
      doc.content,
      doc.size,
      doc.modifiedAt.toISOString(),
      hash,
    ]);

    // Create chunks for the document
    await this.createChunks(result.lastID!, doc.content);
  }

  private async updateDocument(path: string, content: string, hash: string, modifiedAt: Date): Promise<void> {
    const db = await getDatabase();
    
    // Get document ID
    const doc = await db.get('SELECT id FROM documents WHERE path = ?', path);
    if (!doc) return;

    // Update document
    await db.run(`
      UPDATE documents 
      SET content = ?, size_bytes = ?, modified_at = ?, last_indexed_hash = ?, indexed_at = CURRENT_TIMESTAMP
      WHERE path = ?
    `, [content, content.length, modifiedAt.toISOString(), hash, path]);

    // Delete old chunks and create new ones
    await db.run('DELETE FROM chunks WHERE document_id = ?', doc.id);
    await this.createChunks(doc.id, content);
  }

  private async deleteDocument(filePath: string): Promise<void> {
    const db = await getDatabase();
    await db.run('DELETE FROM documents WHERE path = ?', filePath);
  }

  private async createChunks(documentId: number, content: string): Promise<void> {
    const db = await getDatabase();
    const chunks = this.splitIntoChunks(content);

    for (let i = 0; i < chunks.length; i++) {
      await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index)
        VALUES (?, ?, ?)
      `, [documentId, chunks[i], i]);
    }
  }

  private splitIntoChunks(content: string, chunkSize: number = 1000, overlap: number = 200): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      chunks.push(content.slice(start, end));
      start = end - overlap;
      if (start >= end) start = end;
    }

    return chunks;
  }

  async getStats(): Promise<{ documents: number; chunks: number; totalSize: number }> {
    const db = await getDatabase();
    
    const docStats = await db.get('SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_size FROM documents');
    const chunkStats = await db.get('SELECT COUNT(*) as count FROM chunks');

    return {
      documents: docStats.count,
      chunks: chunkStats.count,
      totalSize: docStats.total_size,
    };
  }
}
