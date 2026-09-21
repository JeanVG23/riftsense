"""Payload de coaching -> messages (system, user) pour le LLM. PUR.

Le system encode les règles dures (asymétrie, preuve obligatoire, priorité aux
signaux notable, nuance profondeur, benchmark-relatif, FR). La sélection des
signaux est déjà faite dans payload.py : ici on n'impose que le cadre de narration.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


# Les prompts vivent dans shared/prompts/ : ce sont des données, pas du code, et le
# Worker doit lire exactement le même texte (cf. src/pipeline_ops/generate_shared.py).
# Le newline final est strippé pour que version_of rende les empreintes historiques :
# un hash qui bouge périmerait toutes les reviews déjà publiées.
_PROMPTS = Path(__file__).resolve().parents[2] / "shared" / "prompts"


def _prompt(name: str) -> str:
    return (_PROMPTS / f"{name}.txt").read_text(encoding="utf-8").rstrip("\n")

SYSTEM = _prompt("system")


def render(payload: dict) -> tuple[str, str]:
    m = payload["meta"]
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    user = (f"Signals from your latest {m['n_games_me']} games "
            f"({m['scope']}, outcome={m['outcome_focus']}, vs {m['target']}):\n\n"
            f"{body}\n\nProduce the review.")
    if m.get("qualitative_mode") == "unbalanced" or m.get("unbalanced_causes"):
        issue = ("losses" if m.get("n_game_reviews_available_losses",
                                      m.get("n_game_reviews_losses", 0)) > 0
                 else "wins")
        available = m.get("n_game_reviews_available", 1)
        user += (f"\n\nSAMPLE-BIAS NOTE: The player has only had {issue} analyzed "
                 f"as individual games ({available} available, only one included). "
                 f"This isolated cause is NOT representative of their full profile. "
                 f"Base your conclusions primarily on the actual statistical signals.")
    return SYSTEM, user


SYSTEM_GAME = _prompt("system_game")


def render_game(payload: dict) -> tuple[str, str]:
    m = payload["meta"]
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    issue = "win" if m.get("win") else "loss"
    user = (f"Timeline of your game {m['match_id']} — {m['champion']} vs "
            f"{m.get('opponent') or '?'} ({m['role']}, {issue}, "
            f"{m['duration_min']} min), {m['target']} benchmarks:\n\n"
            f"{body}\n\nProduce the review for this game.")
    return SYSTEM_GAME, user


AXIS_DEATH_POSITIONING = _prompt("axis_death_positioning")

AXIS_ECONOMY_BUILD = _prompt("axis_economy_build")

SPECIALIST_SYSTEMS = {
    "death_positioning": SYSTEM_GAME + "\n\n" + AXIS_DEATH_POSITIONING,
    "economy_build": SYSTEM_GAME + "\n\n" + AXIS_ECONOMY_BUILD,
}

AXIS_LABELS = {
    "death_positioning": "Deaths & positioning",
    "economy_build": "Economy & build",
}


def _axis_payload(payload: dict, axis: str) -> dict:
    journal = payload.get("journal") or {}
    common = {"meta": payload["meta"], "context": payload.get("context", {})}
    if axis == "death_positioning":
        return {**common, "journal": {"deaths": journal.get("deaths", [])},
                "benchmarks": payload.get("benchmarks", {})}
    if axis == "economy_build":
        economy_deaths = [{k: v for k, v in death.items()
                           if k in ("t_ms", "clock", "unspent_gold", "next_purchase",
                                    "objective", "phase", "zone")}
                          for death in journal.get("deaths", [])]
        return {**common, "journal": {"deaths": economy_deaths,
                                      "recalls": journal.get("recalls", [])}}
    raise KeyError(f"unknown axis: {axis}")


def render_specialist(payload: dict, axis: str) -> tuple[str, str]:
    sliced = _axis_payload(payload, axis)
    return (SPECIALIST_SYSTEMS[axis],
            f"Analyze the {AXIS_LABELS[axis]} axis for this game:\n\n"
            f"{json.dumps(sliced, ensure_ascii=False, indent=2)}\n\n"
            "Return only the JSON review for your axis.")


SYSTEM_CHIEF = _prompt("system_chief")


def render_chief(indexed_axes: list[dict]) -> tuple[str, str]:
    return (SYSTEM_CHIEF,
            "Sub-agent analyses:\n\n"
            f"{json.dumps(indexed_axes, ensure_ascii=False, indent=2)}\n\n"
            "Select the priority identifiers.")


# --- versionnage des prompts -------------------------------------------------
# Une review persistée n'est comparable à une autre que si l'on sait sous quel
# prompt elle a été produite. Un numéro à incrémenter à la main dérive dès qu'on
# oublie un bump : la version est donc DÉRIVÉE du texte lui-même (empreinte
# tronquée). Modifier une règle change la version mécaniquement.

def version_of(system: str) -> str:
    return hashlib.sha256(system.encode()).hexdigest()[:12]


PROMPT_VERSION = version_of(SYSTEM)
GAME_PROMPT_VERSION = version_of(SYSTEM_GAME)
SPECIALIZED_PROMPT_VERSION = version_of(
    "\n".join([*SPECIALIST_SYSTEMS.values(), SYSTEM_CHIEF]))
