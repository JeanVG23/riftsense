/** Instants cités par une review de partie, et leur découpage en phases.
 *
 * Propriété du CONTRAT de données, pas de la vue : `game_review.schema.json`
 * impose `\d+:\d\d` dans chaque `evidence`, le Worker en dérive une liste
 * compacte publiée dans la liste légère des reviews, et le client la relit.
 * Ce module vit donc côté `src/` et il est le SEUL endroit où cette lecture
 * est écrite : dupliquer la regex côté client la ferait diverger en silence.
 */

export interface GameStamp {
  /** Minutes décimales depuis le début de la partie. */
  at: number;
  /** L'écriture d'origine ("14:16"), la seule qu'un joueur peut retrouver. */
  label: string;
}

/** Secondes bornées à 59 : sans cette borne, un ratio ("3:1") et un score
 * ("2:0") deviendraient des instants de jeu. Les montants et pourcentages qui
 * traversent les evidence (1,029 damage, 43.07 %) ne portent pas de
 * deux-points et ne peuvent pas matcher. */
const STAMP = /\b(\d{1,3}):([0-5]\d)\b/g;

export function parseTimestamps(text: unknown): GameStamp[] {
  const source = String(text ?? "");
  const seen = new Map<number, GameStamp>();
  for (const match of source.matchAll(STAMP)) {
    const at = Number(match[1]) + Number(match[2]) / 60;
    if (!seen.has(at)) seen.set(at, { at, label: `${match[1]}:${match[2]}` });
  }
  return [...seen.values()].sort((left, right) => left.at - right.at);
}

export type MomentKind = "strength" | "mistake";

/** Un instant publié dans la liste légère : de quoi superposer les frises de
 * N parties sans relire N détails. */
export interface PublishedMoment {
  at: number;
  kind: MomentKind;
}

interface MomentSource {
  strengths?: unknown;
  mistakes?: unknown;
}

/** Les instants d'une review, arrondis au centième de minute (la seconde
 * d'origine est conservée à 0.6 s près, et le payload ne traîne pas
 * 14.333333333333334). */
export function momentsOf(review: MomentSource | null | undefined): PublishedMoment[] {
  const moments: PublishedMoment[] = [];
  const collect = (items: unknown, kind: MomentKind) => {
    for (const item of Array.isArray(items) ? items : []) {
      const evidence = (item as { evidence?: unknown } | null)?.evidence;
      for (const stamp of parseTimestamps(evidence)) {
        moments.push({ at: Math.round(stamp.at * 100) / 100, kind });
      }
    }
  };
  collect(review?.strengths, "strength");
  collect(review?.mistakes, "mistake");
  return moments.sort((left, right) => left.at - right.at);
}
