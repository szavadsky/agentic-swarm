"""Render report.md from out/metrics.json and the corpus/model provenance files."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
MODEL_ORDER = ("glide", "decider-nano", "bekko-17m", "ettin-reranker-150m", "minilm-l6-v2")


def pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def fmt_lat(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.0f}"


def metric_row(name: str, cell: dict[str, Any]) -> str:
    return (
        f"| {name} | {cell['n']} | {pct(cell['accuracy'])} | {pct(cell['meaningless_precision'])} | "
        f"{pct(cell['meaningful_recall'])} | {cell['tp']}/{cell['tn']}/{cell['fp']}/{cell['fn']} |"
    )


def main() -> None:
    metrics = load(OUT / "metrics.json")
    corpus_stats = load(ROOT / "data" / "corpus_stats.json")
    model_stats = load(OUT / "model_stats.json") if (OUT / "model_stats.json").exists() else {}
    bars = metrics["bars"]
    recommendation = metrics["recommendation"]

    lines: list[str] = []
    add = lines.append
    add("# CPU accuracy/latency evaluation over all matrix candidates (PoC)")
    add("")
    add("Confined PoC for M3-1: decide whether a cross-encoder/decision model can gate or replace the")
    add("suppression-justification heuristic, and if so which candidate is the smallest compliant option.")
    add("All artifacts live under `poc/`; production code and tests were not modified.")
    add("")
    add("## 1. Verdict")
    add("")
    if recommendation["formal_verdict"] == "no-go":
        add(
            "**No-go for the contracted evaluation.** The contracted corpus's heuristic-accepted stratum "
            f"contains {metrics['heuristic_baseline']['contracted']['heuristic_accepted']['n']} items with "
            "**zero meaningless (negative) examples**, so the 95% meaningless-precision bar cannot be met "
            "or evaluated: any model that never emits `False` is vacuously perfect, and any model that emits "
            "`False` has an undefined denominator of one. The heuristic itself scores "
            f"{pct(metrics['heuristic_baseline']['contracted']['heuristic_accepted']['accuracy'])} accuracy / "
            f"{pct(metrics['heuristic_baseline']['contracted']['heuristic_accepted']['meaningful_recall'])} "
            "meaningful recall on that stratum (labels are the heuristic's own test tables), so a model can "
            "only lose recall in veto mode. No candidate can be certified on the contracted data."
        )
    else:
        add(f"**Go:** {recommendation['contracted_compliant_count']} contracted cell(s) meet every bar.")
    add("")
    sensitive = recommendation.get("smallest_compliant_augmented")
    if sensitive:
        add(
            "Sensitivity analysis on the augmented corpus (contracted corpus + 39 synthetic hard negatives) "
            "does find compliant cells. The smallest lexicographic compliant candidate there is "
            f"**{sensitive['model_label']} / prompt `{sensitive['prompt']}` / threshold "
            f"{sensitive['threshold']} / {sensitive['mode']} mode** "
            f"({sensitive['params']:,} params, {sensitive['weights_bytes']:,} weight bytes, "
            f"{sensitive['rss_mb']:.0f} MB RSS, p50 {sensitive['p50_ms']:.0f} ms). "
            "This is a sensitivity result, not a certification: the negatives that make precision non-vacuous "
            "are author-written, not real repo suppressions."
        )
    else:
        add(
            "Sensitivity analysis on the augmented corpus also finds no compliant eligible candidate; see "
            "the compliance table below."
        )
    add("")
    add("## 2. What was evaluated")
    add("")
    add("| Candidate | Repo @ revision | Params | Weight bytes | CPU RSS | p50 | p95 | Prompt | Status |")
    add("|---|---|---:|---:|---:|---:|---:|---|---|")
    for model in MODEL_ORDER:
        entry = metrics["models"][model]
        stat = model_stats.get(model, {})
        params = stat.get("params") or entry.get("params")
        weight_bytes = stat.get("weights_bytes") or entry.get("weights_bytes")
        prompt = MODEL_SPEC_ORDER.get(model, "")
        p50 = entry.get("p50_ms")
        p95 = entry.get("p95_ms")
        status = "eligible" if entry.get("eligible") else f"excluded: {entry['note']}"
        add(
            f"| {entry['label']} | {MODEL_REPOS.get(model, '')} | "
            f"{params:,} | {weight_bytes:,} | "
            f"{(entry.get('rss_mb') or 0):.0f} MB | {fmt_lat(p50)} ms | {fmt_lat(p95)} ms | "
            f"`{prompt}` | {status} |"
        )
    add("")
    add(
        "Params and weight bytes are measured directly from the cached `*.safetensors` headers by "
        "`eval/model_stats.py` (`out/model_stats.json`); they supersede the hand-written adapter constants. "
        "Latency is single-request, float32, 10 torch threads, warmup on the first three items, on a "
        "12th Gen Intel i7-12700H (20 logical / 10 physical cores, WSL2, 19 GiB RAM)."
    )
    add("")
    add("### Prompts and modes")
    add("")
    add("- Decision models: `canonical`, `rubric`, `compact` (true/false `noul` question).")
    add(
        "- Rerankers: `current` = production pair construction (`_semantic.py:168-176`: present fields only, "
        "self-pair when both rule and context are absent), `query_first` = same query/justification order swap, "
        "`rubric_query` = rubric-prefixed ablation."
    )
    add("- Modes: `veto` = heuristic AND model >= threshold (model can only flip True to False); `replace` = model >= threshold.")
    add(f"- Thresholds: {', '.join(str(t) for t in metrics['thresholds'])}. Bars: accuracy >= {bars['accuracy']:.0%}, "
        f"meaningless precision >= {bars['meaningless_precision']:.0%}, meaningful recall >= {bars['meaningful_recall']:.0%}.")
    add("")
    add("## 3. Corpus")
    add("")
    add("| Source | Raw rows | Post-dedup | Dedup-dropped |")
    add("|---|---:|---:|---:|")
    for source, raw in sorted(corpus_stats["raw_counts"].items()):
        add(
            f"| {source} | {raw} | {corpus_stats['post_dedup_counts'].get(source, 0)} | "
            f"{corpus_stats['dedup_dropped'].get(source, 0)} |"
        )
    add(
        f"| **total** | **{corpus_stats['total_raw']}** | **{corpus_stats['total_post_dedup']}** | "
        f"**{sum(corpus_stats['dedup_dropped'].values())}** |"
    )
    add("")
    add(
        f"Deduplication is first-wins on the normalized justification. The collapse is large and is disclosed "
        f"per source above: `meaningful_table` contributes 33 raw rows but only 3 after 30 duplicates of "
        f"`threshold_meaningful`; `repo_suppression` contributes 370 raw line-level rows but 183 after dedup. "
        f"The contracted corpus is {corpus_stats['contracted_total']} items; the augmented corpus is "
        f"{corpus_stats['augmented_total']} items."
    )
    add("")
    add("### Stratification and the precision-bar problem")
    add("")
    add("| Scope | Stratum | Meaningful | Meaningless |")
    add("|---|---|---:|---:|")
    for scope, key in (("contracted", "contracted"), ("augmented", "augmented")):
        baseline = metrics["heuristic_baseline"][scope]
        for stratum in ("heuristic_accepted", "heuristic_rejected", "overall"):
            cell = baseline[stratum]
            add(f"| {scope} | {stratum} | {cell['tp'] + cell['fn']} | {cell['tn'] + cell['fp']} |")
    add("")
    add(
        "The contracted corpus has **no heuristic-accepted negative** (`repo_suppression` false rows are all "
        "in the heuristic-rejected stratum; the test-table labels are the heuristic's own outputs). Therefore "
        "the 95% meaningless-precision bar is vacuous on the contract's primary stratum. The 39 synthetic "
        "`hard_negative` rows (all heuristic-accepted, all labelled meaningless) are reported **separately as "
        "a sensitivity analysis**, never mixed into the contracted compliance claim."
    )
    add("")
    add("### Label/protocol fixes applied in this round")
    add("")
    add(
        "- Real suppressions are now **one item per suppression line**; all codes on the line are joined into "
        "`rule` (e.g. `SIM115,consider-using-with`, `arg-type,invalid-argument-type`), mirroring production "
        "`_has_justification` (one boolean per line). This removes the double-counted second suppression that "
        "produced contradictory labels (`c149` true vs `c165` false); both lines now yield one true item with "
        "the real same-line reason."
    )
    add(
        "- Synthetic rows use a single rule convention: `rule = None` for both the test tables and the hard "
        "negatives (no fabricated `W9704` code)."
    )
    add(
        "- Real-repo labels are single-adjudicator rubric labels recorded in `data/repo_labels.json`; "
        "borderline terse reasons (`planted violation`, `usage docs in .pyi`, `test helper for readability`) "
        "are labelled meaningful because they state a concrete purpose. No second rater was available."
    )
    add("")
    add("## 4. Results")
    add("")
    add("### 4.1 Heuristic baseline (no model)")
    add("")
    add("| Scope / stratum | n | Accuracy | Meaningless precision | Meaningful recall | tp/tn/fp/fn |")
    add("|---|---:|---:|---:|---:|---|")
    for scope in ("contracted", "augmented"):
        for stratum in ("heuristic_accepted", "heuristic_rejected", "overall"):
            cell = metrics["heuristic_baseline"][scope][stratum]
            add(f"| {scope} / {stratum} | {cell['n']} | {pct(cell['accuracy'])} | "
                f"{pct(cell['meaningless_precision'])} | {pct(cell['meaningful_recall'])} | "
                f"{cell['tp']}/{cell['tn']}/{cell['fp']}/{cell['fn']} |")
    add("")
    add("### 4.2 Production-prompt matrix")
    add("")
    add(
        "Each block is one candidate at its production prompt. `accepted` is the contract stratum; `overall` "
        "adds the heuristic-rejected easy negatives. Contract compliance is judged only on the accepted rows."
    )
    add("")
    for model in MODEL_ORDER:
        entry = metrics["models"][model]
        prompt = MODEL_SPEC_ORDER[model]
        run = entry["prompts"].get(prompt, {})
        add(f"#### {entry['label']} (`{prompt}`)")
        add("")
        if run.get("status") != "complete":
            add(f"Not scored: {run.get('status')} ({run.get('scored', '?')}/{run.get('expected', '?')} rows).")
            add("")
            continue
        add("| Scope / stratum | Threshold / mode | n | Accuracy | Meaningless precision | Meaningful recall | tp/tn/fp/fn |")
        add("|---|---|---:|---:|---:|---:|---|")
        for scope in ("contracted", "augmented"):
            cells = run[scope]["cells"]
            for cell_key in cells:
                accepted = cells[cell_key]["heuristic_accepted"]
                add(f"| {scope} / accepted | {cell_key} | {accepted['n']} | {pct(accepted['accuracy'])} | "
                    f"{pct(accepted['meaningless_precision'])} | {pct(accepted['meaningful_recall'])} | "
                    f"{accepted['tp']}/{accepted['tn']}/{accepted['fp']}/{accepted['fn']} |")
                overall = cells[cell_key]["overall"]
                add(f"| {scope} / overall | {cell_key} | {overall['n']} | {pct(overall['accuracy'])} | "
                    f"{pct(overall['meaningless_precision'])} | {pct(overall['meaningful_recall'])} | "
                    f"{overall['tp']}/{overall['tn']}/{overall['fp']}/{overall['fn']} |")
        add("")
    add("### 4.3 Prompt ablation")
    add("")
    add("| Candidate | Prompt | Best augmented accepted cell | Accuracy | Precision | Recall | Contracted accepted recall |")
    add("|---|---|---|---:|---:|---:|---:|")
    for model in MODEL_ORDER:
        entry = metrics["models"][model]
        for prompt in MODEL_SPECS_PROMPTS[model]:
            run = entry["prompts"].get(prompt, {})
            if run.get("status") != "complete":
                add(f"| {entry['label']} | `{prompt}` | not scored ({run.get('status')}) | n/a | n/a | n/a | n/a |")
                continue
            best_key = None
            best = None
            for cell_key, cell in run["augmented"]["cells"].items():
                accepted = cell["heuristic_accepted"]
                key = (
                    accepted["accuracy"] if accepted["accuracy"] is not None else -1,
                    accepted["meaningless_precision"] if accepted["meaningless_precision"] is not None else -1,
                    accepted["meaningful_recall"] if accepted["meaningful_recall"] is not None else -1,
                )
                if best is None or key > best:
                    best, best_key = key, cell_key
            accepted = run["augmented"]["cells"][best_key]["heuristic_accepted"]
            contracted = run["contracted"]["cells"][best_key]["heuristic_accepted"]
            add(f"| {entry['label']} | `{prompt}` | {best_key} | {pct(accepted['accuracy'])} | "
                f"{pct(accepted['meaningless_precision'])} | {pct(accepted['meaningful_recall'])} | "
                f"{pct(contracted['meaningful_recall'])} |")
    add("")
    add("### 4.4 Compliance table")
    add("")
    add("| Candidate | Prompt | Threshold / mode | Contracted accepted (acc/prec/rec) | Augmented accepted (acc/prec/rec) | Compliant contracted | Compliant augmented |")
    add("|---|---|---|---|---|---|---|")
    index = {(c["model"], c["prompt"], c["threshold"], c["mode"], c["scope"]): c for c in metrics["candidates"]}
    for candidate in metrics["candidates"]:
        if candidate["scope"] != "contracted":
            continue
        key = (candidate["model"], candidate["prompt"], candidate["threshold"], candidate["mode"], "augmented")
        aug = index.get(key)
        acc = candidate["accepted"]
        aug_cell = aug["accepted"] if aug else {}
        add(
            f"| {candidate['model_label']} | `{candidate['prompt']}` | {candidate['threshold']}/{candidate['mode']} | "
            f"{pct(acc['accuracy'])} / {pct(acc['meaningless_precision'])} / {pct(acc['meaningful_recall'])} | "
            f"{pct(aug_cell.get('accuracy'))} / {pct(aug_cell.get('meaningless_precision'))} / {pct(aug_cell.get('meaningful_recall'))} | "
            f"{'yes' if candidate['compliant'] else 'no'} | {'yes' if aug and aug['compliant'] else 'no'} |"
        )
    add("")
    add("## 5. Per-source breakdown")
    add("")
    add(
        "Per-source cells at threshold 0.5 are shown for the heuristic baseline and for each eligible "
        "production prompt; the full matrix (all thresholds and modes, both scopes) is in `out/metrics.json`."
    )
    add("")
    add("| Scope / source | n (pos/neg) | Heuristic accuracy | Model | Accuracy | Precision | Recall |")
    add("|---|---:|---:|---|---:|---:|---:|")
    corpus = [json.loads(line) for line in (ROOT / "data" / "corpus.jsonl").read_text(encoding="utf-8").splitlines()]
    for scope, items in (("contracted", [i for i in corpus if i["source"] != "hard_negative"]), ("augmented", corpus)):
        by_source: dict[str, list[dict[str, Any]]] = {}
        for item in items:
            by_source.setdefault(item["source"], []).append(item)
        for source, subset in sorted(by_source.items()):
            positives = sum(1 for i in subset if i["label"])
            negatives = len(subset) - positives
            heuristic_acc = sum(1 for i in subset if i["heuristic"] == i["label"]) / len(subset)
            add(f"| {scope} / {source} | {positives}/{negatives} | {pct(heuristic_acc)} | heuristic baseline | "
                f"{pct(heuristic_acc)} | n/a | n/a |")
    for model in MODEL_ORDER:
        entry = metrics["models"][model]
        if not entry.get("eligible"):
            continue
        prompt = MODEL_SPEC_ORDER[model]
        run = entry["prompts"].get(prompt, {})
        if run.get("status") != "complete":
            continue
        for scope in ("contracted", "augmented"):
            for source, cell in run[scope]["sources"].items():
                bucket = cell["0.5/veto"]
                add(f"| {scope} / {source} | {cell['positives']}/{cell['negatives']} | — | {entry['label']} | "
                    f"{pct(bucket['accuracy'])} | {pct(bucket['meaningless_precision'])} | {pct(bucket['meaningful_recall'])} |")
    add("")
    add("## 6. Deviations, exclusions, and risks")
    add("")
    exclusions = list(metrics.get("exclusions", []))
    for model in MODEL_ORDER:
        entry = metrics["models"][model]
        for prompt in MODEL_SPECS_PROMPTS[model]:
            run = entry["prompts"].get(prompt, {})
            if run.get("status") != "complete":
                exclusions.append(
                    f"{entry['label']} prompt `{prompt}` is explicitly excluded: run status "
                    f"{run.get('status')} ({run.get('scored', '?')}/{run.get('expected', '?')} rows)."
                )
    for item in exclusions:
        add(f"- {item}")
    add(
        "- Latency is a single-request measurement on this WSL2 CPU (`10` torch threads, float32). "
        "The 0.4B GLiDE model is compute-bound at ~0.8-1.1 s/item; the other candidates are 15-180 ms/item. "
        "The bekko/ettin/minilm runs overlapped the GLiDE canonical run, so their p50/p95 (and GLiDE's) are "
        "upper bounds under CPU contention; decider runs were measured alone. Accuracy and compliance are "
        "unaffected by the overlap."
    )
    add(
        "- The corpus labels are not an independent ground truth: threshold/table labels assert the heuristic's "
        "own behaviour (so heuristic accuracy is 100% on the contracted corpus by construction), and repo labels "
        "were adjudicated by one author. A defensible production decision needs an independent, double-rated "
        "sample of real suppressions, including real heuristic-accepted brush-offs."
    )
    add(
        "- Reranker probabilities are sigmoid(relevance logit) and are not calibrated decision probabilities; "
        "the 0.5/0.6/0.7 sweep is therefore a ranking-threshold sweep, not a calibrated operating point."
    )
    add(
        "- MiniLM-L6-v2 is explicitly excluded from accuracy comparison: the CrossEncoder classifier head is "
        "newly initialised (transformers LOAD REPORT), so only its latency/RSS rows are meaningful."
    )
    add(
        "- bekko-17m has no declared weight license; it is scored but excluded from any recommendation."
    )
    add(
        "- Decision-model states omit rule/context lines when the item has no rule or context instead of "
        "injecting `(unknown)`/`(none)` literals. A placeholder-vs-omitted ablation was not run; the reranker "
        "`current` prompt, by contrast, exactly mirrors production query construction."
    )
    add("")
    (ROOT / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {ROOT / 'report.md'} ({len(lines)} lines)")


MODEL_SPECS_PROMPTS = {
    "glide": ["canonical", "rubric", "compact"],
    "decider-nano": ["canonical", "rubric", "compact"],
    "bekko-17m": ["canonical", "rubric", "compact"],
    "ettin-reranker-150m": ["current", "query_first", "rubric_query"],
    "minilm-l6-v2": ["current", "query_first", "rubric_query"],
}
MODEL_SPEC_ORDER = {
    "glide": "canonical",
    "decider-nano": "canonical",
    "bekko-17m": "canonical",
    "ettin-reranker-150m": "current",
    "minilm-l6-v2": "current",
}
MODEL_REPOS = {
    "glide": "fastino/GLiDE-0.4B",
    "decider-nano": "tasksource/tasksource-decider-nano",
    "bekko-17m": "hotchpotch/bekko-system-one-v0-17m",
    "ettin-reranker-150m": "cross-encoder/ettin-reranker-150m-v1",
    "minilm-l6-v2": "sentence-transformers/all-MiniLM-L6-v2",
}


if __name__ == "__main__":
    main()
