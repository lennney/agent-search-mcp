#!/usr/bin/env python3
"""DDG search backend using ddgs library (bypasses anti-bot)."""
import sys
import json
from ddgs import DDGS

def search(query: str, max_results: int = 10) -> list[dict]:
    try:
        results = DDGS().text(query, max_results=max_results)
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
                "source": "duckduckgo",
            }
            for r in results
        ]
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return []

if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    results = search(query, limit)
    print(json.dumps(results, ensure_ascii=False))
