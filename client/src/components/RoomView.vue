<script setup>
import { nextTick, ref } from 'vue'
import AppButton from './AppButton.vue'
import { useSession } from '../composables/useSession.js'

const { session, member, members, connection, live, hasCharacter, leave, renameMe, renameRoom } =
  useSession()

// 'room' | 'me' | null
const editing = ref(null)
const draft = ref('')
const inputEl = ref(null)

const LABELS = {
  open: 'live',
  connecting: 'connecting',
  reconnecting: 'reconnecting',
  idle: 'offline',
}

async function edit(what, current) {
  if (!live.value) return
  editing.value = what
  draft.value = current
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
}

function commit() {
  if (editing.value === 'room') renameRoom(draft.value)
  else if (editing.value === 'me') renameMe(draft.value)
  editing.value = null
}
</script>

<template>
  <main class="page">
    <header class="head">
      <input
        v-if="editing === 'room'"
        ref="inputEl"
        v-model="draft"
        class="edit edit--name"
        maxlength="60"
        aria-label="Room name"
        @keyup.enter="commit"
        @keyup.escape="editing = null"
        @blur="commit"
      />
      <button v-else class="name" type="button" @click="edit('room', session.name)">
        {{ session.name || 'Untitled room' }}
      </button>

      <p class="code" :aria-label="'Room code ' + session.code.split('').join(' ')">
        {{ session.code }}
      </p>

      <p class="pill" :data-state="connection">
        <span class="dot" aria-hidden="true" />
        {{ LABELS[connection] }}
      </p>
    </header>

    <section class="roster">
      <h2 class="legend">At the table</h2>
      <ul>
        <li v-for="m in members" :key="m.id" :class="{ off: !m.online }">
          <span class="dot" :class="{ on: m.online }" aria-hidden="true" />

          <input
            v-if="editing === 'me' && m.id === member.id"
            ref="inputEl"
            v-model="draft"
            class="edit"
            maxlength="40"
            aria-label="Your name"
            @keyup.enter="commit"
            @keyup.escape="editing = null"
            @blur="commit"
          />
          <button
            v-else-if="m.id === member.id"
            class="who who--me"
            type="button"
            @click="edit('me', m.displayName)"
          >
            {{ m.displayName || 'Unnamed' }} <span class="tag">you</span>
          </button>
          <span v-else class="who">{{ m.displayName || 'Unnamed' }}</span>

          <span class="claim">{{ m.characterId ? '' : 'no character' }}</span>
        </li>
      </ul>
    </section>

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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-1);
}

.name {
  min-height: var(--tap);
  padding-inline: var(--s-2);
  border: none;
  border-radius: var(--r-1);
  background: none;
  font-family: var(--f-display);
  font-size: var(--t-xl);
  font-weight: 600;
}

.name:hover {
  background: var(--c-surface-2);
}

.code {
  color: var(--c-accent);
  font-family: var(--f-mono);
  font-size: var(--t-2xl);
  font-weight: 700;
  letter-spacing: 0.3em;
  /* The letter-spacing pads the right edge; pull it back to stay centred. */
  text-indent: 0.3em;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-2);
  padding: var(--s-1) var(--s-3);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--c-text-dim);
  opacity: 0.5;
}

.pill[data-state='open'] .dot,
.dot.on {
  background: var(--c-ok);
  opacity: 1;
}

.pill[data-state='reconnecting'] .dot {
  background: var(--c-accent);
  opacity: 1;
}

.roster {
  margin-top: var(--s-6);
}

.legend {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 500;
}

ul {
  margin-top: var(--s-2);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
  list-style: none;
}

li {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: var(--tap);
  padding: var(--s-2) var(--s-3);
}

li + li {
  border-top: 1px solid var(--c-border);
}

li.off .who {
  color: var(--c-text-dim);
}

.who {
  flex: 1;
  min-height: var(--tap);
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 0;
  border: none;
  background: none;
  text-align: left;
}

.who--me {
  font-weight: 600;
}

.tag {
  padding: 0 var(--s-2);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
  font-weight: 500;
}

.claim {
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.edit {
  flex: 1;
  min-height: var(--tap);
  padding: var(--s-1) var(--s-2);
  border: 1px solid var(--c-accent);
  border-radius: var(--r-1);
  background: var(--c-bg);
  font-size: var(--t-md);
}

.edit--name {
  font-family: var(--f-display);
  font-size: var(--t-xl);
  font-weight: 600;
  text-align: center;
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
