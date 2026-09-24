# Security policy

CareerOS currently serves one configured owner. It is not a multi-tenant authentication system. HTTPS, private ingress/rate limits, least-privilege PostgreSQL credentials, secret storage and tested backups are required for a real deployment.

Do not publish credentials, database dumps, exploit details containing private data, or personal records in public GitHub issues. Contact repository owner `@Shams261` privately through an agreed secure channel to arrange disclosure. A private reporting endpoint and response SLA have not yet been established; do not assume GitHub private vulnerability reporting is enabled.

If a secret is exposed: revoke/rotate it first, contain access, review the exposure scope and access logs, then coordinate repository history cleanup if needed. Deleting a file from the latest commit does not remove it from Git history. Do not paste tokens into chat or issue comments.

See [NFR-002/011/012](docs/engineering/non-functional-requirements.md) for current security/privacy gaps and [operations](docs/engineering/operations.md) for response steps. No security audit or compliance certification is claimed.
