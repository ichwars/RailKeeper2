# Architecture

RailKeeper2 is a small modular monolith. It is deployed as one process, but the code is separated by responsibility.

## Boundaries

- `api`: HTTP transport, request validation, response mapping
- `application`: use cases, transactions, authorization decisions
- `domain`: vehicle inventory model and domain rules
- `infrastructure`: SQLite, filesystem storage, backup, article search adapters

## API Contract

`openapi/railkeeper.yaml` is the public contract. Frontend types and API calls should be generated from it once the contract reaches the first implementation milestone.

## Runtime

The production runtime is a Go binary that serves:

- `/api/v1/*` for JSON APIs
- `/health` for container health checks
- static frontend files from `RAILKEEPER_STATIC_DIR`

Node.js is only used to build the frontend.

## Scope Decisions

- Vehicles are the core inventory aggregate.
- Accessories are intentionally excluded from the MVP.
- Article data web search is a core module and should be implemented through replaceable providers.
- SQLite remains the default database because it keeps local installation, backup, and restore simple.

