import { describe, expect, it } from "vitest";
import { listAccounts, putAccount, readAccount, type Account } from "../src/accounts";

function fakeKV() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
  };
}

const SPADZZE: Account = {
  slug: "spadzze", riot_id: "Spadzze#euw", region: "euw1", source: "curated",
};

describe("registre des comptes", () => {
  it("écrit le compte et l'inscrit dans l'index", async () => {
    const kv = fakeKV();
    await putAccount(kv, SPADZZE);
    expect(JSON.parse(kv.store.get("account:spadzze")!)).toEqual(SPADZZE);
    expect(JSON.parse(kv.store.get("accounts:index")!)).toEqual(["spadzze"]);
  });

  it("n'ajoute pas deux fois le même slug à l'index", async () => {
    const kv = fakeKV();
    await putAccount(kv, SPADZZE);
    await putAccount(kv, { ...SPADZZE, last_ingest_ts: "2026-09-08T10:00:00Z" });
    expect(JSON.parse(kv.store.get("accounts:index")!)).toEqual(["spadzze"]);
    expect(JSON.parse(kv.store.get("account:spadzze")!).last_ingest_ts)
      .toBe("2026-09-08T10:00:00Z");
  });

  it("rend null sur un compte inconnu", async () => {
    expect(await readAccount(fakeKV(), "inconnu")).toBeNull();
  });

  it("liste les comptes de l'index en ignorant les entrées orphelines", async () => {
    const kv = fakeKV();
    await putAccount(kv, SPADZZE);
    // Un slug indexé dont l'enregistrement a disparu ne doit pas casser la page
    // d'accueil : l'index est un raccourci de lecture, pas la vérité.
    kv.store.set("accounts:index", JSON.stringify(["spadzze", "fantome"]));
    expect(await listAccounts(kv)).toEqual([SPADZZE]);
  });

  it("rend une liste vide quand l'index n'existe pas encore", async () => {
    expect(await listAccounts(fakeKV())).toEqual([]);
  });
});
