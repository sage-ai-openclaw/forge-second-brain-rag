#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const DocumentIndexer_1 = require("../indexer/DocumentIndexer");
const EmbeddingIndexer_1 = require("../embeddings/EmbeddingIndexer");
const SearchService_1 = require("../search/SearchService");
const RAGService_1 = require("../rag/RAGService");
const database_1 = require("../db/database");
const program = new commander_1.Command();
program
    .name('sbrain')
    .description('Second Brain RAG - Indexa documentos y permite búsqueda semántica')
    .version('1.0.0');
program
    .command('index')
    .description('Indexa un directorio')
    .argument('<directory>', 'Directorio a indexar')
    .action(async (directory) => {
    try {
        await (0, database_1.initializeDatabase)();
        console.log(`🔍 Indexando: ${directory}`);
        const indexer = new DocumentIndexer_1.DocumentIndexer();
        const result = await indexer.indexDirectory(directory);
        console.log('\n✅ Indexación completa:');
        console.log(`   Nuevos documentos: ${result.indexed}`);
        console.log(`   Documentos actualizados: ${result.updated}`);
        console.log(`   Documentos eliminados: ${result.removed}`);
        if (result.errors.length > 0) {
            console.log(`\n⚠️  Errores (${result.errors.length}):`);
            result.errors.slice(0, 5).forEach(e => console.log(`   - ${e}`));
        }
        const stats = await indexer.getStats();
        console.log(`\n📊 Total en base de datos:`);
        console.log(`   Documentos: ${stats.documents}`);
        console.log(`   Chunks: ${stats.chunks}`);
        console.log(`   Tamaño total: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
        await (0, database_1.closeDatabase)();
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
program
    .command('stats')
    .description('Muestra estadísticas de la base de datos')
    .action(async () => {
    try {
        await (0, database_1.initializeDatabase)();
        const indexer = new DocumentIndexer_1.DocumentIndexer();
        const stats = await indexer.getStats();
        console.log('📊 Estadísticas:');
        console.log(`   Documentos: ${stats.documents}`);
        console.log(`   Chunks: ${stats.chunks}`);
        console.log(`   Tamaño total: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
        await (0, database_1.closeDatabase)();
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
program
    .command('embed')
    .description('Genera embeddings para todos los chunks pendientes')
    .option('-r, --regenerate', 'Regenerar todos los embeddings')
    .action(async (options) => {
    try {
        await (0, database_1.initializeDatabase)();
        const indexer = new EmbeddingIndexer_1.EmbeddingIndexer();
        // Show current stats
        const beforeStats = await indexer.getStats();
        console.log('📊 Estado actual:');
        console.log(`   Total chunks: ${beforeStats.totalChunks}`);
        console.log(`   Con embeddings: ${beforeStats.embeddedChunks}`);
        console.log(`   Pendientes: ${beforeStats.pendingChunks}`);
        console.log();
        if (options.regenerate) {
            console.log('🔄 Regenerando todos los embeddings...\n');
        }
        else if (beforeStats.pendingChunks === 0) {
            console.log('✅ No hay chunks pendientes de embeddings.');
            await (0, database_1.closeDatabase)();
            return;
        }
        console.log('🧠 Generando embeddings (esto puede tomar tiempo)...\n');
        const startTime = Date.now();
        const progress = options.regenerate
            ? await indexer.regenerateAllEmbeddings()
            : await indexer.generateEmbeddings();
        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n✅ Completado en ${duration.toFixed(2)}s:`);
        console.log(`   Procesados: ${progress.processed}/${progress.total}`);
        console.log(`   Exitosos: ${progress.success}`);
        console.log(`   Fallidos: ${progress.failed}`);
        // Show final stats
        const afterStats = await indexer.getStats();
        console.log(`\n📊 Estado final:`);
        console.log(`   Total chunks: ${afterStats.totalChunks}`);
        console.log(`   Con embeddings: ${afterStats.embeddedChunks}`);
        console.log(`   Modelo: qwen3-embedding:8b`);
        await (0, database_1.closeDatabase)();
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
program
    .command('search')
    .description('Busca documentos similares a tu consulta')
    .argument('<query>', 'Consulta de búsqueda')
    .option('-k, --top-k <number>', 'Número de resultados (default: 5)', '5')
    .action(async (query, options) => {
    try {
        await (0, database_1.initializeDatabase)();
        const topK = parseInt(options.topK, 10) || 5;
        console.log(`🔍 Buscando: "${query}"`);
        console.log(`   Top K: ${topK}\n`);
        const searchService = new SearchService_1.SearchService();
        const startTime = Date.now();
        const results = await searchService.search(query, topK);
        const duration = Date.now() - startTime;
        if (results.length === 0) {
            console.log('❌ No se encontraron resultados.');
            console.log('💡 Asegúrate de haber indexado documentos y generado embeddings.');
            await (0, database_1.closeDatabase)();
            return;
        }
        console.log(`✅ ${results.length} resultados encontrados (${duration}ms):\n`);
        results.forEach((result, index) => {
            const score = (result.relevanceScore * 100).toFixed(1);
            console.log(`${index + 1}. 📄 ${result.documentFilename} (Score: ${score}%)`);
            console.log(`   📂 ${result.documentPath}`);
            console.log(`   📝 ${result.content.substring(0, 200)}${result.content.length > 200 ? '...' : ''}`);
            console.log();
        });
        await (0, database_1.closeDatabase)();
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
program
    .command('ask')
    .description('Haz una pregunta y obtén una respuesta basada en tus documentos (RAG)')
    .argument('<question>', 'Pregunta a responder')
    .option('-k, --top-k <number>', 'Número de documentos a usar como contexto (default: 5)', '5')
    .option('-m, --model <model>', 'Modelo de Ollama a usar (default: llama3.2)', 'llama3.2')
    .option('-t, --temperature <number>', 'Temperatura para generación (0.0-1.0, default: 0.7)', '0.7')
    .action(async (question, options) => {
    try {
        await (0, database_1.initializeDatabase)();
        const topK = parseInt(options.topK, 10) || 5;
        const temperature = parseFloat(options.temperature) || 0.7;
        console.log(`🤔 Pregunta: "${question}"`);
        console.log(`   Modelo: ${options.model}`);
        console.log(`   Contexto: Top ${topK} documentos\n`);
        // Check Ollama health
        const ragService = new RAGService_1.RAGService(undefined, undefined, options.model, temperature);
        const health = await ragService.healthCheck();
        if (!health.ok) {
            console.error(`❌ Ollama no disponible: ${health.error}`);
            console.log('💡 Asegúrate de que Ollama esté corriendo en truenas-scale:30068');
            await (0, database_1.closeDatabase)();
            process.exit(1);
        }
        console.log('🔍 Buscando documentos relevantes...');
        const startTime = Date.now();
        const result = await ragService.ask({
            query: question,
            topK,
            model: options.model,
            temperature,
        });
        console.log(`\n${'='.repeat(60)}`);
        console.log('💬 RESPUESTA:');
        console.log(`${'='.repeat(60)}`);
        console.log(result.answer);
        console.log(`${'='.repeat(60)}\n`);
        // Show sources
        if (result.sources.length > 0) {
            console.log('📚 Fuentes utilizadas:');
            result.sources.forEach((source, index) => {
                const score = (source.relevanceScore * 100).toFixed(1);
                console.log(`   ${index + 1}. ${source.documentFilename} (Score: ${score}%)`);
            });
        }
        // Show stats
        console.log(`\n⏱️  Tiempo de respuesta: ${result.responseTime}ms`);
        if (result.tokensUsed && result.tokensUsed.total > 0) {
            console.log(`📝 Tokens: ${result.tokensUsed.prompt} prompt + ${result.tokensUsed.completion} completion = ${result.tokensUsed.total} total`);
        }
        await (0, database_1.closeDatabase)();
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
program
    .command('api')
    .description('Inicia el servidor API de búsqueda')
    .option('-p, --port <number>', 'Puerto (default: 3456)', '3456')
    .action(async (options) => {
    try {
        const { SearchAPI } = await Promise.resolve().then(() => __importStar(require('../api/SearchAPI')));
        const port = parseInt(options.port, 10) || 3456;
        const api = new SearchAPI(undefined, port);
        await api.start();
        console.log(`\n🌐 Web UI: http://localhost:${port}`);
        console.log(`\n📡 API endpoints:`);
        console.log(`   GET  http://localhost:${port}/health`);
        console.log(`   POST http://localhost:${port}/api/search`);
        console.log(`   POST http://localhost:${port}/api/ask`);
        console.log(`\nPress Ctrl+C to stop`);
        // Keep the process running
        process.on('SIGINT', async () => {
            console.log('\n\n👋 Shutting down...');
            await api.stop();
            process.exit(0);
        });
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
program.parse();
//# sourceMappingURL=index.js.map