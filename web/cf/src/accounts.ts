/** Registre des comptes, lu depuis KV.
 *
 * C'était une constante compilée : ajouter un joueur demandait un déploiement, ce
 * qui interdit l'inscription d'un visiteur. `accounts:index` évite un `list` KV
 * paginé à chaque affichage de la page d'accueil ; c'est un raccourci de lecture,
 * la vérité restant l'enregistrement `account:{slug}`.
 */
import { KEYS, type KVLike } from "./readers";

export interface Account {
  slug: string;
  riot_id: string;
  region: string;
  puuid?: string;
  created_at?: string;
  /** `curated` : les comptes historiques. `public` : les inscriptions du site.
   * Sans effet aujourd'hui, et c'est le point : quand les comptes publics
   * entreront dans l'entraînement, il faudra pouvoir les isoler du split, sans
   * quoi un visiteur dont les parties entraînent le modèle qui le note obtient
   * un score optimiste. */
  source: "curated" | "public";
  /** `owner` : comptes personnels du joueur/créateur. `permanent` : comptes de référence suivis. */
  group?: "owner" | "permanent";
  icon?: number;
  level?: number;
  last_ingest_ts?: string;
}

function parse(raw: string | null): Account | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Account>;
    if (typeof value.slug !== "string" || typeof value.riot_id !== "string") return null;
    return {
      slug: value.slug,
      riot_id: value.riot_id,
      region: typeof value.region === "string" ? value.region : "euw1",
      puuid: typeof value.puuid === "string" ? value.puuid : undefined,
      created_at: typeof value.created_at === "string" ? value.created_at : undefined,
      source: value.source === "public" ? "public" : "curated",
      group: value.group === "owner" ? "owner" : (value.group === "permanent" ? "permanent" : undefined),
      icon: typeof value.icon === "number" ? value.icon : undefined,
      level: typeof value.level === "number" ? value.level : undefined,
      last_ingest_ts: typeof value.last_ingest_ts === "string"
        ? value.last_ingest_ts : undefined,
    };
  } catch {
    return null;
  }
}

export async function readAccount(kv: KVLike, slug: string): Promise<Account | null> {
  return parse(await kv.get(KEYS.account(slug)));
}

export async function readIndex(kv: KVLike): Promise<string[]> {
  const raw = await kv.get(KEYS.accounts_index());
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export async function listAccounts(kv: KVLike): Promise<Account[]> {
  const slugs = await readIndex(kv);
  const accounts = await Promise.all(slugs.map((slug) => readAccount(kv, slug)));
  return accounts.filter((account): account is Account => account !== null);
}

export async function putAccount(kv: KVLike, account: Account): Promise<void> {
  await kv.put(KEYS.account(account.slug), JSON.stringify(account));
  const slugs = await readIndex(kv);
  if (!slugs.includes(account.slug)) {
    await kv.put(KEYS.accounts_index(), JSON.stringify([...slugs, account.slug]));
  }
}
