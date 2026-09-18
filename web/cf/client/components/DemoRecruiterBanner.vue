<script setup lang="ts">
type Tab = "history" | "coaching" | "shap";
type CoachingView = "overall" | "games";

const props = defineProps<{
  currentTab: Tab;
  currentCoachingView: CoachingView;
  targetMatchId?: string | null;
}>();

const emit = defineEmits<{
  (e: "select-view", tab: Tab, coachingView?: CoachingView, matchId?: string): void;
}>();
</script>

<template>
  <aside class="demo-banner" aria-label="Bandeau de démonstration technique">
    <div class="demo-banner-top">
      <div class="demo-badge">
        <span class="demo-badge-dot" aria-hidden="true"></span>
        <span class="demo-badge-text">MODE DÉMONSTRATION · PROFIL DE RÉFÉRENCE SPADZZE#EUW</span>
      </div>
    </div>

    <p class="demo-desc">
      Ce compte de référence illustre la restitution du pipeline : 47 701 matchs analysés, modèle EBM, attribution SHAP et coaching IA ancré.
    </p>

    <div class="demo-actions" role="toolbar" aria-label="Points d'entrée de la démo">
      <button
        type="button"
        class="demo-nav-btn"
        :class="{ active: currentTab === 'coaching' && currentCoachingView === 'games' }"
        @click="emit('select-view', 'coaching', 'games', 'EUW1_7898084645')"
      >
        <span class="demo-btn-num">1</span>
        <span class="demo-btn-label">Analyse de match horodatée</span>
      </button>

      <button
        type="button"
        class="demo-nav-btn"
        :class="{ active: currentTab === 'shap' }"
        @click="emit('select-view', 'shap')"
      >
        <span class="demo-btn-num">2</span>
        <span class="demo-btn-label">Modèle EBM &amp; Waterfall SHAP</span>
      </button>

      <button
        type="button"
        class="demo-nav-btn"
        :class="{ active: currentTab === 'history' }"
        @click="emit('select-view', 'history')"
      >
        <span class="demo-btn-num">3</span>
        <span class="demo-btn-label">Historique des 20 parties</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.demo-banner {
  margin: 0 0 24px;
  padding: 18px 22px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: var(--card-shadow);
}

.demo-banner-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.demo-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  border-radius: 999px;
  color: var(--primary);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: .06em;
}

.demo-badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.demo-desc {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-dim);
  margin: 0;
}

.demo-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.demo-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  background: var(--panel);
  border: 1px solid var(--border-soft);
  color: var(--text-dim);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition-base);
}

.demo-nav-btn:hover {
  background: var(--panel-hover);
  border-color: var(--border-strong);
  color: var(--text);
}

.demo-nav-btn.active {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 700;
}

.demo-btn-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface-alt);
  font-size: 10.5px;
  font-weight: 750;
}

.demo-nav-btn.active .demo-btn-num {
  background: var(--primary);
  color: var(--primary-text);
}

@media (max-width: 640px) {
  .demo-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .demo-nav-btn {
    justify-content: flex-start;
  }
}
</style>
