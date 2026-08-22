<script setup>
import AppButton from './AppButton.vue'
import { useSession } from '../composables/useSession.js'

const { session, member, hasCharacter, leave } = useSession()
</script>

<template>
  <main class="page">
    <header class="head">
      <p class="eyebrow">You are in</p>
      <h1 class="name">{{ session.name || 'this room' }}</h1>
      <p class="code" :aria-label="'Room code ' + session.code.split('').join(' ')">
        {{ session.code }}
      </p>
      <p class="meta">
        {{ session.memberCount }} {{ session.memberCount === 1 ? 'person' : 'people' }} seated
        <template v-if="session.hasPassphrase"> · passphrase set</template>
        <template v-if="session.locked"> · locked</template>
      </p>
    </header>

    <section class="card">
      <template v-if="hasCharacter">
        <h2>Your character</h2>
        <p class="muted">{{ member.characterId }}</p>
      </template>
      <template v-else>
        <h2>No character yet</h2>
        <p class="muted">
          You are seated but have not claimed a character. Picking one up, or rolling a new one,
          arrives in the next phase.
        </p>
      </template>
    </section>

    <footer class="foot">
      <AppButton variant="ghost" @click="leave">Leave this room on this device</AppButton>
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

.head {
  text-align: center;
}

.eyebrow {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
}

.name {
  font-family: var(--f-display);
  font-size: var(--t-xl);
  font-weight: 600;
}

.code {
  margin-block: var(--s-3);
  color: var(--c-accent);
  font-family: var(--f-mono);
  font-size: var(--t-2xl);
  font-weight: 700;
  letter-spacing: 0.3em;
  /* The letter-spacing pads the right edge; pull it back to stay centred. */
  text-indent: 0.3em;
}

.meta {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
}

.card {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--s-2);
  margin-block: var(--s-5);
  padding: var(--s-5);
  border: 1px solid var(--c-border);
  border-radius: var(--r-3);
  background: var(--c-surface);
  box-shadow: var(--shadow-1);
  text-align: center;
}

.card h2 {
  font-size: var(--t-lg);
  font-weight: 600;
}

.muted {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  text-wrap: pretty;
}

.foot {
  padding-bottom: var(--s-2);
}
</style>
