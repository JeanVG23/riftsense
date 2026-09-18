import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_RECENT_ACCOUNTS,
  readRecentAccounts,
  RECENT_ACCOUNTS_KEY,
  rememberRecentAccount,
  removeRecentAccount,
} from "./recent-accounts";

class MemoryStorage {
  store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

let storage: MemoryStorage;
beforeEach(() => { storage = new MemoryStorage(); });

describe("recent accounts", () => {
  it("persiste les comptes du plus récent au plus ancien sans doublon", () => {
    rememberRecentAccount(
      { slug: "one-euw", riot_id: "One#EUW", region: "euw1" },
      storage,
      "2026-09-17T10:00:00.000Z",
    );
    rememberRecentAccount(
      { slug: "two-na", riot_id: "Two#NA1", region: "na1" },
      storage,
      "2026-09-17T11:00:00.000Z",
    );
    rememberRecentAccount(
      { slug: "one-euw", riot_id: "One#EUW", region: "euw1" },
      storage,
      "2026-09-17T12:00:00.000Z",
    );

    expect(readRecentAccounts(storage).map(account => account.slug))
      .toEqual(["one-euw", "two-na"]);
    expect(readRecentAccounts(storage)[0].last_visited_at)
      .toBe("2026-09-17T12:00:00.000Z");
  });

  it("borne la liste et permet de retirer un compte", () => {
    for (let index = 0; index <= MAX_RECENT_ACCOUNTS; index += 1) {
      rememberRecentAccount({
        slug: `player-${index}`,
        riot_id: `Player ${index}#EUW`,
        region: "euw1",
      }, storage);
    }

    expect(readRecentAccounts(storage)).toHaveLength(MAX_RECENT_ACCOUNTS);
    expect(removeRecentAccount("player-10", storage).map(account => account.slug))
      .not.toContain("player-10");
  });

  it("ignore un stockage corrompu ou des entrées invalides", () => {
    storage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify([
      { slug: "incomplet" },
      { slug: "ok", riot_id: "Ok#EUW", region: "euw1", last_visited_at: "now" },
    ]));
    expect(readRecentAccounts(storage).map(account => account.slug)).toEqual(["ok"]);

    storage.setItem(RECENT_ACCOUNTS_KEY, "{cassé");
    expect(readRecentAccounts(storage)).toEqual([]);
  });
});
