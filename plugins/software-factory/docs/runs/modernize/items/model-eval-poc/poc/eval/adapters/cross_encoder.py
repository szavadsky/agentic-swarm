"""Score the CrossEncoder baselines (ettin-reranker and MiniLM) on the PoC corpus.

Run with the main PoC venv:
    .venv/bin/python eval/adapters/cross_encoder.py --model ettin --prompts current query_first rubric_query
    .venv/bin/python eval/adapters/cross_encoder.py --model minilm --prompts current query_first rubric_query
"""

from __future__ import annotations

import argparse
import json
import time
from typing import Any

from common import (
    ROOT,
    load_corpus,
    load_prompts,
    peak_rss_mb,
    render_query,
    sigmoid,
    timed,
    write_scores,
)

MODELS: dict[str, dict[str, Any]] = {
    "ettin": {
        "slug": "ettin-reranker-150m",
        "dir": ROOT / "cache" / "models" / "ettin-reranker-150m",
        "repo": "cross-encoder/ettin-reranker-150m-v1",
        "revision": "025501c4e0f9bbeb4c5b198318e0089ff061cc14",
        "params": 149_014_272,
        "weights_bytes": 596_070_136 + 2_359_384 + 6_296 + 3_220,
        "excluded_reason": None,
        "note": "trained reranker; raw relevance logit converted with sigmoid",
    },
    "minilm": {
        "slug": "minilm-l6-v2",
        "dir": ROOT / "cache" / "models" / "minilm-l6-v2",
        "repo": "sentence-transformers/all-MiniLM-L6-v2",
        "revision": "1110a243fdf4706b3f48f1d95db1a4f5529b4d41",
        "params": 22_713_728,
        "weights_bytes": 90_868_376,
        "excluded_reason": (
            "no trained decision head: CrossEncoder newly initialized classifier.weight/bias "
            "(transformers LOAD REPORT); accuracy row is not comparable, latency/RSS only"
        ),
        "note": "embedding model used as CrossEncoder baseline; untrained head",
    },
}


def make_pair(item: dict[str, Any], variant: dict[str, Any]) -> tuple[str, str]:
    justification = str(item["justification"])
    query = render_query(item, variant)
    if variant["order"] == "justification_first":
        return justification, query
    return query, justification


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=sorted(MODELS), required=True)
    parser.add_argument("--prompts", nargs="+", default=["current", "query_first", "rubric_query"])
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    import sentence_transformers
    import torch
    from sentence_transformers import CrossEncoder

    spec = MODELS[args.model]
    corpus = load_corpus()
    if args.limit:
        corpus = corpus[: args.limit]
    prompts = load_prompts()["reranker_variants"]

    load_start = time.perf_counter()
    model = CrossEncoder(str(spec["dir"]), device="cpu")
    load_seconds = time.perf_counter() - load_start

    for name in args.prompts:
        variant = prompts[name]
        for item in corpus[:3]:
            model.predict([make_pair(item, variant)])

        rows: list[dict[str, Any]] = []
        run_start = time.perf_counter()
        for item in corpus:
            pair = make_pair(item, variant)
            with timed() as box:
                try:
                    raw = float(model.predict([pair])[0])
                    prob = sigmoid(raw)
                    error = None
                except Exception as exc:  # noqa: BLE001  # record per-item model failure for the report
                    raw, prob, error = None, None, f"{type(exc).__name__}: {exc}"
            rows.append(
                {
                    "id": item["id"],
                    "model": spec["slug"],
                    "prompt": name,
                    "prob": prob,
                    "raw": raw,
                    "latency_ms": box["latency_ms"],
                    "error": error,
                }
            )
        total_seconds = time.perf_counter() - run_start
        meta = {
            "model": spec["slug"],
            "repo": spec["repo"],
            "revision": spec["revision"],
            "params": spec["params"],
            "weights_bytes": spec["weights_bytes"],
            "device": "cpu",
            "dtype": "float32",
            "torch_threads": torch.get_num_threads(),
            "python": __import__("sys").version,
            "torch": torch.__version__,
            "transformers": __import__("transformers").__version__,
            "sentence_transformers": sentence_transformers.__version__,
            "prompt": name,
            "n": len(rows),
            "load_seconds": load_seconds,
            "total_seconds": total_seconds,
            "peak_rss_mb": peak_rss_mb(),
            "errors": sum(1 for r in rows if r["error"]),
            "excluded_reason": spec["excluded_reason"],
            "note": spec["note"],
        }
        path = write_scores(str(spec["slug"]), name, rows, meta)
        print(json.dumps({"scores": str(path), **meta}))


if __name__ == "__main__":
    main()
