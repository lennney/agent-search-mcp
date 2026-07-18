#!/usr/bin/env python3
"""DDG news search backend using ddgs library."""
import sys
import json
from ddgs import DDGS

def search_news(query: str, max_results: int = 10, timelimit: str = 'w') -> list[dict]:
    try:
        results = DDGS().news(query, max_results=max_results, timelimit=timelimit)
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("body", ""),
                "date": r.get("date", ""),
                "source_name": r.get("source", ""),
            }
            for r in results
        ]
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return []

if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    timelimit = sys.argv[3] if len(sys.argv) > 3 else 'w'
    results = search_news(query, limit, timelimit)
    print(json.dumps(results, ensure_ascii=False))
