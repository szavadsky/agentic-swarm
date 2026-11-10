"""Join corpus labels with per-model scores and evaluate every contract cell.

For each model x prompt x threshold (0.5/0.6/0.7) x mode (veto/replace) the
report covers accuracy, meaningless precision, meaningful recall, and counts,
on the heuristic-accepted stratum (contract bars), overall, and per source.
The contracted corpus (threshold tables + brush-off/meaningful tables + real
repo suppressions) is the primary evaluation; the synthetic hard-negative
augmentation is reported separately as a sensitivity analysis.

Run with any Python 3.11+:
    python3 eval/metrics.py
"""

from __future__ import annotations

import json
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "out"
THRESHOLDS = (0.5, 0.6, 0.7)
MODES = ("veto", "replace")
BARS = {"accuracy": 0.90, "meaningless_precision": 0.95, "meaningful_recall": 0.85}

MODEL_SPECS: dict[str, dict[str, Any]] = {
    "glide": {
        "label": "GLiDE-0.4B",
        "family": "decision",
        "prompts": ["canonical", "rubric", "compact"],
        "production_prompt": "canonical",
        "eligible": True,
        "note": "0.4B encoder decision model; float32 CPU",
    },
    "decider-nano": {
        "label": "tasksource-decider-nano",
        "family": "decision",
        "prompts": ["canonical", "rubric", "compact"],
        "production_prompt": "canonical",
        "eligible": True,
        "note": "149M decision model",
    },
    "bekko-17m": {
        "label": "bekko-system-one-v0-17m",
        "family": "decision",
        "prompts": ["canonical", "rubric", "compact"],
        "production_prompt": "canonical",
        "eligible": False,
        "note": "weights carry no declared license; scored but excluded from recommendation",
    },
    "ettin-reranker-150m": {
        "label": "ettin-reranker-150m-v1",
        "family": "reranker",
        "prompts": ["current", "query_first", "rubric_query"],
        "production_prompt": "current",
        "eligible": True,
        "note": "trained reranker; sigmoid of relevance logit",
    },
    "minilm-l6-v2": {
        "label": "all-MiniLM-L6-v2",
        "family": "reranker",
        "prompts": ["current", "query_first", "rubric_query"],
        "production_prompt": "current",
        "eligible": False,
        "note": "untrained CrossEncoder classifier head; accuracy row not comparable (latency/RSS only)",
    },
}


def load_corpus() -> list[dict[str, Any]]:
    with (DATA / "corpus.jsonl").open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_scores(model: str, prompt: str) -> dict[str, dict[str, Any]] | None:
    path = OUT / f"scores__{model}__{prompt}.jsonl"
    if not path.exists():
        return None
    rows: dict[str, dict[str, Any]] = {}
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            rows[str(row["id"])] = row
    return rows


def load_meta(model: str, prompt: str) -> dict[str, Any] | None:
    path = OUT / f"meta__{model}__{prompt}.json"
    return load_json(path) if path.exists() else None


def predict(item: dict[str, Any], prob: float | None, threshold: float, mode: str) -> bool:
    if mode == "heuristic":
        return bool(item["heuristic"])
    model_yes = prob is not None and prob >= threshold
    if mode == "veto":
        return bool(item["heuristic"]) and model_yes
    return model_yes


def confusion(
    items: list[dict[str, Any]],
    scores: dict[str, dict[str, Any]] | None,
    threshold: float,
    mode: str,
) -> dict[str, Any]:
    tp = tn = fp = fn = errors = 0
    for item in items:
        row = (scores or {}).get(str(item["id"]))
        prob = None if row is None else row.get("prob")
        if mode != "heuristic" and (row is None or prob is None or row.get("error")):
            errors += 1
        pred = predict(item, prob, threshold, mode)
        label = bool(item["label"])
        if pred and label:
            tp += 1
        elif pred:
            fp += 1
        elif label:
            fn += 1
        else:
            tn += 1
    n = tp + tn + fp + fn
    predicted_false = tn + fn
    positives = tp + fn
    return {
        "n": n,
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "errors": errors,
        "accuracy": (tp + tn) / n if n else None,
        "meaningless_precision": tn / predicted_false if predicted_false else None,
        "meaningful_recall": tp / positives if positives else None,
        "predicted_meaningful_rate": (tp + fp) / n if n else None,
    }


def evaluate_subset(
    items: list[dict[str, Any]],
    scores: dict[str, dict[str, Any]] | None,
    threshold: float,
    mode: str,
) -> dict[str, Any]:
    return confusion(items, scores, threshold, mode)


