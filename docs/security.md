# Security

RailKeeper2 is intended for local-first and small self-hosted installations. This document describes the implemented baseline and the remaining hardening work.

## Implemented

- no default credentials
- first-run setup gate
- Argon2id password hashing
- random session and CSRF tokens
- session token hashes stored in SQLite
- HTTP-only session cookie
- SameSite cookies
- current-user password change with automatic revocation of other sessions
- admin password resets revoke the affected user's active sessions
- optional secure cookies via `RAILKEEPER_COOKIE_SECURE=true`
- CSRF validation for API write requests
- role enforcement with Admin, Editor, Viewer and Messe roles
- admin-only user management for local accounts and role assignment
- admin-only session review and targeted local session revocation
- persistent rate limiting for login and setup attempts
- audit logs for setup, login, logout and vehicle changes
- structured security event review in the settings area
- configurable image and attachment upload size limits
- configurable allowed attachment extensions via `RAILKEEPER_ALLOWED_ATTACHMENT_EXTENSIONS`
- executable attachment extension blocklist
- server-side MIME detection for attachments
- attachment storage path confinement to the configured data directory
- static asset cache separation from API responses
- security headers: `nosniff`, `same-origin` referrer policy, frame blocking, permissions policy and CSP

## Operational Notes

- Put RailKeeper2 behind HTTPS before setting `RAILKEEPER_COOKIE_SECURE=true`.
- Keep the `/data` directory private and backed up.
- Do not expose the service directly to the internet without a reverse proxy and TLS.
- Article search fetches third-party pages and should be considered untrusted input; results are suggestions and require explicit user selection.

## Open Hardening Work

- optional public read-only vehicle pages with explicit per-item enablement
