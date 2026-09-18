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
        <span class="current">Politique de confidentialité</span>
      </div>
      <h1 class="legal-title">Politique de Confidentialité</h1>
      <p class="legal-meta">
        <span class="badge badge-legal">Protection des données</span>
        <span>Dernière mise à jour : Mars 2026</span>
        <span class="legal-sep">·</span>
        <span>Conforme RGPD (UE 2016/679) &amp; Riot API</span>
      </p>
    </div>

    <!-- Bannière Engagement de Confidentialité -->
    <div class="card legal-disclaimer-card privacy-accent">
      <div class="legal-disclaimer-inner">
        <div class="legal-disclaimer-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="var(--primary)" stroke-width="2" fill="rgba(14, 187, 212, 0.1)"/>
            <path d="M9 12l2 2 4-4" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="legal-disclaimer-content">
          <strong>Engagement de transparence et de minimisation des données</strong>
          <p>
            RiftSense traite exclusivement des données statistiques publiques de parties issues de l'API Riot Games. Nous ne demandons <strong>jamais</strong> de mot de passe, de données bancaires, ni d'informations d'identification privée de votre compte Riot.
          </p>
        </div>
      </div>
    </div>

    <!-- Executive Summary for Riot Reviewers -->
    <div class="card legal-card legal-reviewer-box">
      <div class="legal-reviewer-badge">Privacy &amp; Compliance Summary (EN)</div>
      <p class="legal-reviewer-text">
        <strong>RiftSense</strong> complies with the European General Data Protection Regulation (GDPR) and Riot Games Developer Policies.
      </p>
      <ul class="legal-reviewer-list">
        <li><strong>Data Sources:</strong> Only publicly available match data provided by Riot Games official endpoints (PUUID, Match-V5, Account-V1, League-V4) and local device cache.</li>
        <li><strong>Data Exclusions:</strong> Zero account passwords, zero Riot email addresses, zero payment details, zero commercial tracking cookies.</li>
        <li><strong>User Rights:</strong> Full right of access, rectification, and erasure. Players can request immediate cache deletion by emailing <code>contact@jeanvg.fr</code> (processed within 48h).</li>
      </ul>
    </div>

    <div class="legal-sections">
      <!-- Section 1 -->
      <section class="card legal-card" id="responsable">
        <h2>1. Responsable du traitement des données</h2>
        <p>
          Le responsable du traitement des données pour le site <strong>RiftSense</strong> (<code>riftsense.jeanvg.fr</code>) est :
        </p>
        <p>
          <strong>Jean Van Gysel</strong><br>
          Courriel de contact : <a href="mailto:contact@jeanvg.fr">contact@jeanvg.fr</a>
        </p>
      </section>

      <!-- Section 2 -->
      <section class="card legal-card" id="donnees-collectees">
        <h2>2. Données collectées et sources</h2>
        <p>RiftSense traite deux catégories restreintes de données :</p>

        <h3 class="legal-subheading">A. Données publiques de jeu (via l'API officielle Riot Games)</h3>
        <ul>
          <li><strong>Identifiant Riot public :</strong> Nom d'invocateur et tagline (ex. <code>Spadzze#EUW</code>).</li>
          <li><strong>Identifiant technique anonymisé :</strong> Le PUUID (Player Universally Unique Identifier) attribué par Riot Games.</li>
          <li><strong>Historique de parties classées :</strong> Identifiants de parties (Match IDs) en file Solo/Duo.</li>
          <li><strong>Métriques de partie :</strong> Positions spatiales horodatées (timeline toutes les 60 secondes), champions joués, KDA, CS, or accumulé, objets achetés, balises de vision et runes.</li>
        </ul>

        <h3 class="legal-subheading">B. Données de navigation locale (sur votre terminal)</h3>
        <ul>
          <li><strong>Historique de consultation récent :</strong> Stocké exclusivement dans le <code>localStorage</code> de votre navigateur (clé <code>riftsense_recent_accounts</code>). Ces données restent sur votre machine et ne sont jamais transmises à des tiers.</li>
          <li><strong>Session de coaching optionnelle :</strong> Le cas échéant, un jeton de session chiffré dans le <code>localStorage</code> (clé <code>riftsense_coach_pwd</code>) pour l'accès aux revues de match approfondies.</li>
        </ul>
      </section>

      <!-- Section 3 -->
      <section class="card legal-card" id="donnees-exclues">
        <h2>3. Données formellement exclues</h2>
        <p>RiftSense ne collecte, ne stocke et ne traite <strong>aucune</strong> des données suivantes :</p>
        <ul>
          <li><strong>Aucun mot de passe</strong> ou identifiant de connexion de votre compte Riot Games.</li>
          <li><strong>Aucune adresse email</strong> associée à votre compte Riot Games.</li>
          <li><strong>Aucune information de paiement</strong>, de facturation ou bancaire.</li>
          <li><strong>Aucune communication privée</strong> (messagerie de jeu, liste d'amis, chat textuel ou vocal).</li>
          <li><strong>Aucun cookie publicitaire</strong> ni traqueur d'analyse tiers (pas de Google Analytics, pas de Facebook Pixel).</li>
        </ul>
      </section>

      <!-- Section 4 -->
      <section class="card legal-card" id="finalites">
        <h2>4. Finalités et bases légales du traitement</h2>
        <p>Les données sont collectées et traitées sur la base de l'intérêt légitime (art. 6.1.f du RGPD) pour les finalités suivantes :</p>
        <ul>
          <li>Afficher les statistiques de performance de jeu et l'historique récent des parties.</li>
          <li>Calculer les indicateurs de positionnement (lane patterns, morts évitables, présence sur objectifs).</li>
          <li>Calculer le modèle d'explicabilité SHAP et estimer le rang par Machine Learning (EBM / XGBoost).</li>
          <li>Générer des retours pédagogiques post-partie (coaching automatisé).</li>
        </ul>
      </section>

      <!-- Section 5 -->
      <section class="card legal-card" id="decision-automatique">
        <h2>5. Traitement automatisé et Machine Learning (RGPD Art. 22)</h2>
        <p>
          RiftSense applique des algorithmes d'apprentissage automatique (Explainable Boosting Machine &amp; valeurs de Shapley SHAP) pour estimer le rang compétitif d'un joueur et expliquer statistiquement les forces et axes d'amélioration.
        </p>
        <p>
          Ce traitement a une portée <strong>exclusivement informative, statistique et pédagogique</strong>. Il ne produit aucune décision entièrement automatisée produisant des effets juridiques ou affectant les utilisateurs de manière significative au sens de l'Article 22 du RGPD. Les détails complets du protocole d'entraînement et d'évaluation sont accessibles publiquement dans la section <a href="/readme" @click.prevent="router.push('/readme')">À propos &amp; Méthode</a>.
        </p>
      </section>

      <!-- Section 6 -->
      <section class="card legal-card" id="sous-traitants">
        <h2>6. Hébergement et sous-traitants</h2>
        <p>L'infrastructure technique de RiftSense s'appuie sur des prestataires reconnus pour leur niveau élevé de sécurité :</p>
        <ul>
          <li><strong>Cloudflare Inc. :</strong> Hébergement edge serverless (Cloudflare Workers), réseau de diffusion (CDN), mise en cache chiffrée (Cloudflare KV) et stockage d'objets (Cloudflare R2). Données hébergées en conformité avec les clauses contractuelles types de l'UE.</li>
          <li><strong>Riot Games, Inc. :</strong> Fournisseur source des données publiques de match via l'API développeur.</li>
        </ul>
      </section>

      <!-- Section 7 -->
      <section class="card legal-card" id="duree">
        <h2>7. Durée de conservation</h2>
        <ul>
          <li><strong>Données de parties :</strong> Conservées en cache pour une durée maximale correspondant à la saison compétitive en cours, ou invalidées périodiquement lors des déploiements de patchs majeurs de League of Legends.</li>
          <li><strong>Données locales de navigation :</strong> Conservées dans votre navigateur jusqu'à effacement manuel de vos données de navigation ou suppression via l'interface du site.</li>
        </ul>
      </section>

      <!-- Section 8 -->
      <section class="card legal-card" id="droits">
        <h2>8. Vos droits (RGPD) &amp; droit à l'effacement</h2>
        <p>
          Conformément au Règlement Général sur la Protection des Données (RGPD), vous bénéficiez des droits suivants :
        </p>
        <ul>
          <li><strong>Droit d'accès et d'information :</strong> Obtenir confirmation que des données vous concernant sont traitées.</li>
          <li><strong>Droit à l'effacement (« Droit à l'oubli ») :</strong> Si vous souhaitez que votre Riot ID et l'ensemble des données de parties associées soient définitivement retirés du cache de RiftSense, il vous suffit de nous adresser une demande par courriel à <a href="mailto:contact@jeanvg.fr">contact@jeanvg.fr</a> en mentionnant votre Riot ID (ex: <code>Pseudo#Tag</code>). Le profil sera radié sous 48 heures ouvrées.</li>
          <li><strong>Effacement immédiat de vos données locales :</strong> Vous pouvez supprimer votre compte des récents à tout moment en cliquant sur la croix <code>×</code> dans le sélecteur de joueurs en haut de page, ou en vidant le cache de votre navigateur.</li>
        </ul>
      </section>

      <!-- Section 9 -->
      <section class="card legal-card" id="reclamation">
        <h2>9. Réclamation auprès d'une autorité de contrôle</h2>
        <p>
          Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous disposez du droit d'introduire une réclamation auprès de la <strong>CNIL</strong> (Commission Nationale de l'Informatique et des Libertés — <a href="https://www.cnil.fr" target="_blank" rel="noopener">cnil.fr</a>).
        </p>
      </section>
    </div>

    <div class="legal-footer-nav">
      <a href="/" class="btn btn-secondary" @click.prevent="goHome">← Retour à l'accueil</a>
      <a href="/readme" class="btn btn-secondary" @click.prevent="router.push('/readme')">À propos &amp; Méthode</a>
      <a href="/terms" class="btn btn-secondary" @click.prevent="router.push('/terms')">Conditions d'utilisation →</a>
    </div>
  </div>
</template>
