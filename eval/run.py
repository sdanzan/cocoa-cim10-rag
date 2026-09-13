#!/usr/bin/env python3
"""
Evaluate the RAG system against a gold set (eval/gold.jsonl).

Two modes:

  --retrieval   Query ChromaDB directly and check whether a gold code appears in
                the metadata of the top-k retrieved chunks.
                Metrics: Recall@k, MRR (over the non-abstain gold entries).

  (default)     Call the backend POST /suggest_code and compare the suggested
                codes to the gold codes.
                Metrics: any-hit rate, top-1 rate, mean precision / recall,
                abstention accuracy, grounded rate, latency.

Run:
  python eval/run.py                       # end-to-end, needs `npm run dev`
  python eval/run.py --retrieval --k 5     # retrieval only, needs rag_database/
  python eval/run.py --gold eval/gold.jsonl

Env: BACKEND_URL, CHROMA_PATH, CHROMA_COLLECTION, OLLAMA_URL, EMBED_MODEL,
     EMBED_QUERY_PREFIX, AUTH_USER, AUTH_PASSWORD (default demo / demo)
"""

import argparse
import json
import os
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3000").rstrip("/")
CHROMA_PATH = os.environ.get("CHROMA_PATH", "./rag_database")
COLLECTION = os.environ.get("CHROMA_COLLECTION", "cocoa_cim10_v2")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text:latest")
# Retrieval mode only. Must match how the target collection was indexed:
# "search_query: " for the default nomic-prefixed index, "" for prefix-free.
EMBED_QUERY_PREFIX = os.environ.get("EMBED_QUERY_PREFIX", "search_query: ")
# POST /suggest_code is JWT-guarded; e2e mode logs in with these.
AUTH_USER = os.environ.get("AUTH_USER", "demo")
AUTH_PASSWORD = os.environ.get("AUTH_PASSWORD", "demo")

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = REPO_ROOT / "eval" / "results"


def norm(code: str) -> str:
    return code.upper().replace(" ", "").strip()


def code_matches(pred: str, gold: str) -> bool:
    """Exact match, or same 3-char category where one code refines the other.

    "I48.0" matches gold "I48" (family) but not gold "I48.1" (different leaf).
    """
    p, g = norm(pred), norm(gold)
    if p == g:
        return True
    return p[:3] == g[:3] and (p.startswith(g) or g.startswith(p))


def hits_any(pred: str, gold_codes: list[str]) -> bool:
    return any(code_matches(pred, g) for g in gold_codes)


def load_gold(path: str) -> list[dict]:
    entries = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            entries.append(json.loads(line))
    return entries


# --------------------------------------------------------------------------- #
# Retrieval mode
# --------------------------------------------------------------------------- #

def embed(text: str) -> list[float]:
    r = requests.post(
        f"{OLLAMA_URL}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": EMBED_QUERY_PREFIX + text},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["embedding"]


def run_retrieval(gold: list[dict], k: int) -> dict:
    import chromadb

    collection = chromadb.PersistentClient(path=CHROMA_PATH).get_collection(name=COLLECTION)
    graded = [e for e in gold if e["codes"]]  # abstain entries have nothing to retrieve

    rows, recall_hits, reciprocal_ranks = [], 0, []
    for e in graded:
        res = collection.query(query_embeddings=[embed(e["input"])], n_results=k)
        retrieved = [m.get("code_cim10", "") for m in res["metadatas"][0]]

        rank = next(
            (i for i, rc in enumerate(retrieved) if hits_any(rc, e["codes"])), None
        )
        recall_hits += rank is not None
        reciprocal_ranks.append(1 / (rank + 1) if rank is not None else 0.0)
        rows.append({"input": e["input"], "gold": e["codes"], "retrieved": retrieved,
                     "first_hit_rank": rank})
        mark = "ok " if rank is not None else "MISS"
        print(f"  [{mark}] {e['input'][:55]:55}  {retrieved}")

    return {
        "mode": "retrieval",
        "collection": COLLECTION,
        "k": k,
        "n": len(graded),
        "recall_at_k": round(recall_hits / len(graded), 3) if graded else None,
        "mrr": round(statistics.mean(reciprocal_ranks), 3) if reciprocal_ranks else None,
        "rows": rows,
    }


# --------------------------------------------------------------------------- #
# End-to-end mode
# --------------------------------------------------------------------------- #

_auth_header: dict = {}


