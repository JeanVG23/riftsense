import { ref } from "vue";
import { RECENT_ACCOUNTS_CHANGED, rememberRecentAccount } from "./recent-accounts";

export const RIOT_PLATFORMS = [
  { value: "euw1", label: "EUW (Western Europe)", shortLabel: "EUW" },
  { value: "eun1", label: "EUNE (Northern & Eastern Europe)", shortLabel: "EUNE" },
  { value: "na1", label: "NA (North America)", shortLabel: "NA" },
  { value: "kr", label: "KR (Korea)", shortLabel: "KR" },
  { value: "br1", label: "BR (Brazil)", shortLabel: "BR" },
  { value: "jp1", label: "JP (Japan)", shortLabel: "JP" },
  { value: "tr1", label: "TR (Turkey)", shortLabel: "TR" },
  { value: "la1", label: "LAN (Latin America North)", shortLabel: "LAN" },
  { value: "la2", label: "LAS (Latin America South)", shortLabel: "LAS" },
  { value: "oc1", label: "OCE (Oceania)", shortLabel: "OCE" },
] as const;

export const REGISTER_ERRORS: Record<string, string> = {
  riot_id_not_found: "We couldn't find this Riot ID. Check the game name and tag.",
  no_ranked_games: "No recent ranked games were found for this account.",
  riot_unavailable: "The Riot API is currently unavailable. Try again in a few minutes.",
  internal: "An internal error occurred. Please try again later.",
};

export type RegistrationState = "queued" | "running" | "done" | "error";

export interface RegistrationResponse {
  slug?: string;
  detail?: string;
  state?: RegistrationState;
  error_code?: string;
  position?: number | null;
  n_games?: number | null;
}

export function navigateTo(path: string): void {
  window.dispatchEvent(new CustomEvent("coach-go", { detail: { path } }));
}

export function useAccountRegistration() {
  const riotId = ref("");
  const platform = ref("euw1");
  const submitting = ref(false);
  const error = ref<string | null>(null);

  async function submitRegistration(options?: {
    requireTag?: boolean;
    clearOnSuccess?: boolean;
    onSuccess?: (slug: string) => void;
  }): Promise<boolean> {
    const trimmed = riotId.value.trim();
    if (!trimmed || submitting.value) return false;

    if (options?.requireTag && !trimmed.includes("#")) {
      error.value = "Expected format: Summoner#TAG";
      return false;
    }

    error.value = null;
    submitting.value = true;
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ riot_id: trimmed, platform: platform.value }),
      });
      const body = (await response.json().catch(() => ({}))) as RegistrationResponse;
      if (!response.ok || !body.slug) {
        error.value = body.detail || REGISTER_ERRORS.internal;
        return false;
      }
      rememberRecentAccount({
        slug: body.slug,
        riot_id: trimmed,
        region: platform.value,
        games_count: body.n_games ?? undefined,
      });
      window.dispatchEvent(new CustomEvent(RECENT_ACCOUNTS_CHANGED));
      if (options?.clearOnSuccess) {
        riotId.value = "";
      }
      if (options?.onSuccess) {
        options.onSuccess(body.slug);
      } else {
        navigateTo(`/register/${body.slug}`);
      }
      return true;
    } catch {
      error.value = REGISTER_ERRORS.internal;
      return false;
    } finally {
      submitting.value = false;
    }
  }

  return {
    riotId,
    platform,
    submitting,
    error,
    submitRegistration,
  };
}
