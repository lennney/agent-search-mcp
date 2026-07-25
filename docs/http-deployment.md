# HTTP Deployment Guide

Agent Search MCP keeps stdio as the zero-configuration local default. HTTP mode is intended for controlled network deployment and requires authentication unless the operator explicitly opts out.

## Secure local start

Generate a high-entropy token and pass it through the environment rather than a config file:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"

HTTP_AUTH_TOKEN="replace-with-generated-token" \
ALLOWED_ORIGINS="https://agent.example.com" \
MODE=http PORT=3000 npx agent-search-mcp
```

Clients call the MCP endpoint with:

```http
Authorization: Bearer replace-with-generated-token
```

`GET /health` remains unauthenticated for process and load-balancer probes. It does not expose MCP tools or search results.

## Origin policy

`ALLOWED_ORIGINS` is a comma-separated exact allowlist for browser `Origin` values. Requests without an Origin header, such as normal server-to-server MCP clients, are still accepted after Bearer authentication. Requests with an unlisted Origin receive `403`.

Set `ENABLE_CORS=true` only when a browser client needs CORS response headers. Avoid `*` when credentials are involved; list the actual HTTPS origins.

## Reverse proxy checklist

- Terminate TLS at the proxy; do not expose plain HTTP outside a trusted network.
- Preserve the `Authorization`, `Origin`, and `Mcp-Session-Id` headers.
- Apply connection and request-rate limits at the proxy.
- Store `HTTP_AUTH_TOKEN` in a secret manager and rotate it by restarting the service with a new value.
- Restrict `/health` at the network layer if infrastructure metadata is considered sensitive.
- Keep logs free of Authorization headers and tokens.

## Explicit unauthenticated mode

For an isolated local development network only:

```bash
HTTP_ALLOW_UNAUTHENTICATED=true MODE=http npx agent-search-mcp
```

This is an explicit risk acceptance. Origin checks still apply to browser requests; set `ALLOWED_ORIGINS` when browser access is required.
