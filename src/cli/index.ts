#!/usr/bin/env node

import { Command } from 'commander';
import { DocumentIndexer } from '../indexer/DocumentIndexer';
import { EmbeddingIndexer } from '../embeddings/EmbeddingIndexer';
import { SearchService } from '../search/SearchService';
import { initializeDatabase, closeDatabase } from '../db/database';

const program = new Command();

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
      await initializeDatabase();
      
      console.log(`🔍 Indexando: ${directory}`);
      const indexer = new DocumentIndexer();
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

      await closeDatabase();
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Muestra estadísticas de la base de datos')
  .action(async () => {
    try {
      await initializeDatabase();
      
      const indexer = new DocumentIndexer();
      const stats = await indexer.getStats();
      
      console.log('📊 Estadísticas:');
      console.log(`   Documentos: ${stats.documents}`);
      console.log(`   Chunks: ${stats.chunks}`);
      console.log(`   Tamaño total: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);

      await closeDatabase();
    } catch (err) {
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
      await initializeDatabase();
      
      const indexer = new EmbeddingIndexer();
      
      // Show current stats
      const beforeStats = await indexer.getStats();
      console.log('📊 Estado actual:');
      console.log(`   Total chunks: ${beforeStats.totalChunks}`);
      console.log(`   Con embeddings: ${beforeStats.embeddedChunks}`);
      console.log(`   Pendientes: ${beforeStats.pendingChunks}`);
      console.log();

      if (options.regenerate) {
        console.log('🔄 Regenerando todos los embeddings...\n');
      } else if (beforeStats.pendingChunks === 0) {
        console.log('✅ No hay chunks pendientes de embeddings.');
        await closeDatabase();
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

      await closeDatabase();
    } catch (err) {
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
      await initializeDatabase();

      const topK = parseInt(options.topK, 10) || 5;
      
      console.log(`🔍 Buscando: "${query}"`);
      console.log(`   Top K: ${topK}\n`);

      const searchService = new SearchService();
      const startTime = Date.now();
      const results = await searchService.search(query, topK);
      const duration = Date.now() - startTime;

      if (results.length === 0) {
        console.log('❌ No se encontraron resultados.');
        console.log('💡 Asegúrate de haber indexado documentos y generado embeddings.');
        await closeDatabase();
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

      await closeDatabase();
    } catch (err) {
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
      const { SearchAPI } = await import('../api/SearchAPI');
      const port = parseInt(options.port, 10) || 3456;
      
      const api = new SearchAPI(undefined, port);
      await api.start();

      console.log(`\n📡 API endpoints:`);
      console.log(`   GET  http://localhost:${port}/health`);
      console.log(`   POST http://localhost:${port}/api/search`);
      console.log(`\nPress Ctrl+C to stop`);

      // Keep the process running
      process.on('SIGINT', async () => {
        console.log('\n\n👋 Shutting down...');
        await api.stop();
        process.exit(0);
      });
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

program.parse();
