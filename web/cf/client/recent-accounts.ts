export const RECENT_ACCOUNTS_KEY = "riftsense:recent-accounts:v1";
export const RECENT_ACCOUNTS_CHANGED = "riftsense:recent-accounts-changed";
export const MAX_RECENT_ACCOUNTS = 10;

export interface RecentAccount {
  slug: string;
  riot_id: string;
  region: string;
  last_visited_at: string;
  games_count?: number;
  level?: number;
  icon?: number;
}


type StorageLike = Pick<Storage, "getItem" | "setItem">;

function validAccount(value: unknown): value is RecentAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<RecentAccount>;
  return typeof account.slug === "string" && account.slug.length > 0
    && typeof account.riot_id === "string" && account.riot_id.length > 0
    && typeof account.region === "string" && account.region.length > 0
    && typeof account.last_visited_at === "string";
}

function browserStorage(): StorageLike | null {
  try { return window.localStorage; }
  catch { return null; }
}

export function readRecentAccounts(storage: StorageLike | null = browserStorage()): RecentAccount[] {
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(RECENT_ACCOUNTS_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(validAccount).slice(0, MAX_RECENT_ACCOUNTS);
  } catch {
    return [];
  }
}

export function rememberRecentAccount(
  account: Partial<RecentAccount> & Pick<RecentAccount, "slug" | "riot_id" | "region">,
  storage: StorageLike | null = browserStorage(),
  visitedAt = new Date().toISOString(),
): RecentAccount[] {
  if (!storage || !account.slug || !account.riot_id || !account.region) {
    return readRecentAccounts(storage);
  }
  const updated = [
    { ...account, last_visited_at: visitedAt },
    ...readRecentAccounts(storage).filter(item => item.slug !== account.slug),
  ].slice(0, MAX_RECENT_ACCOUNTS);
  try { storage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(updated)); }
  catch { /* Le compte reste accessible pour cette navigation. */ }
  return updated;
}

export function removeRecentAccount(
  slug: string,
  storage: StorageLike | null = browserStorage(),
): RecentAccount[] {
  const updated = readRecentAccounts(storage).filter(account => account.slug !== slug);
  try { storage?.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(updated)); }
  catch { /* Le stockage peut être bloqué par le navigateur. */ }
  return updated;
}