def login() -> None:
    """Populate `_auth_header` with a bearer token for the demo account."""
    try:
        r = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"username": AUTH_USER, "password": AUTH_PASSWORD},
            timeout=10,
        )
        r.raise_for_status()
    except requests.RequestException as exc:
        sys.exit(f"login failed at {BACKEND_URL}/auth/login: {exc}")
    _auth_header["Authorization"] = f"Bearer {r.json()['access_token']}"


def search(symptom: str) -> tuple[dict, float]:
    t0 = time.time()
    r = requests.post(
        f"{BACKEND_URL}/suggest_code",
        json={"symptom": symptom},
        headers=_auth_header,
        timeout=180,
    )
    r.raise_for_status()
    return r.json(), time.time() - t0


def backend_collection() -> str:
    try:
        return requests.get(f"{BACKEND_URL}/rag-health", timeout=10).json().get("collection", "?")
    except requests.RequestException:
        return "?"


def run_e2e(gold: list[dict]) -> dict:
    login()
    rows, latencies, grounded_flags = [], [], []
    abstain_total = abstain_ok = 0
    graded_total = any_hit = top1_hit = 0
    precisions, recalls = [], []
    collection = backend_collection()

    for e in gold:
        result, dt = search(e["input"])
        latencies.append(dt)
        suggestions = result.get("suggestions", [])
        preds = [s["code_icd10"] for s in suggestions]
        grounded_flags += [s.get("grounded", False) for s in suggestions]

        row = {
            "input": e["input"],
            "gold": e["codes"],
            "predicted": preds,
            "grounded": [s.get("grounded", False) for s in suggestions],
            "latency_s": round(dt, 2),
        }

        if not e["codes"]:  # system should abstain
            abstain_total += 1
            ok = len(preds) == 0
            abstain_ok += ok
            row["abstained_correctly"] = ok
            print(f"  [{'ok ' if ok else 'BAD'}] {e['input'][:45]:45}  abstain  got {preds}")
        else:
            graded_total += 1
            hit = any(hits_any(p, e["codes"]) for p in preds)
            t1 = bool(preds) and hits_any(preds[0], e["codes"])
            any_hit += hit
            top1_hit += t1
            precisions.append(
                sum(hits_any(p, e["codes"]) for p in preds) / len(preds) if preds else 0.0
            )
            recalls.append(
                sum(any(code_matches(p, g) for p in preds) for g in e["codes"]) / len(e["codes"])
            )
            row.update({"any_hit": hit, "top1_hit": t1})
            print(f"  [{'ok ' if hit else 'MISS'}] {e['input'][:45]:45}  gold {e['codes']}  got {preds}")

        rows.append(row)

    return {
        "mode": "e2e",
        "collection": collection,
        "n": len(gold),
        "graded": graded_total,
        "any_hit_rate": round(any_hit / graded_total, 3) if graded_total else None,
        "top1_rate": round(top1_hit / graded_total, 3) if graded_total else None,
        "mean_precision": round(statistics.mean(precisions), 3) if precisions else None,
        "mean_recall": round(statistics.mean(recalls), 3) if recalls else None,
        "abstention_accuracy": round(abstain_ok / abstain_total, 3) if abstain_total else None,
        "grounded_rate": round(sum(grounded_flags) / len(grounded_flags), 3) if grounded_flags else None,
        "latency_mean_s": round(statistics.mean(latencies), 2),
        "latency_p95_s": round(sorted(latencies)[int(len(latencies) * 0.95) - 1], 2) if latencies else None,
        "rows": rows,
    }


# --------------------------------------------------------------------------- #

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--retrieval", action="store_true", help="retrieval-only mode")
    ap.add_argument("--k", type=int, default=5, help="top-k for retrieval mode (default 5)")
    ap.add_argument("--gold", default=str(REPO_ROOT / "eval" / "gold.jsonl"))
    args = ap.parse_args()

    gold = load_gold(args.gold)
    if not gold:
        sys.exit(f"empty gold set: {args.gold}")
    print(f"Gold set: {len(gold)} entries ({sum(1 for e in gold if not e['codes'])} abstain)\n")

    summary = run_retrieval(gold, args.k) if args.retrieval else run_e2e(gold)

    print("\n== summary ==")
    for key, value in summary.items():
        if key != "rows":
            print(f"  {key:22} {value}")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    label = summary.get("collection") or os.environ.get("CHROMA_COLLECTION", COLLECTION)
    out = RESULTS_DIR / f"{summary['mode']}-{label}-{stamp}.json"
    out.write_text(json.dumps({"generated_at": stamp, **summary}, indent=2, ensure_ascii=False))
    print(f"\nWrote {out.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
