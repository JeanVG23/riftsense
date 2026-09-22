import { parseTimestamps, type GameStamp, type PublishedMoment } from "../src/game_moments";

// Point d'entrée unique côté client : les composants n'ont pas à savoir que
// la lecture des horodatages appartient au contrat servi par le Worker.
export { parseTimestamps };
export type { PublishedMoment };

/** Frise temporelle d'une review de game.
 *
 * L'onglet ML lit une décomposition SANS dimension temporelle : un poids par
 * métrique, agrégé sur une fenêtre de parties. Le coaching lit l'inverse, des
 * instants datés d'UNE partie. C'est la seule chose que les deux onglets ne
 * peuvent pas se voler, donc c'est ce que la vue par game donne à voir en
 * premier : une frise, pas des barres.
 *
 * La matière est gratuite : `game_review.schema.json` impose `\d+:\d\d` dans
 * chaque `evidence`, donc tout insight publié porte au moins un horodatage.
 * Ce module ne fait que le relire ; il ne calcule aucune feature et n'invente
 * aucun instant que le LLM n'a pas cité.
 */

export type { GameStamp } from "../src/game_moments";

export interface GameMark extends GameStamp {
  kind: "strength" | "mistake";
  /** Index dans `strengths`/`mistakes` : c'est la clé du feedback existant. */
  index: number;
  title: string;
  category: string | null;
}

interface RawInsight {
  title?: unknown;
  point?: unknown;
  category?: unknown;
  evidence?: unknown;
}

interface RawReview {
  strengths?: RawInsight[] | null;
  mistakes?: RawInsight[] | null;
}

function insightTitleOf(item: RawInsight): string {
  return String(item.title ?? item.point ?? "");
}

/** Un repère par instant cité. Un insight qui en cite trois en pose trois :
 * la frise montre des moments de jeu, pas des cartes. Un insight sans instant
 * daté n'apparaît pas plutôt que d'être planté à zéro, ce qui inventerait une
 * information que le journal ne porte pas. */
export function buildMarks(review: RawReview | null | undefined): GameMark[] {
  const marks: GameMark[] = [];
  const collect = (items: RawInsight[] | null | undefined, kind: GameMark["kind"]) => {
    for (const [index, item] of (items ?? []).entries()) {
      for (const stamp of parseTimestamps(item?.evidence)) {
        marks.push({
          ...stamp,
          kind,
          index,
          title: insightTitleOf(item ?? {}),
          category: item?.category ? String(item.category) : null,
        });
      }
    }
  };
  collect(review?.strengths, "strength");
  collect(review?.mistakes, "mistake");
  return marks.sort((left, right) => left.at - right.at);
}

/** Position sur la frise, en pourcentage de la durée. Les instants hors durée
 * sont plaqués aux extrémités : la durée publiée est arrondie à la minute et
 * le LLM cite parfois l'instant exact d'un dernier combat. */
export function markPosition(at: number, durationMin: number | null | undefined): number {
  const duration = Number(durationMin);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(100, (at / duration) * 100));
}

export interface CategoryCount {
  category: string;
  count: number;
  total: number;
}

/** La catégorie la plus citée, avec son compte sur le total, SEULEMENT si elle
 * se détache seule. Une review de cinq erreurs porte souvent cinq catégories
 * distinctes : désigner la première ferait passer une égalité parfaite pour un
 * dominant, et « X domine : 1 erreur sur 5 » se lit comme une conclusion alors
 * que ce n'en est pas une. Même discipline que `dominantPhase`. */
