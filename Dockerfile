# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend ./
RUN npm run build

FROM golang:1.25-alpine AS backend-build
WORKDIR /src/backend
COPY backend/go.mod ./
RUN go mod download
COPY backend ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/railkeeper ./cmd/railkeeper

FROM alpine:3.22 AS runtime
RUN apk add --no-cache ca-certificates tzdata \
  && adduser -D -H -u 10001 railkeeper \
  && mkdir -p /app/web /data \
  && chown -R railkeeper:railkeeper /app /data
COPY --from=backend-build /out/railkeeper /usr/local/bin/railkeeper
COPY --from=frontend-build /src/frontend/dist /app/web
COPY backend/migrations /app/migrations
COPY backend/seeds /app/seeds
USER railkeeper
ENV RAILKEEPER_ADDR=:8080 \
  RAILKEEPER_DATA_DIR=/data \
  RAILKEEPER_MIGRATIONS_DIR=/app/migrations \
  RAILKEEPER_SEEDS_DIR=/app/seeds \
  RAILKEEPER_STATIC_DIR=/app/web
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["railkeeper", "healthcheck"]
ENTRYPOINT ["railkeeper"]
