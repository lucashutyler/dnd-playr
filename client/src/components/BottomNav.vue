<script setup>
defineProps({
  modelValue: { type: String, required: true },
  fightCount: { type: Number, default: 0 },
})

defineEmits(['update:modelValue'])

/*
 * Two. Party and the fight were separate tabs until a playtest pointed out
 * that during combat they are read together, so they share a screen now.
 * Resist a third.
 */
const TABS = [
  { id: 'me', label: 'Me' },
  { id: 'table', label: 'The table' },
]
</script>

<template>
  <nav class="nav" aria-label="Sections">
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      :class="{ on: modelValue === tab.id }"
      :aria-current="modelValue === tab.id ? 'page' : undefined"
      @click="$emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
      <span v-if="tab.id === 'table' && fightCount" class="count">{{ fightCount }}</span>
    </button>
  </nav>
</template>

<style scoped>
.nav {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  border-top: 1px solid var(--c-border);
  /* Sits above the home indicator rather than under it. */
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--c-surface);
}

button {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-height: 3.5rem;
  border: none;
  background: none;
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 500;
}

button.on {
  color: var(--c-accent);
}

/* A quiet marker rather than a whole icon set. */
button.on::before {
  content: '';
  position: absolute;
  top: 0;
  width: 2.5rem;
  height: 2px;
  border-radius: 0 0 var(--r-pill) var(--r-pill);
  background: var(--c-accent);
}

.count {
  min-width: 1.25rem;
  padding: 0 var(--s-1);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
  font-variant-numeric: tabular-nums;
}

button.on .count {
  background: var(--c-accent);
  color: var(--c-on-accent);
}
</style>
