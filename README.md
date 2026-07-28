# Second Brain — Personal Knowledge RAG SaaS

Upload documents (PDF, DOCX, TXT) and chat with your knowledge base using Claude AI. Built for users accessing from China via CDN — all AI API calls happen server-side outside the GFW.

## Tech Stack

- **Frontend/API**: Next.js 16 App Router, TypeScript, Tailwind CSS, shadcn/ui
- **Chat AI**: Anthropic Claude (via Vercel AI SDK)
- **Embeddings**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Vector DB**: Qdrant Cloud
- **Object Storage**: Cloudflare R2
- **Database + Auth**: Supabase (PostgreSQL + Auth)
- **Queue**: BullMQ + Redis

## Local Development

### Prerequisites

- Node.js 18+
- Docker (for Redis)
- Accounts: Supabase, Qdrant Cloud, Cloudflare R2, OpenAI, Anthropic

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in your API keys and URLs in .env.local
```

### 3. Run Supabase schema

Open your Supabase project → SQL Editor → run once:

`supabase/migrations/001_schema_v2.sql`

Create the first admin user (set `ADMIN_PASSWORD` in `.env.local` first):

```bash
npm run create-admin
```

### 4. Start Redis

```bash
docker-compose up -d
```

### 5. Start the development servers

```bash
npm run dev:all
```

This runs both the Next.js dev server and the ingestion worker concurrently.

- App: http://localhost:3000
- Worker logs appear in the same terminal

### 6. Re-index after embedding migration

If upgrading from Voyage (512d) to OpenAI (1536d), set `QDRANT_COLLECTION_NAME=second-brain-v2` then:

```bash
npm run reindex-all
```

### 7. Evaluate retrieval quality

Upload `test-data/vietnam-startup-ecosystem.txt`, wait for ingestion, then set `EVAL_USER_ID` in `.env.local` to your user UUID and run:

```bash
npm run eval-retrieval
```

Custom dataset path: `npm run eval-retrieval -- path/to/eval.json`

Metrics reported: Hit@k, Precision@k, MRR.

### 8. Orphan cleanup (Qdrant / R2 / Postgres)

Dry run (default):

```bash
npm run cleanup-orphans
```

Delete orphans:

```bash
npm run cleanup-orphans -- --fix
```

Optional filter by user: `npm run cleanup-orphans -- --user=<uuid>`

## Production Deployment (PM2)

### Build the app

```bash
npm run build
```

### Start with PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

### Useful PM2 commands

```bash
pm2 logs                        # tail all logs
pm2 logs second-brain-web       # web server logs only
pm2 logs second-brain-worker    # ingestion worker logs only
pm2 restart ecosystem.config.js # restart all processes
pm2 stop ecosystem.config.js    # stop all
pm2 delete ecosystem.config.js  # remove from PM2
```

Logs are written to `./logs/` directory.

## Architecture

```
Browser (China CDN)
  └── Next.js Server (Singapore/HK)
        ├── /api/upload       → validate → R2 stream → BullMQ job
        ├── /api/chat         → embed question → Qdrant search → Claude stream
        ├── /api/sessions     → CRUD chat sessions
        └── /api/documents    → list + delete documents

Ingestion Worker (separate Node process)
  └── BullMQ job → download R2 → parse → chunk → embed batch → upsert Qdrant → update Postgres
```

## Proxy / Auth

`proxy.ts` protects `/chat`, `/documents`, and most API routes. **`/api/upload` is excluded** from the proxy matcher because the proxy layer buffers multipart bodies and breaks file uploads. Upload auth is enforced in the route handler.

## File Structure

```
/app
  /api          API routes (upload, chat, sessions, documents)
  /(dashboard)  Protected pages (documents, chat)
  /login        Authentication pages
  /signup
/lib
  /db           Supabase client + TypeScript types
  /vector       Qdrant client + collection management
  /storage      Cloudflare R2 client
  /queue        BullMQ + Redis singleton
  /ingestion    Parse, chunk, embed pipeline
  /upload       File validation + upload helpers
  /ai           Claude prompt template + citations
  rate-limit.ts Redis sliding window rate limiter
/workers
  ingestion-worker.ts   Standalone Node process for async ingestion
/scripts
  reindex-all.ts        Re-queue all done documents for re-embedding
/supabase/migrations
  001_init.sql          PostgreSQL schema + RLS policies
  002_note_content.sql  Inline notes support
  003_description.sql   Document descriptions
  004_indexes.sql       Performance indexes
```

## Security

- All `user_id` values come from Supabase Auth server session — never from request body
- Qdrant queries always filter by `user_id` at the query layer
- Row Level Security (RLS) enabled on all Postgres tables as defense-in-depth
- Server-side magic bytes validation before accepting file uploads
- Upload quotas: max file size, max documents per user, max total storage
- Anti-prompt-injection instruction in Claude system prompt

## Observability

- Structured JSON logs via `lib/logger.ts` (used in API routes, worker, ingestion pipeline)
- Set `SENTRY_DSN` to forward errors to Sentry automatically
- Required env vars are validated at server startup (`instrumentation.ts`) and worker boot

## Testing

```bash
npm test
```
