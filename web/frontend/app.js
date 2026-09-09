// coaching_lol — frontend SPA (Alpine). Aucune clé/secret ici : tout passe par /api/*.

const NEG_TAGS = ["asymetrie", "stat-inventee", "profondeur-en-faute",
  "trop-vague", "non-actionnable", "autre"];
// Étapes purement informatives du flux SSE (les 2 autres events changent le statut).
const SSE_PROGRESS = { payload: "payload construit", llm: "génération LLM…" };
const CHAMP_SLUGS = {
  "Kai'Sa": "Kaisa", "Kha'Zix": "Khazix", "Cho'Gath": "Chogath",
  "Vel'Koz": "Velkoz", "Wukong": "MonkeyKing", "LeBlanc": "Leblanc",
  "Nunu & Willump": "Nunu", "Renata Glasc": "Renata", "Bel'Veth": "Belveth",
  "K'Sante": "KSante",
};

const LATEST_DDRAGON = "16.17.1";

const CHAMP_CD_IDS = {"Annie": 1, "Olaf": 2, "Galio": 3, "Twisted Fate": 4, "Xin Zhao": 5, "Urgot": 6, "LeBlanc": 7, "Vladimir": 8, "Fiddlesticks": 9, "Kayle": 10, "Master Yi": 11, "Alistar": 12, "Ryze": 13, "Sion": 14, "Sivir": 15, "Soraka": 16, "Teemo": 17, "Tristana": 18, "Warwick": 19, "Nunu & Willump": 20, "Miss Fortune": 21, "Ashe": 22, "Tryndamere": 23, "Jax": 24, "Morgana": 25, "Zilean": 26, "Singed": 27, "Evelynn": 28, "Twitch": 29, "Karthus": 30, "Cho'Gath": 31, "Amumu": 32, "Rammus": 33, "Anivia": 34, "Shaco": 35, "Dr. Mundo": 36, "Sona": 37, "Kassadin": 38, "Irelia": 39, "Janna": 40, "Gangplank": 41, "Corki": 42, "Karma": 43, "Taric": 44, "Veigar": 45, "Trundle": 48, "Swain": 50, "Caitlyn": 51, "Blitzcrank": 53, "Malphite": 54, "Katarina": 55, "Nocturne": 56, "Maokai": 57, "Renekton": 58, "Jarvan IV": 59, "Elise": 60, "Orianna": 61, "Wukong": 62, "Brand": 63, "Lee Sin": 64, "Vayne": 67, "Rumble": 68, "Cassiopeia": 69, "Skarner": 72, "Heimerdinger": 74, "Nasus": 75, "Nidalee": 76, "Udyr": 77, "Poppy": 78, "Gragas": 79, "Pantheon": 80, "Ezreal": 81, "Mordekaiser": 82, "Yorick": 83, "Akali": 84, "Kennen": 85, "Garen": 86, "Leona": 89, "Malzahar": 90, "Talon": 91, "Riven": 92, "Kog'Maw": 96, "Shen": 98, "Lux": 99, "Xerath": 101, "Shyvana": 102, "Ahri": 103, "Graves": 104, "Fizz": 105, "Volibear": 106, "Rengar": 107, "Varus": 110, "Nautilus": 111, "Viktor": 112, "Sejuani": 113, "Fiora": 114, "Ziggs": 115, "Lulu": 117, "Draven": 119, "Hecarim": 120, "Kha'Zix": 121, "Darius": 122, "Jayce": 126, "Lissandra": 127, "Diana": 131, "Quinn": 133, "Syndra": 134, "Aurelion Sol": 136, "Kayn": 141, "Zoe": 142, "Zyra": 143, "Kai'Sa": 145, "Seraphine": 147, "Gnar": 150, "Zac": 154, "Yasuo": 157, "Vel'Koz": 161, "Taliyah": 163, "Camille": 164, "Akshan": 166, "Bel'Veth": 200, "Braum": 201, "Jhin": 202, "Kindred": 203, "Zeri": 221, "Jinx": 222, "Tahm Kench": 223, "Briar": 233, "Viego": 234, "Senna": 235, "Lucian": 236, "Zed": 238, "Kled": 240, "Ekko": 245, "Qiyana": 246, "Vi": 254, "Aatrox": 266, "Nami": 267, "Azir": 268, "Yuumi": 350, "Samira": 360, "Thresh": 412, "Illaoi": 420, "Rek'Sai": 421, "Ivern": 427, "Kalista": 429, "Bard": 432, "Rakan": 497, "Xayah": 498, "Ornn": 516, "Sylas": 517, "Neeko": 518, "Aphelios": 523, "Rell": 526, "Pyke": 555, "Vex": 711, "Yone": 777, "Ambessa": 799, "Mel": 800, "Yunara": 804, "Locke": 805, "Sett": 875, "Lillia": 876, "Gwen": 887, "Renata Glasc": 888, "Aurora": 893, "Nilah": 895, "K'Sante": 897, "Smolder": 901, "Milio": 902, "Zaahen": 904, "Hwei": 910, "Naafiri": 950, "TwistedFate": 4, "XinZhao": 5, "Leblanc": 7, "FiddleSticks": 9, "MasterYi": 11, "Nunu": 20, "MissFortune": 21, "Chogath": 31, "DrMundo": 36, "JarvanIV": 59, "MonkeyKing": 62, "LeeSin": 64, "KogMaw": 96, "Khazix": 121, "AurelionSol": 136, "Kaisa": 145, "Velkoz": 161, "Belveth": 200, "TahmKench": 223, "RekSai": 421, "Renata": 888, "KSante": 897};

const cdIconUrl = (id) => `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;

const CHAMP_CUSTOM_ICONS = {
  "Locke": cdIconUrl(805),
  "Yunara": cdIconUrl(804),
  "Mel": cdIconUrl(800),
  "Ambessa": cdIconUrl(799),
  "Zaahen": cdIconUrl(904),
};

const DDRAGON = (patch, champ) => {
  if (!champ) return "";
  if (CHAMP_CUSTOM_ICONS[champ]) return CHAMP_CUSTOM_ICONS[champ];
  const key = CHAMP_SLUGS[champ] || String(champ).replace(/['\s.]/g, "");
  let version = LATEST_DDRAGON;
  if (patch) {
    const p = String(patch);
    version = p.includes(".") && p.split(".").length === 2 ? `${p}.1` : (p || LATEST_DDRAGON);
  }
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`;
};

