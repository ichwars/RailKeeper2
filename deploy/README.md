# Deployment

The default deployment target is Docker Compose with a single container and a persistent `/data` volume.

Copy `.env.example` to `.env` only if you want to override operational settings such as upload limits, secure cookies, the GitHub release update endpoint or a manually configured printer list. Docker Compose sets the required container paths for data, migrations, seeds and static files itself.

## Start from the published image

```bash
docker compose pull
docker compose up -d
```

By default Compose uses:

```env
RAILKEEPER_IMAGE=ghcr.io/ichwars/railkeeper2:latest
```

For a fixed release, set the image tag in `.env` before pulling:

```env
RAILKEEPER_IMAGE=ghcr.io/ichwars/railkeeper2:v0.1.3
```

Then run:

```bash
docker compose pull
docker compose up -d
```

## Build locally from source

If no published image is available yet, or if you intentionally want to build the checked-out source tree:

```bash
docker compose up -d --build
```

If an older `.env` contains `RAILKEEPER_DATA_DIR`, `RAILKEEPER_MIGRATIONS_DIR`, `RAILKEEPER_SEEDS_DIR` or `RAILKEEPER_STATIC_DIR`, remove those entries before rebuilding. These paths must stay inside the container and are fixed by `docker-compose.yml`.
