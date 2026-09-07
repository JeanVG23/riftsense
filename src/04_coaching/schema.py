"""Schéma de sortie typé de la review de coaching (Pydantic v2).

Expose Review (1-3 forces / 3 erreurs / 2 habitudes) et le JSON-schema dérivé pour le
paramètre `format` d'Ollama (structured output). Chaque Insight porte sa
preuve chiffrée — pas de conseil sans stat.
"""
from __future__ import annotations

import copy
from typing import Annotated, Literal, get_args

from pydantic import BaseModel, Field, field_validator, model_validator


class Insight(BaseModel):
    point: str       # affirmation FR ("tu roams trop peu en mid")
    evidence: str    # preuve chiffrée du payload ("roam mid 50% vs 70% challenger")


class Review(BaseModel):
    # 1 à 3 forces : forcer exactement 3 poussait le LLM à remplir avec du filler
    # quand le profil n'a que 1-2 forces réellement saillantes (feedback "trop-vague").
    strengths: Annotated[list[Insight], Field(min_length=1, max_length=3)]
    mistakes: Annotated[list[Insight], Field(min_length=3, max_length=3)]
    habits: Annotated[list[str], Field(min_length=2, max_length=2)]
    next_focus: str
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]


def _strict(schema: dict) -> dict:
    """Schéma Pydantic -> schéma envoyé au LLM.

    Trois transformations : inlining des `$defs`/`$ref` (les modèles ne sont pas
    récursifs, l'inlining termine), suppression des `title`/`description` (sinon les
    docstrings Pydantic partent dans le `format` d'Ollama), et fermeture des objets
    par `additionalProperties: false`. Le résultat est le schéma que le Worker
    écrivait à la main : une seule définition pour les deux runtimes.
    """
    defs = schema.pop("$defs", {})

    def walk(node):
        if isinstance(node, list):
            return [walk(item) for item in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            return walk(copy.deepcopy(defs[node["$ref"].rsplit("/", 1)[1]]))
        out = {k: walk(v) for k, v in node.items() if k not in ("title", "description")}
        if out.get("type") == "object":
            out["additionalProperties"] = False
        return out

    return walk(schema)


def review_json_schema() -> dict:
    """JSON-schema passé à Ollama `format`. minItems/maxItems contraignent la génération."""
    return _strict(Review.model_json_schema())


# --- Review par-game : chaque erreur ancrée sur un moment précis --------------


class AnchoredInsight(Insight):
    """Insight dont la preuve cite un horodatage mm:ss du journal.

    La contrainte est portée par le schéma (`pattern`), donc appliquée AU MOMENT de
    la génération : portée par un validateur seul, elle n'était rattrapée qu'au
    retry, ce qui coûtait un appel. Pydantic v2 applique `pattern` en sémantique
    `re.search`, identique au validateur qu'elle remplace.
    """
    evidence: Annotated[str, Field(pattern=r"\d+:\d\d")]


class GameInsight(AnchoredInsight):
    """Insight par-game : `point` = la leçon actionnable, `cause` = le POURQUOI
    (mécanisme), `evidence` = la preuve chiffrée + l'horodatage mm:ss (hérité).

    Réponse au feedback (boucle d'éval, 2026-07-08) : l'horodatage seul laissait le
    joueur sans cause de mort (« je sais pas pourquoi je suis mort ») et les forces
    sans explication (« aucune idée de pourquoi »). `cause` force le LLM à expliciter
    le mécanisme (solo 1v1 vs gank, comportement à l'origine d'une force), et ancre les
    forces sur un moment au même titre que les erreurs."""

    cause: Annotated[str, Field(min_length=1, description=(
        "Le POURQUOI de l'insight : mécanisme de mort (solo 1v1 sans flash, gank 3v1, "
        "overextension) ou comportement à l'origine d'une force. Jamais l'issue."))]

    # min_length=1 contraint la génération mais accepterait "   " : le validateur
    # attrape le blanc. Même couple que le Worker (minLength + .trim() !== "").
    @field_validator("cause")
    @classmethod
    def _cause_nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("cause vide")
        return v


class GameReview(BaseModel):
    """Review d'UNE game. Pas de section habits : une habitude est un pattern
    multi-games, indétectable sur une game isolée (source de vague assurée).
    Forces ET erreurs sont des `GameInsight` : ancrées sur un moment mm:ss + cause
    explicite (cf. GameInsight) — une force sans preuve temporelle ni cause est du
    remplissage vague, on l'exclut plutôt que de la produire."""
    strengths: Annotated[list[GameInsight], Field(max_length=2)]
    mistakes: Annotated[list[GameInsight], Field(min_length=1, max_length=3)]
    next_focus: Annotated[str, Field(min_length=1)]
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]


def game_review_json_schema() -> dict:
    return _strict(GameReview.model_json_schema())


# --- Review par agents spécialisés ------------------------------------------

AxisKind = Literal["death_positioning", "economy_build"]


class AxisReview(GameReview):
    axis: AxisKind
    label: str


class ChiefSelection(BaseModel):
    """Le chef ne rédige rien : il sélectionne les IDs des sous-agents."""
    summary_insight_id: str
    priority_mistake_ids: Annotated[list[str], Field(min_length=1, max_length=3)]
    strength_insight_ids: Annotated[list[str], Field(max_length=2)]
    next_focus_insight_id: str
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]


class SpecializedGameReview(GameReview):
    """Vue compatible GameReview + analyses complètes dépliables par axe."""
    summary: str
    axes: Annotated[list[AxisReview], Field(min_length=2, max_length=2)]


def chief_selection_json_schema(mistake_ids: list[str], strength_ids: list[str]) -> dict:
    schema = ChiefSelection.model_json_schema()
    props = schema["properties"]
    props["summary_insight_id"]["enum"] = mistake_ids
    props["priority_mistake_ids"]["items"]["enum"] = mistake_ids
    props["next_focus_insight_id"]["enum"] = mistake_ids
    props["strength_insight_ids"]["items"]["enum"] = strength_ids
    return schema


# --- Boucle d'évaluation : annotation des reviews persistées -----------------

TagKind = Literal["asymetrie", "stat-inventee", "profondeur-en-faute",
                 "trop-vague", "non-actionnable", "autre"]
NEG_TAGS: tuple[str, ...] = get_args(TagKind)   # affiché en menu (restera synchronisé)


class FeedbackItem(BaseModel):
    kind: Literal["strength", "mistake", "habit", "focus"]
    index: int                       # position dans sa section (focus = 0)
    useful: bool
    tag: TagKind | None = None        # obligatoire si useful=False (cf. validator)
    note: str | None = None

    @model_validator(mode="after")
    def _tag_required_when_not_useful(self):
        if not self.useful and self.tag is None:
            raise ValueError("tag requis quand useful=False")
        return self


class Feedback(BaseModel):
    ts: str                           # clé = ts de la review annotée
    player: str
    rated_at: str                     # ISO timestamp de l'annotation
    model: str                        # copié de la review (récap par modèle)
    overall_useful: bool | None = None   # non collecté par le flow interactif
    items: list[FeedbackItem]         # items annotés (≤9 ; skips omis)
