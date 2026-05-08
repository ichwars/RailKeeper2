# Deployment

The default deployment target is Docker Compose with a single container and a persistent `/data` volume.

Copy `.env.example` to `.env`, then build and start:

```bash
docker compose up -d --build
```

