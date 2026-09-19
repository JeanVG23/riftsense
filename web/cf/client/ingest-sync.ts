import { computed, onBeforeUnmount, reactive, ref, watch, type Ref } from "vue";
import { withAuthHeaders } from "./auth";

export interface RefreshResponse {
  detail?: string;
  retry_after?: number;
  cooldown?: number;
  state?: "queued" | "running" | "done" | "error";
  position?: number;
  n_games?: number;
  error_code?: string;
}

export interface IngestSync {
  syncing: boolean;
  feedback: string | null;
  cooling: boolean;
  cooldownLabel: string;
  trigger: () => void;
}

export interface IngestSyncOpts {
  /** Invoqué une seule fois par job réussi suivi, avec le nombre de parties
   * collectées annoncé par la file. */
  onDone?: (nGames?: number) => void;
}

/** Codes de la file d'ingestion, formulés court : ils s'affichent DANS le
 * bouton, pas dans un bandeau. */
const REFRESH_ERRORS: Record<string, string> = {
  riot_id_not_found: "Riot ID introuvable",
  no_ranked_games: "Aucune partie classée",
  riot_unavailable: "API Riot indisponible",
  internal: "Erreur interne",
};
const POLL_INTERVAL_MS = 3000;
/** Au-delà, on rend la main : la collecte se poursuit côté serveur, c'est le
 * suivi qui s'arrête, pas le job. */
const POLL_TIMEOUT_MS = 3 * 60 * 1000;
/** Repli si la réponse n'annonce pas sa propre fenêtre. Le serveur reste
 * l'arbitre de la cadence : cette valeur ne fait que griser le bouton. */
const FALLBACK_COOLDOWN_S = 15 * 60;

/** État de rafraîchissement partagé par tous les boutons d'une page joueur :
 * une seule instance vit dans AccountPage (invariant spec §6.5), les boutons
 * du hero et de l'onglet SHAP la consomment en prop. Impossible de lancer
 * deux jobs concurrents : `syncing`/`cooling` sont les mêmes refs. */
export function useIngestSync(slug: Ref<string>, opts: IngestSyncOpts = {}): IngestSync {
  const syncing = ref(false);
  const syncFeedback = ref<string | null>(null);
  const cooldownUntil = ref(0);
  const now = ref(Date.now());
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let clock: ReturnType<typeof setInterval> | null = null;
  let syncSequence = 0;

  const cooling = computed(() => cooldownUntil.value > now.value);
  const cooldownLabel = computed(() => {
    const minutes = Math.ceil((cooldownUntil.value - now.value) / 60000);
    return minutes > 1 ? `À jour · ${minutes} min` : "À jour · < 1 min";
  });

  /** Mémoriser la fenêtre ici ne la fait pas respecter : c'est le serveur qui
   * refuse. Ça évite seulement de la redécouvrir par un 429 après un F5.
   * `localStorage` lève en navigation privée, son échec ne doit rien casser. */
  const cooldownKey = () => `riftsense:refresh:${slug.value}`;

  function stopClock(): void {
    if (clock !== null) clearInterval(clock);
    clock = null;
  }

  function startClock(): void {
    if (clock === null) {
      clock = setInterval(() => {
        now.value = Date.now();
        if (!cooling.value) stopClock();
      }, 1000);
    }
  }

  function setCooldown(seconds: number): void {
    now.value = Date.now();
    cooldownUntil.value = now.value + seconds * 1000;
    try { localStorage.setItem(cooldownKey(), String(cooldownUntil.value)); } catch { /* ignoré */ }
    startClock();
  }

  function restoreCooldown(): void {
    let stored = 0;
    try { stored = Number(localStorage.getItem(cooldownKey())) || 0; } catch { stored = 0; }
    now.value = Date.now();
    cooldownUntil.value = stored > now.value ? stored : 0;
    if (cooling.value) startClock(); else stopClock();
  }

  function scheduleFeedbackReset(delay = 3500): void {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { syncFeedback.value = null; }, delay);
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function getJson<T>(path: string): Promise<T | null> {
    try {
      const response = await fetch(path, { headers: withAuthHeaders() });
      if (!response.ok) return null;
      return await response.json() as T;
    } catch {
      return null;
    }
  }

  /** Suit le job jusqu'à son terme. `token` vaut le `syncSequence` du clic :
   * un changement de slug ou un démontage l'invalide et la boucle rend la main
   * sans toucher à l'état d'un autre compte. */
  async function followJob(token: number, cooldown: number): Promise<void> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      if (token !== syncSequence) return;
      const status = await getJson<RefreshResponse>(
        `/api/register/${encodeURIComponent(slug.value)}/status`);
      if (token !== syncSequence) return;
      if (status?.state === "error") {
        // Pas de fenêtre posée sur un échec : la file a déjà la sienne, plus
        // courte, pour qu'un tag mal tapé se corrige tout de suite.
        syncFeedback.value = REFRESH_ERRORS[status.error_code ?? ""] ?? REFRESH_ERRORS.internal;
        return;
      }
      if (status?.state === "done") {
        setCooldown(cooldown);
        syncFeedback.value = status.n_games
          ? `${status.n_games} parties synchronisées` : "Synchronisation terminée";
        opts.onDone?.(status.n_games);
        return;
      }
      syncFeedback.value = status?.state === "running"
        ? "Collecte en cours…"
        : `En file d'attente (${status?.position ?? 1})`;
    }
    syncFeedback.value = "Collecte toujours en cours…";
  }

  async function triggerSync(): Promise<void> {
    if (syncing.value || cooling.value) return;
    const token = ++syncSequence;
    syncing.value = true;
    syncFeedback.value = "Interrogation de Riot…";
    try {
      // Par slug, jamais par Riot ID reconstitué : les comptes curés portent un
      // slug écrit à la main que `slugFor` ne reproduit pas, et une inscription
      // bâtie depuis l'URL collecterait un compte fantôme à côté du vrai.
      const response = await fetch(`/api/c/${encodeURIComponent(slug.value)}/refresh`, {
        method: "POST",
        headers: withAuthHeaders(),
      });
      const body = await response.json().catch(() => ({})) as RefreshResponse;
      if (token !== syncSequence) return;
      if (response.status === 429) {
        setCooldown(body.retry_after ?? FALLBACK_COOLDOWN_S);
        syncFeedback.value = "Données déjà à jour";
        return;
      }
      if (!response.ok) {
        syncFeedback.value = body.detail || REFRESH_ERRORS.internal;
        return;
      }
      await followJob(token, body.cooldown ?? FALLBACK_COOLDOWN_S);
    } catch {
      syncFeedback.value = "Erreur de connexion";
    } finally {
      if (token === syncSequence) {
        syncing.value = false;
        scheduleFeedbackReset();
      }
    }
  }

  watch(slug, () => {
    // Changement de compte : le job suivi pour l'ancien slug ne doit plus
    // jamais écrire dans l'état du nouveau.
    syncSequence += 1;
    syncing.value = false;
    syncFeedback.value = null;
    restoreCooldown();
  });
  onBeforeUnmount(() => {
    syncSequence += 1;
    stopClock();
    if (feedbackTimer) clearTimeout(feedbackTimer);
  });
  restoreCooldown();

  // reactive() débauche les refs et computeds : le consommateur lit
  // `sync.syncing` (booléen), pas `sync.syncing.value`.
  return reactive({
    syncing,
    feedback: syncFeedback,
    cooling,
    cooldownLabel,
    trigger: () => { void triggerSync(); },
  });
}
