"""Run the local, labeled retrieval set against the current /api/search baseline."""

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_CASES = Path(__file__).with_name("retrieval_eval.json")


def get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=180) as response:
        return json.loads(response.read())


def source_available(gold: dict, files: list[dict]) -> bool:
    needle = gold["file_contains"].casefold()
    return any(needle in item["name"].casefold() for item in files)


def matches_gold(result: dict, gold_sources: list[dict]) -> bool:
    for gold in gold_sources:
        if gold["file_contains"].casefold() not in result["file"].casefold():
            continue
        if "page" not in gold or gold["page"] == result.get("page"):
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    try:
        files = get_json(f"{base_url}/api/files")["files"]
    except (urllib.error.URLError, TimeoutError) as error:
        parser.error(f"Δεν συνδέθηκε το backend στο {base_url}: {error}")
    dataset = json.loads(args.cases.read_text(encoding="utf-8"))
    k = max(1, min(int(dataset.get("k", 5)), 20))
    outcomes = []
    for case in dataset["cases"]:
        gold_sources = case.get("gold_sources", [])
        available_gold = [gold for gold in gold_sources if source_available(gold, files)]
        if gold_sources and not available_gold:
            outcomes.append({"id": case["id"], "status": "skipped_missing_source"})
            continue

        params = urllib.parse.urlencode({"q": case["query"], "limit": 20, "debug": "true"})
        started = time.perf_counter()
        try:
            result = get_json(f"{base_url}/api/search?{params}")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            outcomes.append({"id": case["id"], "status": "error", "detail": detail})
            continue
        except (urllib.error.URLError, TimeoutError) as error:
            outcomes.append({"id": case["id"], "status": "error", "detail": str(error)})
            continue

        results = result.get("results", [])
        top_k = results[:k]
        relevant_ranks = [index for index, item in enumerate(top_k, start=1) if matches_gold(item, available_gold)]
        expected_abstain = bool(case.get("expected_abstain", False))
        selected_count = result.get("debug", {}).get("selected_chunks", 0)
        if expected_abstain:
            outcomes.append({"id": case["id"], "status": "measured", "abstain_correct": selected_count == 0, "selected_count": selected_count})
        else:
            outcomes.append({"id": case["id"], "status": "measured", "recall_at_k": int(bool(relevant_ranks)), "precision_at_k": len(relevant_ranks) / max(1, len(top_k)), "reciprocal_rank": 1 / relevant_ranks[0] if relevant_ranks else 0, "selected_relevant": any(item.get("selected_for_chat") and matches_gold(item, available_gold) for item in results), "retrieval_ms": result.get("debug", {}).get("timings_ms", {}).get("total"), "request_ms": round((time.perf_counter() - started) * 1000, 2)})

    measured = [item for item in outcomes if item["status"] == "measured"]
    answerable = [item for item in measured if "recall_at_k" in item]
    abstentions = [item for item in measured if "abstain_correct" in item]
    summary = {
        "provider": result.get("provider") if "result" in locals() else None,
        "model": result.get("model") if "result" in locals() else None,
        "k": k,
        "measured": len(measured),
        "skipped": sum(item["status"] == "skipped_missing_source" for item in outcomes),
        "errors": sum(item["status"] == "error" for item in outcomes),
        "recall_at_k": sum(item["recall_at_k"] for item in answerable) / max(1, len(answerable)),
        "precision_at_k": sum(item["precision_at_k"] for item in answerable) / max(1, len(answerable)),
        "mrr": sum(item["reciprocal_rank"] for item in answerable) / max(1, len(answerable)),
        "selected_relevant_rate": sum(item["selected_relevant"] for item in answerable) / max(1, len(answerable)),
        "abstention_accuracy": sum(item["abstain_correct"] for item in abstentions) / max(1, len(abstentions)),
        "cases": outcomes,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if summary["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
