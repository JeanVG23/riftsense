<script setup lang="ts">
import { computed } from "vue";

interface CoachingJob {
  type: "coach" | "game-coach";
  status: "running" | "done" | "error";
  progress?: string;
  error?: string;
  matchId?: string;
  notice?: string;
}

const props = defineProps<{
  job?: CoachingJob | null;
}>();

const label = computed(() => {
  if (!props.job) return "";
  if (props.job.type === "game-coach") {
    if (props.job.status === "running") {
      return `Analyse de partie en cours… ${props.job.progress || ""}`.trim();
    }
    return props.job.status === "done" ? "✅ Analyse de partie prête" : "⛔ Erreur";
  }
  if (props.job.status === "running") {
    return `Coaching en cours… ${props.job.progress || ""}`.trim();
  }
  return props.job.status === "done" ? "✅ Coaching prêt" : "⛔ Erreur";
});
</script>

<template>
  <div v-if="job" class="job-banner" :class="{ err: job.status === 'error' }">
    <span aria-live="polite">{{ label }}</span>
    <span v-if="job.status === 'error' && job.error" class="faint">{{ job.error }}</span>
  </div>
</template>
