"""Score hotchpotch/bekko-system-one-v0-17m on the PoC corpus (CPU).

Run with the bekko-pinned venv:
    .venv-bekko/bin/python eval/adapters/bekko.py --prompts canonical rubric
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
    render_state,
    timed,
    write_scores,
)

MODEL = "bekko-17m"
MODEL_DIR = ROOT / "cache" / "models" / "bekko-17m"
REPO = "hotchpotch/bekko-system-one-v0-17m"
REVISION = "b886a1f9b91f4e8368d7830080d52d955e2c8dfa"


def make_request(item: dict[str, Any], variant: dict[str, Any]) -> dict[str, Any]:
    state = render_state(item, variant)
    return {
        "state_json": json.dumps({"text": state}),
        "decisions": [
            {
                "id": "meaningful",
                "kind": "judgment",
                "type": "noul",
                "instructions_json": json.dumps(variant["instructions"]),
                "system_prompt": "",
                "criteria": [
                    {"id": "true", "description_json": json.dumps(variant["true"]), "value": None},
                    {"id": "false", "description_json": json.dumps(variant["false"]), "value": None},
                ],
                "documents": [],
                "scoring": None,
            }
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompts", nargs="+", default=["canonical", "rubric", "compact"])
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    import sentence_transformers
    import torch
    from sentence_transformers import SentenceTransformer

    corpus = load_corpus()
    if args.limit:
        corpus = corpus[: args.limit]
    prompts = load_prompts()["decision_variants"]

    load_start = time.perf_counter()
    sentence_model = SentenceTransformer(
        str(MODEL_DIR), device="cpu", trust_remote_code=True, local_files_only=True
    )
    typed = sentence_model[0]
    load_seconds = time.perf_counter() - load_start

    for name in args.prompts:
        variant = prompts[name]
        for item in corpus[:3]:
            typed.predict([make_request(item, variant)], show_progress_bar=False)

        rows: list[dict[str, Any]] = []
        run_start = time.perf_counter()
        for item in corpus:
            request = make_request(item, variant)
            with timed() as box:
                try:
                    result = typed.predict([request], show_progress_bar=False)
                    prob = float(result[0]["meaningful"]["probability_yes"])
                    error = None
                except Exception as exc:  # noqa: BLE001  # record per-item model failure for the report
                    prob, error = None, f"{type(exc).__name__}: {exc}"
            rows.append(
                {
                    "id": item["id"],
                    "model": MODEL,
                    "prompt": name,
                    "prob": prob,
                    "latency_ms": box["latency_ms"],
                    "error": error,
                }
            )
        total_seconds = time.perf_counter() - run_start
        meta = {
            "model": MODEL,
            "repo": REPO,
            "revision": REVISION,
            "params": 16_800_000,
            "weights_bytes": 67_198_244,
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
            "license": "none declared (excluded from recommendation)",
        }
        path = write_scores(MODEL, name, rows, meta)
        print(json.dumps({"scores": str(path), **meta}))


if __name__ == "__main__":
    main()
