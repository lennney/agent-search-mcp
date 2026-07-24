"""
Persistent Python subprocess for semantic dedup + rerank using Model2Vec.

Reads JSON commands from stdin (one per line), writes JSON responses to
stdout (one per line). The model is loaded lazily on the first request.
"""

import json
import sys
import threading
from typing import Any

import numpy as np

# Global model cache — lazy-loaded on first request.
_model = None
_model_lock = threading.Lock()


def _get_model(model_name: str):
    """Load (or retrieve cached) Model2Vec StaticModel.

    Logs loading to stderr on first load. Thread-safe via a lock so only
    one thread pays the ~5.8 s cold-start cost.
    """
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:  # double-check after acquiring lock
            return _model
        print(f"Loading model {model_name}...", file=sys.stderr, flush=True)
        from model2vec import StaticModel

        _model = StaticModel.from_pretrained(model_name)
        print(f"Model {model_name} loaded (dim={_model.dim}).", file=sys.stderr, flush=True)
    return _model


def _cosine_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    """Compute pairwise cosine similarity matrix for a batch of vectors.

    Args:
        embeddings: Shape (N, D) array of embeddings.

    Returns:
        Shape (N, N) matrix where [i, j] = cosine_sim(vec_i, vec_j).
    """
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    normalized = embeddings / np.maximum(norms, 1e-12)
    return normalized @ normalized.T


def _cosine_similarities(query_emb: np.ndarray, doc_embs: np.ndarray) -> np.ndarray:
    """Compute cosine similarity between a single query and many documents.

    Args:
        query_emb: Shape (D,) query embedding.
        doc_embs:  Shape (N, D) document embeddings.

    Returns:
        Shape (N,) array of cosine similarities.
    """
    q_norm = np.linalg.norm(query_emb)
    d_norms = np.linalg.norm(doc_embs, axis=1)
    return (doc_embs @ query_emb) / np.maximum(d_norms * q_norm, 1e-12)


def handle_embed(cmd: dict[str, Any]) -> dict[str, Any]:
    """Embed a list of texts and return the dense vectors."""
    model_name = cmd.get("model", "minishlab/M2V_base_output")
    texts: list[str] = cmd["texts"]
    model = _get_model(model_name)
    emb = model.encode(texts)
    # Convert to list-of-lists for JSON serialization.
    return {"embeddings": emb.tolist()}


def handle_dedup(cmd: dict[str, Any]) -> dict[str, Any]:
    """Remove near-duplicate texts, keeping the one with higher confidence.

    For every pair with cosine similarity above *threshold*, the item with
    the lower confidence value is pruned.

    Items are sorted by confidence descending before dedup to make the
    outcome deterministic when confidences are equal.
    """
    texts: list[str] = cmd["texts"]
    confidences: list[float] = cmd.get("confidences", [1.0] * len(texts))
    threshold: float = cmd.get("threshold", 0.85)
    model_name: str = cmd.get("model", "minishlab/M2V_base_output")

    if len(texts) == 0:
        return {"keep_indices": [], "removed_count": 0}

    # Sort by confidence descending for deterministic dedup.
    # We track original indices so we can map back after pruning.
    n = len(texts)
    sorted_order = sorted(range(n), key=lambda i: confidences[i], reverse=True)
    texts_sorted = [texts[i] for i in sorted_order]

    model = _get_model(model_name)
    emb = model.encode(texts_sorted)
    sim_matrix = _cosine_similarity_matrix(emb)

    keep_sorted = set(range(n))

    # Only walk the upper triangle (i < j) since the matrix is symmetric.
    for i in range(n):
        for j in range(i + 1, n):
            if sim_matrix[i, j] > threshold:
                # Higher confidence always comes first after sorting.
                keep_sorted.discard(j)

    # Map back to original indices.
    keep_indices = sorted(sorted_order[i] for i in keep_sorted)
    removed_count = n - len(keep_indices)
    return {"keep_indices": keep_indices, "removed_count": removed_count}


def handle_rerank(cmd: dict[str, Any]) -> dict[str, Any]:
    """Rerank texts by cosine similarity to the query, returning top-k."""
    query: str = cmd["query"]
    texts: list[str] = cmd["texts"]
    top_k: int = cmd.get("top_k", len(texts))
    model_name: str = cmd.get("model", "minishlab/M2V_base_output")

    if len(texts) == 0:
        return {"order": [], "scores": []}

    model = _get_model(model_name)

    # Encode query and documents together to batch the inference.
    all_texts = [query] + texts
    all_emb = model.encode(all_texts)

    query_emb = all_emb[0]
    doc_embs = all_emb[1:]

    scores = _cosine_similarities(query_emb, doc_embs)

    # Sort descending by score.
    sorted_indices = np.argsort(-scores)

    # Truncate to top_k.
    top_indices = sorted_indices[:top_k].tolist()
    top_scores = scores[sorted_indices[:top_k]].tolist()

    return {"order": top_indices, "scores": top_scores}


def main() -> None:
    """Event loop: read JSON commands from stdin, dispatch, write responses."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            cmd = json.loads(line)
            action = cmd.get("action")

            if action == "embed":
                response = handle_embed(cmd)
            elif action == "dedup":
                response = handle_dedup(cmd)
            elif action == "rerank":
                response = handle_rerank(cmd)
            elif action == "ping":
                response = {"ok": True}
            else:
                response = {"error": f"Unknown action: {action}"}
        except Exception as exc:
            response = {"error": str(exc)}

        # Echo the request id for correlation. If absent (e.g. malformed
        # command), the TS side will drop the response via _pending.get(undefined).
        response["id"] = cmd.get("id")
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
