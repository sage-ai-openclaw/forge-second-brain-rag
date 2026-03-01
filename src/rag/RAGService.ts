import { SearchService } from './SearchService';
import { EmbeddingService } from '../embeddings/EmbeddingService';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://truenas-scale:30068/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

export interface RAGResult {
  answer: string;
  sources: {
    chunkId: number;
    documentPath: string;
    content: string;
    relevance: number;
  }[];
  model: string;
  promptTokens?: number;
  responseTokens?: number;
}

export class RAGService {
  private searchService: SearchService;
  private embeddingService: EmbeddingService;

  constructor() {
    this.searchService = new SearchService();
    this.embeddingService = new EmbeddingService();
  }

  async query(question: string, topK: number = 5): Promise<RAGResult> {
    // Step 1: Search for relevant chunks
    const searchResults = await this.searchService.search(question, topK);
    
    if (searchResults.length === 0) {
      return {
        answer: 'No relevant documents found to answer this question.',
        sources: [],
        model: OLLAMA_MODEL,
      };
    }

    // Step 2: Build context from retrieved chunks
    const context = searchResults
      .map((r, i) => `[${i + 1}] ${r.content}`)
      .join('\n\n');

    // Step 3: Build prompt with context
    const prompt = this.buildPrompt(question, context);

    // Step 4: Query Ollama
    const response = await this.queryOllama(prompt);

    // Step 5: Format result with sources
    return {
      answer: response,
      sources: searchResults.map(r => ({
        chunkId: r.chunkId,
        documentPath: r.documentPath,
        content: r.content.substring(0, 200) + (r.content.length > 200 ? '...' : ''),
        relevance: r.similarity,
      })),
      model: OLLAMA_MODEL,
    };
  }

  private buildPrompt(question: string, context: string): string {
    return `You are a helpful assistant that answers questions based on the provided context. 
Use only the information from the context to answer the question. 
If the context doesn't contain enough information, say so.

Context:
${context}

Question: ${question}

Answer:`;
  }

  private async queryOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 500,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return data.response?.trim() || 'No response from model';
    } catch (error) {
      console.error('Error querying Ollama:', error);
      return `Error: Unable to generate answer. ${error}`;
    }
  }
}
