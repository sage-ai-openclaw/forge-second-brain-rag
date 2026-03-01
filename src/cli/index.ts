#!/usr/bin/env node

import { Command } from 'commander';
import { DocumentIndexer } from '../indexer/DocumentIndexer';
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

program.parse();
