# Cursor Integration

## 1. Install

```bash
npm install -g agent-search-mcp
```

## 2. Configure Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "agent-search-mcp"
    }
  }
}
```

## 3. Use in Cursor

In Cursor's AI chat, it will automatically use the search tool when you ask it to search the web.
