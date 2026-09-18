# web/ — interface web de riftsense

Le site de production est un **Cloudflare Worker TypeScript** qui sert dans le même
déploiement :

- l'API sous `/api/*` (`web/cf/src/`) ;
- le frontend Vite (`web/cf/client/`, assets publics dans `web/cf/public/`) via
  le binding `ASSETS` ;
- les données de consultation dans Cloudflare KV (`DATA`).

Production : <https://riftsense.jeanvg.fr>

Les clés restent côté serveur. La collecte Riot, les agrégations et l'entraînement ML
continuent de tourner localement en Python ; seul le résultat utile au site est synchronisé
vers KV.

## Développement local du Worker

```bash
cd web/cf
npm install
npm run dev
```

Le plugin Vite Cloudflare lance le frontend et le Worker dans le même runtime de
développement, avec HMR. Les bindings restent locaux par défaut afin qu'un test
de feedback ou d'inscription ne modifie pas les données de production.

Commandes de validation :

```bash
cd web/cf
npm test
npm run typecheck
```

> ℹ️ **Stack de serving** : Le site (en local comme en production) tourne exclusivement sur le Worker Cloudflare TypeScript (`web/cf/`). L'ancien backend FastAPI (`web/backend/`) issu de l'hébergement initial sur Fly.io a été supprimé du dépôt ; l'historique git en garde la trace, et les modules qui servaient encore à la collecte locale ont été déplacés dans `src/core/` (`ml_rank.py`, `settings.py`) et `src/collection/` (`pipeline.py`).

## Synchroniser les données locales vers KV

La commande habituelle rafraîchit les parties et le rang depuis Riot, reconstruit les
agrégats locaux, puis publie le compte dans KV :

```bash
poetry run python src/collection/refresh_cloudflare.py
```

Elle traite tous les comptes configurés (un seul actuellement). Pour limiter la collecte
ou republier également les référentiels statiques :

```bash
poetry run python src/collection/refresh_cloudflare.py --slug spadzze -n 20
poetry run python src/collection/refresh_cloudflare.py --with-ref
```

Elle vérifie d'abord `CF_API_TOKEN`, `CF_ACCOUNT_ID` et `CF_NAMESPACE_ID` : sans ces
variables dans `.env`, elle s'arrête avant tout appel à Riot.

Le script de synchronisation seul reste utile pour republier les fichiers locaux sans
interroger Riot. Il fusionne les données locales avec celles déjà présentes dans KV et ne
supprime pas l'historique distant. Il reconstruit aussi, depuis le cache raw local, les
payloads déterministes des 50 parties les plus récentes dans
`riftsense:{slug}:game-payloads` (20 Mio maximum). Cela ne provoque ni appel Riot ni appel
LLM ; `--skip-game-payloads` permet de sauter cette reconstruction lors d'un diagnostic.

```bash
poetry run python src/collection/sync_cloudflare.py --dry-run
poetry run python src/collection/sync_cloudflare.py
```

Variables requises dans `.env` ou dans l'environnement :

- `CF_API_TOKEN` — jeton Cloudflare avec `Account / Workers KV Storage / Edit` et
  `Account / Account Settings / Read` pour ce compte ;
- `CF_ACCOUNT_ID` — identifiant du compte Cloudflare ;
- `CF_NAMESPACE_ID` — namespace lié au binding `DATA`.

Les secrets de production se configurent avec Wrangler et ne doivent pas être
placés dans le dépôt :

```bash
cd web/cf
npx wrangler secret put OLLAMA_API_KEY
npx wrangler secret put COACH_AUTH_PASSWORD
```

Le mot de passe `COACH_AUTH_PASSWORD` protège les appels LLM (`/api/coach`, `/api/coach/game`,
`/api/chat`) contre les abus de visiteurs publics : sans ce mot de passe, les boutons de
régénération et le chat interactif restent verrouillés sur le site web. En local avec `npm run dev`,
ce secret peut être défini dans `web/cf/.dev.vars` (ex. `COACH_AUTH_PASSWORD=dev-secret`).

Les générations globales et unitaires passent par le Durable Object `COACH_GATE`, nommé
par joueur. Il conserve le verrou jusqu'à la fermeture du flux SSE et empêche deux appels
Ollama concurrents d'écraser le même JSONL. La migration SQLite déclarée dans
`wrangler.toml` est appliquée par le déploiement Wrangler.

## Déployer

```bash
cd web/cf
npm test
npm run typecheck
npm run build
npm run deploy
```

Le domaine personnalisé `riftsense.jeanvg.fr` est rattaché au Worker dans Cloudflare.
Après chaque déploiement, vérifier au minimum :

