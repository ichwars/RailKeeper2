# Deployment

The default deployment target is Docker Compose with a single container and a persistent `/data` volume.

Copy `.env.example` to `.env` only if you want to override operational settings such as upload limits, secure cookies or the GitHub release update endpoint. Docker Compose sets the required container paths for data, migrations, seeds and static files itself.

Build and start:

```bash
docker compose up -d --build
```

If an older `.env` contains `RAILKEEPER_DATA_DIR`, `RAILKEEPER_MIGRATIONS_DIR`, `RAILKEEPER_SEEDS_DIR` or `RAILKEEPER_STATIC_DIR`, remove those entries before rebuilding. These paths must stay inside the container and are fixed by `docker-compose.yml`.
