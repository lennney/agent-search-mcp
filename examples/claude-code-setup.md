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

Ask Claude Code to use Agent Search's `free_search` tool. Run `/mcp` in
Claude Code to check that the server is connected before searching.

## 4. Optional: cross-check with Parallel Search MCP

For a second search source, connect [Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp)
alongside Agent Search. It provides hosted web search in Fast mode and page
fetching, with no account or API key needed. Anonymous access is intended for
light use and has rate limits.

From your project directory, register the optional server:

```bash
claude mcp add --transport http --scope local parallel-search https://search.parallel.ai/mcp --header "User-Agent: agent-search-mcp"
claude mcp get parallel-search
```

Local scope saves the entry for this project in your personal Claude Code
configuration. Keep your existing `agent-search` entry. Restart Claude Code,
then run `/mcp` to confirm both servers are connected and approve tool use when
prompted. See [Claude Code's MCP guide](https://code.claude.com/docs/en/mcp)
for other configuration scopes.

Use the server names explicitly when asking for a cross-check:

> Use Agent Search's `free_search` to find the official Node.js release
> schedule. Then use parallel-search's `web_search` to look for the official
> schedule, and `web_fetch` to read a selected source if the excerpts are
> insufficient. Compare the URLs and dates, cite the evidence, and report any
> disagreements or failed requests.

Agent Search exposes `free_search`, `free_search_advanced`, and `free_extract`;
Parallel exposes `web_search` and `web_fetch`. Clients may prefix tool names
with the server name. If a tool is missing, check `/mcp` before continuing.

The two servers return separate results. Parallel is not registered as an
Agent Search engine: its calls do not participate in Agent Search's provider
policy, request budgets, evidence packet, or `source_count`. Agreement between
servers alone does not establish independent evidence; inspect the underlying
sources. Each Parallel request sends its query or selected URL to Parallel.

To remove the optional server from this project:

```bash
claude mcp remove --scope local parallel-search
```