```bash
curl https://riftsense.jeanvg.fr/api/health
curl https://riftsense.jeanvg.fr/api/accounts
```

## Architecture

```text
web/
  cf/                 # paquet Vite + Worker unique
    client/
      main.ts         # point d'entrée de la SPA Vue
      App.vue         # shell, navigation et pied de page
      pages/          # accueil, compte et méthodologie
      auth.ts         # jeton et événements d'authentification partagés
      router.ts       # routes et historique centralisés avec Vue Router
      style.css       # thème global existant
      components/     # profil, auth, historique et coaching Vue + tests Vitest
    public/           # favicons, aperçu social, robots et sitemap
    index.html        # entrée Vite / shell SEO
    vite.config.ts    # Vue + plugin Cloudflare officiel
    src/index.ts      # routeur Worker, erreurs et assets
    src/readers.ts      # accès typé à Cloudflare KV
    src/coach.ts        # coaching global en Server-Sent Events
    src/game_coach.ts   # coaching unitaire à la demande
    src/coach_gate.ts   # verrou Durable Object par joueur
    src/llm_client.ts   # client Ollama Cloud avec retries
    src/schema.ts       # validation des entrées/sorties
    wrangler.toml       # Worker, assets et binding DATA
src/collection/sync_cloudflare.py  # publication locale vers KV
```

Flux de données :

```text
Riot + pipeline Python local -> sync_cloudflare.py -> Cloudflare KV
                                                    -> Worker API -> navigateur
navigateur -> POST /api/coach -> Worker -> Ollama Cloud -> événements SSE
navigateur -> POST /api/coach/game -> payload KV -> Ollama Cloud -> review versionnée
```

## Endpoints de production

- `GET /api/health` — état du Worker ;
- `GET /api/accounts` — comptes préconfigurés et indicateurs ;
- `GET /api/c/{slug}/account` — identité minimale d'un compte connu, utilisée pour
  valider et mémoriser localement les comptes récents du navigateur ;
- `GET /api/c/{slug}/games` — historique paginé ;
- `GET /api/c/{slug}/rank` — rang Riot mis en cache ;
- `GET /api/c/{slug}/predicted-rank` — estimation ML per-player, disponible à partir de
  15 parties ADC ;
- `GET /api/c/{slug}/reviews` — historique des coachings ; `?kind=aggregate|game` renvoie une
  page légère, et `GET /api/c/{slug}/reviews/{ts}` charge le détail d'une partie ;
- `GET /api/c/{slug}/coaching-context` — scopes disponibles, champion principal, matchs
  analysables, recommandations pédagogiques et fraîcheur des bilans ;
- `GET /api/c/{slug}/shap` — profil SHAP local ;
- `POST /api/coach` — génération Ollama diffusée en SSE ;
- `POST /api/coach/game` — génération d'une seule partie depuis son payload KV ; sans
  `force`, une review existante est relue sans nouvel appel, et `force=true` conserve
  l'ancienne version ;
- `POST /api/feedback` — annotation des conseils, limitée à 30 envois par heure et par IP ; les
  requêtes de navigateur provenant d'une autre origine sont refusées.

La mise à jour Riot n'est volontairement plus exposée dans l'interface publique : collecte,
calcul ML et synchronisation se font depuis la machine locale. Les anciens endpoints
`/api/fetch` et `/api/jobs/{id}` ne font pas partie du Worker.

## État de la migration Fly.io

Le trafic de production est entièrement basculé sur Cloudflare. L'ancien service Fly a été
supprimé ; il ne sert plus le site et n'occasionne plus de facturation.

L'historique local disponible a été fusionné dans KV (17 reviews et 5 feedbacks lors de la
migration). Le volume Fly n'a pas été rapatrié davantage, par choix : son contenu n'était
pas jugé important.

## Périmètre fonctionnel

- `/` liste les comptes préconfigurés ;
- `/c/{slug}` affiche historique, rang, estimation ML, coaching, feedback et SHAP ;
- `/readme` explique les recommandations et leurs benchmarks challenger ;
- l'authentification reste reportée : le site est publiquement accessible ;
- le coaching global reste fondé sur les agrégats déterministes ; les causes issues des
  analyses unitaires ne servent qu'en enrichissement qualitatif borné et transparent ;
- chaque partie dont le journal local a été synchronisé peut être analysée explicitement
  depuis l'historique, sans batch automatique.

La conception fonctionnelle détaillée est conservée dans
`docs/superpowers/specs/2026-07-01-web-app-design.md`.
