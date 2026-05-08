# RailKeeper2

RailKeeper2 is the clean successor for RailKeeper: a small, production-oriented model railway inventory application focused on vehicles.

## Goals

- local-first deployment with one self-contained runtime
- no default credentials; first-run setup creates the first admin
- vehicle inventory as the core domain
- article data web search as a first-class feature
- OpenAPI as the API contract
- generated frontend API client
- SQLite for simple operation and backup
- clear backend boundaries for long-term maintenance

## Stack

- Backend: Go
- Database: SQLite
- Frontend: React with Vite
- API contract: OpenAPI
- Runtime: Go binary serving API and static frontend

## MVP Scope

- setup and admin creation
- authentication, sessions, roles, CSRF protection
- vehicle CRUD
- master data
- vehicle images and documents
- maintenance records
- decoder and CV data
- article data search
- backup and restore
- audit log
- settings

Accessories are intentionally out of scope for the MVP.

## Repository Layout

```text
backend/
  cmd/railkeeper/
  internal/
    api/
    application/
    domain/
    infrastructure/
  migrations/
frontend/
  src/
    app/
    features/
    generated/
    shared/
openapi/
docs/
deploy/
```

## Development

This repository is scaffolded first. Implementation should move module by module, starting with the API contract and backend foundation.