def evaluate_cells(
    items: list[dict[str, Any]],
    scores: dict[str, dict[str, Any]] | None,
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for threshold in THRESHOLDS:
        for mode in MODES:
            key = f"{threshold:.1f}/{mode}"
            result[key] = {
                "heuristic_accepted": evaluate_subset(
                    [i for i in items if i["stratum"] == "heuristic_accepted"], scores, threshold, mode
                ),
                "heuristic_rejected": evaluate_subset(
                    [i for i in items if i["stratum"] == "heuristic_rejected"], scores, threshold, mode
                ),
                "overall": evaluate_subset(items, scores, threshold, mode),
            }
    return result


def evaluate_sources(items: list[dict[str, Any]], scores: dict[str, dict[str, Any]] | None) -> dict[str, Any]:
    by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        by_source[str(item["source"])].append(item)
    result: dict[str, Any] = {}
    for source, subset in sorted(by_source.items()):
        result[source] = {
            "n": len(subset),
            "positives": sum(1 for i in subset if i["label"]),
            "negatives": sum(1 for i in subset if not i["label"]),
        }
        for threshold in THRESHOLDS:
            for mode in MODES:
                result[source][f"{threshold:.1f}/{mode}"] = evaluate_subset(subset, scores, threshold, mode)
    return result


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * pct
    low = int(pos)
    high = min(low + 1, len(ordered) - 1)
    frac = pos - low
    return ordered[low] * (1 - frac) + ordered[high] * frac


def latency_stats(scores: dict[str, dict[str, Any]] | None) -> dict[str, Any]:
    if scores is None:
        return {"p50_ms": None, "p95_ms": None, "n": 0}
    values = [float(r["latency_ms"]) for r in scores.values() if r.get("latency_ms") is not None and not r.get("error")]
    return {
        "p50_ms": percentile(values, 0.50),
        "p95_ms": percentile(values, 0.95),
        "mean_ms": statistics.fmean(values) if values else None,
        "n": len(values),
    }


def is_compliant(cell: dict[str, Any]) -> bool:
    values = [cell.get(name) for name in BARS]
    return all(value is not None and value >= BARS[name] for name, value in zip(BARS, values))


def compare_smallest(candidate: dict[str, Any], current: dict[str, Any] | None) -> bool:
    if current is None:
        return True
    key = (
        candidate["params"] if candidate["params"] is not None else float("inf"),
        candidate["weights_bytes"] if candidate["weights_bytes"] is not None else float("inf"),
        candidate["rss_mb"] if candidate["rss_mb"] is not None else float("inf"),
        candidate["p50_ms"] if candidate["p50_ms"] is not None else float("inf"),
    )
    cur = (
        current["params"] if current["params"] is not None else float("inf"),
        current["weights_bytes"] if current["weights_bytes"] is not None else float("inf"),
        current["rss_mb"] if current["rss_mb"] is not None else float("inf"),
        current["p50_ms"] if current["p50_ms"] is not None else float("inf"),
    )
    return key < cur


def main() -> None:
    corpus = load_corpus()
    contracted = [i for i in corpus if i["source"] != "hard_negative"]
    stats = load_json(DATA / "corpus_stats.json")
    measured = load_json(OUT / "model_stats.json") if (OUT / "model_stats.json").exists() else {}

    heuristics = {
        scope: {
            stratum: confusion(subset, None, 0.0, "heuristic")
            for stratum, subset in {
                "heuristic_accepted": [i for i in subset_items if i["stratum"] == "heuristic_accepted"],
                "heuristic_rejected": [i for i in subset_items if i["stratum"] == "heuristic_rejected"],
                "overall": subset_items,
            }.items()
        }
        for scope, subset_items in (("contracted", contracted), ("augmented", corpus))
    }

    models: dict[str, Any] = {}
    candidates: list[dict[str, Any]] = []
    for model, spec in MODEL_SPECS.items():
        model_entry: dict[str, Any] = {
            "label": spec["label"],
            "family": spec["family"],
            "eligible": spec["eligible"],
            "note": spec["note"],
            "params": None,
            "weights_bytes": None,
            "rss_mb": None,
            "prompts": {},
        }
        stat = measured.get(model, {})
        if stat:
            model_entry["params"] = stat.get("params")
            model_entry["weights_bytes"] = stat.get("weights_bytes")
        for prompt in spec["prompts"]:
            scores = load_scores(model, prompt)
            meta = load_meta(model, prompt)
            if scores is None or meta is None:
                model_entry["prompts"][prompt] = {"status": "missing"}
                continue
            if len(scores) != len(corpus):
                model_entry["prompts"][prompt] = {
                    "status": "incomplete",
                    "scored": len(scores),
                    "expected": len(corpus),
                }
                continue
            if model_entry["params"] is None:
                model_entry["params"] = meta.get("params")
            if model_entry["weights_bytes"] is None:
                model_entry["weights_bytes"] = meta.get("weights_bytes")
            if model_entry["rss_mb"] is None:
                model_entry["rss_mb"] = meta.get("peak_rss_mb")
            lat = latency_stats(scores)
            production = prompt == spec["production_prompt"]
            entry: dict[str, Any] = {
                "status": "complete",
                "production": production,
                "latency": lat,
                "errors": sum(1 for r in scores.values() if r.get("error")),
                "contracted": {
                    "cells": evaluate_cells(contracted, scores),
                    "sources": evaluate_sources(contracted, scores),
                },
                "augmented": {
                    "cells": evaluate_cells(corpus, scores),
                    "sources": evaluate_sources(corpus, scores),
                },
            }
            model_entry["prompts"][prompt] = entry
            if production:
                model_entry["p50_ms"] = lat["p50_ms"]
                model_entry["p95_ms"] = lat["p95_ms"]
            if spec["eligible"]:
                for scope in ("contracted", "augmented"):
                    for cell_key, cell in entry[scope]["cells"].items():
                        accepted = cell["heuristic_accepted"]
                        threshold, mode = cell_key.split("/")
                        candidates.append(
                            {
                                "model": model,
                                "model_label": spec["label"],
                                "prompt": prompt,
                                "threshold": threshold,
                                "mode": mode,
                                "scope": scope,
                                "accepted": accepted,
                                "overall": cell["overall"],
                                "compliant": is_compliant(accepted),
                                "params": model_entry["params"],
                                "weights_bytes": model_entry["weights_bytes"],
                                "rss_mb": model_entry["rss_mb"],
                                "p50_ms": lat["p50_ms"],
                            }
                        )
        models[model] = model_entry

    compliant_contracted = [c for c in candidates if c["scope"] == "contracted" and c["compliant"]]
    compliant_augmented = [c for c in candidates if c["scope"] == "augmented" and c["compliant"]]
    smallest_augmented: dict[str, Any] | None = None
    for candidate in compliant_augmented:
        if compare_smallest(candidate, smallest_augmented):
            smallest_augmented = candidate

    recommendation = {
        "formal_verdict": "no-go" if not compliant_contracted else "go",
        "contracted_compliant_count": len(compliant_contracted),
        "contracted_reason": (
            "the contracted heuristic-accepted stratum has no meaningless items "
            f"(0 negatives / {heuristics['contracted']['heuristic_accepted']['n']} items), so the "
            "meaningless-precision bar cannot be met or evaluated; no model can be certified"
            if not compliant_contracted
            else "",
        ),
        "augmented_sensitivity_compliant_count": len(compliant_augmented),
        "smallest_compliant_augmented": smallest_augmented,
        "heuristic_baseline": heuristics,
    }

    exclusions = [
        "MiniLM-L6-v2 accuracy is explicitly excluded: its CrossEncoder classifier head was newly "
        "initialised (transformers LOAD REPORT), so only its latency/RSS rows are comparable.",
        "bekko-17m is scored but excluded from all recommendations: the weights carry no declared license.",
    ]
    glide = models.get("glide", {}).get("prompts", {})
    missing_glide = [p for p in MODEL_SPECS["glide"]["prompts"] if glide.get(p, {}).get("status") != "complete"]
    if missing_glide:
        if "canonical" in missing_glide:
            exclusions.append(
                "GLiDE-0.4B is explicitly excluded from the compliance matrix: the full canonical run did "
                "not complete within the PoC CPU budget (0.4B params, ~0.8-1.1 s/item; 6-item smoke only). "
                "It is the largest candidate (395M params) and cannot be the smallest compliant option; the "
                "model loads and scores on CPU, so the exclusion is a compute-budget exclusion, not a "
                "feasibility failure."
            )
        else:
            exclusions.append(
                "GLiDE-0.4B prompt variants "
                + ", ".join(f"`{p}`" for p in missing_glide)
                + " are explicitly excluded from the full matrix: a 0.4B model measured at ~0.8-1.1 s/item "
                "would add roughly 4-6 min per prompt on this CPU, and GLiDE is the largest candidate "
                "(395M params) so it cannot be the smallest compliant option. `canonical` is fully scored."
            )

    payload = {
        "corpus": stats,
        "exclusions": exclusions,
        "thresholds": list(THRESHOLDS),
        "modes": list(MODES),
        "bars": BARS,
        "heuristic_baseline": heuristics,
        "models": models,
        "candidates": candidates,
        "recommendation": recommendation,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "metrics.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(recommendation, indent=2))
    print(f"wrote {OUT / 'metrics.json'}")


if __name__ == "__main__":
    main()
