<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const tab = ref("overview");
function setTab(value: string): void { tab.value = value; }

function goHome(): void {
  void router.push("/");
}

function goTerms(): void {
  void router.push("/terms");
}

function goPrivacy(): void {
  void router.push("/privacy");
}
</script>

<template>
  <div class="legal-page readme">
    <div class="legal-header">
      <div class="legal-breadcrumbs">
        <a href="/" @click.prevent="goHome">Accueil</a>
        <span class="legal-sep">/</span>
        <span class="current">À propos &amp; Méthode</span>
      </div>
      <h1 class="legal-title">Comment fonctionne RiftSense</h1>
      <p class="legal-meta">
        <span class="badge badge-legal">Documentation &amp; Méthode</span>
        <span>Mise à jour : Saison 2026</span>
        <span class="legal-sep">·</span>
        <span>Architecture, Data Science &amp; Pipeline IA</span>
      </p>
      <p class="legal-subline">
        Le projet de bout en bout : de la récupération des données à la boucle de feedback. Les recos sont benchmarkées, vérifiables, et respectent ce que tu savais vraiment.
      </p>
    </div>

    <div class="tabs" role="tablist" aria-label="Sections de présentation">
      <button type="button" class="tab" :class="tab === 'overview' ? 'active' : ''" @click="setTab('overview')" :aria-selected="tab === 'overview'">Vue d'ensemble</button>
      <button type="button" class="tab" :class="tab === 'data' ? 'active' : ''" @click="setTab('data')" :aria-selected="tab === 'data'">Données &amp; API Riot</button>
      <button type="button" class="tab" :class="tab === 'features' ? 'active' : ''" @click="setTab('features')" :aria-selected="tab === 'features'">Features</button>
      <button type="button" class="tab" :class="tab === 'ml' ? 'active' : ''" @click="setTab('ml')" :aria-selected="tab === 'ml'">Data Science &amp; ML</button>
      <button type="button" class="tab" :class="tab === 'coaching' ? 'active' : ''" @click="setTab('coaching')" :aria-selected="tab === 'coaching'">Coaching IA</button>
      <button type="button" class="tab" :class="tab === 'feedback' ? 'active' : ''" @click="setTab('feedback')" :aria-selected="tab === 'feedback'">Feedback</button>
    </div>

    <!-- onglet Vue d'ensemble -->
    <template v-if="tab === 'overview'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>Le problème avec op.gg &amp; co.</h2>
          <p>Les outils existants (op.gg, u.gg, score OP…) s'appuient sur des <strong>stats classiques</strong> — KDA, nombre de tourelles, gold. Résultat : des conseils pauvres et souvent faux du type « meurs moins », alors que le vrai conseil serait « place-toi ici plutôt que là ». Ce projet part d'un pari inverse : reconstruire <strong>le positionnement et les déplacements réels</strong> des 10 joueurs depuis la timeline Riot, parce que ça porte beaucoup plus d'information qu'un agrégat de fin de game.</p>
        </section>

        <section class="card legal-card">
          <h2>Respect de l'asymétrie d'information</h2>
          <p>Le coach ne te reproche <strong>jamais</strong> une décision basée sur une info que tu n'avais pas. Ex. : il ne dira pas « tu n'aurais pas dû push, le jungle ennemi était botside » si tu n'avais aucune vision dessus. On raisonne uniquement sur l'information réellement disponible au joueur au moment T. L'info complète post-game sert à <em>labelliser a posteriori</em>, jamais à juger — ce principe traverse tout le pipeline, de l'extraction des features (onglet Features) jusqu'au prompt envoyé au LLM (onglet Coaching IA).</p>
        </section>

        <section class="card legal-card">
          <h2>Benchmark challenger, pas opinion absolue</h2>
          <p>« Tu recalls à 1450 g en moyenne, les challengers de ton matchup à 1100 » est concret et <strong>vérifiable</strong>. « Recall plus tôt » est une opinion creuse. Les benchmarks viennent directement des timelines high-elo de l'API Riot, à issue et contexte de lane égaux. Une reco sans preuve chiffrée n'est pas une reco — c'est la règle qui contraint tout, des features au schéma de sortie du LLM.</p>
        </section>

        <section class="card legal-card">
          <h2>Le pipeline, de bout en bout</h2>
          <ol style="margin:6px 0 0; padding-left:20px">
            <li><strong>Collecte</strong> — API Riot (Match-V5 + Timeline) pour tes games et pour un référentiel de milliers de games high-elo. <span class="faint">→ onglet Données</span></li>
            <li><strong>Extraction</strong> — la timeline brute devient des features macro (lane, positionnement, morts, contexte de matchup). <span class="faint">→ onglet Features</span></li>
            <li><strong>Agrégation</strong> — tes features sont comparées aux médianes du référentiel, à issue et contexte égaux (op.gg s'arrête ici ; nous, c'est le point de départ).</li>
            <li><strong>Machine Learning</strong> — un ensemble de modèles classe les profils par rang et explique quelles features pèsent le plus, via SHAP. <span class="faint">→ onglet Data Science</span></li>
            <li><strong>Narration</strong> — un LLM transforme ce diff chiffré en 3 forces / 3 erreurs / 2 habitudes / 1 focus, sous contrainte de schéma strict. <span class="faint">→ onglet Coaching IA</span></li>
            <li><strong>Évaluation</strong> — chaque insight est noté utile/faux par le joueur, pour mesurer si le coach s'améliore réellement. <span class="faint">→ onglet Feedback</span></li>
          </ol>
        </section>

        <section class="card legal-card">
          <h2>Où en est le projet</h2>
          <p>Phase 1 (coach 100% API, zéro vision) est validée : le positionnement reconstruit sans image apporte déjà un signal utile. Le référentiel multi-rangs (Diamond → Challenger) est collecté, le pipeline ML (XGBoost / Random Forest / EBM + SHAP) est branché, et la narration LLM (Ollama) avec boucle de feedback tourne en production sur ce site. La capture live et la computer vision sont un projet séparé, hors périmètre actuel : le coach s'appuie uniquement sur la timeline Riot post-game.</p>
        </section>
      </div>
    </template>

    <!-- onglet Données & API Riot -->
    <template v-if="tab === 'data'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>Riot-first</h2>
          <p>Décision d'architecture centrale : <strong>la capture live et la vision par ordinateur ne sont pas la source active</strong>. L'API Riot post-game fournit gratuitement, sans erreur d'OCR, l'essentiel de la donnée nécessaire à un coach de positionnement.</p>
          <ul>
            <li><strong>Match-V5 + Timeline</strong> (post-game) — positions x/y de <em>tous</em> les champions toutes les 60 s, gold/XP/items par joueur, et tous les événements discrets (kills, objectifs, wards, level-ups, achats).</li>
          </ul>
        </section>

        <section class="card legal-card">
          <h2>Le mécanisme de l'asymétrie</h2>
          <p>C'est le garde-fou qui rend le principe d'asymétrie (onglet Vue d'ensemble) réellement applicable, et pas juste une intention :</p>
          <ul>
            <li><strong>« Ce qui peut être prescrit »</strong> — uniquement les features exactes et vérifiables depuis la timeline (<span class="mono">COACHING_SAFE</span>).</li>
            <li><strong>« Ce qui reste statistique »</strong> — les proxys <span class="mono">ML_ONLY</span> servent le modèle, mais ne sont jamais formulés comme un reproche.</li>
            <li><strong>« Ce qui sert à labelliser »</strong> — la timeline complète et les benchmarks comparent et labellisent après coup ; ils ne sont jamais présentés au LLM comme une connaissance que le joueur avait au moment T.</li>
          </ul>
        </section>

        <section class="card legal-card">
          <h2>Les APIs utilisées</h2>
          <div style="overflow-x:auto">
          <table class="readme-table">
            <tr><th>API</th><th>Endpoint clé</th><th>Rôle</th><th>Routing</th></tr>
            <tr><td>account-v1</td><td class="mono">accounts/by-riot-id/{gameName}/{tagLine}</td><td>Riot ID → puuid, porte d'entrée</td><td>régional</td></tr>
            <tr><td>match-v5</td><td class="mono">matches/{id}/timeline</td><td>Cœur du projet : positions/60s + events</td><td>régional</td></tr>
            <tr><td>league-v4</td><td class="mono">entries/by-puuid/{puuid}</td><td>Elo/LP pour contexte de rang</td><td>plateforme</td></tr>
          </table>
          </div>
          <p class="faint" style="margin-top:10px">account-v1 et match-v5 utilisent le routing <strong>régional</strong> (europe/americas/asia) ; league-v4 utilise le routing <strong>plateforme</strong> (euw1…). Clé de production : pas de rate-limiting agressif nécessaire, juste un backoff poli sur 429.</p>
        </section>

        <section class="card legal-card">
          <h2>Architecture de stockage — un médaillon en couches numérotées</h2>
          <p>Chaque couche a un rôle unique et ne fait qu'une seule transformation, pour pouvoir tout régénérer sans re-taper l'API :</p>
          <ul>
            <li><span class="mono">01_raw</span> — JSON brut de l'API Riot, compressé zstd, caché par matchId. Ne change plus jamais une fois écrit.</li>
            <li><span class="mono">02_silver</span> — une ligne par game nettoyée (features + comp), extraite depuis le raw.</li>
            <li><span class="mono">03_gold</span> — agrégats/benchmarks (par rang, par joueur), facettes win/loss et contexte de lane.</li>
            <li><span class="mono">04_dataset</span> — table tabulaire consolidée, prête pour le Machine Learning.</li>
            <li><span class="mono">05_model</span> / <span class="mono">06_shap</span> — modèles entraînés et sorties d'explicabilité.</li>
            <li><span class="mono">07_coaching</span> — reviews LLM et feedback persistés, par joueur.</li>
          </ul>
          <p>Séparer raw/silver/gold veut dire qu'une évolution des features (ex. ajout du positionnement) se rejoue <strong>sans un seul appel API supplémentaire</strong> : on ré-extrait le silver depuis le raw déjà caché.</p>
        </section>
      </div>
    </template>

    <!-- onglet Features -->
    <template v-if="tab === 'features'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>Quatre familles de features</h2>
          <ul>
            <li><strong>Lane</strong> — gold/CS/XP diff @10/@14/@20 minutes vs l'adversaire direct à ton poste.</li>
            <li><strong>Positionnement</strong> (17 features) — présence par zone de carte, roam mid, indice d'over-extension, vision posée/détruite, temps mort de gold (gold dead time). Calculées uniquement depuis les positions x/y de la timeline — <strong>zéro vision par ordinateur</strong>.</li>
            <li><strong>Morts</strong> — répartition par zone et par phase de game, morts en fog de guerre vs morts sous vision alliée, état du gold (avance/retard) au moment de mourir.</li>
            <li><strong>Contexte de matchup</strong> — dérivé du comp des 6 champions botlane : un axe <em>lane_pattern</em> (poke / all-in / scaling / mixed) et un axe <em>gank_exposure</em> (bas/moyen/haut, jungler+mid ennemis atténués par ton propre jungler). Sert uniquement de contexte de benchmark, jamais à reprocher une décision sur une info cachée.</li>
          </ul>
        </section>

        <section class="card legal-card">
          <h2>Le manifeste d'asymétrie mécanique : COACHING_SAFE vs ML_ONLY</h2>
          <p>Toutes les features de positionnement ne se valent pas du point de vue de l'asymétrie. On distingue formellement :</p>
          <ul>
            <li><strong>COACHING_SAFE</strong> (14 features) — mesures exactes et vérifiables depuis la timeline (ex. distance moyenne aux alliés, wards posées/détruites). Utilisables à la fois pour le Machine Learning <em>et</em> pour prescrire un conseil au joueur.</li>
            <li><strong>ML_ONLY</strong> (3 features) — des proxys plus flous, utiles au modèle statistique mais qu'on ne peut pas transformer en instruction actionnable sans sur-interpréter. Elles nourrissent le classement ML (onglet Data Science) mais ne sont <strong>jamais</strong> formulées comme un reproche.</li>
          </ul>
          <p class="faint">Cas particulier : la profondeur de carte (avg/max_map_depth) a un sens contre-intuitif — une valeur haute est un marqueur de rang élevé, pas un défaut à corriger. Elle est donc descriptive uniquement, jamais prescriptive.</p>
        </section>

        <section class="card legal-card">
          <h2>Benchmarker à issue et contexte égaux</h2>
          <p>Une comparaison brute contre la moyenne challenger est trompeuse — un support qui gagne facilement n'a pas le même profil qu'un support qui perd une lane difficile. Chaque feature est donc benchmarkée en conditionnant sur deux axes : la <strong>facette win/loss</strong> (neutralise le biais d'issue) et le <strong>contexte de matchup</strong> (lane_pattern / gank_exposure), avec un seuil de repli si l'échantillon contextuel devient trop fin. C'est ce double conditionnement qui rend une phrase comme « tes challengers en matchup all-in font X » réellement comparable à ta game.</p>
        </section>
      </div>
    </template>

    <!-- onglet Data Science & ML -->
    <template v-if="tab === 'ml'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>Les features d'abord, le modèle ensuite</h2>
          <p>La qualité du coaching final dépend à ~90% de la couche de features, pas du modèle statistique. Le Machine Learning n'a donc pas vocation à remplacer les heuristiques déterministes (onglet Features) : il sert à valider qu'un signal existe au-delà du laning, et à hiérarchiser objectivement quelles features comptent le plus.</p>
        </section>

        <section class="card legal-card">
          <h2>De la game au dataset</h2>
          <p>Chaque ligne du dataset ML représente <strong>un ADC dans une game donnée</strong> (pas une game entière) : les deux ADC — le tien et l'adversaire — sont ré-extraits depuis le raw pour densifier le référentiel, plutôt que de se limiter au seul joueur ciblé par la collecte silver. Le rang de collecte est transféré aux deux ADC du lobby, sous l'hypothèse d'un MMR proche entre les deux camps en solo queue high-elo — une approximation assumée, documentée comme telle.</p>
        </section>

        <section class="card legal-card">
          <h2>Un ensemble à trois biais inductifs distincts</h2>
          <p>Plutôt qu'un seul modèle, la classification (élo haut vs bas) s'appuie sur trois familles d'algorithmes qui apprennent différemment des mêmes données — si les trois convergent, le signal est plus robuste qu'une coïncidence d'un seul modèle :</p>
          <ul>
            <li><strong>XGBoost</strong> — boosting de gradient (GBDT), construit ses arbres séquentiellement en corrigeant les erreurs des précédents. Capture des interactions complexes entre features.</li>
            <li><strong>Random Forest</strong> — bagging d'arbres indépendants, moyenné. Plus robuste au bruit, biais et variance différents de XGBoost.</li>
            <li><strong>EBM</strong> (Explainable Boosting Machine) — un modèle additif généralisé avec interactions par paires (GA²M), <em>glass-box</em> par construction : on peut lire directement sa fonction de décision, sans avoir besoin d'une méthode d'explicabilité a posteriori. Sert de validateur indépendant des deux autres.</li>
          </ul>
        </section>

        <section class="card legal-card">
          <h2>SHAP — expliquer une prédiction, pas juste la faire</h2>
          <p>Les valeurs de Shapley (SHAP) répartissent la prédiction d'un modèle entre ses features d'entrée, en s'appuyant sur un résultat de théorie des jeux : pour chaque feature, on mesure sa contribution marginale moyenne en la retirant/ajoutant sur tous les sous-ensembles possibles de features. Concrètement, ça permet deux lectures :</p>
          <ul>
            <li><strong>Globale</strong> — quelles features, en moyenne sur tout le référentiel, séparent le mieux les rangs élevés des rangs bas.</li>
            <li><strong>Individuelle</strong> — pour un profil donné, quelles features précises poussent son classement vers un rang plutôt qu'un autre — la base du rang ML affiché sur la page d'un compte.</li>
          </ul>
          <p>Comme XGBoost et Random Forest sont tous deux des arbres, leurs SHAP sont moyennés ensemble ; l'EBM, additif par construction, sert de <strong>cross-check indépendant</strong> — s'il pointe dans la même direction qu'un SHAP issu d'un modèle boîte noire, la lecture est d'autant plus fiable.</p>
        </section>

        <section class="card legal-card">
          <h2>Model card : les chiffres, le protocole et ce qui ne marche pas</h2>
          <p>Un chiffre sans son protocole ne prouve rien. Les deux modèles servis sont évalués sur un <strong>test held-out</strong>, jamais sur du out-of-fold optimiste :</p>
          <div style="overflow-x:auto">
          <table class="readme-table">
            <tr><th>Modèle</th><th>Unité</th><th>Sélection (CV purgée sur le train)</th><th>Test held-out</th></tr>
            <tr><td>Rang (binaire high-elo)</td><td>1 joueur, ≥15 games ADC</td><td>AUC 0.591 (n=687)</td><td><strong>AUC 0.677</strong> (n=147)</td></tr>
            <tr><td>Régression LP</td><td>1 joueur apex</td><td>Spearman 0.493 (n=805)</td><td><strong>Spearman 0.537</strong> (n=170)</td></tr>
          </table>
          </div>
          <p style="margin-top:10px"><strong>Purged CV.</strong> Environ 37 % des parties des joueurs du dataset opposent <em>deux</em> joueurs du dataset : leurs features sont en miroir, ce qui fait fuir de l'information entre folds. À chaque fold, les agrégats d'entraînement sont recalculés en excluant ces parties. La fuite a été <strong>mesurée, pas supposée</strong> : ≈ +0,005 d'AUC.</p>
          <p><strong>Ce que le modèle regarde vraiment.</strong> Les statistiques de dispersion (écart-type, p10, p90) concentrent <strong>65 %</strong> du signal SHAP, contre 20 % pour la moyenne. Autrement dit : le rang tient au <em>plancher</em>, pas à la moyenne. Ce n'est pas la bonne partie qui distingue un joueur, c'est la mauvaise.</p>
          <p><strong>Résultats négatifs, assumés.</strong> Les taire donnerait une image fausse du projet :</p>
          <ul>
            <li>Le pré-entraînement auto-supervisé (mask-and-reconstruct) <strong>n'apporte rien</strong> : delta −0,019, et −0,025 pour une v2 censée l'améliorer.</li>
            <li>La frontière Master / Grandmaster <strong>plafonne à ≈ 0,589</strong> : la calibration place master à 0,489 et grandmaster à 0,487, un ordre inversé. Ces deux tiers sont confondus sur des features macro.</li>
            <li>Augmenter le nombre de parties par joueur <strong>n'aide pas au-delà de ~30</strong> (0,635 au pic, 0,599 à N=50).</li>
            <li>Le modèle par-partie a été <strong>déprécié</strong> : trop instable pour être affiché.</li>
          </ul>
          <p class="faint">Limites documentées : un seul patch (16.13) et une seule région (EUW) ; rang transféré aux deux ADC du lobby ; Grandmaster sous-représenté (16 joueurs dans le test) donc métriques GM non interprétables ; drift connu entre le modèle servi et le dataset courant. Détail complet dans la <a href="https://github.com/JeanVG23/riftsense/blob/master/docs/MODEL_CARD.md" target="_blank" rel="noopener">model card</a>.</p>
        </section>

        <section class="card legal-card">
          <h2>Du score au rang affiché</h2>
          <p>Le modèle de classification est binaire (élo haut vs bas), donc pas directement un rang. Une étape de calibration transforme la probabilité moyenne de l'ensemble en un rang précis : on mesure comment cette probabilité se distribue par rang réel sur le référentiel, puis on place un joueur au rang calibré le plus proche de sa probabilité moyenne sur ses dernières games. Le niveau de confiance est toujours affiché explicitement à côté du rang estimé — jamais présenté comme une certitude.</p>
        </section>
      </div>
    </template>

    <!-- onglet Coaching IA -->
    <template v-if="tab === 'coaching'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>Le LLM ne voit pas la game, il raconte un diff chiffré</h2>
          <p>Le modèle de langage ne reçoit jamais de vidéo, de timeline brute ou de log d'événements. Il reçoit un <strong>payload déterministe</strong>, déjà réduit à l'essentiel : les features du joueur comparées à celles du référentiel, à issue et contexte égaux. La qualité du récit dépend de la qualité de ce payload, pas de l'intelligence du modèle — cohérent avec le principe « features d'abord » (onglet Data Science).</p>
        </section>

        <section class="card legal-card">
          <h2>Construction du payload — safe-only</h2>
          <p>Le payload est assemblé à partir du gold (perso + référentiel). Il applique strictement le manifeste d'asymétrie de l'onglet Features : seules les features <strong>COACHING_SAFE</strong> du positionnement y figurent ; la profondeur de carte y est marquée explicitement <span class="mono">descriptive_only</span> pour empêcher le LLM de la formuler comme un reproche. Le payload est déterministe — deux exécutions sur les mêmes games produisent le même contenu, seule la formulation du LLM peut varier.</p>
        </section>

        <section class="card legal-card">
          <h2>Le prompt — deux règles cardinales</h2>
          <p>Le prompt système encode explicitement les deux contraintes qui traversent tout le projet, pour que le modèle ne les redécouvre pas tout seul :</p>
          <ul>
            <li><strong>Asymétrie</strong> — ne jamais juger une décision sur une information que le joueur n'avait pas au moment où il l'a prise.</li>
            <li><strong>Preuve chiffrée obligatoire</strong> — toute affirmation doit s'appuyer sur un chiffre comparatif issu du payload (le tien vs le référentiel). Une affirmation sans preuve n'est pas gardée.</li>
          </ul>
          <p>Le reste du prompt est en français, écrit pour un ton direct et actionnable plutôt qu'un compte-rendu de stats.</p>
        </section>

        <section class="card legal-card">
          <h2>Sortie strictement typée</h2>
          <p>Le LLM ne répond pas en texte libre : la sortie est contrainte par un schéma JSON (validé par Pydantic) pour éviter les résumés qui partent en vrille. La structure imposée :</p>
          <ul>
            <li><span class="mono">strengths[1..3]</span> — 1 à 3 points forts</li>
            <li><span class="mono">mistakes[3]</span> — 3 erreurs prioritaires</li>
            <li><span class="mono">habits[2]</span> — 2 habitudes à corriger</li>
            <li><span class="mono">next_focus[1]</span> — 1 seul focus pour la prochaine game</li>
            <li><span class="mono">confidence</span> — niveau de confiance du modèle sur sa propre analyse</li>
          </ul>
          <p>Chaque force et chaque erreur porte son <span class="mono">evidence</span> — la preuve chiffrée qui la justifie, fusionnée dans le même objet plutôt que laissée en annexe.</p>
          <p>La borne basse des forces est passée de 3 à 1 après lecture des annotations : exiger exactement trois forces poussait le modèle au remplissage, et c'était la cause des retours « trop vague ». Les erreurs restent à 3 (le compte-rendu doit trancher), les habitudes à 2.</p>
        </section>

        <section class="card legal-card">
          <h2>Le modèle</h2>
          <p>L'inférence passe par Ollama Cloud plutôt qu'un modèle local, avec sortie au format JSON-schema. Le modèle par défaut a été retenu après un A/B test entre plusieurs candidats sur la qualité du récit produit — surclassable via une option si besoin, mais un choix par défaut délibéré plutôt qu'arbitraire.</p>
        </section>
      </div>
    </template>

    <!-- onglet Feedback -->
    <template v-if="tab === 'feedback'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>Pourquoi mesurer, pas juste générer</h2>
          <p>Sans boucle de feedback, impossible de savoir si le coach s'améliore ou s'il raconte juste des choses plausibles. Un coaching benchmarké (onglet Vue d'ensemble) est intrinsèquement plus vérifiable qu'une opinion absolue de LLM — encore faut-il collecter si le joueur, lui, le juge utile.</p>
        </section>

        <section class="card legal-card">
          <h2>Annoter, insight par insight</h2>
          <p>Chaque insight généré (une force, une erreur, une habitude ou le focus) est annotable indépendamment des autres — pas un score global sur toute la review, qui diluerait le signal. Deux façons d'annoter, qui écrivent dans le même fichier :</p>
          <ul>
            <li><strong>CLI</strong> — <span class="mono">feedback.py annotate --player X</span> parcourt chaque insight persisté et demande utile / faux / passer, plus une note libre optionnelle.</li>
            <li><strong>Web</strong> — un ✓/✗ directement sous chaque item de la review, avec un champ de note libre qui apparaît une fois l'item noté, envoyé au même endpoint que le CLI.</li>
          </ul>
        </section>

        <section class="card legal-card">
          <h2>Le tag, la note, et pourquoi les deux comptent</h2>
          <p>Un jugement négatif (✗) impose de choisir un tag parmi une liste fermée : <em>asymétrie</em>, <em>stat inventée</em>, <em>profondeur en faute</em>, <em>trop vague</em>, <em>non actionnable</em>, <em>autre</em>. Chaque tag correspond à une façon typique dont un coaching automatisé peut se planter. Mais le tag dit seulement <strong>quoi</strong> est faux ; la note libre associée dit <strong>pourquoi</strong> — c'est elle qui guide la correction du prompt ou des features sans avoir à deviner à partir du seul tag.</p>
        </section>

        <section class="card legal-card">
          <h2>Le critère de succès, chiffré et publié</h2>
          <p>La boucle n'a de valeur que si elle porte un seuil décidé <strong>avant</strong> de regarder les résultats : <strong>≥70 % d'erreurs jugées utiles sur au moins 10 analyses de parties annotées</strong>. La métrique ne retient que les erreurs des analyses par-partie, parce que ce sont les seules vérifiables moment par moment (une habitude multi-games ne l'est pas). Le taux courant est affiché en haut de l'onglet Coaching d'un compte, atteint ou non : un chiffre qu'on ne publierait que s'il est bon ne prouve rien. Chaque analyse persistée porte aussi la trace de son run (version de prompt, modèle, latence, tokens), sans quoi une variation du taux ne serait attribuable ni au prompt ni au modèle.</p>
        </section>

        <section class="card legal-card">
          <h2>Ce que révèle l'agrégation</h2>
          <p>Le résumé des annotations calcule un taux d'utilité par section (forces / erreurs / habitudes / focus), les tags les plus fréquents, une ventilation par modèle LLM utilisé (utile pour comparer objectivement deux modèles sur le même joueur), et signale explicitement les tendances calculées sur un petit échantillon (moins de 10 annotations) pour ne pas en tirer de conclusion prématurée. Jusqu'à deux verbatims de note libre sont conservés par tag, pour garder la nuance qu'un simple pourcentage effacerait.</p>
        </section>
      </div>
    </template>

    <div class="legal-footer-nav">
      <a href="/" class="btn btn-secondary" @click.prevent="goHome">← Retour à l'accueil</a>
      <a href="/terms" class="btn btn-secondary" @click.prevent="goTerms">Conditions d'utilisation</a>
      <a href="/privacy" class="btn btn-secondary" @click.prevent="goPrivacy">Politique de confidentialité →</a>
    </div>
  </div>
</template>
