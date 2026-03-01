import { Database } from 'sqlite';
export declare function getDatabase(): Promise<Database>;
export declare function initializeDatabase(): Promise<Database>;
export declare function closeDatabase(): Promise<void>;
