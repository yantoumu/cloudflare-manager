# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Cloudflare Workers Manager - A multi-account Cloudflare Workers batch management system with real-time monitoring, batch operations, and worker script management. The system uses Express.js backend with TypeScript, SQLite database, Socket.IO for real-time updates, and JWT authentication.

## Commands

### Development
```bash
npm run dev          # Start development server with tsx watch
npm run build        # Compile TypeScript to dist/
npm start            # Run production build
npm test             # Run tests with vitest
```

### Docker Deployment
```bash
# Recommended approach
docker-compose up -d --build        # Build and start services
docker-compose logs -f              # View logs
docker-compose down                 # Stop services
docker-compose down -v              # Stop and remove volumes (destroys data!)

# Manual Docker
docker build -t cloudflare-manager:latest .
docker volume create cloudflare-data
docker run -d --name cloudflare-manager -p 3000:3000 \
  -v cloudflare-data:/app/data \
  -e JWT_SECRET=your-secret-key \
  -e NODE_ENV=production \
  cloudflare-manager:latest
```

### Database Operations
```bash
sqlite3 data.db                     # Open database CLI
sqlite3 data.db ".tables"           # List all tables
sqlite3 data.db "SELECT * FROM accounts;"  # Query data
sqlite3 data.db "PRAGMA wal_checkpoint(TRUNCATE);"  # Checkpoint WAL

# Backup database
docker cp cloudflare-manager:/app/data/data.db ./data.db.backup
```

### Environment Configuration
```bash
cp .env.example .env                # Copy environment template
# Generate strong JWT secret
openssl rand -base64 32
```

### Debugging
```bash
DEBUG_CF_API=true npm run dev       # Enable Cloudflare API debugging
```

## Architecture

### Core Components

**Backend Structure (`src/`)**
- `index.ts` - Main application entry: Express server, Socket.IO setup, route registration
- `db/schema.ts` - Database initialization, table schemas, automatic migrations
- `middleware/auth.ts` - JWT authentication, master password management (bcrypt)
- `models/types.ts` - TypeScript type definitions for all domain models

**Services Layer (`src/services/`)**
- `CloudflareAPI.ts` - Cloudflare API wrapper with authentication (Token/Email+Key), debug logging, error handling
- `JobExecutor.ts` - EventEmitter-based batch job execution engine with concurrency control (default: 3), task lifecycle management, progress tracking
- `WorkersService.ts` - Worker management: caching, sync, script retrieval

**Routes (`src/routes/`)**
- `auth.ts` - Master password initialization, login, JWT token generation
- `accounts.ts` - Cloudflare account CRUD, health checks, bulk import
- `jobs.ts` - Create and execute batch jobs (create/update/delete/query/list/health_check)
- `workers.ts` - List workers, get script source, update scripts, sync cache
- `templates.ts` - Script template management

### Job System Architecture

The job system uses a hierarchical structure: Job → Tasks → Accounts

1. **Job Types**: `create`, `update`, `delete`, `query`, `list`, `health_check`
2. **Job Lifecycle**: `pending` → `running` → `completed`/`partial`/`failed`
3. **Task Lifecycle**: `pending` → `running` → `success`/`failed`/`skipped`
4. **Concurrency**: Controlled via `JobExecutor` constructor (default: 3 concurrent tasks)
5. **Real-time Updates**: WebSocket events (`task:update`, `job:completed`) broadcast to subscribed clients

### Database Schema

**Technology**: SQLite with WAL mode, foreign keys enabled

**Key Tables**:
- `system_config` - System settings (master password hash)
- `accounts` - Cloudflare accounts with auth credentials (Token or Email+Key), subdomain, status
- `jobs` - Batch job records with type, status, config JSON
- `tasks` - Individual task records per job per account
- `workers` - Cached worker metadata (name, subdomain, URL, script hash)
- `script_templates` - Reusable worker script templates
- `audit_logs` - System audit trail

**Migration Strategy**: Automatic migrations run on startup in `schema.ts`. New migrations should:
1. Check if table/column exists
2. Apply changes if needed
3. Log migration status
4. Continue gracefully on errors

### Authentication Flow

1. First use: Initialize master password via `/api/auth/init`
2. Login: Verify password via `/api/auth/login` → receive JWT token (24h expiry)
3. Protected routes: Include `Authorization: Bearer <token>` header
4. Middleware: `authenticateToken` validates JWT and extracts userId

