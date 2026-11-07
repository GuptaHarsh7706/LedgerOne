"""
Local Vector Embedding Engine (Phase 6).
Generates 384-dimensional dense vectors using SentenceTransformer (all-MiniLM-L6-v2)
with local NVIDIA RTX 3050 CUDA hardware acceleration.
Includes L2-normalization for zero-cost cosine distance calculations in pgvector.
"""
from __future__ import annotations

from functools import lru_cache
import hashlib
import logging
from typing import List, Optional, Sequence
import numpy as np
import torch

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSION = 384
DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"

_global_embedding_model = None


def get_embedding_model():
    """Lazy-load and cache the SentenceTransformer embedding model."""
    global _global_embedding_model
    if _global_embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer

            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info("Initializing SentenceTransformer on device: %s", device)
            _global_embedding_model = SentenceTransformer(DEFAULT_MODEL_NAME, device=device)
        except Exception as exc:
            logger.warning("Failed to initialize SentenceTransformer (%s); using fallback hash generator", exc)
            _global_embedding_model = "FALLBACK"
    return _global_embedding_model


def _generate_deterministic_fallback_vector(text: str, dim: int = EMBEDDING_DIMENSION) -> List[float]:
    """Generate a reproducible, L2-normalized 384-d pseudo-vector when transformer model is offline."""
    h = hashlib.sha256(text.encode("utf-8")).digest()
    rng = np.random.RandomState(int.from_bytes(h[:4], "big"))
    vec = rng.randn(dim).astype(np.float32)
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec.tolist()


def embed_texts(texts: Sequence[str]) -> List[List[float]]:
    """
    Generate L2-normalized 384-dimensional embeddings for a batch of strings.
    Returns list of float lists.
    """
    if not texts:
        return []

    model = get_embedding_model()
    if model != "FALLBACK":
        try:
            embeddings = model.encode(
                list(texts),
                batch_size=32,
                show_progress_bar=False,
                normalize_embeddings=True,
            )
            return [emb.tolist() for emb in embeddings]
        except Exception as exc:
            logger.error("Transformer embedding failed: %s; falling back to deterministic vectors", exc)

    return [_generate_deterministic_fallback_vector(t) for t in texts]


@lru_cache(maxsize=1024)
def embed_query(query: str) -> List[float]:
    """Generate normalized 384-dimensional embedding for a single search query (LRU cached)."""
    res = embed_texts([query])
    return res[0] if res else [0.0] * EMBEDDING_DIMENSION


def vector_to_pg_str(vec: Sequence[float]) -> str:
    """Format float sequence as PostgreSQL vector literal string '[0.123, -0.456, ...]'."""
    return f"[{','.join(f'{x:.6f}' for x in vec)}]"
