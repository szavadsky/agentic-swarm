"""Score fastino/GLiDE-0.4B on the PoC corpus (CPU, float32).

Run with the GLiDE-pinned venv:
    .venv-glide/bin/python eval/adapters/glide.py --prompts canonical rubric
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

from common import (
    ROOT,
    decision_question,
    load_corpus,
    load_prompts,
    peak_rss_mb,
    render_state,
    timed,
    write_scores,
)

MODEL = "glide"
MODEL_DIR = ROOT / "cache" / "models" / "glide"
REPO = "fastino/GLiDE-0.4B"
REVISION = "6bda7ab91aeb36dcad6d27828a8871e548c7fc71"


def load_glide() -> Any:
    sys.path.insert(0, str(MODEL_DIR))
    from glide.model import Glide  # noqa: PLC0415  # vendored model code must be importable from the snapshot

    return Glide.from_pretrained(str(MODEL_DIR), device="cpu", dtype=__import__("torch").float32, vision=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompts", nargs="+", default=["canonical", "rubric", "compact"])
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    import torch

    corpus = load_corpus()
    if args.limit:
        corpus = corpus[: args.limit]
    prompts = load_prompts()["decision_variants"]

    load_start = time.perf_counter()
    glide = load_glide()
    load_seconds = time.perf_counter() - load_start

    for name in args.prompts:
        variant = prompts[name]
        question = decision_question(variant)
        for item in corpus[:3]:
            glide.decide(state=render_state(item, variant), questions=question)

        rows: list[dict[str, Any]] = []
        run_start = time.perf_counter()
        for item in corpus:
            state = render_state(item, variant)
            with timed() as box:
                try:
                    answer = glide.decide(state=state, questions=question)
                    prob = float(answer["answers"]["meaningful"]["noul"])
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
            "params": 394_781_696,
            "weights_bytes": 789_581_344 + 522_320,
            "device": "cpu",
            "dtype": "float32",
            "torch_threads": torch.get_num_threads(),
            "python": __import__("sys").version,
            "torch": torch.__version__,
            "transformers": __import__("transformers").__version__,
            "prompt": name,
            "n": len(rows),
            "load_seconds": load_seconds,
            "total_seconds": total_seconds,
            "peak_rss_mb": peak_rss_mb(),
            "errors": sum(1 for r in rows if r["error"]),
        }
        path = write_scores(MODEL, name, rows, meta)
        print(json.dumps({"scores": str(path), **meta}))


if __name__ == "__main__":
    main()
