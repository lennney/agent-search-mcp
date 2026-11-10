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

## Request limits

MCP HTTP request bodies are limited to 256 KiB (262,144 bytes), including
chunked uploads. Larger bodies receive `413` and the connection is closed so
an unread upload cannot block a reused keep-alive socket. The SDK also rejects JSON-RPC
batches over 100 messages with `400`. Authentication runs before body parsing.

Each tool call is limited to 1,000 total array elements and object keys across
its arguments, including nested collections. Calls over that limit return a
tool error before schema validation or provider work. This guard also applies
to stdio because both transports use the same server factory. Inputs at the
limits remain accepted when otherwise valid. These limits suit search queries,
URLs and domain filters; tools do not accept document uploads.

The SDK 1.32 element guard is off by default, so retain the explicit
`maxToolInputElements` setting when changing the server factory. Keep the
explicit `maxRequestBodySize` setting on the HTTP transport as well. Dependency
updates alone do not enable both protections.

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
