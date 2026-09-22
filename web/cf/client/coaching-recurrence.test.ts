import { describe, expect, it } from "vitest";
import { recurrenceRows } from "./coaching-recurrence";

const game = (id: string, win: boolean, categories: string[]) => ({
  match_id: id, meta: { win }, summary: { categories },
});

describe("recurrenceRows", () => {
  // L'API rend la plus récente d'abord ; la grille doit se lire dans le sens du temps.
  const items = [
    game("G3", false, ["POSITIONNEMENT_COMBAT", "OBJECTIFS"]),
    game("G2", true, ["POSITIONNEMENT_COMBAT"]),
    game("G1", false, ["POSITIONNEMENT_COMBAT", "TRACKING_JUNGLE"]),
  ];

  it("classe les catégories par nombre de parties concernées", () => {
    const rows = recurrenceRows(items);
    expect(rows.map(row => row.category)).toEqual([
      "POSITIONNEMENT_COMBAT", "TRACKING_JUNGLE", "OBJECTIFS",
    ]);
    expect(rows[0]).toMatchObject({ count: 3, total: 3 });
  });

  it("remet les parties dans l'ordre chronologique et marque les présences", () => {
    const [top, jungle] = recurrenceRows(items);
    expect(top.games.map(item => item.matchId)).toEqual(["G1", "G2", "G3"]);
    expect(top.games.map(item => item.hit)).toEqual([true, true, true]);
    expect(jungle.games.map(item => item.hit)).toEqual([true, false, false]);
    expect(jungle.games.map(item => item.win)).toEqual([false, true, false]);
  });

  it("compte une partie une seule fois, même citée deux fois", () => {
    const rows = recurrenceRows([game("G1", false, ["OBJECTIFS", "OBJECTIFS"])]);
    expect(rows[0]).toMatchObject({ category: "OBJECTIFS", count: 1, total: 1 });
  });

  it("borne le nombre de lignes rendues", () => {
    expect(recurrenceRows(items, 2)).toHaveLength(2);
  });

  it("ne rend rien quand aucune catégorie n'est publiée", () => {
    expect(recurrenceRows([{ match_id: "G1", meta: { win: true }, summary: {} }])).toEqual([]);
    expect(recurrenceRows(null)).toEqual([]);
  });
});
