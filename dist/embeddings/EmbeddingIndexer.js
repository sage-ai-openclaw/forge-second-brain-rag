"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingIndexer = void 0;
const database_1 = require("../db/database");
const EmbeddingService_1 = require("./EmbeddingService");
class EmbeddingIndexer {
    embeddingService;
    constructor(embeddingService) {
        this.embeddingService = embeddingService || new EmbeddingService_1.EmbeddingService();
    }
    /**
     * Get statistics about chunks and their embedding status
     */
    async getStats() {
        const db = await (0, database_1.getDatabase)();
        const totalResult = await db.get('SELECT COUNT(*) as count FROM chunks');
        const embeddedResult = await db.get('SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL');
        // Get chunks that failed (marked with empty embedding)
        const failedResult = await db.get('SELECT COUNT(*) as count FROM chunks WHERE embedding = ?', [Buffer.from(new Float32Array(0).buffer)]);
        return {
            totalChunks: totalResult.count,
            embeddedChunks: embeddedResult.count,
            pendingChunks: totalResult.count - embeddedResult.count,
            failedChunks: failedResult.count,
        };
    }
    /**
     * Get all chunks that need embeddings (NULL or empty embedding)
     */
    async getPendingChunks(batchSize = 100) {
        const db = await (0, database_1.getDatabase)();
        return await db.all(`SELECT id, content FROM chunks 
       WHERE embedding IS NULL 
       LIMIT ?`, [batchSize]);
    }
    /**
     * Generate and store embeddings for pending chunks
     */
    async generateEmbeddings(batchSize = 10) {
        const db = await (0, database_1.getDatabase)();
        const progress = { total: 0, processed: 0, success: 0, failed: 0 };
        // Get total count
        const stats = await this.getStats();
        progress.total = stats.pendingChunks;
        if (progress.total === 0) {
            return progress;
        }
        // Process chunks in batches
        while (true) {
            const chunks = await this.getPendingChunks(batchSize);
            if (chunks.length === 0) {
                break;
            }
            for (const chunk of chunks) {
                try {
                    const result = await this.embeddingService.generateEmbedding(chunk.content);
                    if (result.embedding.length === 0) {
                        // Mark as failed with empty embedding
                        await this.markChunkAsFailed(chunk.id);
                        progress.failed++;
                    }
                    else {
                        // Store the embedding
                        const embeddingBuffer = EmbeddingService_1.EmbeddingService.serializeEmbedding(result.embedding);
                        await this.storeEmbedding(chunk.id, embeddingBuffer);
                        progress.success++;
                    }
                }
                catch (error) {
                    // Mark as failed
                    await this.markChunkAsFailed(chunk.id);
                    progress.failed++;
                    console.error(`❌ Failed to generate embedding for chunk ${chunk.id}:`, error);
                }
                progress.processed++;
            }
        }
        return progress;
    }
    /**
     * Store embedding in the database
     */
    async storeEmbedding(chunkId, embeddingBuffer) {
        const db = await (0, database_1.getDatabase)();
        await db.run('UPDATE chunks SET embedding = ? WHERE id = ?', [embeddingBuffer, chunkId]);
    }
    /**
     * Mark a chunk as failed (with empty embedding buffer)
     */
    async markChunkAsFailed(chunkId) {
        const db = await (0, database_1.getDatabase)();
        const emptyBuffer = Buffer.from(new Float32Array(0).buffer);
        await db.run('UPDATE chunks SET embedding = ? WHERE id = ?', [emptyBuffer, chunkId]);
    }
    /**
     * Regenerate embeddings for all chunks (useful when changing models)
     */
    async regenerateAllEmbeddings() {
        const db = await (0, database_1.getDatabase)();
        // Reset all embeddings
        await db.run('UPDATE chunks SET embedding = NULL');
        // Generate new embeddings
        return await this.generateEmbeddings();
    }
    /**
     * Get embedding for a specific chunk
     */
    async getEmbedding(chunkId) {
        const db = await (0, database_1.getDatabase)();
        const result = await db.get('SELECT embedding FROM chunks WHERE id = ?', [chunkId]);
        if (!result || !result.embedding) {
            return null;
        }
        // Check if it's an empty (failed) embedding
        const buffer = Buffer.from(result.embedding);
        if (buffer.byteLength === 0) {
            return null;
        }
        return EmbeddingService_1.EmbeddingService.deserializeEmbedding(buffer);
    }
}
exports.EmbeddingIndexer = EmbeddingIndexer;
//# sourceMappingURL=EmbeddingIndexer.js.map