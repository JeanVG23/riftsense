#!/usr/bin/env python3
"""Prompts et schémas partagés -> artefacts consommés par le Worker.

Les prompts vivent dans shared/prompts/ (source, écrite à la main) et les schémas
sont dérivés de Pydantic : ce script ne fait que les sérialiser vers shared/schemas/
et vers un module TypeScript committé. Le Worker n'a donc ni configuration de
bundler ni runtime Python à sa charge, et la parité entre les deux runtimes est
vérifiée par tests/test_shared_contract.py.

0 réseau, 0 API, idempotent.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "src" / "04_coaching"))
import prompt as prompt_mod   # noqa: E402
import schema as schema_mod   # noqa: E402

SHARED = ROOT / "shared"
GENERATED_TS = ROOT / "web" / "cf" / "src" / "generated" / "shared.ts"

HEADER = ("// GÉNÉRÉ par src/pipeline_ops/generate_shared.py — ne pas éditer à la main.\n"
          "// Source : shared/prompts/*.txt et src/04_coaching/schema.py.\n"
          "// Régénérer : make generate-shared\n")


def _ts(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def build() -> dict[Path, str]:
    """Chemin -> contenu attendu. N'écrit rien : le test compare au disque."""
    review = schema_mod.review_json_schema()
    game_review = schema_mod.game_review_json_schema()
    out = {
        SHARED / "schemas" / "review.schema.json":
            json.dumps(review, ensure_ascii=False, indent=2) + "\n",
        SHARED / "schemas" / "game_review.schema.json":
            json.dumps(game_review, ensure_ascii=False, indent=2) + "\n",
        GENERATED_TS: (
            f"{HEADER}\n"
            f"export const SYSTEM = {_ts(prompt_mod.SYSTEM)};\n\n"
            f"export const SYSTEM_GAME = {_ts(prompt_mod.SYSTEM_GAME)};\n\n"
            f"export const REVIEW_SCHEMA: Record<string, unknown> = {_ts(review)};\n\n"
            f"export const GAME_REVIEW_SCHEMA: Record<string, unknown> = "
            f"{_ts(game_review)};\n\n"
            f"export const REVIEW_SCHEMA_VERSION = "
            f"{json.dumps(schema_mod.REVIEW_SCHEMA_VERSION)};\n\n"
            f"export const GAME_REVIEW_SCHEMA_VERSION = "
            f"{json.dumps(schema_mod.GAME_REVIEW_SCHEMA_VERSION)};\n"
        ),
    }
    return out


def write() -> list[Path]:
    written = []
    for path, content in build().items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        written.append(path)
    return written


if __name__ == "__main__":
    for path in write():
        print(path.relative_to(ROOT))
