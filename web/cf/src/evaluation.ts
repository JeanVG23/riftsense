/** Taux d'utilité du coaching, calculé depuis KV (reviews + annotations).
 *
 * Le chiffre est la métrique de succès du projet : ≥70 % de mistakes jugées
 * utiles sur ≥10 analyses par-partie annotées. Il est calculé ici, à la lecture,
 * et non poussé précalculé par le sync : les annotations arrivent aussi du site
 * lui-même (POST /api/feedback), un blob figé au dernier sync afficherait un
 * taux périmé dès la première note laissée depuis le web.
 *
 * Définition de référence : `objective_stats` / `eval_report` dans
 * src/04_coaching/feedback.py. Les deux constantes ci-dessous sont verrouillées
 * sur leur équivalent Python par tests/test_eval_parity.py.
 */
import { KEYS, readJsonl, type KVLike } from "./readers";

export const TARGET_N = 10;
export const TARGET_RATE = 0.7;

type FeedbackItem = { kind?: string; useful?: boolean; tag?: string | null };
type FeedbackRow = { ts?: string; items?: FeedbackItem[] };
type ReviewRow = { ts?: string; kind?: string; model?: string; run?: { prompt_version?: string } };

export interface EvalReport {
  n_game_reviews: number;
  objective: {
    n_game_reviews_annotated: number;
    target_n: number;
    mistake_useful_rate: number | null;
    target_rate: number;
  };
  target_met: boolean;
  n_reviews_annotated: number;
  n_items: number;
  global_rate: number | null;
  by_kind: Record<string, { n: number; useful: number; rate: number | null }>;
  top_tags: { tag: string; n: number }[];
  by_prompt_version: Record<string, {
    n_game_reviews_annotated: number;
    mistake_useful_rate: number | null;
    n_items: number;
    global_rate: number | null;
  }>;
}

const KINDS = ["strength", "mistake", "habit", "focus"] as const;

function rate(useful: number, n: number): number | null {
  return n ? useful / n : null;
}

export async function readEval(kv: KVLike, slug: string): Promise<EvalReport> {
  const [reviews, feedbacks] = await Promise.all([
    readJsonl<ReviewRow>(kv, KEYS.reviews(slug)),
    readJsonl<FeedbackRow>(kv, KEYS.feedback(slug)),
  ]);
  const gameTs = new Set(
    reviews.filter((r) => r.kind === "game").map((r) => r.ts),
  );
  const items = feedbacks.flatMap((f) => f.items ?? []);
  // La métrique ne porte que sur les analyses PAR PARTIE : les reviews agrégées
  // relèvent d'un autre objectif (et d'un autre schéma, avec habits).
  const gameFeedbacks = feedbacks.filter((f) => gameTs.has(f.ts));
  const gameMistakes = gameFeedbacks
    .flatMap((f) => f.items ?? [])
    .filter((it) => it.kind === "mistake");
  const mistakeRate = rate(
    gameMistakes.filter((it) => it.useful).length,
    gameMistakes.length,
  );

  const byKind: EvalReport["by_kind"] = {};
  for (const kind of KINDS) {
    const section = items.filter((it) => it.kind === kind);
    const useful = section.filter((it) => it.useful).length;
    byKind[kind] = { n: section.length, useful, rate: rate(useful, section.length) };
  }
  const tags = new Map<string, number>();
  for (const it of items) {
    if (!it.useful && it.tag) tags.set(it.tag, (tags.get(it.tag) ?? 0) + 1);
  }

  // Cohorte de prompt : "none" pour les reviews d'avant le bloc `run`. Sans
  // cette coupe, un changement de prompt reste noyé dans la moyenne globale.
  const cohortByTs = new Map<string, string>();
  for (const r of reviews) {
    if (r.ts) cohortByTs.set(r.ts, r.run?.prompt_version || "none");
  }
  const byPromptVersion: EvalReport["by_prompt_version"] = {};
  for (const version of [...new Set(cohortByTs.values())].sort()) {
    const subset = feedbacks.filter((f) => f.ts && cohortByTs.get(f.ts) === version);
    const subItems = subset.flatMap((f) => f.items ?? []);
    const subGame = subset.filter((f) => gameTs.has(f.ts));
    const subMistakes = subGame.flatMap((f) => f.items ?? [])
      .filter((it) => it.kind === "mistake");
    byPromptVersion[version] = {
      n_game_reviews_annotated: subGame.length,
      mistake_useful_rate: rate(
        subMistakes.filter((it) => it.useful).length,
        subMistakes.length,
      ),
      n_items: subItems.length,
      global_rate: rate(subItems.filter((it) => it.useful).length, subItems.length),
    };
  }

  return {
    n_game_reviews: gameTs.size,
    objective: {
      n_game_reviews_annotated: gameFeedbacks.length,
      target_n: TARGET_N,
      mistake_useful_rate: mistakeRate,
      target_rate: TARGET_RATE,
    },
    target_met: gameFeedbacks.length >= TARGET_N && (mistakeRate ?? 0) >= TARGET_RATE,
    n_reviews_annotated: feedbacks.length,
    n_items: items.length,
    global_rate: rate(items.filter((it) => it.useful).length, items.length),
    by_kind: byKind,
    top_tags: [...tags.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, n]) => ({ tag, n })),
    by_prompt_version: byPromptVersion,
  };
}
