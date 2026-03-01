# Second Brain RAG

Sistema RAG (Retrieval Augmented Generation) local. Indexa documentos del workspace (docs, notes, código, PDFs) y permite búsqueda semántica con respuestas generadas por Ollama.

## Features

- ✅ CLI indexer that scans directories for documents
- Embedding generation for document chunks (TODO)
- Semantic search via cosine similarity (TODO)
- RAG query with Ollama for answers (TODO)
- Web UI for querying (TODO)

## Installation

```bash
npm install
npm run build
```

## Usage

### Indexar un directorio

```bash
npm start -- index ~/workspace
# o
./dist/cli/index.js index ~/workspace
```

### Ver estadísticas

```bash
npm start -- stats
```

## Formatos soportados

- Markdown (.md)
- Texto (.txt)
- Código: .js, .ts, .jsx, .tsx, .json, .py, .rs, .go, .java, .c, .cpp, .h
- Web: .html, .css
- Config: .sql, .yaml, .yml

## Base de datos

SQLite con tablas:
- `documents` - Documentos indexados
- `chunks` - Fragmentos para embedding

## Development

```bash
npm run dev index ~/workspace
npm test
```