const RANK_EMBLEMS = {
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

const POSITION_ICONS = {
  top: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top-blue.png",
  jungle: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle-blue.png",
  middle: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle-blue.png",
  mid: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle-blue.png",
  bottom: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom-blue.png",
  bot: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom-blue.png",
  adc: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom-blue.png",
  utility: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility-blue.png",
  support: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility-blue.png",
};

const SUMMONER_PROFILES = {
  spadzze: { icon: 6282, level: 755, tag: "EUW" },
  two: { icon: 5373, level: 412, tag: "EUW" },
};

function summonerProfile(slug) {
  const s = String(slug || "").toLowerCase();
  return SUMMONER_PROFILES[s] || { icon: 6282, level: 755, tag: "EUW" };
}

function summonerIcon(slugOrIcon) {
  if (typeof slugOrIcon === "number") {
    return `https://ddragon.leagueoflegends.com/cdn/${LATEST_DDRAGON}/img/profileicon/${slugOrIcon}.png`;
  }
  const prof = summonerProfile(slugOrIcon);
  return `https://ddragon.leagueoflegends.com/cdn/${LATEST_DDRAGON}/img/profileicon/${prof.icon}.png`;
}

function summonerLevel(slug) {
  return summonerProfile(slug).level;
}

function rankEmblem(tier) {
  if (!tier) return "";
  const key = String(tier).toLowerCase().trim();
  return RANK_EMBLEMS[key] || "";
}

function rankGlow(tier) {
  if (!tier) return "";
  const key = String(tier).toLowerCase().trim();
  return `glow-${key}`;
}

function roleIcon(role) {
  if (!role) return "";
  const key = String(role).toLowerCase().trim();
  return POSITION_ICONS[key] || "";
}

// Un seul casing de tier : `rank.tier` arrive en MAJUSCULES de l'API Riot et
// `predicted_rank` en minuscules du modèle ML — deux implémentations coexistaient.
function titleCase(value) {
  const s = String(value || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

const AUTH_TOKEN_KEY = "coach_auth_token";
let authToken = null;
try {
  authToken = localStorage.getItem(AUTH_TOKEN_KEY);
} catch (e) {}

function setStoredAuthToken(token) {
  authToken = token || null;
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (e) {}
}

function openCoachAuth(action = null) {
  window.dispatchEvent(new CustomEvent("coach-open-auth", { detail: { action } }));
}

async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  const r = await fetch(path, { ...opts, headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}`);
  return r.json();
}

function fmtKDA(k, d, a) {
  const count = (value) => Array.isArray(value) ? value.length : Number(value || 0);
  const kills = count(k), deaths = count(d), assists = count(a);
  const ka = kills + assists;
  const ratio = deaths === 0 ? "Perfect" : (ka / deaths).toFixed(2);
  return `${kills}/${deaths}/${assists} · ${ratio}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  }).format(date);
}

// La canonique et og:url sont statiques dans le HTML (la SPA n'a pas de rendu
// serveur) : sans cette resynchronisation, /c/<slug> se déclarerait duplicata de la
// page d'accueil. Les paramètres de requête (?tab=, ?review=) ne sont que de l'état
// d'affichage, la canonique s'arrête donc au chemin.
function syncCanonical() {
  const href = location.origin + location.pathname;
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", href);
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute("content", href);
}

function routeOf(path) {
  if (path === "/" || path === "") return { name: "home" };
  const m = path.match(/^\/c\/([^/]+)$/);
  if (m) return { name: "account", slug: decodeURIComponent(m[1]) };
  const r = path.match(/^\/register\/([^/]+)$/);
  if (r) return { name: "register", slug: decodeURIComponent(r[1]) };
  if (path === "/readme") return { name: "readme" };
  return { name: "home" };
}

// Lien profond : /c/<slug>?tab=coaching&view=games&review=<match_id>.
// Un lien externe (page CV, partage) doit tomber sur une analyse de partie précise,
// pas sur la page d'accueil du compte qui n'explique rien. `review` implique l'onglet
// coaching et la vue par-partie : un seul paramètre suffit côté appelant.
// Le bloc « Mettre à jour mes données » demande de lancer une commande dans un
// terminal : il n'a de sens que pour le propriétaire du compte, alors que la page est
// publique et sert de démonstration. `?admin=1` l'active et le mémorise, `?admin=0` le
// coupe ; le stockage peut être indisponible (navigation privée), d'où le try/catch.
const OWNER_FLAG = "coachlol:owner";

function ownerViewFrom(search) {
  const asked = new URLSearchParams(search || "").get("admin");
  try {
    if (asked === "1") { localStorage.setItem(OWNER_FLAG, "1"); return true; }
    if (asked === "0") { localStorage.removeItem(OWNER_FLAG); return false; }
    return localStorage.getItem(OWNER_FLAG) === "1";
  } catch (e) {
    return asked === "1";
  }
}

const ACCOUNT_TABS = ["history", "coaching", "shap"];
const COACHING_VIEWS = ["overall", "games"];

function deepLinkOf(search) {
  const q = new URLSearchParams(search || "");
  const review = q.get("review") || null;
  let tab = q.get("tab");
  let view = q.get("view");
  if (review) { tab = "coaching"; view = "games"; }
  if (!ACCOUNT_TABS.includes(tab)) tab = null;
  if (!COACHING_VIEWS.includes(view)) view = null;
  return { tab, view, review };
}

// Une analyse d'une partie ne permet pas d'inférer des habitudes : son format est
// volontairement différent et elle ne doit pas remplacer le coaching global dans cet
// onglet. La séparation est portée par l'API (`?kind=aggregate` vs `?kind=game`,
// cf. loadReviews) et non plus par des type-guards qui redevinaient le type depuis
// la forme du payload alors que chaque record porte déjà son `kind`.

function coachErrorMessage(error) {
  const raw = typeof error === "string" ? error : String(error?.message || error || "");
  if (/\b401\b/.test(raw) || /authentification/i.test(raw) || /non autoris/i.test(raw)) {
    return "Connexion requise : mot de passe coach nécessaire pour les générations IA.";
  }
  if (/\b429\b/.test(raw)) {
    return "Le modèle est temporairement limité. Attends quelques minutes avant de relancer le coaching.";
  }
  if (/OLLAMA_API_KEY/.test(raw)) return "Le service de coaching n’est pas configuré correctement.";
  return raw || "Le coaching n’a pas pu être généré. Réessaie dans un instant.";
}

function app() {
  return {
    path: location.pathname,
    accounts: [],
    accountsLoading: true,
    get route() { return routeOf(this.path); },

    // Authentification Coach (protection des fonctionnalités LLM)
    isAuthenticated: Boolean(authToken),
    authConfigured: true,
    authModalOpen: false,
    authPassword: "",
    authError: null,
    authLoading: false,
    postAuthAction: null,

    async checkAuthStatus() {
      try {
        const res = await api("/api/auth/status");
        this.authConfigured = res.configured !== false;
        this.isAuthenticated = Boolean(res.authenticated);
        if (!res.authenticated && authToken) {
          setStoredAuthToken(null);
          this.isAuthenticated = false;
        }
      } catch (e) {}
    },

    openAuthModal(action = null) {
      this.postAuthAction = typeof action === "function" ? action : null;
      this.authPassword = "";
      this.authError = null;
      this.authModalOpen = true;
      setTimeout(() => {
        const el = document.getElementById("coach-auth-password-input");
        if (el) el.focus();
      }, 50);
    },

    closeAuthModal() {
      this.authModalOpen = false;
      this.authPassword = "";
      this.authError = null;
      this.postAuthAction = null;
    },

    async login() {
      const pwd = this.authPassword.trim();
      if (!pwd) {
        this.authError = "Veuillez saisir le mot de passe coach.";
        return;
      }
      this.authLoading = true;
      this.authError = null;
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: pwd }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.detail || "Mot de passe incorrect.");
        }
        setStoredAuthToken(data.token);
        this.isAuthenticated = true;
        const pendingAction = this.postAuthAction;
        this.closeAuthModal();
        if (pendingAction) {
          setTimeout(() => { pendingAction(); }, 100);
        }
      } catch (e) {
        this.authError = e.message || "Erreur de connexion.";
      } finally {
        this.authLoading = false;
      }
    },

    async logout() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch (e) {}
      setStoredAuthToken(null);
      this.isAuthenticated = false;
    },

    init() {
      syncCanonical();
      window.addEventListener("popstate", () => {
        this.path = location.pathname;
        syncCanonical();
      });
      window.addEventListener("coach-open-auth", (e) => {
        this.openAuthModal(e.detail?.action);
      });
      window.addEventListener("coach-auth-change", (e) => {
        this.isAuthenticated = Boolean(e.detail?.authenticated);
      });
      window.addEventListener("coach-go", (e) => {
        if (e.detail?.path) this.go(e.detail.path);
      });
      api("/api/accounts").then(a => { this.accounts = a; this.accountsLoading = false; })
        .catch(() => { this.accountsLoading = false; });
      this.checkAuthStatus();
    },

    go(p) {
      if (p === this.path) return;
      history.pushState({}, "", p);
      this.path = p;
      syncCanonical();
    },

    switcherOpen: false,
    toggleSwitcher() { this.switcherOpen = !this.switcherOpen; },
    closeSwitcher() { this.switcherOpen = false; },
    formatDate,
    summonerIcon,
    summonerLevel,
    rankEmblem,
    rankGlow,
    roleIcon,
  };
}

