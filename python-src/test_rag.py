#!/usr/bin/env python3
"""
Reference RAG pipeline, talking straight to ChromaDB + Ollama (no backend).

Useful to sanity-check retrieval and prompting in isolation. For the full
product path, use test_rag_backend.py, which goes through the NestJS API.

Run:  python python-src/test_rag.py ["a symptom"]
"""

import json
import os
import sys

import chromadb
import requests

CHROMA_PATH = os.environ.get("CHROMA_PATH", "./rag_database")
COLLECTION = os.environ.get("CHROMA_COLLECTION", "cocoa_cim10_v2")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text:latest")
EMBED_QUERY_PREFIX = os.environ.get("EMBED_QUERY_PREFIX", "search_query: ")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen3-coder:latest")
N_RESULTS = 3

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

# The prompt stays in French: source document, models and domain are French.
PROMPT_TEMPLATE = """Tu es un assistant médical expert en codage CIM-10.
En te basant STRICTEMENT ET UNIQUEMENT sur le document d'expertise CoCoA ci-dessous, suggère le code CIM-10 approprié pour le symptôme du patient.
Ne devine rien. Si l'information n'est pas dans le contexte, dis-le. Propose au maximum 3 suggestions.

CONTEXTE CoCoA :
{context}

SYMPTÔME DU PATIENT : {symptom}

Tu dois répondre OBLIGATOIREMENT au format JSON suivant :
{{
"query": "Le symptôme",
"suggestions": [
    {{
    "code_icd10": "Code",
    "description": "Description du code",
    "justification": "Ton explication basée sur le contexte",
    "bonus_info": "Info supplémentaire trouvée dans le contexte"
    }}
]
}}
"""


def get_embedding(text):
    response = requests.post(
        f"{OLLAMA_URL}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": EMBED_QUERY_PREFIX + text},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["embedding"]


def answer(collection, symptom):
    results = collection.query(
        query_embeddings=[get_embedding(symptom)],
        n_results=N_RESULTS,
    )
    context = "\n---\n".join(results["documents"][0])

    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={
            "model": LLM_MODEL,
            "prompt": PROMPT_TEMPLATE.format(context=context, symptom=symptom),
            "format": "json",
            "stream": False,
        },
        timeout=180,
    )
    response.raise_for_status()
    return json.loads(response.json()["response"])


def main():
    collection = chromadb.PersistentClient(path=CHROMA_PATH).get_collection(name=COLLECTION)
    symptoms = sys.argv[1:] or SYMPTOMS

    for symptom in symptoms:
        print(f"\n=== {symptom} ===")
        print(json.dumps(answer(collection, symptom), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