### Cloudflare API Integration

**Authentication Methods**:
- **API Token** (recommended): `Authorization: Bearer <token>`
- **Email + Global API Key**: `X-Auth-Email` + `X-Auth-Key` headers

**Worker Creation Flow**:
1. Create worker entry (`createWorker`) → get worker ID
2. Upload script version (`uploadWorkerScript`) → get version ID
3. Deploy version (`deployWorker`) with percentage routing

**Rate Limiting**: 
- Default concurrency: 3 simultaneous API calls per job
- Adjust in `JobExecutor` constructor if hitting 429 errors
- Debug mode (`DEBUG_CF_API=true`) logs all API requests/responses with timing

## Development Guidelines

### Adding New Routes
1. Create route file in `src/routes/`
2. Export router factory function that takes `db` and dependencies
3. Register route in `src/index.ts` with `app.use()`
4. Apply `authenticateToken` middleware for protected endpoints

### Adding Database Tables
1. Add `CREATE TABLE IF NOT EXISTS` statement in `initDatabase()` in `schema.ts`
2. For existing table changes: create migration logic (check column existence, apply ALTER TABLE)
3. Update TypeScript types in `models/types.ts`
4. Test migration by removing and recreating database

### Adding Cloudflare API Methods
1. Add method to `CloudflareAPI` class following existing patterns
2. Use `this.apiRequest<T>()` wrapper for automatic debug logging and error handling
3. Return typed responses using `CFApiResponse<T>` wrapper
4. Handle Cloudflare error format: check `response.success` and extract `errors[0].message`

### Adding Job Types
1. Add type to `JobType` union in `models/types.ts`
2. Create config interface extending `BaseJobConfig`
3. Update job type CHECK constraint in database schema
4. Add case handler in `JobExecutor.executeTask()` switch statement
5. Implement execution method (e.g., `executeCreateWorker()`)

### WebSocket Events
- Clients subscribe to jobs: `socket.emit('subscribe:job', jobId)`
- Server emits: `task:update` (per task), `job:completed` (per job)
- Events broadcast to room: `job:${jobId}`

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP server port | `3000` | No |
| `JWT_SECRET` | JWT signing key | - | **Yes** |
| `DB_PATH` | SQLite database path | `./data.db` | No |
| `NODE_ENV` | Runtime environment | `development` | No |
| `DEBUG_CF_API` | Log all CF API calls | `false` | No |
| `CLIENT_URL` | CORS allowed origin | `http://localhost:5173` | No |

**Production Setup**:
```bash
NODE_ENV=production
JWT_SECRET=<generate with: openssl rand -base64 32>
DB_PATH=/app/data/data.db  # for Docker
DEBUG_CF_API=false
```

## Common Patterns

### Error Handling
- Cloudflare API errors: Extract from `response.errors[0].message`
- Database errors: Catch and log, return meaningful HTTP status codes
- Job errors: Update task status to `failed` with error message
- Always sanitize sensitive data (API tokens masked in debug logs)

### Type Safety
- Use discriminated unions for authentication types (`TokenAuth` | `EmailKeyAuth`)
- Leverage TypeScript strict mode (enabled in tsconfig.json)
- Define explicit types for all API responses and database records

### Concurrency Control
- JobExecutor uses Promise.race() to limit concurrent tasks
- Avoid overwhelming Cloudflare API (default: 3 concurrent)
- Batch operations automatically handle retry logic

### Data Persistence
- SQLite WAL mode for better concurrency
- Foreign keys enforced for referential integrity
- Atomic transactions for multi-step operations
- Cache worker metadata to reduce API calls

## Troubleshooting

**Database Locked Errors**:
- Check if WAL mode is enabled: `PRAGMA journal_mode;`
- Ensure proper cleanup on process termination (SIGINT handler)

**Cloudflare API 429 (Rate Limiting)**:
- Reduce `concurrencyLimit` in JobExecutor constructor
- Check for other processes calling same account APIs
- Wait and retry

**Docker Permission Issues**:
- Always use Named Volumes (`cloudflare-data`), not bind mounts
- Container runs as non-root user (nodejs:1001)
- Data directory owned by nodejs user

**WebSocket Connection Issues**:
- Verify CORS settings match frontend origin
- Check Socket.IO client subscribes to correct job ID
- Ensure Nginx proxy (if used) has WebSocket upgrade headers