export function dominantCategory(items: RawInsight[] | null | undefined): CategoryCount | null {
  const counts = new Map<string, number>();
  for (const item of items ?? []) {
    if (!item?.category) continue;
    const key = String(item.category);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return { category: ranked[0][0], count: ranked[0][1], total: (items ?? []).length };
}

export type GamePhase = "early" | "mid" | "late";

export interface PhaseCounts {
  early: number;
  mid: number;
  late: number;
}

const PHASES: GamePhase[] = ["early", "mid", "late"];

/** Répartition des erreurs en tiers de partie. Les forces sont exclues : la
 * question posée est « quand ça casse », pas « quand ça se passe ». */
export function gamePhases(marks: GameMark[], durationMin: number | null | undefined): PhaseCounts | null {
  const duration = Number(durationMin);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const counts: PhaseCounts = { early: 0, mid: 0, late: 0 };
  for (const mark of marks) {
    if (mark.kind !== "mistake") continue;
    const third = Math.min(2, Math.max(0, Math.floor((mark.at / duration) * 3)));
    counts[PHASES[third]] += 1;
  }
  return counts;
}

/** La phase dominante, seulement si elle se détache seule. Une égalité ne dit
 * rien sur la partie : on se tait plutôt que de servir un tiers au hasard. */
export function dominantPhase(marks: GameMark[], durationMin: number | null | undefined): GamePhase | null {
  const counts = gamePhases(marks, durationMin);
  if (!counts) return null;
  const ranked = PHASES.map(phase => ({ phase, count: counts[phase] })).sort((left, right) => right.count - left.count);
  if (!ranked[0].count || ranked[0].count === ranked[1].count) return null;
  return ranked[0].phase;
}


/** Bandes de phase EN MINUTES ABSOLUES. Agréger N parties de durées
 * différentes interdit le tiers relatif : la 12e minute d'une partie de 24
 * minutes et d'une de 40 est la même phase de jeu, pas le même tiers. Les
 * bornes suivent le déroulé d'une partie (mise en place, lane, regroupements,
 * fin), pas un découpage arithmétique. */
export const PHASE_BANDS = [
  { key: "very_early", from: 0, to: 5, label: "0-5", name: "very early" },
  { key: "laning", from: 5, to: 15, label: "5-15", name: "laning phase" },
  { key: "mid", from: 15, to: 25, label: "15-25", name: "mid game" },
  { key: "late", from: 25, to: Infinity, label: "25+", name: "late game" },
] as const;

export type PhaseBand = (typeof PHASE_BANDS)[number];

export interface BandCount {
  key: PhaseBand["key"];
  label: string;
  name: string;
  from: number;
  to: number;
  mistakes: number;
  strengths: number;
}

export function bandCounts(moments: PublishedMoment[] | null | undefined): BandCount[] {
  return PHASE_BANDS.map((band) => {
    const inside = (moments ?? []).filter((moment) => moment.at >= band.from && moment.at < band.to);
    return {
      key: band.key,
      label: band.label,
      name: band.name,
      from: band.from,
      to: band.to,
      mistakes: inside.filter((moment) => moment.kind === "mistake").length,
      strengths: inside.filter((moment) => moment.kind === "strength").length,
    };
  });
}

export interface DenseSpan {
  fromMin: number;
  /** `null` sur la dernière bande, qui n'a pas de borne haute. */
  toMin: number | null;
  count: number;
  total: number;
}

/** Part des erreurs qu'une fenêtre doit tenir pour être dite « concentrée ». */
export const DENSE_SHARE = 0.7;

/** La plus courte fenêtre CONTIGUË de bandes qui tient au moins `share` des
 * erreurs. Une concentration, pas un classement : sur la fenêtre réelle de
 * Spadzze, laning (55) et mid (58) sont à égalité de fait, et nommer un
 * dominant y serait faux alors que « 113 sur 140 entre 5 et 25 minutes » est
 * exact. À longueur égale, la fenêtre la plus précoce gagne, pour que deux
 * rendus du même payload ne se contredisent pas. */
export function denseSpan(counts: BandCount[], share: number = DENSE_SHARE): DenseSpan | null {
  const total = counts.reduce((sum, band) => sum + band.mistakes, 0);
  if (!total) return null;
  const needed = total * share;
  for (let width = 1; width <= counts.length; width += 1) {
    for (let start = 0; start + width <= counts.length; start += 1) {
      const window = counts.slice(start, start + width);
      const count = window.reduce((sum, band) => sum + band.mistakes, 0);
      if (count >= needed) {
        const last = window[window.length - 1];
        return {
          fromMin: window[0].from,
          toMin: Number.isFinite(last.to) ? last.to : null,
          count,
          total,
        };
      }
    }
  }
  return null;
}

/** Fin de l'axe affiché, arrondie au palier de cinq minutes au-dessus du
 * dernier instant, avec un plancher à 30 pour qu'une fenêtre de parties
 * courtes ne donne pas une frise écrasée. */
export function axisMax(moments: PublishedMoment[] | null | undefined): number {
  const last = (moments ?? []).reduce((high, moment) => Math.max(high, moment.at), 0);
  return Math.max(30, Math.ceil(last / 5) * 5);
}
