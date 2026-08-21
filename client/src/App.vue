<script setup>
import { onMounted, ref } from 'vue'

// Phase 0 proves the wiring: the client can reach the server through the proxy.
// The buttons below are inert until Phase 1 gives them rooms to create and join.
const status = ref('checking')

onMounted(async () => {
  try {
    const res = await fetch('/api/health')
    status.value = res.ok && (await res.json()).ok ? 'online' : 'offline'
  } catch {
    status.value = 'offline'
  }
})
</script>

<template>
  <main class="page">
    <header class="masthead">
      <h1 class="wordmark">dnd&#8203;-playr</h1>
      <p class="tagline">A shared bookkeeper for your table.</p>
    </header>

    <div class="actions">
      <button class="btn btn--primary" type="button" disabled>Create a room</button>
      <button class="btn" type="button" disabled>Join with a code</button>
    </div>

    <footer class="foot">
      <span class="pill" :data-status="status">
        <span class="dot" aria-hidden="true" />
        server {{ status }}
      </span>
    </footer>
  </main>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--s-5) var(--s-4);
}

.masthead {
  /* Sits in the upper-middle; the actions live in thumb reach below. */
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: var(--s-2);
}

.wordmark {
  font-family: var(--f-display);
  font-size: var(--t-2xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.tagline {
  color: var(--c-text-dim);
  font-size: var(--t-md);
  text-wrap: balance;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding-block: var(--s-6);
}

.btn {
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

.foot {
  display: flex;
  justify-content: center;
  padding-bottom: var(--s-2);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-1) var(--s-3);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
  font-variant: tabular-nums;
}

.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--c-text-dim);
}

.pill[data-status='online'] .dot {
  background: var(--c-ok);
}

.pill[data-status='offline'] .dot {
  background: var(--c-danger);
}
</style>
