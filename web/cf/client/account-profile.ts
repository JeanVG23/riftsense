export interface CurrentRank {
  tier?: string;
  division?: string;
  league_points?: number;
  wins?: number;
  losses?: number;
  fetched_at?: string;
}

export interface PredictedRank {
  predicted_rank?: string;
  predicted_lp?: number | null;
  proba?: number;
  n_games_used?: number;
}

interface SummonerProfile {
  icon: number;
  level: number;
  tag: string;
}

export const LATEST_DDRAGON = "16.17.1";

const RANK_EMBLEMS: Record<string, string> = {
  iron: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/iron.svg",
  bronze: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/bronze.svg",
  silver: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/silver.svg",
  gold: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/gold.svg",
  platinum: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/platinum.svg",
  emerald: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/emerald.svg",
  diamond: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/diamond.svg",
  master: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/master.svg",
  grandmaster: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/grandmaster.svg",
  challenger: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/challenger.svg",
  unranked: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/unranked.svg",
};

const SUMMONER_PROFILES: Record<string, SummonerProfile> = {
  spadzze: { icon: 6282, level: 755, tag: "EUW" },
  two: { icon: 5373, level: 412, tag: "EUW" },
};

export function summonerProfile(slug: unknown): SummonerProfile {
  const normalized = String(slug || "").toLowerCase();
  return SUMMONER_PROFILES[normalized] || { icon: 6282, level: 755, tag: "EUW" };
}

export function summonerIcon(slugOrIcon: string | number): string {
  const icon = typeof slugOrIcon === "number" ? slugOrIcon : summonerProfile(slugOrIcon).icon;
  return `https://ddragon.leagueoflegends.com/cdn/${LATEST_DDRAGON}/img/profileicon/${icon}.png`;
}

export function summonerLevel(slug: string): number {
  return summonerProfile(slug).level;
}

export function rankEmblem(tier?: string): string {
  return tier ? RANK_EMBLEMS[tier.toLowerCase().trim()] || "" : "";
}

export function rankGlow(tier?: string): string {
  return tier ? `glow-${tier.toLowerCase().trim()}` : "";
}

export function titleCase(value: unknown): string {
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : text;
}

export function rankLabel(rank: CurrentRank | null): string {
  if (!rank?.tier) return "Non renseigné";
  return `${titleCase(rank.tier)} ${rank.division || ""} · ${rank.league_points ?? 0} LP`;
}

export function rankWinrate(rank: CurrentRank | null): string | null {
  if (!rank || rank.wins == null || rank.losses == null) return null;
  const wins = Number(rank.wins) || 0;
  const losses = Number(rank.losses) || 0;
  const games = wins + losses;
  return games ? `${wins}V ${losses}D · ${Math.round((wins / games) * 100)}% WR` : null;
}

export function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  }).format(date);
}
