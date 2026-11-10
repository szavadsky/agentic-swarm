"""Measure params and weight bytes from the cached safetensors headers.

Writes out/model_stats.json; the report cites this file as the provenance of the
lexicographic smallest-compliant comparison instead of hand-written adapter
constants.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from safetensors import safe_open

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache" / "models"
OUT = ROOT / "out"

MODELS = ("glide", "decider-nano", "bekko-17m", "ettin-reranker-150m", "minilm-l6-v2")


def measure(model_dir: Path) -> dict[str, Any]:
    files = sorted(model_dir.rglob("*.safetensors"))
    params = 0
    tensors: list[dict[str, Any]] = []
    for path in files:
        with safe_open(str(path), framework="pt", device="cpu") as handle:
            for name in handle.keys():
                shape = tuple(handle.get_slice(name).get_shape())
                count = math.prod(shape)
                params += count
                tensors.append(
                    {
                        "file": str(path.relative_to(model_dir)),
                        "name": name,
                        "shape": list(shape),
                        "numel": count,
                    }
                )
    return {
        "params": params,
        "weights_bytes": sum(path.stat().st_size for path in files),
        "files": [str(path.relative_to(model_dir)) for path in files],
        "tensor_count": len(tensors),
    }


def main() -> None:
    result: dict[str, Any] = {}
    for model in MODELS:
        model_dir = CACHE / model
        if not model_dir.exists():
            result[model] = {"error": "missing model directory"}
            continue
        result[model] = measure(model_dir)
        print(model, result[model]["params"], result[model]["weights_bytes"], result[model]["files"])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "model_stats.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
