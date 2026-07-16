# Claude Code Integration

## 1. Install

```bash
npm install -g agent-search-mcp
```

## 2. Configure Claude Code

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "agent-search-mcp",
      "args": []
    }
  }
}
```

## 3. Use

Just ask Claude Code to search:

> "Search for the latest Next.js 15 app router patterns"

Claude Code will automatically use agent-search-mcp's `free_search` tool.
