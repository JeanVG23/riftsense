/** Validation Review — miroir strict de src/04_coaching/schema.py. */

import { GAME_REVIEW_SCHEMA, REVIEW_SCHEMA } from "./generated/shared";

export interface Insight {
  point: string;
  evidence: string;
}

export interface Review {
  strengths: Insight[];
  mistakes: Insight[];
  habits: string[];
  next_focus: string;
  confidence: number;
}

export interface GameInsight extends Insight {
  cause: string;
}

export interface GameReview {
  strengths: GameInsight[];
  mistakes: GameInsight[];
  next_focus: string;
  confidence: number;
}

export const NEG_TAGS = [
  "asymetrie",
  "stat-inventee",
  "profondeur-en-faute",
  "trop-vague",
  "non-actionnable",
  "autre",
] as const;
export type TagKind = (typeof NEG_TAGS)[number];

function isInsight(value: unknown): value is Insight {
  return typeof value === "object" && value !== null
    && typeof (value as Insight).point === "string"
    && typeof (value as Insight).evidence === "string";
}

function isStringArray(value: unknown, length: number): value is string[] {
  return Array.isArray(value)
    && value.length === length
    && value.every((item) => typeof item === "string");
}

function isConfidence(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
}

function isGameInsight(value: unknown): value is GameInsight {
  return isInsight(value)
    && typeof (value as GameInsight).cause === "string"
    && (value as GameInsight).cause.trim() !== ""
    && /\d+:\d\d/.test((value as GameInsight).evidence);
}

export function validateReview(raw: unknown): Review | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.strengths)
      || value.strengths.length < 1
      || value.strengths.length > 3) return null;
  if (!Array.isArray(value.mistakes) || value.mistakes.length !== 3) return null;
  if (!value.strengths.every(isInsight) || !value.mistakes.every(isInsight)) return null;
  if (!isStringArray(value.habits, 2)) return null;
  if (typeof value.next_focus !== "string") return null;
  if (!isConfidence(value.confidence)) return null;
  return {
    strengths: value.strengths,
    mistakes: value.mistakes,
    habits: value.habits,
    next_focus: value.next_focus,
    confidence: value.confidence,
  };
}

/** Miroir de GameReview : aucune habitude n'est inférée sur une seule partie. */
export function validateGameReview(raw: unknown): GameReview | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.strengths) || value.strengths.length > 2) return null;
  if (!Array.isArray(value.mistakes)
      || value.mistakes.length < 1
      || value.mistakes.length > 3) return null;
  if (!value.strengths.every(isGameInsight) || !value.mistakes.every(isGameInsight)) return null;
  if (typeof value.next_focus !== "string" || value.next_focus.trim() === "") return null;
  if (!isConfidence(value.confidence)) return null;
  return {
    strengths: value.strengths,
    mistakes: value.mistakes,
    next_focus: value.next_focus,
    confidence: value.confidence,
  };
}

// Les schémas sont dérivés de Pydantic (src/04_coaching/schema.py) : une contrainte
// de génération est déclarée une seule fois, du côté qui fait aussi la validation.
export function reviewJsonSchema(): Record<string, unknown> {
  return REVIEW_SCHEMA;
}

export function gameReviewJsonSchema(): Record<string, unknown> {
  return GAME_REVIEW_SCHEMA;
}
