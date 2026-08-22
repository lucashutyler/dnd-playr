<script setup>
import { computed, nextTick, ref } from 'vue'
import BottomNav from './BottomNav.vue'
import CharacterChooser from './CharacterChooser.vue'
import CharacterSheet from './CharacterSheet.vue'
import EnemyLedger from './EnemyLedger.vue'
import PartyView from './PartyView.vue'
import UndoToast from './UndoToast.vue'
import { useSession } from '../composables/useSession.js'

const { session, enemies, connection, live, myCharacter, renameRoom, setArchived } = useSession()

const tab = ref('me')

const editingName = ref(false)
const draft = ref('')
const nameInput = ref(null)

const showCode = ref(false)

const offline = computed(() => connection.value !== 'open')
const activeEnemies = computed(() => enemies.value.filter((e) => e.status === 'active').length)

async function editName() {
  if (!live.value) return
  draft.value = session.value.name
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

function commitName() {
  editingName.value = false
  if (draft.value.trim() !== session.value.name) renameRoom(draft.value)
}
</script>

<template>
  <div class="room">
    <header class="bar">
      <input
        v-if="editingName"
        ref="nameInput"
        v-model="draft"
        class="name-edit"
        maxlength="60"
        aria-label="Room name"
        @keyup.enter="commitName"
        @keyup.escape="editingName = false"
        @blur="commitName"
      />
      <button v-else class="name" type="button" @click="editName">
        {{ session.name || 'Untitled room' }}
      </button>

      <button
        class="code"
        type="button"
        :aria-expanded="showCode"
        aria-label="Room code"
        @click="showCode = !showCode"
      >
        <i class="dot" :class="connection" aria-hidden="true" />
        {{ session.code }}
      </button>
    </header>

    <p v-if="showCode" class="share">
      Anyone can join at this room's code:
      <strong>{{ session.code }}</strong>
      <template v-if="session.hasPassphrase"> — they will need the passphrase too.</template>
    </p>

    <!--
      A closed room still works for whoever is already inside, so that reopening
      it is one tap rather than a rejoin. It just will not take anyone new.
    -->
    <div v-if="session.archived" class="closed" role="status">
      <p>
        <strong>This room is closed.</strong>
        Nothing has been deleted — nobody new can join until it is reopened.
      </p>
      <button type="button" :disabled="!live" @click="setArchived(false)">Reopen it</button>
    </div>

    <!-- Only once it has actually been down a moment; see the reconnect delay. -->
    <p v-if="offline" class="banner" role="status">
      {{ connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…' }}
      Changes will not send until this clears.
    </p>

    <!--
      v-show rather than v-if: switching tabs must not throw away a half-typed
      enemy name or an open editor. Three small lists cost nothing to keep
      mounted, and it means a reconnect cannot lose them either.
    -->
    <main class="content">
      <section v-show="tab === 'me'">
        <CharacterSheet v-if="myCharacter" :character="myCharacter" />
        <CharacterChooser v-else />
      </section>

      <section v-show="tab === 'party'">
        <PartyView />
      </section>

      <section v-show="tab === 'fight'">
        <EnemyLedger />
      </section>
    </main>

    <UndoToast />
    <BottomNav v-model="tab" :fight-count="activeEnemies" />
  </div>
</template>

<style scoped>
.room {
  max-width: var(--page-max);
  margin-inline: auto;
  /* Clear of the fixed nav, so the last control is never trapped under it. */
  padding: var(--s-3) var(--s-4) calc(4.5rem + env(safe-area-inset-bottom));
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
}

.name,
.name-edit {
  flex: 1;
  min-width: 0;
  min-height: var(--tap);
  padding-inline: var(--s-2);
  border: none;
  border-radius: var(--r-1);
  background: none;
  font-family: var(--f-display);
  font-size: var(--t-lg);
  font-weight: 600;
  text-align: left;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name-edit {
  border: 1px solid var(--c-accent);
  background: var(--c-bg);
}

.code {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--s-2);
  min-height: var(--tap);
  padding-inline: var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-accent);
  font-family: var(--f-mono);
  font-size: var(--t-sm);
  font-weight: 700;
  letter-spacing: 0.15em;
}

.dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--c-text-dim);
  opacity: 0.5;
}

.dot.open {
  background: var(--c-ok);
  opacity: 1;
}

.dot.reconnecting {
  background: var(--c-accent);
  opacity: 1;
}

.share {
  margin-top: var(--s-2);
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-2);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
  text-wrap: pretty;
}

.closed {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin-top: var(--s-2);
  padding: var(--s-3);
  border: 1px solid var(--c-danger);
  border-radius: var(--r-2);
  font-size: var(--t-xs);
  text-wrap: pretty;
}

.closed p {
  flex: 1;
}

.closed button {
  flex-shrink: 0;
  min-height: var(--tap);
  padding-inline: var(--s-3);
  border: none;
  border-radius: var(--r-2);
  background: var(--c-accent);
  color: var(--c-on-accent);
  font-size: var(--t-sm);
}

.banner {
  margin-top: var(--s-2);
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-2);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.content {
  margin-top: var(--s-3);
}
</style>
