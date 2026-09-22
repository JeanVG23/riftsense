"""Tests de câblage statique du frontend Vite/Vue.

Les interactions sont couvertes par Vitest dans web/cf/client ; ce fichier
verrouille surtout l'architecture livrée et les contrats entre composants.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web" / "cf"


def _read(name: str) -> str:
    return (WEB / name).read_text()


def test_index_mounts_the_vue_application():
    body = _read("index.html")
    assert '<div id="app"></div>' in body
    assert 'type="module" src="/client/main.ts"' in body
    assert "x-data" not in body and "Alpine" not in body
    assert "/static/" not in body


def test_worker_serves_the_spa_fallback():
    toml = _read("wrangler.toml")
    assert "directory =" not in toml
    assert 'not_found_handling = "single-page-application"' in toml
    assert "cloudflare()" in _read("vite.config.ts")


def test_assets_and_dependencies_are_current():
    for name in ("client/style.css", "client/main.ts", "client/App.vue", "public/og.png"):
        asset = WEB / name
        assert asset.exists() and asset.stat().st_size > 100, name
    package = _read("package.json")
    assert '"vue"' in package and '"vue-router"' in package and '"chart.js"' in package
    assert '"alpinejs"' not in package


def test_style_css_has_tokens():
    css = _read("client/style.css")
    for token in ("--bg:", "--panel:", "--gold:", "--win:", "--loss:", "tabular-nums"):
        assert token in css


def test_router_and_canonical_are_wired():
    main = _read("client/main.ts")
    router = _read("client/router.ts")
    body = _read("index.html")
    assert "createApp(App).use(router)" in main
    assert "createRouter" in router and "createWebHistory" in router
    assert "router.afterEach(syncCanonical)" in main
    assert 'link[rel="canonical"]' in main and 'meta[property="og:url"]' in main
    assert '<link rel="canonical" href="https://riftsense.jeanvg.fr/">' in body


def test_shell_and_home_are_vue_components():
    shell = _read("client/App.vue")
    home = _read("client/pages/HomePage.vue")
    assert "/api/accounts" in shell
    assert "route.name === 'home'" in shell
    assert "accounts-grid" in home and "account-card" in home
    assert "<RegisterForm" in home


def test_account_dashboard_is_vue_owned():
    page = _read("client/pages/AccountPage.vue")
    for component in ("AccountProfile", "GameHistory", "CoachingControls", "GlobalCoaching", "GameReviews", "ShapProfile"):
        assert f"<{component}" in page
    assert 'role="tablist"' in page
    assert 'v-if="ownerView"' in page and "refresh_cloudflare.py" in page


def test_account_header_and_history_contracts():
    page = _read("client/pages/AccountPage.vue")
    profile = _read("client/components/AccountProfile.ce.vue")
    history = _read("client/components/GameHistory.ce.vue")
    assert "/predicted-rank" in profile and "/rank" in profile
    assert '@prediction-loaded="predictedRank = $event"' in page
    assert ':predicted-rank="predictedRank"' in page
    assert "/games?page=${page.value}&size=${size}" in history
    assert "review_status" in history


def test_coaching_context_and_generation_are_wired():
    page = _read("client/pages/AccountPage.vue")
    history = _read("client/components/GameHistory.ce.vue")
    global_coaching = _read("client/components/GlobalCoaching.ce.vue")
    assert "/coaching-context" in page
    assert 'fetch("/api/coach"' in page and 'fetch("/api/coach/game"' in page
    assert "getReader()" in page and 'event === "review"' in page
    assert "props.coachingContext?.matches?.[matchId]" in history
    assert "n_game_reviews_available" in global_coaching and "n_game_reviews_used" in global_coaching


def test_aggregate_and_game_reviews_stay_separate():
    page = _read("client/pages/AccountPage.vue")
    assert "kind=aggregate" in page and "kind=game" in page
    assert "findMatchingReview" in page and "gameReviewsCount" in page


def test_deep_link_to_game_review_is_preserved():
    page = _read("client/pages/AccountPage.vue")
    games = _read("client/components/GameReviews.vue")
    assert "route.query.review" in page
    assert 'reviewQuery ? "coaching"' in page and 'reviewQuery ? "games"' in page
    assert "resolveTarget" in games and "gameMatchId(item) === matchId" in games


def test_game_reviews_own_filters_pagination_and_details():
    component = _read("client/components/GameReviews.vue")
    assert 'class="review-primer"' in component and "Riot API" in component
    assert 'class="game-review-layout"' in component
    assert "filterResult" in component and "filterChampion" in component
    assert "async function loadMore" in component and "/reviews?kind=game&page=" in component
    assert "async function selectReview" in component


def test_interactive_game_chat_is_vue_owned():
    component = _read("client/components/GameReviews.vue")
    assert 'class="game-chat"' in component
    assert "async function sendChat" in component and 'fetch("/api/chat"' in component
    assert "hidden enemy information" in component


def test_game_feedback_sends_full_map_and_notes():
    component = _read("client/components/GameReviews.vue")
    assert 'class="fb-note-input"' in component and "async function saveNote" in component
    assert "const next = { ...feedback.value, [key]: entry }" in component
    assert "responses: next" in component and "responses = { [key]" not in component


def test_global_feedback_and_evaluation_refresh_are_wired():
    page = _read("client/pages/AccountPage.vue")
    controls = _read("client/components/CoachingControls.ce.vue")
    global_coaching = _read("client/components/GlobalCoaching.ce.vue")
    assert 'class="eval-strip"' in controls and "mistake_useful_rate" in controls and "/eval" in controls
    assert 'fetch("/api/feedback"' in global_coaching
    assert '@feedback-saved="evalRevision += 1"' in page


def test_shap_is_lazy_and_charted():
    component = _read("client/components/ShapProfile.ce.vue")
    assert "/shap" in component and 'import("chart.js")' in component
    assert "new Chart(" in component and "shap-empty" in component


def test_readme_is_a_vue_page_and_keeps_methodology():
    page = _read("client/pages/ReadmePage.vue")
    assert "const tab = ref" in page and "v-if=\"tab === 'overview'\"" in page
    for phrase in ("asymmetry", "benchmark", "positioning", "Model card", "AUC 0.677", "Spearman 0.537", "held-out", "docs/MODEL_CARD.md", "self-supervised", "deprecated"):
        assert phrase.lower() in page.lower(), phrase


def test_readme_states_success_criterion_and_real_schema_bounds():
    import re
    page = _read("client/pages/ReadmePage.vue")
    assert "at least 70%" in page and "at least 10 rated game analyses" in page
    schema = (ROOT / "src" / "04_coaching" / "schema.py").read_text()
    review = schema.split("class Review")[1].split("class ")[0]
    for field in ("strengths", "mistakes", "habits"):
        line = next(line for line in review.splitlines() if line.strip().startswith(field))
        lo = int(re.search(r"min_length=(\d+)", line).group(1))
        hi = int(re.search(r"max_length=(\d+)", line).group(1))
        expected = f"{field}[{lo}]" if lo == hi else f"{field}[{lo}..{hi}]"
        assert expected in page


def test_registration_routes_and_polling_are_wired():
    shell = _read("client/App.vue")
    component = _read("client/components/RegisterForm.ce.vue")
    assert "route.name === 'register'" in shell and '<RegisterForm v-else-if=' in shell
    reg_lib = _read("client/account-registration.ts")
    assert ('"/api/register"' in component or '"/api/register"' in reg_lib) and "/api/register/${" in component
    assert "location.pathname.match" in component
    assert "onBeforeUnmount(stopPolling)" in component and "clearTimeout(timer)" in component
    for code in ("riot_id_not_found", "no_ranked_games", "riot_unavailable", "internal"):
        assert code in component or code in reg_lib


def test_authentication_is_shared_by_vue_components():
    shell = _read("client/App.vue")
    auth = _read("client/auth.ts")
    modal = _read("client/components/AuthModal.ce.vue")
    control = _read("client/components/AuthControl.ce.vue")
    assert "<AuthControl" in shell and "<AuthModal" in shell
    assert 'AUTH_TOKEN_KEY = "coach_auth_token"' in auth
    assert "export let authToken" in auth and "withAuthHeaders" in auth
    assert 'fetch("/api/auth/login"' in modal
    assert 'fetch("/api/auth/status"' in control and 'fetch("/api/auth/logout"' in control


def test_social_preview_robots_and_sitemap_are_present():
    body = _read("index.html")
    for tag in ('property="og:title"', 'property="og:image"', 'property="og:description"', 'name="twitter:card"'):
        assert tag in body
    robots = _read("public/robots.txt")
    sitemap = _read("public/sitemap.xml")
    assert "User-agent: *" in robots and "Disallow: /api/" in robots
    assert "Sitemap: https://riftsense.jeanvg.fr/sitemap.xml" in robots
    assert sitemap.startswith("<?xml") and "<loc>https://riftsense.jeanvg.fr/</loc>" in sitemap


def test_no_alpine_directives_or_runtime_remain():
    sources = "\n".join(path.read_text() for path in (WEB / "client").rglob("*") if path.suffix in {".ts", ".vue", ".js"})
    assert "Alpine" not in sources
    assert "x-data=" not in sources and "x-show=" not in sources and "x-if=" not in sources
    assert '"alpinejs"' not in _read("package.json")
