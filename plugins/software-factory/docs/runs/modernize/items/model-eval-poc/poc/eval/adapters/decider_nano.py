"""Score tasksource/tasksource-decider-nano on the PoC corpus.

Run with the main PoC venv:
    .venv/bin/python eval/adapters/decider_nano.py --prompts canonical rubric compact
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import time
from pathlib import Path
from typing import Any

from common import (
    DATA,
    ROOT,
    decision_question,
    load_corpus,
    load_prompts,
    peak_rss_mb,
    render_state,
    timed,
    write_scores,
)

MODEL = "decider-nano"
MODEL_DIR = ROOT / "cache" / "models" / "decider-nano"
REPO = "tasksource/tasksource-decider-nano"
REVISION = "2c7c01ffe5aba74dd15968cf38b0fdc83d1f3810"


def load_decider() -> Any:
    spec = importlib.util.spec_from_file_location("poc_decider", MODEL_DIR / "decider.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load decider.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.Decider.from_pretrained(str(MODEL_DIR), revision=REVISION)


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
    decider = load_decider()
    load_seconds = time.perf_counter() - load_start

    for name in args.prompts:
        variant = prompts[name]
        question = decision_question(variant)
        # Warmup on the first three items.
        for item in corpus[:3]:
            decider.answer(state=render_state(item, variant), questions=question)

        rows: list[dict[str, Any]] = []
        run_start = time.perf_counter()
        for item in corpus:
            state = render_state(item, variant)
            with timed() as box:
                try:
                    answer = decider.answer(state=state, questions=question)
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
            "params": 149_015_041,
            "weights_bytes": 298_044_578,
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
