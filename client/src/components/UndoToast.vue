<script setup>
import { useSession } from '../composables/useSession.js'

const { toast, undoLast, dismissToast } = useSession()
</script>

<template>
  <div v-if="toast" class="toast" role="status">
    <span class="what">{{ toast.label }}</span>
    <button type="button" class="undo" @click="undoLast">Undo</button>
    <button type="button" class="close" aria-label="Dismiss" @click="dismissToast">×</button>
  </div>
</template>

<style scoped>
/*
 * Sits above the nav rather than over the content, so the thing you just
 * changed stays visible while you decide whether you meant it.
 */
.toast {
  position: fixed;
  inset-inline: var(--s-3);
  bottom: calc(3.5rem + env(safe-area-inset-bottom) + var(--s-2));
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4);
  border-radius: var(--r-pill);
  background: var(--c-text);
  box-shadow: var(--shadow-2);
  color: var(--c-bg);
}

.what {
  flex: 1;
  overflow: hidden;
  font-size: var(--t-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.undo {
  min-height: var(--tap);
  padding-inline: var(--s-3);
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-accent);
  color: var(--c-on-accent);
  font-size: var(--t-sm);
  font-weight: 600;
}

.close {
  width: var(--tap);
  height: var(--tap);
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--c-bg);
  font-size: var(--t-lg);
  opacity: 0.7;
}

/*
 * A plain CSS entrance rather than <Transition>. The state machine there has
 * to be driven by animation frames, and a toast that can wedge half-faded over
 * the controls is worse than one that simply appears.
 */
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
}

.toast {
  animation: rise 0.15s ease;
}
</style>