// Libellés des codes d'erreur typés du service d'ingestion. Le service publie un
// code stable, jamais une phrase : la traduction est ici, une seule fois.
const REGISTER_ERRORS = {
  riot_id_not_found: "Ce Riot ID est introuvable. Vérifie le pseudo et le tag.",
  no_ranked_games: "Aucune partie classée récente trouvée sur ce compte.",
  riot_unavailable: "L'API Riot ne répond pas pour le moment. Réessaie dans quelques minutes.",
  internal: "Une erreur interne est survenue. Réessaie plus tard.",
};

// Bornage des tentatives sur un échec réseau isolé (fetch qui rejette). Un échec
// isolé peut être réessayé, mais la boucle doit finir par s'arrêter : sans cette
// borne, une coupure réseau prolongée ferait sonder /api/register/.../status
// indéfiniment, onglet ouvert, sans jamais rien afficher à la place.
const REGISTER_MAX_NETWORK_RETRIES = 5;

function registerPage() {
  return {
    riotId: "",
    platform: "euw1",
    state: null,
    position: null,
    nGames: null,
    error: null,
    submitting: false,
    slug: null,
    _timer: null,
    _networkFailures: 0,
    _stopped: false,

    init() {
      // Route dédiée `/register/{slug}` : la page d'attente est ouverte directement
      // (rafraîchissement pendant l'attente, lien partagé), sans passer par le
      // formulaire. On réutilise `routeOf()` plutôt que de dupliquer son regex ici.
      const r = routeOf(location.pathname);
      if (r.name === "register" && r.slug) {
        this.slug = r.slug;
        this.state = "queued";
        this.refresh();
      }
      // Alpine ne rappelle aucune méthode "destroy" au démontage d'un x-data : le
      // seul hook réel est `Alpine.onElRemoved`, déclenché quand ce noeud quitte le
      // DOM (retour à l'accueil, navigation vers un autre compte, bouton précédent
      // du navigateur pendant l'attente). Sans lui, `poll()` continuerait de sonder
      // le statut d'un compte que plus personne n'affiche.
      if (window.Alpine && this.$el) {
        window.Alpine.onElRemoved(this.$el, () => this.stopPolling());
      }
    },

    async submit() {
      this.error = null;
      this.submitting = true;
      try {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ riot_id: this.riotId, platform: this.platform }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          this.error = body.detail || REGISTER_ERRORS.internal;
          return;
        }
        this.slug = body.slug;
        // La page d'attente dédiée reprend le sondage pour ce slug depuis `init()` :
        // inutile de dupliquer cette logique ici.
        window.dispatchEvent(new CustomEvent("coach-go", { detail: { path: `/register/${this.slug}` } }));
      } catch (e) {
        this.error = REGISTER_ERRORS.internal;
      } finally {
        this.submitting = false;
      }
    },

    poll() {
      if (this._stopped) return;
      this.stopPolling({ keepStopped: false });
      // 3 secondes : une inscription dure de dix secondes à une minute selon le
      // palier de la clé Riot. Inutile d'interroger plus vite.
      this._timer = setTimeout(() => this.refresh(), 3000);
    },

    // `keepStopped` distingue l'arrêt définitif (élément retiré du DOM) d'un simple
    // réarmement du minuteur avant une nouvelle attente : sans cette distinction, un
    // `refresh()` déjà en vol au moment du démontage relancerait `poll()` juste après
    // que la navigation a coupé le sondage.
    stopPolling({ keepStopped = true } = {}) {
      clearTimeout(this._timer);
      this._timer = null;
      if (keepStopped) this._stopped = true;
    },

    async refresh() {
      if (!this.slug || this._stopped) return;
      let response;
      try {
        response = await fetch(`/api/register/${encodeURIComponent(this.slug)}/status`);
      } catch (e) {
        // Échec réseau isolé (coupure, DNS) : on retente un nombre borné de fois,
        // jamais indéfiniment.
        this._networkFailures += 1;
        if (this._networkFailures >= REGISTER_MAX_NETWORK_RETRIES) {
          this.state = "error";
          this.error = REGISTER_ERRORS.internal;
          return;
        }
        this.poll();
        return;
      }
      this._networkFailures = 0;
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        // 404 (inscription inconnue) ou 503 (service indisponible) : le corps ne
        // porte pas de champ `state` reconnu. Sans ce cas, `this.state` resterait
        // `null` et le panneau ne montrerait plus rien, tout en continuant de sonder.
        this.state = "error";
        this.error = body.detail || REGISTER_ERRORS.internal;
        return;
      }
      if (body.state === "error") {
        this.state = "error";
        this.error = REGISTER_ERRORS[body.error_code] || REGISTER_ERRORS.internal;
        return;
      }
      if (body.state === "done") {
        this.state = "done";
        this.goToProfile();
        return;
      }
      if (body.state !== "queued" && body.state !== "running") {
        // État non reconnu (schéma évolué côté service, réponse inattendue) :
        // état terminal explicite plutôt qu'un sondage muet et sans fin.
        this.state = "error";
        this.error = REGISTER_ERRORS.internal;
        return;
      }
      this.state = body.state;
      this.position = body.position ?? null;
      this.nGames = body.n_games ?? null;
      this.poll();
    },

    goToProfile() {
      window.dispatchEvent(new CustomEvent("coach-go", { detail: { path: `/c/${this.slug}` } }));
    },

    // Sortie de secours depuis la page d'attente en échec. Le sondage est arrêté
    // explicitement : `Alpine.onElRemoved` s'en chargerait aussi, mais dépendre du
    // démontage laisserait une requête en vol pendant la navigation.
    backToForm() {
      this.stopPolling();
      window.dispatchEvent(new CustomEvent("coach-go", { detail: { path: "/" } }));
    },
  };
}

