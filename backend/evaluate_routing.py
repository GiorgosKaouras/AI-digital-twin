"""Evaluate routing, answers, citations and abstention on synthetic demo data."""

import argparse
import json
import os
import re
import sqlite3
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
SAMPLE_DIR = PROJECT_DIR / "sample-data"
CASES = BACKEND_DIR / "routing_eval.json"


def normalize(value: str) -> str:
    import unicodedata

    text = "".join(char for char in unicodedata.normalize("NFD", value.casefold()) if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", text).strip()


def run() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=CASES)
    args = parser.parse_args()
    dataset = json.loads(args.cases.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="echo-routing-eval-") as temp_name:
        temp_dir = Path(temp_name)
        test_db = temp_dir / "echo.sqlite3"
        os.environ["ECHO_DB_PATH"] = str(test_db)
        os.environ["PROCESSING_MODE"] = "ollama"
        os.environ["ECHO_CHAT_TEMPERATURE"] = "0"

        import sys

        sys.path.insert(0, str(BACKEND_DIR))
        import main as app

        app.UPLOAD_DIR = temp_dir / "uploads"
        app.UPLOAD_DIR.mkdir()
        now = datetime.now(timezone.utc).isoformat()
        with app.db() as conn:
            app.ensure_profile_row(conn)
            conn.execute(
                "UPDATE twin_profile SET display_name=?,identity_confirmed=1,updated_at=? WHERE id=1",
                ("Ελένη Παπαδοπούλου", now),
            )
            conn.execute("INSERT OR REPLACE INTO app_settings(key,value) VALUES('processing_mode','ollama')")
            conn.execute("DELETE FROM chat_messages")
            for item in dataset.get("profile_fixtures", []):
                conn.execute(
                    "INSERT INTO profile_items(category,value,status,source_type,source_name,source_excerpt,created_at,updated_at) VALUES(?,?,'confirmed',?,?,?,?,?)",
                    (item["category"], item["value"], "demo", "Συνθετικό προφίλ", item["value"], now, now),
                )

        provider, model = app.embedding_config()
        sample_files = sorted(SAMPLE_DIR.glob("*.txt")) + sorted((SAMPLE_DIR / "connections").glob("*.txt"))
        for source in sample_files:
            name = f"connections-{source.name}" if source.parent.name == "connections" else source.name
            result = app.store_document(name, source.read_bytes(), provider, model)
            if result["status"] != "embedded":
                raise RuntimeError(f"Δεν δημιουργήθηκαν embeddings για το συνθετικό αρχείο {name}.")

        app.ensure_explicit_connection_edges()
        with app.db() as conn:
            conn.execute("UPDATE relationship_items SET status='confirmed'")
            conn.execute("UPDATE entities SET status='confirmed'")

        outcomes = []
        for case in dataset["cases"]:
            try:
                response = app.chat({"question": case["question"], "session_id": str(uuid.uuid4()), "debug": True})
                answer = normalize(str(response.get("answer", "")))
                sources = response.get("sources", [])
                labels = [normalize(str(source.get("label", ""))) for source in sources]
                kinds = {str(source.get("kind", "")) for source in sources}
                routing = response.get("retrieval_debug", {}).get("routing")
                actual_route = set(routing.get("sources", [])) if routing else None
                route_correct = actual_route == set(case["expected_routes"]) if actual_route is not None else None
                expected_kinds = set(case.get("expected_source_kinds", []))
                source_correct = expected_kinds.issubset(kinds) if case["answerable"] else not sources
                file_correct = all(any(normalize(token) in label for label in labels) for token in case.get("source_file_any", []))
                refusal_terms = ("δεν γνωριζω", "δεν βρηκα", "δεν υπαρχ", "δεν εχω στοιχεια", "δεν μπορω να επιβεβαιω")
                abstained = not sources and any(term in answer for term in refusal_terms)
                answer_correct = (case["answerable"] and any(normalize(token) in answer for token in case.get("answer_any", []))) or (not case["answerable"] and abstained)
                outcomes.append({
                    "id": case["id"], "status": "measured", "expected_routes": case["expected_routes"],
                    "actual_routes": sorted(actual_route) if actual_route is not None else None,
                    "selected_source_kinds": sorted(kinds), "route_correct": route_correct,
                    "answerable": case["answerable"], "answer_correct": answer_correct,
                    "source_correct": source_correct, "file_correct": file_correct,
                    "abstained": abstained, "answer": response.get("answer"), "sources": sources,
                    "retrieval_debug": response.get("retrieval_debug", {}),
                })
            except Exception as error:
                outcomes.append({"id": case["id"], "status": "error", "detail": str(error)})

        measured = [item for item in outcomes if item["status"] == "measured"]
        answerable = [item for item in measured if item["answerable"]]
        unanswerable = [item for item in measured if not item["answerable"]]
        summary = {
            "variant": "synthetic-demo",
            "provider": provider,
            "model": model,
            "measured": len(measured),
            "errors": len(outcomes) - len(measured),
            "routing_exact": {"correct": sum(item["route_correct"] is True for item in measured), "measured_cases": sum(item["route_correct"] is not None for item in measured), "cases": len(measured)},
            "answer_correct": {"correct": sum(item["answer_correct"] for item in answerable), "cases": len(answerable)},
            "source_citation_correct": {"correct": sum(item["source_correct"] and item["file_correct"] for item in answerable), "cases": len(answerable)},
            "unsupported_abstention": {"correct": sum(item["abstained"] for item in unanswerable), "cases": len(unanswerable)},
            "unsupported_false_source": {"count": sum(bool(item["sources"]) for item in unanswerable), "cases": len(unanswerable)},
            "cases": outcomes,
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 1 if summary["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(run())
