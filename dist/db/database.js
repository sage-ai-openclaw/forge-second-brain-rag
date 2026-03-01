"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabase = getDatabase;
exports.initializeDatabase = initializeDatabase;
exports.closeDatabase = closeDatabase;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let db = null;
function getDbPath() {
    return process.env.SBRAIN_DB || path_1.default.join(process.cwd(), 'data', 'second-brain.db');
}
async function getDatabase() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}
async function initializeDatabase() {
    if (db)
        return db;
    const dbPath = getDbPath();
    const dir = path_1.default.dirname(dbPath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    db = await (0, sqlite_1.open)({
        filename: dbPath,
        driver: sqlite3_1.default.Database,
    });
    await createTables();
    return db;
}
async function closeDatabase() {
    if (db) {
        await db.close();
        db = null;
    }
}
async function createTables() {
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
//# sourceMappingURL=database.js.map