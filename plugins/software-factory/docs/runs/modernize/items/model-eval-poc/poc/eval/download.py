"""Download the pinned candidate snapshots into the PoC cache.

Run with the main PoC venv:
    HF_HOME=$PWD/cache/hf .venv/bin/python eval/download.py
"""

from __future__ import annotations

import os
from pathlib import Path

from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache" / "models"

MODELS: dict[str, dict[str, object]] = {
    "decider-nano": {
        "repo": "tasksource/tasksource-decider-nano",
        "revision": "2c7c01ffe5aba74dd15968cf38b0fdc83d1f3810",
        "patterns": [
            "config.json",
            "decider.py",
            "decider_config.json",
            "decision_index_engine.py",
            "model.safetensors",
            "tokenizer.json",
            "tokenizer_config.json",
            "special_tokens_map.json",
        ],
    },
    "glide": {
        "repo": "fastino/GLiDE-0.4B",
        "revision": "6bda7ab91aeb36dcad6d27828a8871e548c7fc71",
        "patterns": [
            "config.json",
            "decision_config.json",
            "glide/*.py",
            "licenses/*",
            "model-00001-of-00001.safetensors",
            "model.safetensors.index.json",
            "readout.safetensors",
            "render_tokenizer/*",
            "requirements.txt",
            "special_tokens_map.json",
            "tokenizer.json",
            "tokenizer_config.json",
        ],
    },
    "bekko-17m": {
        "repo": "hotchpotch/bekko-system-one-v0-17m",
        "revision": "b886a1f9b91f4e8368d7830080d52d955e2c8dfa",
        "patterns": [
            "0_BekkoInference/*",
            "0_BekkoInference/tokenizer/*",
            "config_sentence_transformers.json",
            "inference_v0.py",
            "modules.json",
            "requirements.txt",
        ],
    },
    "ettin-reranker-150m": {
        "repo": "cross-encoder/ettin-reranker-150m-v1",
        "revision": "025501c4e0f9bbeb4c5b198318e0089ff061cc14",
        "patterns": [
            "1_Pooling/*",
            "2_Dense/*",
            "3_LayerNorm/*",
            "4_Dense/*",
            "config.json",
            "config_sentence_transformers.json",
            "model.safetensors",
            "modules.json",
            "sentence_bert_config.json",
            "special_tokens_map.json",
            "tokenizer.json",
            "tokenizer_config.json",
        ],
    },
    "minilm-l6-v2": {
        "repo": "sentence-transformers/all-MiniLM-L6-v2",
        "revision": "1110a243fdf4706b3f48f1d95db1a4f5529b4d41",
        "patterns": [
            "1_Pooling/*",
            "config.json",
            "config_sentence_transformers.json",
            "model.safetensors",
            "modules.json",
            "sentence_bert_config.json",
            "special_tokens_map.json",
            "tokenizer.json",
            "tokenizer_config.json",
        ],
    },
}


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for slug, spec in MODELS.items():
        target = CACHE / slug
        print(f"==> {slug}: {spec['repo']}@{spec['revision']}")
        snapshot_download(
            repo_id=str(spec["repo"]),
            revision=str(spec["revision"]),
            allow_patterns=spec["patterns"],  # type: ignore[arg-type]
            local_dir=target,
            token=os.environ.get("HF_TOKEN"),
        )
        print(f"    -> {target}")


if __name__ == "__main__":
    main()
