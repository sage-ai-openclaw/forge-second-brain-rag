"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
class EmbeddingService {
    baseUrl;
    model;
    constructor(baseUrl = 'http://truenas-scale:30068', model = 'qwen3-embedding:8b') {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.model = model;
    }
    /**
     * Generate embedding for a single text
     */
    async generateEmbedding(text) {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                prompt: text,
            }),
        });
        if (!response.ok) {
            throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.embedding || !Array.isArray(data.embedding)) {
            throw new Error('Invalid embedding response: missing embedding array');
        }
        return {
            embedding: data.embedding,
            model: this.model,
        };
    }
    /**
     * Generate embeddings for multiple texts in batches
     */
    async generateEmbeddings(texts, batchSize = 10) {
        const results = [];
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchPromises = batch.map(text => this.generateEmbedding(text));
            const batchResults = await Promise.allSettled(batchPromises);
            for (let j = 0; j < batchResults.length; j++) {
                const result = batchResults[j];
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                }
                else {
                    // Return null for failed embeddings
                    results.push({ embedding: [], model: this.model });
                }
            }
        }
        return results;
    }
    /**
     * Serialize embedding array to Buffer for storage
     */
    static serializeEmbedding(embedding) {
        // Store as Float32Array for efficiency
        const floatArray = new Float32Array(embedding);
        return Buffer.from(floatArray.buffer);
    }
    /**
     * Deserialize Buffer back to embedding array
     */
    static deserializeEmbedding(buffer) {
        const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
        return Array.from(floatArray);
    }
    getModel() {
        return this.model;
    }
}
exports.EmbeddingService = EmbeddingService;
//# sourceMappingURL=EmbeddingService.js.map