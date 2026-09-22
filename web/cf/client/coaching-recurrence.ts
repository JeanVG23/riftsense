/** Ce qui revient d'une partie à l'autre, pour la vue globale.
 *
 * L'onglet ML répond déjà « quelles métriques pèsent sur ton score » avec des
 * barres de contribution. Refaire ici un classement à barres publierait deux
 * fois le même objet visuel pour deux vérités différentes. La question propre
 * au coaching est autre : sur quelles parties, et dans quel ordre, la même
 * catégorie d'erreur est-elle ressortie ? La réponse est une grille de
 * présence (une colonne par partie, dans l'ordre chronologique), pas un
 * classement : toutes les lignes ont la même largeur, seul le motif change.
 *
 * Les catégories viennent du vocabulaire fermé de `game_review.schema.json`,
 * publié par le Worker dans le résumé de chaque review.
 */

export interface RecurrenceGame {
  matchId: string;
  win: boolean | null;
  /** La catégorie de la ligne a été relevée dans cette partie. */
  hit: boolean;
}

export interface RecurrenceRow {
  category: string;
  count: number;
  total: number;
  /** Les parties dans l'ordre où elles ont été jouées, la plus ancienne d'abord. */
  games: RecurrenceGame[];
}

interface ReviewSummaryItem {
  match_id?: unknown;
  meta?: { win?: unknown; match_id?: unknown } | null;
  summary?: { categories?: unknown } | null;
}

function matchIdOf(item: ReviewSummaryItem): string {
  return String(item?.match_id ?? item?.meta?.match_id ?? "");
}

function categoriesOf(item: ReviewSummaryItem): string[] {
  const raw = item?.summary?.categories;
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
}

export const RECURRENCE_ROWS = 3;

/** Les `limit` catégories les plus récurrentes. Une catégorie compte une fois
 * par partie, jamais deux : la question est « dans combien de parties », pas
 * « combien de fois au total », sinon une partie très commentée pèserait pour
 * plusieurs. L'égalité se départage par la première apparition, pour que deux
 * rendus du même payload ne se contredisent pas. */
export function recurrenceRows(
  items: ReviewSummaryItem[] | null | undefined,
  limit: number = RECURRENCE_ROWS,
): RecurrenceRow[] {
  // L'API rend les reviews de la plus récente à la plus ancienne ; la grille
  // se lit dans le sens du temps.
  const games = [...(items ?? [])].reverse();
  const order: string[] = [];
  const present = new Map<string, Set<string>>();
  for (const game of games) {
    const id = matchIdOf(game);
    for (const category of new Set(categoriesOf(game))) {
      if (!present.has(category)) { present.set(category, new Set()); order.push(category); }
      present.get(category)?.add(id);
    }
  }
  return order
    .map((category) => {
      const hits = present.get(category) as Set<string>;
      return {
        category,
        count: hits.size,
        total: games.length,
        games: games.map((game) => ({
          matchId: matchIdOf(game),
          win: typeof game?.meta?.win === "boolean" ? game.meta.win : null,
          hit: hits.has(matchIdOf(game)),
        })),
      };
    })
    .sort((left, right) => right.count - left.count || order.indexOf(left.category) - order.indexOf(right.category))
    .slice(0, limit);
}
