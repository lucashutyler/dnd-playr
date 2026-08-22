<script setup>
defineProps({
  variant: { type: String, default: 'default' },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
})
</script>

<template>
  <button :type="type" :disabled="disabled" :class="['btn', 'btn--' + variant]">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  /* Steppers get bigger still in Phase 3; this is the floor. */
  min-height: var(--tap-lg);
  padding: var(--s-3) var(--s-5);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
  box-shadow: var(--shadow-1);
  font-size: var(--t-lg);
  font-weight: 500;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.btn:hover:not(:disabled) {
  background: var(--c-surface-2);
}

.btn:active:not(:disabled) {
  transform: translateY(1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  border-color: transparent;
  background: var(--c-accent);
  color: var(--c-on-accent);
}

.btn--primary:hover:not(:disabled) {
  background: var(--c-accent-hover);
}

.btn--ghost {
  min-height: var(--tap);
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  color: var(--c-text-dim);
  font-size: var(--t-sm);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--c-surface-2);
}
</style>
