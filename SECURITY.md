# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately by emailing **lennney@users.noreply.github.com**.

**Do not** file a public issue for security vulnerabilities.

We will acknowledge receipt within 48 hours and provide an estimated timeline for a fix.

## Scope

- **SSRF protection**: mcp-slim-guard provides IP blacklist + domain whitelist to prevent internal network probing
- **Injection detection**: 17 heuristic patterns for shell/SQL/NoSQL/prompt injection
- **Rate limiting**: token bucket per-tool or global, default 60 req/min/tool
- **Audit trail**: structured JSON audit log with rotation + compression

For mcp-slim-guard security features, see [docs/SECURITY_AUDIT.md](https://github.com/lennney/mcp-slim-guard/blob/main/docs/SECURITY_AUDIT.md).

## Supported Versions

We recommend always using the latest published version on npm.
