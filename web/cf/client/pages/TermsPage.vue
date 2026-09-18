<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

function goHome(): void {
  void router.push("/");
}
</script>

<template>
  <div class="legal-page">
    <div class="legal-header">
      <div class="legal-breadcrumbs">
        <a href="/" @click.prevent="goHome">Accueil</a>
        <span class="legal-sep">/</span>
        <span class="current">Conditions d'utilisation</span>
      </div>
      <h1 class="legal-title">Conditions Générales d'Utilisation</h1>
      <p class="legal-meta">
        <span class="badge badge-legal">Réglementaire</span>
        <span>Dernière mise à jour : Mars 2026</span>
        <span class="legal-sep">·</span>
        <span>Conforme aux Riot Developer Policies</span>
      </p>
    </div>

    <!-- Bannière Riot Games Disclaimer -->
    <div class="card legal-disclaimer-card">
      <div class="legal-disclaimer-inner">
        <div class="legal-disclaimer-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <circle cx="12" cy="12" r="10" stroke="var(--primary)" stroke-width="2"/>
            <line x1="12" y1="8" x2="12" y2="12" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="16" r="1" fill="var(--primary)"/>
          </svg>
        </div>
        <div class="legal-disclaimer-content">
          <strong>Avis légal officiel Riot Games (Official Riot Legal Disclaimer)</strong>
          <p class="legal-quote">
            « RiftSense isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc. »
          </p>
        </div>
      </div>
    </div>

    <!-- Executive Summary for Riot Reviewers -->
    <div class="card legal-card legal-reviewer-box">
      <div class="legal-reviewer-badge">Developer Compliance Summary (EN)</div>
      <p class="legal-reviewer-text">
        <strong>RiftSense</strong> is a personal, non-commercial educational project providing post-match statistical analysis, position timeline metrics, and explainable machine learning models (EBM &amp; SHAP) for League of Legends players.
      </p>
      <ul class="legal-reviewer-list">
        <li><strong>Zero Real-Time Assistance:</strong> Operates strictly post-match using official Match-V5 and Account-V1 APIs. No live game overlays, no memory reading, no automated gameplay interference.</li>
        <li><strong>Non-Commercial &amp; Free:</strong> Completely free public access. No paid subscriptions, no paywalling of Riot data.</li>
        <li><strong>Privacy &amp; Data Rights:</strong> No Riot account credentials or emails collected. Immediate data deletion upon request at <code>contact@jeanvg.fr</code>.</li>
      </ul>
    </div>

    <div class="legal-sections">
      <!-- Section 1 -->
      <section class="card legal-card" id="objet">
        <h2>1. Présentation du service, objet &amp; acceptation</h2>
        <p>
          <strong>RiftSense</strong> (accessible à l'adresse <code>riftsense.jeanvg.fr</code>) est un service web d'analyse statistique rétrospective, d'explicabilité par apprentissage automatique (SHAP / EBM) et de coaching post-partie dédié aux joueurs de <em>League of Legends</em>.
        </p>
        <p>
          L'accès et l'utilisation de RiftSense impliquent l'acceptation pleine et entière des présentes Conditions Générales d'Utilisation. L'utilisateur reconnaît avoir pris connaissance de ces règles avant toute consultation ou synchronisation de profil.
        </p>
      </section>

      <!-- Section 2 -->
      <section class="card legal-card" id="riot-policy">
        <h2>2. Conformité aux politiques Riot Games &amp; API</h2>
        <p>
          RiftSense est développé et exploité dans le respect strict des <a href="https://developer.riotgames.com/policies/general" target="_blank" rel="noopener">Riot Games Developer Policies</a> et des <a href="https://developer.riotgames.com/terms" target="_blank" rel="noopener">Riot Games API Terms and Conditions</a>.
        </p>
        <ul>
          <li>RiftSense utilise exclusivement les points de terminaison officiels fournis par l'API Riot Games (Match-V5, Account-V1, League-V4).</li>
          <li>RiftSense respecte les quotas de requêtes (rate limits) assignés par Riot Games et intègre un mécanisme de repli (backoff) en cas de code HTTP 429.</li>
          <li>RiftSense n'incite en aucune manière à contourner les limitations techniques fixées par Riot Games.</li>
        </ul>
      </section>

      <!-- Section 3 -->
      <section class="card legal-card" id="fair-play">
        <h2>3. Analyse post-partie &amp; Fair-Play (Zero Real-Time Gameplay Assistance)</h2>
        <p>
          RiftSense est conçu pour promouvoir le progrès et l'apprentissage équitable sur la Faille de l'Invocateur :
        </p>
        <ul>
          <li><strong>Strictement post-game :</strong> Toutes les analyses de positionnement, de laning et de prise de décision s'appuient exclusivement sur la timeline des parties déjà terminées (Match-V5 Timeline).</li>
          <li><strong>Zéro assistance en direct :</strong> RiftSense n'interagit pas avec le client de jeu en cours, ne lit pas la mémoire du jeu pendant une partie, et ne fournit aucun overlay, HUD dynamique ou assistance d'aide à la décision en temps réel (« zero real-time gameplay assistance »).</li>
          <li><strong>Respect de l'asymétrie d'information :</strong> Les analyses méthodologiques de RiftSense ne reprochent jamais à un joueur une action basée sur une information cachée par le brouillard de guerre au moment de l'action.</li>
        </ul>
      </section>

      <!-- Section 4 -->
      <section class="card legal-card" id="access">
        <h2>4. Usage personnel non commercial &amp; gratuité</h2>
        <p>
          RiftSense est un projet indépendant à vocation éducative et personnelle. L'accès et l'utilisation du service sont strictement réservés à un <strong>usage personnel et non commercial</strong> :
        </p>
        <ul>
          <li>Toutes les fonctionnalités publiques (recherche de joueur, affichage de l'historique, métriques de macro-jeu, estimation de rang ML et visualisations SHAP) sont mises à disposition <strong>gratuitement</strong>.</li>
          <li>Aucune donnée issue de l'API Riot Games n'est vendue, louée ou soumise à un péage obligatoire.</li>
          <li>L'extraction automatisée massive (scraping non sollicité), la revente de données ou toute exploitation commerciale non autorisée par écrit sont formellement interdites.</li>
        </ul>
        <p>
          Le service est fourni « en l'état » (AS IS) et « selon disponibilité ». L'éditeur met en œuvre tous les moyens raisonnables pour assurer un accès continu mais ne saurait garantir l'absence d'interruptions techniques liées à la maintenance, aux serveurs Cloudflare ou aux indisponibilités temporaires de l'API Riot Games.
        </p>
      </section>

      <!-- Section 5 -->
      <section class="card legal-card" id="propriete">
        <h2>5. Propriété intellectuelle</h2>
        <p>
          <strong>Actifs Riot Games :</strong> League of Legends, les illustrations, logos, icônes d'invocateurs, portraits de champions et données statistiques de jeu sont la propriété exclusive de Riot Games, Inc.
        </p>
        <p>
          <strong>Actifs RiftSense :</strong> Le code source original, l'architecture serverless Cloudflare Workers, les modèles statistiques prédictifs (EBM / Random Forest / XGBoost) et l'interface utilisateur sont la propriété de l'auteur de RiftSense et publiés sous licence libre MIT sur le <a href="https://github.com/JeanVG23/riftsense" target="_blank" rel="noopener">dépôt GitHub officiel</a>.
        </p>
      </section>

      <!-- Section 6 -->
      <section class="card legal-card" id="responsabilite">
        <h2>6. Limitation de responsabilité &amp; clause « AS IS »</h2>
        <p>
          <strong>Absence de garantie de performance en jeu :</strong> Les estimations de rang (ML Rank) et les conseils stratégiques fournis par RiftSense ont une finalité exclusivement statistique et pédagogique. RiftSense ne formule aucune promesse ou garantie quant au taux de victoire, au gain de points de ligue (LP) ou à la promotion de rang des utilisateurs.
        </p>
        <p>
          <strong>Pannes et indisponibilités :</strong> L'éditeur ne saurait être tenu responsable des dysfonctionnements, déconnexions, pertes de données ou erreurs imputables aux fournisseurs de réseau, aux navigateurs web tiers ou aux interruptions temporaires des services de Riot Games.
        </p>
      </section>

      <!-- Section 7 -->
      <section class="card legal-card" id="contact">
        <h2>7. Contact &amp; signalement</h2>
        <p>
          Pour toute question relative aux présentes Conditions Générales d'Utilisation ou pour signaler un dysfonctionnement, vous pouvez nous contacter :
        </p>
        <ul>
          <li>Par email : <a href="mailto:contact@jeanvg.fr">contact@jeanvg.fr</a></li>
          <li>Par GitHub : <a href="https://github.com/JeanVG23/riftsense/issues" target="_blank" rel="noopener">github.com/JeanVG23/riftsense/issues</a></li>
        </ul>
      </section>
    </div>

    <div class="legal-footer-nav">
      <a href="/" class="btn btn-secondary" @click.prevent="goHome">← Retour à l'accueil</a>
      <a href="/readme" class="btn btn-secondary" @click.prevent="router.push('/readme')">À propos &amp; Méthode</a>
      <a href="/privacy" class="btn btn-secondary" @click.prevent="router.push('/privacy')">Politique de confidentialité →</a>
    </div>
  </div>
</template>
