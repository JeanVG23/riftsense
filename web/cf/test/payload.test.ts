import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addGameReviewCauses, buildPayload, gameReviewSample } from "../src/payload";

const goldenDirectory = new URL("./golden/", import.meta.url);

describe("parité golden payload (Python == TS)", () => {
  const files = readdirSync(goldenDirectory)
    .filter((file) => file.startsWith("payload_") && file.endsWith(".json"));

  it("a des fixtures à rejouer", () => expect(files.length).toBeGreaterThanOrEqual(6));
  for (const file of files) {
    const golden = JSON.parse(
      readFileSync(new URL(`./golden/${file}`, import.meta.url), "utf8"),
    );
    it(`rejoue ${file}`, () => {
      expect(buildPayload(golden.me, golden.ref, golden.args)).toEqual(golden.expected);
    });
  }
});

describe("scopes de benchmark", () => {
  it("refuse un ancien scope champion", () => {
    expect(() => buildPayload({}, {}, {
      player: "p", scope: "zeri", target: "challenger", outcome: "loss",
    })).toThrow("unknown benchmark scope");
  });
});

describe("map des reviews par partie", () => {
  it("conserve point+cause, retire evidence et filtre le scope", () => {
    const payload = { meta: { scope: "adc" }, signals: [], context: {} };
    const result = addGameReviewCauses(payload, [
      {
        ts: "2026-09-02", kind: "game", scope: "adc", match_id: "EUW1_42",
        payload: { meta: { champion: "Jinx", win: false } },
        review: { strengths: [], mistakes: [
          { point: "greed reset", cause: "attente", evidence: "1 268 g à 11:06" },
        ] },
      },
      {
        ts: "2026-09-03", kind: "game", scope: "mid",
        payload: { meta: { champion: "Ahri", win: true } },
        review: { strengths: [], mistakes: [{ point: "mid", cause: "mid" }] },
      },
    ], "adc");
    expect(result.meta.n_game_reviews_used).toBe(1);
    expect(result.game_review_causes).toEqual([{
      champion: "Jinx", outcome: "loss", strengths: [],
      mistakes: [{ point: "greed reset", cause: "attente" }],
    }]);
    expect(JSON.stringify(result)).not.toContain("1 268");
    expect(JSON.stringify(result)).not.toContain("EUW1_42");
    expect(result.meta.unbalanced_causes).toBe(true);
  });

  it("impose la parité stricte win/loss sur des reviews asymétriques", () => {
    const payload = { meta: { scope: "adc" }, signals: [], context: {} };
    // 3 défaites et 1 victoire
    const reviews = [
      {
        ts: "2026-09-04", kind: "game", scope: "adc",
        payload: { meta: { champion: "Zeri", win: true } },
        review: { strengths: [{ point: "spacing", cause: "kite" }], mistakes: [] },
      },
      {
        ts: "2026-09-03", kind: "game", scope: "adc",
        payload: { meta: { champion: "Zeri", win: false } },
        review: { strengths: [], mistakes: [{ point: "facecheck", cause: "vision" }] },
      },
      {
        ts: "2026-09-02", kind: "game", scope: "adc",
        payload: { meta: { champion: "Zeri", win: false } },
        review: { strengths: [], mistakes: [{ point: "overextend", cause: "gank" }] },
      },
      {
        ts: "2026-09-01", kind: "game", scope: "adc",
        payload: { meta: { champion: "Zeri", win: false } },
        review: { strengths: [], mistakes: [{ point: "bad back", cause: "tempo" }] },
      },
    ];
    const result = addGameReviewCauses(payload, reviews, "adc");
    // nPairs = min(1, 3) = 1 -> 1 win + 1 loss = 2 reviews injectées
    expect(result.meta.n_game_reviews_used).toBe(2);
    expect(result.meta.n_game_reviews_wins).toBe(1);
    expect(result.meta.n_game_reviews_losses).toBe(3);
    expect(result.meta.n_game_reviews_used_wins).toBe(1);
    expect(result.meta.n_game_reviews_used_losses).toBe(1);
    expect(result.meta.unbalanced_causes).toBe(false);
    expect(result.game_review_causes.filter((c: any) => c.outcome === "win")).toHaveLength(1);
    expect(result.game_review_causes.filter((c: any) => c.outcome === "loss")).toHaveLength(1);
  });

  it("borne à 2V/2D et distingue disponible de utilisé", () => {
    const review = (ts: string, win: boolean, champion = "Zeri") => ({
      ts, kind: "game", scope: "adc", match_id: `m-${ts}`,
      payload: { meta: { champion, role: "BOTTOM", win } },
      review: { strengths: [], mistakes: [{ point: ts, cause: `cause-${ts}` }] },
    });
    const reviews = [
      ...Array.from({ length: 4 }, (_, i) => review(`w${i}`, true)),
      ...Array.from({ length: 5 }, (_, i) => review(`l${i}`, false)),
    ];
    const sample = gameReviewSample(reviews, "adc");
    expect(sample.mode).toBe("balanced");
    expect(sample.available).toEqual({ total: 9, wins: 4, losses: 5 });
    expect(sample.used).toEqual({ total: 4, wins: 2, losses: 2 });
    expect(gameReviewSample(reviews, "zeri").available.total).toBe(0);
    expect(gameReviewSample(reviews, "jinx").mode).toBe("none");
  });

  it("n'injecte qu'une cause si une seule issue est disponible", () => {
    const reviews = ["1", "2", "3"].map((ts) => ({
      ts, kind: "game", scope: "adc", payload: { meta: { role: "BOTTOM", win: false } },
      review: { mistakes: [{ point: ts, cause: ts }] },
    }));
    const sample = gameReviewSample(reviews, "adc");
    expect(sample.mode).toBe("unbalanced");
    expect(sample.available).toEqual({ total: 3, wins: 0, losses: 3 });
    expect(sample.used).toEqual({ total: 1, wins: 0, losses: 1 });
  });

  it("ne compte qu'une fois un match régénéré", () => {
    const run = (ts: string) => ({
      ts, kind: "game", match_id: "EUW1_42", scope: "adc",
      payload: { meta: { role: "BOTTOM", win: false } },
      review: { mistakes: [{ point: ts, cause: `cause-${ts}` }] },
    });
    const sample = gameReviewSample([run("2026-09-01"), run("2026-09-02")], "adc");
    expect(sample.available).toEqual({ total: 1, wins: 0, losses: 1 });
    expect(sample.causes[0].mistakes[0].point).toBe("2026-09-02");
  });
});
