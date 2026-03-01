import { SearchService, SearchResult } from '../search/SearchService';
import { EmbeddingService } from '../embeddings/EmbeddingService';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://truenas-scale:30068/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

export interface RAGSource {
  chunkId: number;
  documentId: number;
  documentPath: string;
  documentFilename: string;
  content: string;
  relevanceScore: number;
}

export interface RAGQueryRequest {
  query: string;
  topK?: number;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}

export interface RAGQueryResult {
  answer: string;
  sources: RAGSource[];
  model: string;
  responseTime: number;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface RAGHealthCheck {
  ok: boolean;
  error?: string;
}

export class RAGService {
  private searchService: SearchService;
  private embeddingService: EmbeddingService;
  private defaultModel: string;
  private defaultTemperature: number;

  constructor(
    searchService?: SearchService,
    embeddingService?: EmbeddingService,
    defaultModel: string = OLLAMA_MODEL,
    defaultTemperature: number = 0.7
  ) {
    this.searchService = searchService || new SearchService();
    this.embeddingService = embeddingService || new EmbeddingService();
    this.defaultModel = defaultModel;
    this.defaultTemperature = defaultTemperature;
  }

  /**
   * Query documents using RAG (Retrieval Augmented Generation)
   * Legacy method - kept for compatibility
   */
  async query(question: string, topK: number = 5): Promise<{
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
  }> {
    const result = await this.ask({ query: question, topK });
    return {
      answer: result.answer,
      sources: result.sources.map(s => ({
        chunkId: s.chunkId,
        documentPath: s.documentPath,
        content: s.content,
        relevance: s.relevanceScore,
      })),
      model: result.model,
    };
  }

  /**
   * Ask a question using RAG with full options
   */
  async ask(request: RAGQueryRequest): Promise<RAGQueryResult> {
    const startTime = Date.now();
    const topK = request.topK || 5;
    const model = request.model || this.defaultModel;
    const temperature = request.temperature !== undefined 
      ? request.temperature 
      : this.defaultTemperature;

    // Step 1: Search for relevant chunks
    const searchResults = await this.searchService.search(request.query, topK);
    
    if (searchResults.length === 0) {
      return {
        answer: 'No relevant documents found to answer this question.',
        sources: [],
        model,
        responseTime: Date.now() - startTime,
      };
    }

    // Step 2: Build context from retrieved chunks
    const context = searchResults
      .map((r, i) => `[${i + 1}] ${r.content}`)
      .join('\n\n');

    // Step 3: Build prompt with context
    const prompt = this.buildPrompt(request.query, context, request.systemPrompt);

    // Step 4: Query Ollama
    const ollamaResponse = await this.queryOllama(prompt, model, temperature);

    // Step 5: Format result with sources
    const sources: RAGSource[] = searchResults.map(r => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentPath: r.documentPath,
      documentFilename: r.documentFilename,
      content: r.content.substring(0, 200) + (r.content.length > 200 ? '...' : ''),
      relevanceScore: r.relevanceScore,
    }));

    return {
      answer: ollamaResponse.response,
      sources,
      model,
      responseTime: Date.now() - startTime,
      tokensUsed: ollamaResponse.tokensUsed,
    };
  }

  /**
   * Check if Ollama is available
   */
  async healthCheck(): Promise<RAGHealthCheck> {
    try {
      const response = await fetch(OLLAMA_URL.replace('/generate', '/tags'), {
        method: 'GET',
      });
      
      if (response.ok) {
        return { ok: true };
      }
      return { ok: false, error: `Ollama returned ${response.status}` };
    } catch (error) {
      return { 
        ok: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Build the prompt with context
   */
  private buildPrompt(question: string, context: string, systemPrompt?: string): string {
    const defaultSystemPrompt = `You are a helpful assistant that answers questions based on the provided context. 
Use only the information from the context to answer the question. 
If the context doesn't contain enough information, say so clearly.`;

    const sp = systemPrompt || defaultSystemPrompt;

    return `${sp}

Context:
${context}

Question: ${question}

Answer:`;
  }

  /**
   * Query Ollama API
   */
  private async queryOllama(
    prompt: string, 
    model: string, 
    temperature: number
  ): Promise<{ response: string; tokensUsed?: { prompt: number; completion: number; total: number } }> {
    try {
      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature,
            num_predict: 500,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json() as OllamaGenerateResponse;
      
      const tokensUsed = (data.prompt_eval_count || data.eval_count)
        ? {
            prompt: data.prompt_eval_count || 0,
            completion: data.eval_count || 0,
            total: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          }
        : undefined;

      return {
        response: data.response?.trim() || 'No response from model',
        tokensUsed,
      };
    } catch (error) {
      console.error('Error querying Ollama:', error);
      return {
        response: `Error: Unable to generate answer. ${error}`,
      };
    }
  }
}
