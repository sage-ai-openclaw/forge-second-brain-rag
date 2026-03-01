export interface DocumentInfo {
    path: string;
    filename: string;
    extension: string;
    content: string;
    size: number;
    modifiedAt: Date;
}
export interface IndexResult {
    indexed: number;
    updated: number;
    removed: number;
    errors: string[];
}
export declare class DocumentIndexer {
    indexDirectory(dirPath: string): Promise<IndexResult>;
    private computeHash;
    private insertDocument;
    private updateDocument;
    private deleteDocument;
    private createChunks;
    private splitIntoChunks;
    getStats(): Promise<{
        documents: number;
        chunks: number;
        totalSize: number;
    }>;
}
