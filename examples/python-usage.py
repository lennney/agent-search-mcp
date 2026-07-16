"""
Agent Search MCP — Python usage example.

Requires: pip install mcp
"""
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    # Launch agent-search-mcp as a subprocess
    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "agent-search-mcp"],
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # List available tools
            tools = await session.list_tools()
            print(f"Available tools: {[t.name for t in tools.tools]}")

            # Search
            result = await session.call_tool(
                "free_search",
                arguments={"query": "Next.js 15 server components best practices", "limit": 5}
            )
            print(f"\nSearch results:\n{result.content[0].text}")

asyncio.run(main())
