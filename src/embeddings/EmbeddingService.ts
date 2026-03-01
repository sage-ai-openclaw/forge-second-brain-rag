export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

export interface EmbeddingStats {
  totalChunks: number;
  embeddedChunks: number;
  pendingChunks: number;
  failedChunks: number;
}

export class EmbeddingService {
  private baseUrl: string;
  private model: string;

  constructor(
    baseUrl: string = 'http://truenas-scale:30068',
    model: string = 'qwen3-embedding:8b'
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
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

    interface EmbeddingResponse {
      embedding?: number[];
    }

    const data = await response.json() as EmbeddingResponse;
    
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
  async generateEmbeddings(texts: string[], batchSize: number = 10): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.generateEmbedding(text));
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
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
  static serializeEmbedding(embedding: number[]): Buffer {
    // Store as Float32Array for efficiency
    const floatArray = new Float32Array(embedding);
    return Buffer.from(floatArray.buffer);
  }

  /**
   * Deserialize Buffer back to embedding array
   */
  static deserializeEmbedding(buffer: Buffer): number[] {
    const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    return Array.from(floatArray);
  }

  getModel(): string {
    return this.model;
  }
}
