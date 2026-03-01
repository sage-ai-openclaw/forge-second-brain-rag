import { beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeDatabase, closeDatabase, getDatabase } from '../src/db/database';

process.env.SBRAIN_DB = ':memory:';

beforeAll(async () => {
  await initializeDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

beforeEach(async () => {
  const db = await getDatabase();
  await db.run('DELETE FROM chunks');
  await db.run('DELETE FROM documents');
});
