<script setup lang="ts">
import { NEGATIVE_FEEDBACK_TAGS } from "../coaching";

interface FeedbackState {
  useful: boolean;
  tag?: string | null;
}

const props = withDefaults(defineProps<{
  kind: string;
  index: number;
  state?: FeedbackState | null;
  busy?: boolean;
  openKey?: string | null;
  prompt?: boolean;
}>(), {
  state: null,
  busy: false,
  openKey: null,
  prompt: false,
});

const emit = defineEmits<{
  vote: [kind: string, index: number, useful: boolean];
  tag: [kind: string, index: number, tag: string];
}>();

const key = `${props.kind},${props.index}`;
</script>

<template>
  <div :class="prompt ? 'global-focus-actions' : 'fb-compact-row'">
    <span v-if="prompt" class="fb-compact-prompt">Utile ?</span>
    <button
      type="button"
      class="fb-btn-compact"
      title="Cette recommandation est utile"
      :class="{ 'active-win': state?.useful === true }"
      :disabled="busy"
      @click="emit('vote', kind, index, true)"
    >👍</button>
    <button
      type="button"
      class="fb-btn-compact"
      title="Cette recommandation n'est pas utile"
      :class="{ 'active-loss': state?.useful === false }"
      :disabled="busy"
      @click="emit('vote', kind, index, false)"
    >👎</button>
    <div v-if="openKey === key" class="tag-menu">
      <span class="tag-menu-title">Motif de rejet :</span>
      <button
        v-for="item in NEGATIVE_FEEDBACK_TAGS"
        :key="item"
        type="button"
        class="tag-opt"
        @click="emit('tag', kind, index, item)"
      >{{ item }}</button>
    </div>
  </div>
</template>