// Placeholder components — remplis par les tâches suivantes.
function homePage() {
  return {
    init() {
      // Les comptes sont chargés par le store app() parent (GET /api/accounts).
      // Pas de fetch ici — on consomme `accounts` via le scope hérité dans le HTML.
    },
  };
}
function accountPage(slug, search) {
  const deep = deepLinkOf(search === undefined ? location.search : search);
  return {
    slug,
    get isAuthenticated() { return Boolean(authToken); },
    openAuthModal(action = null) { openCoachAuth(action); },
    ownerView: ownerViewFrom(search === undefined ? location.search : search),
    tab: deep.tab || "history",
    pendingReviewId: deep.review,
    expandedGameId: null,
    games: [], page: 1, size: 20, total: 0,
    gamesLoading: true, gamesError: null,
    job: null, // {type, status, progress, error}
    rank: null, rankLoading: true,
    predictedRank: null, predictedRankLoading: true,
    // coaching
    scope: "adc", outcome: "loss", target: "challenger",
    reviews: [], review: null, aggregateReviewsTotal: 0,
    gameReviews: [], selectedGameReview: null, gameReviewsPage: 1, gameReviewsLoading: false,
    gameReviewLoading: false, gameReviewError: null,
    coachingContext: null, coachingContextLoading: true, scopeTouched: false,
    gameFilterResult: "all", // "all" | "win" | "loss"
    gameFilterChampion: "all",
    chatMessages: [], chatDraft: "", chatBusy: false, chatError: null,
    coachingView: deep.view || "overall", gameReviewsCount: 0, reviewsLoading: true,
    reviewsInFlight: false,
    evalReport: null, evalLoading: false,
    fbMap: {}, fbBusy: {}, noteDraft: {}, feedbackError: null,
    coachOpen: false, noteOpen: {},
    // shap (F5)
    shap: null, shapLoading: false, shapSort: "abs", chart: null,

    init() {
      this.loadGames(); this.loadRank(); this.loadPredictedRank();
      this.loadCoachingContext();
      this.loadReviews();
      // setTab porte déjà le chargement paresseux de chaque onglet : on le rejoue
      // pour l'onglet ouvert par le lien profond plutôt que de dupliquer la logique.
      if (this.tab !== "history") this.setTab(this.tab);
    },

    // Charge une URL dans un champ, avec drapeau de chargement et valeur de repli :
    // loadRank / loadPredictedRank / loadShap avaient le même corps recopié.
    async loadInto(field, flag, url, fallback = null, after = null) {
      this[flag] = true;
      try {
        this[field] = await api(url);
        if (after) after();
      } catch (e) { this[field] = fallback; }
      finally { this[flag] = false; }
    },

    async loadGames() {
      this.gamesLoading = true; this.gamesError = null;
      try {
        const d = await api(`/api/c/${this.slug}/games?page=${this.page}&size=${this.size}`);
        this.games = d.items; this.total = d.total;
      } catch (e) { this.gamesError = "Impossible de charger les parties. Réessaie dans un instant."; }
      finally { this.gamesLoading = false; }
    },

    async loadCoachingContext() {
      this.coachingContextLoading = true;
      try {
        this.coachingContext = await api(`/api/c/${this.slug}/coaching-context`);
        if (!this.scopeTouched && this.coachingContext?.default_scope) {
          this.scope = this.coachingContext.default_scope;
          await this.syncGlobalReview();
        }
      } catch (e) {
        this.coachingContext = null;
      } finally {
        this.coachingContextLoading = false;
      }
    },

    loadRank() {
      return this.loadInto("rank", "rankLoading", `/api/c/${this.slug}/rank`);
    },

    rankTier() {
      return this.rank?.tier ? titleCase(this.rank.tier) : "";
    },
    rankDivision() {
      return this.rank?.division || "";
    },
    rankLp() {
      return this.rank?.league_points != null ? `${this.rank.league_points} LP` : "";
    },
    rankWinrate() {
      if (!this.rank || this.rank.wins == null || this.rank.losses == null) return null;
      const w = Number(this.rank.wins) || 0;
      const l = Number(this.rank.losses) || 0;
      const total = w + l;
      if (total === 0) return null;
      const pct = Math.round((w / total) * 100);
      return `${w}V ${l}D · ${pct}% WR`;
    },

    rankLabel() {
      if (!this.rank || !this.rank.tier) return "Non renseigné";
      return `${titleCase(this.rank.tier)} ${this.rank.division} · ${this.rank.league_points} LP`;
    },

    loadPredictedRank() {
      return this.loadInto("predictedRank", "predictedRankLoading",
                           `/api/c/${this.slug}/predicted-rank`);
    },

    rankTierLabel: titleCase,
    summoner() { return summonerProfile(this.slug); },

    async prevPage() { if (this.page > 1) { this.page--; this.loadGames(); } },
    async nextPage() {
      if (this.page * this.size < this.total) { this.page++; this.loadGames(); }
    },

    setTab(t) {
      this.tab = t;
      if (t === "coaching" && this.reviews.length === 0 && this.reviewsLoading) {
        this.loadReviews();
      }
      if (t === "coaching" && this.evalReport === null) { this.loadEval(); }
      if (t === "shap" && this.shap === null) { this.loadShap(); }
    },

    async setCoachingView(view) {
      this.coachingView = view;
      await this.loadFeedback(this.activeFeedbackReview());
    },

    // Taux d'utilite du coaching : la boucle d'evaluation du projet, affichee
    // meme quand elle est mauvaise. Un conseil LLM non evalue n'est qu'une opinion.
    loadEval() {
      return this.loadInto("evalReport", "evalLoading", `/api/c/${this.slug}/eval`);
    },

    pct(v) { return v === null || v === undefined ? "—" : `${Math.round(v * 100)} %`; },

    loadShap() {
      return this.loadInto("shap", "shapLoading", `/api/c/${this.slug}/shap`,
                           { available: false, drivers: [] },
                           () => {
                             if (this.shap.available) this.$nextTick(() => this.renderChart());
                           });
    },

    sortedDrivers() {
      const d = (this.shap?.drivers || []).slice();
      if (this.shapSort === "abs") d.sort((a, b) => Math.abs(b.mean_shap) - Math.abs(a.mean_shap));
      else d.sort((a, b) => b.mean_shap - a.mean_shap);
      return d.slice(0, 16); // top 16 pour la lisibilité
    },

    renderChart() {
      this.destroyChart();
      const cv = this.$root.querySelector("#shap-canvas");
      if (!cv || !window.Chart) return;
      const d = this.sortedDrivers();
      this.chart = new Chart(cv, {
        type: "bar",
        data: {
          labels: d.map(x => x.feature),
          datasets: [{
            data: d.map(x => x.mean_shap),
            backgroundColor: d.map(x => x.mean_shap >= 0 ? "#c8aa6e" : "#f85149"),
            borderRadius: 3, borderSkipped: false,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            label: c => `SHAP ${c.raw.toFixed(4)}`,
          } } },
          scales: {
            x: { grid: { color: "#2a2d34" }, ticks: { color: "#9a9da4", font: { size: 11 } } },
            y: { grid: { display: false }, ticks: { color: "#e8e9ec", font: { size: 11 } } },
          },
        },
      });
    },

    toggleSort() {
      this.shapSort = this.shapSort === "abs" ? "val" : "abs";
      this.renderChart();
    },

    destroyChart() {
      if (this.chart) { this.chart.destroy(); this.chart = null; }
    },

    async loadReviews() {
      // Alpine initialise le composant deux fois (x-data dans un template x-if
      // re-rendu) : sans ce garde, le second appel concurrent rejouait la selection
      // par defaut et ecrasait la review ciblee par le lien profond.
      if (this.reviewsInFlight) return;
      this.reviewsInFlight = true;
      this.reviewsLoading = true;
      try {
        const [aggregatePage, gamePage] = await Promise.all([
          api(`/api/c/${this.slug}/reviews?kind=aggregate&page=1&size=20`),
          api(`/api/c/${this.slug}/reviews?kind=game&page=1&size=20`),
        ]);
        this.reviews = aggregatePage.items || [];
        this.aggregateReviewsTotal = aggregatePage.total || 0;
        this.review = this.findMatchingReview(this.scope, this.outcome);
        this.gameReviews = gamePage.items || [];
        this.gameReviewsPage = gamePage.page || 1;
        this.gameReviewsCount = gamePage.total || 0;
        const target = await this.resolvePendingReview();
        const selected = target || (this.filteredGameReviews().length ? this.filteredGameReviews()[0] : this.gameReviews[0]);
        if (selected) await this.selectGameReview(selected, false);
        const active = this.activeFeedbackReview();
        if (active) await this.loadFeedback(active);
      } catch (e) { /* keep reviews empty */ }
      finally { this.reviewsLoading = false; this.reviewsInFlight = false; }
    },

    findMatchingReview(scope = this.scope, outcome = this.outcome) {
      if (!this.reviews || this.reviews.length === 0) return null;
      const s = (scope || "").toLowerCase();
      const exact = this.reviews.find(r =>
        (r.scope || r.payload?.meta?.scope || "").toLowerCase() === s &&
        (outcome === "overall" || r.outcome_focus === outcome)
      );
      return exact || null;
    },

    async setScope(s) {
      this.scopeTouched = true;
      this.scope = s;
      await this.syncGlobalReview();
    },

    async setOutcome(o) {
      this.outcome = o;
      await this.syncGlobalReview();
    },

    async syncGlobalReview() {
      this.review = this.findMatchingReview(this.scope, this.outcome);
      const active = this.activeFeedbackReview();
      if (active) await this.loadFeedback(active);
    },

    get dynamicScopes() {
      if (this.coachingContext?.scopes?.length) return this.coachingContext.scopes;
      const list = [
        { id: "all", label: "Toutes", rawLabel: "Toutes" },
        { id: "adc", label: "ADC", rawLabel: "ADC" },
      ];
      const counts = {};
      for (const g of (this.games || [])) {
        const c = typeof g === "object" ? g.champion : g;
        if (c) counts[c] = (counts[c] || 0) + 1;
      }
      for (const r of (this.gameReviews || [])) {
        const c = this.gameChampion(r);
        if (c && c !== "Partie analysée") counts[c] = (counts[c] || 0) + 1;
      }
      const sortedChamps = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      sortedChamps.slice(0, 3).forEach((champ, idx) => {
        const id = champ.toLowerCase();
        if (!list.some(item => item.id === id)) {
          const isTop = idx === 0 && counts[champ] >= 2;
          const prefix = isTop ? "⭐ " : "";
          list.push({ id, label: `${prefix}${champ} (${counts[champ]})`, rawLabel: champ, isTop });
        }
      });
      if (this.scope && !list.some(s => s.id === this.scope.toLowerCase())) {
        list.push({ id: this.scope.toLowerCase(), label: titleCase(this.scope), rawLabel: titleCase(this.scope) });
      }
      return list;
    },

    outcomeLabel(o) {
      return o === "loss" ? "Défaites" : o === "win" ? "Victoires" : "Global";
    },

    scopeLabel(s) {
      const found = this.dynamicScopes.find(sc => sc.id === (s || "").toLowerCase());
      return found ? (found.rawLabel || found.label) : titleCase(s || "Parties");
    },

    pedagogicTarget(g) {
      const id = typeof g === "string" ? g : g?.match_id;
      const target = id ? this.coachingContext?.matches?.[id]?.pedagogic : null;
      return target ? { ...target, badge: target.label } : null;
    },

    filteredGameReviews() {
      return (this.gameReviews || []).filter(item => {
        const win = this.gameMeta(item).win;
        if (this.gameFilterResult === "win" && win !== true) return false;
        if (this.gameFilterResult === "loss" && win !== false) return false;
        if (this.gameFilterChampion !== "all") {
          const champ = (this.gameChampion(item) || "").toLowerCase();
          if (champ !== this.gameFilterChampion.toLowerCase()) return false;
        }
        return true;
      });
    },

    get gameReviewsCountWin() {
      return (this.gameReviews || []).filter(r => this.gameMeta(r).win === true).length;
    },

    get gameReviewsCountLoss() {
      return (this.gameReviews || []).filter(r => this.gameMeta(r).win === false).length;
    },

    get gameReviewChampions() {
      const champs = new Set();
      for (const r of (this.gameReviews || [])) {
        const c = this.gameChampion(r);
        if (c && c !== "Partie analysée") champs.add(c);
      }
      return Array.from(champs).sort();
    },

    setGameFilterResult(res) {
      this.gameFilterResult = res;
      this.ensureSelectedGameVisible();
    },

    setGameFilterChampion(champ) {
      this.gameFilterChampion = champ;
      this.ensureSelectedGameVisible();
    },

    ensureSelectedGameVisible() {
      const filtered = this.filteredGameReviews();
      if (filtered.length === 0) return;
      const currentTs = this.selectedGameReview?.ts;
      const exists = filtered.some(r => r.ts === currentTs);
      if (!exists) {
        this.selectGameReview(filtered[0]);
      }
    },

    insightTitle(text) {
      if (!text) return "";
      const raw = String(text).trim();
      const cleaned = raw.replace(/^Erreur\s*\d+\s*:\s*/i, "").replace(/^Force\s*\d+\s*:\s*/i, "");
      const sepIdx = cleaned.search(/[:—–-]/);
      if (sepIdx > 5 && sepIdx < 80) {
        return cleaned.slice(0, sepIdx).trim();
      }
      const dotIdx = cleaned.indexOf(". ");
      if (dotIdx > 5 && dotIdx < 85) {
        return cleaned.slice(0, dotIdx).trim();
      }
      if (cleaned.length > 80) {
        const spaceIdx = cleaned.lastIndexOf(" ", 75);
        return (spaceIdx > 25 ? cleaned.slice(0, spaceIdx) : cleaned.slice(0, 70)) + "…";
      }
      return cleaned;
    },

    insightBody(text) {
      if (!text) return "";
      const raw = String(text).trim();
      const cleaned = raw.replace(/^Erreur\s*\d+\s*:\s*/i, "").replace(/^Force\s*\d+\s*:\s*/i, "");
      const sepIdx = cleaned.search(/[:—–-]/);
      if (sepIdx > 5 && sepIdx < 80) {
        return cleaned.slice(sepIdx + 1).trim();
      }
      const dotIdx = cleaned.indexOf(". ");
      if (dotIdx > 5 && dotIdx < 85) {
        return cleaned.slice(dotIdx + 2).trim();
      }
      return "";
    },

    toggleNote(kind, index) {
      const key = this.fbKey(kind, index);
      this.coachOpen = false;
      this.noteOpen[key] = !this.noteOpen[key];
    },

    // Le lien profond porte un `match_id`, alors que l'API identifie une review par son
    // `ts` : on pagine la liste jusqu'à le trouver. Introuvable (review supprimée, lien
    // périmé) : repli silencieux sur la plus récente, un lien mort ne doit pas casser
    // la page pour un visiteur venu du CV.
    async resolvePendingReview() {
      const wanted = this.pendingReviewId;
      if (!wanted) return null;
      for (;;) {
        const hit = this.gameReviews.find(r => this.gameMatchId(r) === wanted);
        if (hit) return hit;
        const before = this.gameReviews.length;
        if (before >= this.gameReviewsCount) return null;
        await this.loadMoreGameReviews();
        if (this.gameReviews.length === before) return null;
      }
    },

    async loadMoreGameReviews() {
      if (this.gameReviewsLoading || this.gameReviews.length >= this.gameReviewsCount) return;
      this.gameReviewsLoading = true;
      try {
        const next = await api(`/api/c/${this.slug}/reviews?kind=game&page=${this.gameReviewsPage + 1}&size=20`);
        this.gameReviews = [...this.gameReviews, ...(next.items || [])];
        this.gameReviewsPage = next.page || this.gameReviewsPage;
      } finally { this.gameReviewsLoading = false; }
    },

    async genCoach() {
      if (!this.slug) return;
      if (!authToken) {
        openCoachAuth(() => this.genCoach());
        return;
      }
      this.job = { type: "coach", status: "running" };
      try {
        const headers = { "Content-Type": "application/json" };
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
        const response = await fetch("/api/coach", {
          method: "POST",
          headers,
          body: JSON.stringify({
            slug: this.slug,
            scope: this.scope,
            outcome: this.outcome,
            target: this.target,
          }),
        });
        if (response.status === 401) {
          setStoredAuthToken(null);
          window.dispatchEvent(new CustomEvent("coach-auth-change", { detail: { authenticated: false } }));
          openCoachAuth(() => this.genCoach());
          throw new Error("HTTP 401 sur /api/coach");
        }
        if (response.status === 409) throw new Error("Une analyse est déjà en cours.");
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status} sur /api/coach`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = /^event: (.+)$/m.exec(frame)?.[1];
            const raw = /^data: (.+)$/m.exec(frame)?.[1];
            if (!event || !raw) continue;
            const data = JSON.parse(raw);
            if (event in SSE_PROGRESS) {
              this.job = { type: "coach", status: "running", progress: SSE_PROGRESS[event] };
            } else if (event === "review") {
              this.job = { type: "coach", status: "done" };
              await Promise.all([this.loadReviews(), this.loadCoachingContext()]);
            } else if (event === "error") {
              this.job = {
                type: "coach",
                status: "error",
                error: coachErrorMessage(data.error),
              };
            }
          }
        }
      } catch (e) {
        this.job = { type: "coach", status: "error", error: coachErrorMessage(e) };
      }
    },

    coachBusy() { return Boolean(this.job && this.job.status === "running"); },

    matchCoachInfo(matchId) {
      return this.coachingContext?.matches?.[matchId] || null;
    },

    isGameCoachRunning(matchId) {
      return this.job?.type === "game-coach" && this.job.status === "running"
        && this.job.matchId === matchId;
    },

    async genGameCoach(game, force = false) {
      if (!game?.match_id || this.coachBusy()) {
        if (this.coachBusy()) this.job = { ...this.job, notice: "Une analyse est déjà en cours." };
        return;
      }
      if (!authToken) {
        openCoachAuth(() => this.genGameCoach(game, force));
        return;
      }
      const matchId = game.match_id;
      this.job = { type: "game-coach", matchId, status: "running", progress: "lecture du journal…" };
      try {
        const headers = { "Content-Type": "application/json" };
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
        const response = await fetch("/api/coach/game", {
          method: "POST",
          headers,
          body: JSON.stringify({ slug: this.slug, match_id: matchId, force }),
        });
        if (response.status === 401) {
          setStoredAuthToken(null);
          window.dispatchEvent(new CustomEvent("coach-auth-change", { detail: { authenticated: false } }));
          openCoachAuth(() => this.genGameCoach(game, force));
          throw new Error("HTTP 401 sur /api/coach/game");
        }
        if (response.status === 409) throw new Error("Une analyse est déjà en cours.");
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let completed = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = /^event: (.+)$/m.exec(frame)?.[1];
            const raw = /^data: (.+)$/m.exec(frame)?.[1];
            if (!event || !raw) continue;
            const data = JSON.parse(raw);
            if (event === "payload") {
              this.job = { type: "game-coach", matchId, status: "running", progress: "journal prêt" };
            } else if (event === "llm") {
              this.job = { type: "game-coach", matchId, status: "running", progress: "génération LLM…" };
            } else if (event === "review") {
              completed = data;
            } else if (event === "error") {
              throw new Error(data.error);
            }
          }
        }
        if (!completed) throw new Error("Flux interrompu avant la réception de l'analyse.");
        this.job = { type: "game-coach", matchId, status: "done" };
        this.pendingReviewId = matchId;
        await Promise.all([this.loadReviews(), this.loadCoachingContext()]);
        await this.goToGameReview(matchId);
      } catch (e) {
        this.job = { type: "game-coach", matchId, status: "error", error: coachErrorMessage(e) };
      }
    },

    async gameCoachAction(game) {
      if (this.hasReview(game?.match_id)) return this.goToGameReview(game.match_id);
      if (!authToken) {
        openCoachAuth(() => this.genGameCoach(game, false));
        return;
      }
      return this.genGameCoach(game, false);
    },

    globalNeedsRefresh() {
      if (!this.review?.ts) return false;
      const status = this.coachingContext?.aggregate_status?.[this.scope]?.[this.outcome];
      if (status) return Boolean(status.needs_refresh || status.stale_prompt);
      const latest = this.coachingContext?.review_samples?.[this.scope]?.latest_ts;
      return Boolean(latest && String(latest) > String(this.review.ts));
    },

    activeFeedbackReview() {
      return this.coachingView === "games" ? this.selectedGameReview : this.review;
    },

    async loadFeedback(review = this.activeFeedbackReview()) {
      this.fbMap = {}; this.noteDraft = {}; this.feedbackError = null; this.coachOpen = false;
      if (!review) return;
      try {
        const list = await api(`/api/c/${this.slug}/feedback`);
        const mine = list.find(f => f.ts === review.ts);
        const m = {}, notes = {};
        if (mine) for (const it of (mine.items || [])) {
          const key = `${it.kind},${it.index}`;
          m[key] = { useful: it.useful, tag: it.tag, note: it.note };
          notes[key] = it.note || "";
        }
        this.fbMap = m;
        this.noteDraft = notes;
      } catch (e) { /* fbMap stays empty */ }
    },

    fbKey(kind, index) { return `${kind},${index}`; },
    fbState(kind, index) { return this.fbMap[this.fbKey(kind, index)] || null; },

    async setFb(kind, index, useful) {
      if (useful) {
        await this.submitFb(kind, index, { useful: true });
      } else {
        // ouvre le menu tag ; le choix de tag appelle submitFb avec tag
        this.coachOpen = this.fbKey(kind, index);
      }
    },

    async pickTag(kind, index, tag) {
      await this.submitFb(kind, index, { useful: false, tag });
      this.coachOpen = false;
    },

    noteValue(kind, index) {
      const key = this.fbKey(kind, index);
      return key in this.noteDraft ? this.noteDraft[key] : (this.fbState(kind, index)?.note || "");
    },

    async saveNote(kind, index) {
      const state = this.fbState(kind, index);
      if (!state) return; // note rattachée au vote existant (y/n) — pas de vote seul
      const key = this.fbKey(kind, index);
      const note = (this.noteDraft[key] || "").trim() || null;
      await this.submitFb(kind, index, { useful: state.useful, tag: state.tag, note });
    },

    async submitFb(kind, index, { useful, tag = null, note = null }) {
      const review = this.activeFeedbackReview();
      if (!review) return;
      const key = this.fbKey(kind, index);
      const entry = tag ? { useful, tag, note } : { useful, note };
      // Le backend persist_feedback écrase toute la ligne pour ce ts
      // (1 ligne/review = l'ensemble annoté, comme le flow CLI annotate).
      // On envoie donc la map complète à chaque POST pour ne pas perdre
      // les insights déjà notés.
      const newMap = { ...this.fbMap, [key]: entry };
      this.fbBusy = { ...this.fbBusy, [key]: true };
      const responses = {};
      for (const [k, v] of Object.entries(newMap)) {
        responses[k] = v.tag ? { useful: v.useful, tag: v.tag, note: v.note }
                             : { useful: v.useful, note: v.note };
      }
      try {
        await api("/api/feedback", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: this.slug, ts: review.ts, responses }),
        });
        this.fbMap = newMap;
        this.loadEval();          // le taux publie inclut ce vote
      } catch (e) {
        this.feedbackError = /\b429\b/.test(String(e))
          ? "Trop de votes en peu de temps. Réessaie dans une heure."
          : "Le vote n’a pas été enregistré. Réessaie dans un instant.";
      }
      finally { this.fbBusy = { ...this.fbBusy, [key]: false }; }
    },

    meta() { return this.review?.payload?.meta || null; },

    async selectGameReview(review, loadFeedback = true) {
      if (!review?.ts) return;
      // Un clic prend le pas sur le lien profond : la cible n'est conservee que pour
      // les selections automatiques (loadFeedback = false), pas apres un choix humain.
      if (loadFeedback) this.pendingReviewId = null;
      this.gameReviewLoading = true; this.gameReviewError = null;
      this.chatMessages = []; this.chatDraft = ""; this.chatError = null;
      try {
        this.selectedGameReview = await api(`/api/c/${this.slug}/reviews/${encodeURIComponent(review.ts)}`);
        if (loadFeedback && this.coachingView === "games") await this.loadFeedback(this.selectedGameReview);
      } catch (e) {
        this.gameReviewError = "Impossible de charger cette analyse. Réessaie dans un instant.";
      } finally { this.gameReviewLoading = false; }
    },

    async sendGameChat() {
      const content = this.chatDraft.trim();
      if (!content || !this.selectedGameReview?.ts || this.chatBusy) return;
      if (!authToken) {
        openCoachAuth(() => this.sendGameChat());
        return;
      }
      const pending = [...this.chatMessages, { role: "user", content }];
      this.chatMessages = pending; this.chatDraft = ""; this.chatBusy = true; this.chatError = null;
      try {
        const headers = { "Content-Type": "application/json" };
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
        const response = await fetch("/api/chat", {
          method: "POST", headers,
          body: JSON.stringify({
            slug: this.slug, review_ts: this.selectedGameReview.ts,
            messages: pending.slice(-12),
          }),
        });
        if (response.status === 401) {
          setStoredAuthToken(null);
          window.dispatchEvent(new CustomEvent("coach-auth-change", { detail: { authenticated: false } }));
          openCoachAuth(() => this.sendGameChat());
          throw new Error("HTTP 401 sur /api/chat");
        }
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const event = /^event: (.+)$/m.exec(frame)?.[1];
            const raw = /^data: (.+)$/m.exec(frame)?.[1];
            if (!event || !raw) continue;
            const data = JSON.parse(raw);
            if (event === "message") {
              this.chatMessages = [...this.chatMessages, {
                role: "assistant", content: data.answer,
                refused_hidden_info: data.refused_hidden_info,
              }];
            } else if (event === "error") throw new Error(data.error);
          }
        }
      } catch (e) {
        this.chatError = coachErrorMessage(e);
      } finally { this.chatBusy = false; }
    },
    gameMeta(review) { return review?.payload?.meta || review?.meta || {}; },
    gameChampion(review) { return this.gameMeta(review).champion || "Partie analysée"; },
    gameOpponent(review) { return this.gameMeta(review).opponent || null; },
    gameResult(review) {
      const win = this.gameMeta(review).win;
      return win === true ? "Victoire" : win === false ? "Défaite" : "Analyse";
    },
    gameDuration(review) {
      const minutes = Number(this.gameMeta(review).duration_min);
      return Number.isFinite(minutes) ? `${Math.round(minutes)} min` : null;
    },
    gameKda(review) {
      const kda = this.gameMeta(review).kda;
      return kda ? fmtKDA(kda.kills, kda.deaths, kda.assists) : null;
    },
    gamePatch(review) { return this.gameMeta(review).patch || null; },
    gameMatchId(review) { return review?.match_id || this.gameMeta(review).match_id || "—"; },
    gameIcon(review) {
      const meta = this.gameMeta(review);
      if (!meta.champion) return "";
      return DDRAGON(meta.patch, meta.champion);
    },

    kda(g) { return fmtKDA(g.kills, g.deaths, g.assists); },
    champIcon(g, maybePatch) {
      if (!g) return "";
      const champ = typeof g === "string" ? g : g.champion;
      const patch = (typeof g === "object" && g.patch) ? g.patch : maybePatch;
      return DDRAGON(patch, champ);
    },
    iconFallback(e, champ) {
      if (!champ) {
        e.target.style.display = "none";
        return;
      }
      const id = CHAMP_CD_IDS[champ] || CHAMP_CD_IDS[CHAMP_SLUGS[champ]];
      if (id && !e.target.dataset.triedCd) {
        e.target.dataset.triedCd = "1";
        e.target.src = cdIconUrl(id);
        return;
      }
      if (!e.target.dataset.triedLatest) {
        e.target.dataset.triedLatest = "1";
        const key = CHAMP_SLUGS[champ] || String(champ).replace(/['\s.]/g, "");
        e.target.src = `https://ddragon.leagueoflegends.com/cdn/${LATEST_DDRAGON}/img/champion/${key}.png`;
        return;
      }
      e.target.style.display = "none";
      if (e.target.nextElementSibling && e.target.nextElementSibling.classList.contains("champ-fallback")) {
        e.target.nextElementSibling.style.display = "";
      }
    },
    roleLabel(r) {
      return ({ MIDDLE: "Mid", JUNGLE: "Jungle", BOTTOM: "Bot", TOP: "Top", UTILITY: "Support" })[r] || r;
    },
    roleIcon(r) {
      const roleMap = { MIDDLE: "middle", JUNGLE: "jungle", BOTTOM: "bottom", TOP: "top", UTILITY: "utility" };
      return roleIcon(roleMap[r] || r);
    },
    queueLabel(queueId) {
      if (queueId === 420) return "Solo/Duo";
      if (queueId === 440) return "Flex";
      return "Partie";
    },

    toggleGame(matchId) {
      this.expandedGameId = this.expandedGameId === matchId ? null : matchId;
    },
    hasReview(matchId) {
      if (!matchId) return false;
      const status = this.matchCoachInfo(matchId)?.review_status;
      if (status) return status === "ready" || status === "stale";
      return (this.gameReviews || []).some(r => this.gameMatchId(r) === matchId);
    },
    async goToGameReview(matchId) {
      this.pendingReviewId = matchId;
      this.setTab("coaching");
      await this.setCoachingView("games");
      if (this.gameReviews.length === 0 && this.reviewsLoading) {
        await this.loadReviews();
      }
      const target = await this.resolvePendingReview();
      if (target) {
        await this.selectGameReview(target);
      }
      this.$nextTick(() => {
        const el = this.$root.querySelector(".game-reviews") || this.$root.querySelector(".coach-view-tabs");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    fmtDiff(val, suffix = "") {
      if (val === null || val === undefined) return "—";
      const sign = val > 0 ? "+" : "";
      return `${sign}${val}${suffix}`;
    },
    diffClass(val) {
      if (val === null || val === undefined || val === 0) return "diff-neutral";
      return val > 0 ? "diff-pos" : "diff-neg";
    },
    fmtPct(val) {
      if (val === null || val === undefined) return "—";
      return `${Math.round(val * 100)} %`;
    },
    fmtNum(val, digits = 1) {
      if (val === null || val === undefined) return "—";
      return Number(val).toFixed(digits);
    },
    fmtGold(val) {
      if (val === null || val === undefined) return "—";
      return `${Math.round(val)} g`;
    },
    zoneLabel(z) {
      if (!z) return "Zone inconnue";
      const map = {
        "MID": "Mid lane",
        "BOT": "Bot lane",
        "TOP": "Top lane",
        "JUNGLE/RIVER": "Jungle / Rivière",
        "BASE": "Base alliée",
        "ENEMY_BASE": "Base ennemie",
      };
      return map[z] || z;
    },
    phaseLabel(p) {
      const map = { early: "Early (0-14m)", mid: "Mid (14-25m)", late: "Late (25m+)" };
      return map[p] || p;
    },
    teamCompAllies(g) {
      if (!g?.comp) return [];
      const res = [];
      const c = g.comp;
      if (c.self_top) res.push({ role: "TOP", roleName: "TOP", champ: c.self_top, isSelf: g.champion === c.self_top });
      if (c.self_jungle) res.push({ role: "JUNGLE", roleName: "JGL", champ: c.self_jungle, isSelf: g.champion === c.self_jungle });
      if (c.self_mid) res.push({ role: "MIDDLE", roleName: "MID", champ: c.self_mid, isSelf: g.champion === c.self_mid });
      if (c.self_adc) res.push({ role: "BOTTOM", roleName: "ADC", champ: c.self_adc, isSelf: g.champion === c.self_adc });
      if (c.self_support) res.push({ role: "UTILITY", roleName: "SUP", champ: c.self_support, isSelf: g.champion === c.self_support });
      return res;
    },
    teamCompEnemies(g) {
      if (!g?.comp) return [];
      const res = [];
      const c = g.comp;
      if (c.enemy_top) res.push({ role: "TOP", roleName: "TOP", champ: c.enemy_top });
      if (c.enemy_jungle) res.push({ role: "JUNGLE", roleName: "JGL", champ: c.enemy_jungle });
      if (c.enemy_mid) res.push({ role: "MIDDLE", roleName: "MID", champ: c.enemy_mid });
      if (c.enemy_adc) res.push({ role: "BOTTOM", roleName: "ADC", champ: c.enemy_adc });
      if (c.enemy_support) res.push({ role: "UTILITY", roleName: "SUP", champ: c.enemy_support });
      return res;
    },
    hasSides(g) {
      return Boolean(g?.sides?.ally_start || g?.sides?.enemy_start);
    },
    sideSummary(g) {
      if (!g?.sides) return null;
      const s = g.sides;
      if (!s.ally_start && !s.enemy_start) return null;
      const allyBotWeak = s.ally_weakside === "BOT";
      const enemyBotWeak = s.enemy_weakside === "BOT";
      if (allyBotWeak && enemyBotWeak) {
        return "Double Weakside bot : les deux junglers jouent vers le Top en early (0-4m).";
      }
      if (!allyBotWeak && !enemyBotWeak) {
        return "Double Strongside bot : les deux junglers jouent vers le Bot en early (0-4m).";
      }
      if (!allyBotWeak && enemyBotWeak) {
        return "Avantage Bot : ton jungler joue vers le Bot (Strongside), le jungler adverse joue vers le Top (Weakside).";
      }
      return "Attention Bot : ton jungler joue vers le Top (Weakside), le jungler adverse joue vers le Bot (Strongside).";
    },
    objectivesList(g) {
      if (!g?.objectives || !Array.isArray(g.objectives)) return [];
      return g.objectives;
    },
    objectiveIcon(obj) {
      if (!obj) return "🎯";
      if (obj.type === "DRAGON") {
        const sub = obj.sub_type || "";
        if (sub.includes("FIRE")) return "🔥";
        if (sub.includes("WATER")) return "💧";
        if (sub.includes("EARTH")) return "⛰️";
        if (sub.includes("AIR")) return "💨";
        if (sub.includes("HEXTECH")) return "⚡";
        if (sub.includes("CHEMTECH")) return "☣️";
        if (sub.includes("ELDER")) return "👑";
        return "🐉";
      }
      if (obj.type === "HORDE") return "🐛";
      if (obj.type === "RIFTHERALD") return "👁️";
      if (obj.type === "BARON_NASHOR") return "🟣";
      if (obj.type === "TURRET") return "🛡️";
      return "🎯";
    },
    objectiveLabel(obj) {
      if (!obj) return "Objectif";
      if (obj.type === "DRAGON") {
        const sub = obj.sub_type || "";
        if (sub.includes("FIRE")) return "Dragon Infernal";
        if (sub.includes("WATER")) return "Dragon des Océans";
        if (sub.includes("EARTH")) return "Dragon des Montagnes";
        if (sub.includes("AIR")) return "Dragon des Nuages";
        if (sub.includes("HEXTECH")) return "Dragon Hextech";
        if (sub.includes("CHEMTECH")) return "Dragon Chimico";
        if (sub.includes("ELDER")) return "Dragon Ancestral";
        return "Dragon";
      }
      if (obj.type === "HORDE") return "Larves du Néant";
      if (obj.type === "RIFTHERALD") return "Héraut de la Faille";
      if (obj.type === "BARON_NASHOR") return "Baron Nashor";
      if (obj.type === "TURRET") {
        const laneMap = { BOT_LANE: "Bot", MID_LANE: "Mid", TOP_LANE: "Top" };
        const towerMap = { OUTER_TURRET: "T1", INNER_TURRET: "T2", BASE_TURRET: "T3", NEXUS_TURRET: "T4" };
        const lane = laneMap[obj.lane] || "Tour";
        const tower = towerMap[obj.tower_type] || "";
        return `Tour ${lane} ${tower}`.trim();
      }
      return obj.type;
    },
    combatFilter: "all",
    setCombatFilter(f) {
      this.combatFilter = f;
    },
    combatEvents(g) {
      if (!g) return [];
      const events = [];
      const kills = g.kills || [];
      const deaths = g.deaths || [];
      const assists = g.assists || [];

      for (const k of kills) {
        events.push({
          type: "kill",
          minute: k.minute,
          champ: k.victim_champ || "Ennemi",
          role: k.victim_role,
          zone: k.zone,
          is_solo: k.is_solo,
          is_2v2: k.is_2v2,
        });
      }

      for (const d of deaths) {
        events.push({
          type: "death",
          minute: d.minute,
          champ: d.killer_champ || "Ennemi",
          role: d.killer_role,
          zone: d.zone,
          is_solo: d.is_solo,
          is_ganked_by_jungle: d.is_ganked_by_jungle,
          is_2v2: d.is_2v2,
          gold_state: d.gold_state,
        });
      }

      for (const a of assists) {
        events.push({
          type: "assist",
          minute: a.minute,
          champ: a.victim_champ || "Ennemi",
          killer_champ: a.killer_champ,
          role: a.victim_role,
          zone: a.zone,
          is_2v2: a.is_2v2,
        });
      }

      const typeRank = { kill: 1, assist: 2, death: 3 };
      events.sort((a, b) => {
        if (a.minute !== b.minute) return a.minute - b.minute;
        return (typeRank[a.type] || 0) - (typeRank[b.type] || 0);
      });

      if (this.combatFilter === "kill") return events.filter(e => e.type === "kill");
      if (this.combatFilter === "death") return events.filter(e => e.type === "death");
      if (this.combatFilter === "assist") return events.filter(e => e.type === "assist");
      return events;
    },
    combatCount(g, type) {
      if (!g) return 0;
      if (type === "kill") return g.kills?.length || 0;
      if (type === "death") return g.deaths?.length || 0;
      if (type === "assist") return g.assists?.length || 0;
      return (g.kills?.length || 0) + (g.deaths?.length || 0) + (g.assists?.length || 0);
    },
  };
}
function readmePage() {
  return {
    tab: "overview",
    init() { /* page statique, rien à fetcher */ },
    setTab(t) { this.tab = t; },
  };
}
