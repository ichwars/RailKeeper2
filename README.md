# RailKeeper2

RailKeeper2 is a local-first inventory application for model railway vehicles. It is designed to stay small, safe and easy to maintain, with a solid vehicle workflow before accessories or larger collection modules are added.

The application runs as one Go service that serves both the JSON API and the React frontend. Data is stored in SQLite so a private installation can stay simple to operate and back up.

## Current Features

- first-run setup without default credentials
- login, logout, server-side sessions, roles and CSRF protection
- overview dashboard with inventory, value, digital/analog, maintenance and data-quality indicators
- vehicle list with search and sortable columns
- table/card inventory view with responsive navigation
- printable/PDF inventory report with summary and vehicle detail cards
- vehicle CSV, TSV, XLSX, ODS and JSON import/export with row-by-row review and safe duplicate update mode
- vehicle create, detail, edit and delete dialogs
- configurable inventory number schemes with collision checks
- inventory number change history
- editable master data for manufacturers, categories, gauges, epochs, railway companies and symbols
- category-to-gattung dependencies for vehicle entry
- dedicated master data JSON import/export without touching inventory or uploads
- model and technical vehicle fields
- article data web search with explicit field-by-field review before applying values
- source URL storage for imported article data
- image suggestions from article search, local image uploads, primary image selection, preview and automatic JPEG/PNG thumbnails
- QR code generation with PNG/SVG download and print view
- file attachments for vehicles, including category, notes, download and PDF inline view
- maintenance and condition history per vehicle
- decoder function mapping from F0 to F31 with editable symbol master data and JSON import/export
- structured CV values with import/export and stored CV files
- local JSON backup/restore for app data and upload files with compatibility preflight
- audit log entries for setup, login/logout and vehicle changes
- OpenAPI contract in `openapi/railkeeper.yaml`
- Docker Compose deployment with persistent `/data` volume

Accessories are intentionally not part of the current scope.

## Security Baseline

RailKeeper2 is built for private or small self-hosted installations, but the defaults avoid the most common footguns:

- no default admin account
- Argon2id password hashing
- HTTP-only session cookie
- SameSite cookies
- CSRF token for write requests
- role checks for viewer/editor/admin operations
- basic login/setup rate limiting
- security headers including CSP, frame blocking and nosniff
- upload size limit and executable attachment blocking
- attachment paths confined to the configured data directory
- runtime data ignored by Git

For HTTPS deployments set:

```env
RAILKEEPER_COOKIE_SECURE=true
```

## Repository Layout

```text
backend/
  cmd/railkeeper/          Go entrypoint
  internal/api/            HTTP routes, middleware and response mapping
  internal/application/    use cases, validation and transactions
  internal/infrastructure/ SQLite, migrations and seed loading
  migrations/              SQLite schema migrations
  seeds/                   master data seed JSON
frontend/
  src/app/                 shell, routing and global styles
  src/features/            setup, auth, vehicles and settings UI
  src/shared/              API adapter and shared frontend types
openapi/
  railkeeper.yaml          API contract
docs/
  architecture.md
  roadmap.md
  security.md
deploy/
  README.md
```

## Development

Backend:

```bash
cd backend
go test ./...
go run ./cmd/railkeeper
```

Frontend:

```bash
cd frontend
npm ci
npm run build
```

Local full runtime expects the built frontend in `frontend/dist` and uses the following defaults:

```env
RAILKEEPER_ADDR=:8080
RAILKEEPER_DATA_DIR=./data
RAILKEEPER_MIGRATIONS_DIR=./backend/migrations
RAILKEEPER_SEEDS_DIR=./backend/seeds
RAILKEEPER_STATIC_DIR=./frontend/dist
RAILKEEPER_COOKIE_SECURE=false
RAILKEEPER_MAX_IMAGE_MB=10
RAILKEEPER_MAX_ATTACHMENT_MB=25
RAILKEEPER_ALLOWED_ATTACHMENT_EXTENSIONS=.pdf,.txt,.csv,.json,.xml,.zip,.jpg,.jpeg,.png,.webp
```

## Docker

Create `.env` from `.env.example`, then run:

```bash
docker compose up -d --build
```

The container stores SQLite data and uploads in `/data`. Backups can be exported from the settings UI as JSON files.

## Data Sources

Initial master data is seeded from `backend/seeds/master_data.json`. Article data web search is treated as a suggestion source only: the user chooses explicitly which fields and images are applied to a vehicle.

## Not Yet Included

- accessories
