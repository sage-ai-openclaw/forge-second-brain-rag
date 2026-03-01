"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentIndexer = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../db/database");
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
class DocumentIndexer {
    async indexDirectory(dirPath) {
        const result = { indexed: 0, updated: 0, removed: 0, errors: [] };
        try {
            // Find all supported files
            const pattern = path_1.default.join(dirPath, '**/*');
            const files = await (0, glob_1.glob)(pattern, {
                ignore: IGNORE_PATTERNS,
                nodir: true,
                absolute: true,
            });
            const supportedFiles = files.filter(f => SUPPORTED_EXTENSIONS.includes(path_1.default.extname(f).toLowerCase()));
            // Get currently indexed documents
            const db = await (0, database_1.getDatabase)();
            const indexedDocs = await db.all('SELECT path, last_indexed_hash FROM documents');
            const indexedPaths = new Map(indexedDocs.map(d => [d.path, d.last_indexed_hash]));
            // Index new/updated files
            for (const filePath of supportedFiles) {
                try {
                    const stat = await promises_1.default.stat(filePath);
                    const content = await promises_1.default.readFile(filePath, 'utf-8');
                    const hash = this.computeHash(content);
                    const existingHash = indexedPaths.get(filePath);
                    if (!existingHash) {
                        // New document
                        await this.insertDocument({
                            path: filePath,
                            filename: path_1.default.basename(filePath),
                            extension: path_1.default.extname(filePath),
                            content,
                            size: stat.size,
                            modifiedAt: stat.mtime,
                        }, hash);
                        result.indexed++;
                    }
                    else if (existingHash !== hash) {
                        // Updated document
                        await this.updateDocument(filePath, content, hash, stat.mtime);
                        result.updated++;
                    }
                    // Remove from map to track deletions
                    indexedPaths.delete(filePath);
                }
                catch (err) {
                    result.errors.push(`Failed to index ${filePath}: ${err}`);
                }
            }
            // Remove deleted documents
            for (const deletedPath of indexedPaths.keys()) {
                await this.deleteDocument(deletedPath);
                result.removed++;
            }
        }
        catch (err) {
            result.errors.push(`Failed to scan directory: ${err}`);
        }
        return result;
    }
    computeHash(content) {
        return crypto_1.default.createHash('md5').update(content).digest('hex');
    }
    async insertDocument(doc, hash) {
        const db = await (0, database_1.getDatabase)();
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
        await this.createChunks(result.lastID, doc.content);
    }
    async updateDocument(path, content, hash, modifiedAt) {
        const db = await (0, database_1.getDatabase)();
        // Get document ID
        const doc = await db.get('SELECT id FROM documents WHERE path = ?', path);
        if (!doc)
            return;
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
    async deleteDocument(filePath) {
        const db = await (0, database_1.getDatabase)();
        await db.run('DELETE FROM documents WHERE path = ?', filePath);
    }
    async createChunks(documentId, content) {
        const db = await (0, database_1.getDatabase)();
        const chunks = this.splitIntoChunks(content);
        for (let i = 0; i < chunks.length; i++) {
            await db.run(`
        INSERT INTO chunks (document_id, content, chunk_index)
        VALUES (?, ?, ?)
      `, [documentId, chunks[i], i]);
        }
    }
    splitIntoChunks(content, chunkSize = 1000, overlap = 200) {
        const chunks = [];
        let start = 0;
        while (start < content.length) {
            const end = Math.min(start + chunkSize, content.length);
            chunks.push(content.slice(start, end));
            start = end - overlap;
            if (start >= end)
                start = end;
        }
        return chunks;
    }
    async getStats() {
        const db = await (0, database_1.getDatabase)();
        const docStats = await db.get('SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_size FROM documents');
        const chunkStats = await db.get('SELECT COUNT(*) as count FROM chunks');
        return {
            documents: docStats.count,
            chunks: chunkStats.count,
            totalSize: docStats.total_size,
        };
    }
}
exports.DocumentIndexer = DocumentIndexer;
//# sourceMappingURL=DocumentIndexer.js.map