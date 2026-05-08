# Security Baseline

RailKeeper2 is intended for production use by other users, not only private experiments.

## Baseline Requirements

- no default login
- first-run setup gate
- Argon2id password hashing
- httpOnly session cookies
- SameSite cookies
- CSRF token for write requests
- rate limits for login and setup-sensitive routes
- roles: Admin, Editor, Viewer
- audit log for security-sensitive actions
- upload validation and path confinement
- backup compatibility checks before restore

## First Implementation Order

1. setup gate and admin creation
2. session storage and logout invalidation
3. CSRF middleware
4. role enforcement
5. audit events
6. rate limits

