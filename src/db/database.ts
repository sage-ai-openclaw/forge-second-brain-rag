import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

let db: Database | null = null;

function getDbPath(): string {
  return process.env.SBRAIN_DB || path.join(process.cwd(), 'data', 'second-brain.db');
}

export async function getDatabase(): Promise<Database> {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export async function initializeDatabase(): Promise<Database> {
  if (db) return db;

  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await createTables();
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}

async function createTables(): Promise<void> {
  const database = await getDatabase();

  // Documents table
  await database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      extension TEXT,
      content TEXT NOT NULL,
      size_bytes INTEGER,
      modified_at DATETIME,
      indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_indexed_hash TEXT
    )
  `);

  // Chunks table (for embedding)
  await database.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      embedding BLOB,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);

  // Indexes
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id)`);
}
