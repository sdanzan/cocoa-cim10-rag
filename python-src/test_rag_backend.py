#!/usr/bin/env python3
"""
Exercise the RAG pipeline through the NestJS backend (POST /suggest_code).

Unlike test_rag.py, this hits the real product path: retrieval, prompting and
generation all happen in the backend. This script is a thin HTTP client.

Run:   python python-src/test_rag_backend.py ["a symptom"]
Env:   BACKEND_URL (default http://localhost:3000), AUTH_USER / AUTH_PASSWORD
       (default demo / demo — POST /suggest_code is JWT-guarded)

Prerequisites: the three servers running (see nestjs-backend/README.md):
    ollama serve  |  npm run chroma  |  npm run dev
"""

import os
import sys
import time

import requests

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3000").rstrip("/")
AUTH_USER = os.environ.get("AUTH_USER", "demo")
AUTH_PASSWORD = os.environ.get("AUTH_PASSWORD", "demo")
REQUEST_TIMEOUT = 180  # LLM generation can be slow on CPU

# Example inputs from the exercise brief.
SYMPTOMS = [
    "Dyspnée (difficulté respiratoire) à l’effort et à la parole",
    "Toux purulente",
    "Fièvre",
    "Œdème des membres inférieurs",
    "Hyponatrémie (faible taux de sodium)",
    "Hypercalcémie (taux élevé de calcium)",
    "Syndrome inflammatoire (CRP élevée)",
    "Hyperleucocytose (augmentation des globules blancs)",
    "Désaturation à l’effort (saturation d’oxygène à 80 %)",
    "Râles crépitants bilatéraux",
    "Tachycardie",
    "Acidose mixte avec hyperlactatémie",
    "Détresse respiratoire aiguë",
    "Altération de la conscience (stade terminal)",
    "Pneumopathie d’hypersensibilité",
    "Hypertension pulmonaire (groupes 2 et 3)",
    "Dyslipidémie",
    "Hypertension artérielle (HTA)",
    "Diabète de type 2 non insulinodépendant",
    "Fibrillation auriculaire",
    "Syndrome d’apnées obstructives du sommeil (SAOS) appareillé par PPC",
    "Infection pulmonaire à Haemophilus influenzae",
    "Insuffisance respiratoire aiguë hypoxémique sur décompensation cardiaque globale",
    "Pneumopathie à Haemophilus influenzae",
    "Décompensation de pneumopathie interstitielle chronique compliquée de défaillance cardiaque",
    "Insuffisance rénale aiguë fonctionnelle (secondaire à la déplétion)",
    "Acidose mixte (secondaire à la décompensation respiratoire)",
    "Tuberculose pulmonaire, confirmée par culture",
]


def check_health():
    try:
        data = requests.get(f"{BACKEND_URL}/rag-health", timeout=10).json()
    except requests.RequestException as exc:
        sys.exit(f"Backend not reachable at {BACKEND_URL} ({exc}). Start it with: npm run dev")
    if not data.get("chroma"):
        sys.exit("Backend is up but ChromaDB is not reachable. Start it with: npm run chroma")
    print(f"Backend healthy - {data.get('chunks')} chunks in '{data.get('collection')}'.\n")


def login() -> dict:
    """Exchange the demo credentials for a bearer-token header."""
    try:
        r = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"username": AUTH_USER, "password": AUTH_PASSWORD},
            timeout=10,
        )
        r.raise_for_status()
    except requests.RequestException as exc:
        sys.exit(f"Login failed at {BACKEND_URL}/auth/login: {exc}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def print_result(result, elapsed):
    suggestions = result.get("suggestions", [])
    print(f"  {len(suggestions)} suggestion(s) in {elapsed:.1f}s")
    if not suggestions:
        print("  (no suggestion - information absent from the retrieved CoCoA context)")
    for i, s in enumerate(suggestions, 1):
        flag = "" if s.get("grounded", True) else "  [not grounded in retrieved chunks]"
        print(f"  {i}. {s.get('code_icd10', '?')} - {s.get('description', '')}{flag}")
        print(f"     justification: {s.get('justification', '')}")
        if s.get("bonus_info"):
            print(f"     bonus_info   : {s.get('bonus_info', '')}")


def main():
    check_health()
    headers = login()
    symptoms = sys.argv[1:] or SYMPTOMS
    ok = empty = errors = 0

    for symptom in symptoms:
        print(f"POST /suggest_code  <-  '{symptom}'")
        start = time.time()
        try:
            resp = requests.post(
                f"{BACKEND_URL}/suggest_code",
                json={"symptom": symptom},
                headers=headers,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
        except requests.RequestException as exc:
            errors += 1
            body = getattr(exc.response, "text", "") if getattr(exc, "response", None) else ""
            print(f"  ERROR: {exc} {body}\n")
            continue

        result = resp.json()
        print_result(result, time.time() - start)
        ok += bool(result.get("suggestions"))
        empty += not result.get("suggestions")
        print()

    print(f"Summary: {ok} with suggestions, {empty} empty, {errors} errors.")


if __name__ == "__main__":
    main()
