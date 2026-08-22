<script setup>
import { ref, watch } from 'vue'
import AppButton from './AppButton.vue'
import AppField from './AppField.vue'
import { useSession } from '../composables/useSession.js'

const { busy, error, needsPassphrase, closedRoom, createRoom, joinRoom, clearError } = useSession()

// 'menu' | 'create' | 'join'
const mode = ref('menu')

const roomName = ref('')
const displayName = ref('')
const passphrase = ref('')
const code = ref('')

function show(next) {
  mode.value = next
  clearError()
}

function back() {
  mode.value = 'menu'
  passphrase.value = ''
  clearError()
}

watch(code, clearError)

async function submitCreate() {
  await createRoom({
    name: roomName.value,
    displayName: displayName.value,
    passphrase: passphrase.value,
  })
}

async function submitJoin(restore) {
  await joinRoom({
    code: code.value,
    displayName: displayName.value,
    passphrase: passphrase.value,
    // Strict, because a submit handler is called with the Event. Anything but
    // a literal true would otherwise reopen a closed room by accident.
    restore: restore === true,
  })
}
</script>

<template>
  <main class="page">
    <header class="masthead">
      <h1 class="wordmark">dnd&#8203;-playr</h1>
      <p class="tagline">A shared bookkeeper for your table.</p>
    </header>

    <section class="panel">
      <div v-if="mode === 'menu'" class="stack">
        <AppButton variant="primary" @click="show('create')">Create a room</AppButton>
        <AppButton @click="show('join')">Join with a code</AppButton>
      </div>

      <form v-else-if="mode === 'create'" class="stack" @submit.prevent="submitCreate">
        <AppField
          v-model="roomName"
          label="Room name"
          placeholder="Tuesday Night"
          :maxlength="60"
        />
        <AppField v-model="displayName" label="Your name" placeholder="Sam" :maxlength="40" />
        <AppField
          v-model="passphrase"
          label="Passphrase"
          type="password"
          hint="Optional. Add one if you play somewhere public."
          :maxlength="200"
          autocomplete="new-password"
        />
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <AppButton variant="primary" type="submit" :disabled="busy">
          {{ busy ? 'Creating...' : 'Create the room' }}
        </AppButton>
        <AppButton variant="ghost" @click="back">Back</AppButton>
      </form>

      <form v-else class="stack" @submit.prevent="submitJoin()">
        <AppField
          v-model="code"
          label="Room code"
          placeholder="KTZP"
          code
          :maxlength="6"
          hint="Four letters, from whoever made the room."
        />
        <AppField v-model="displayName" label="Your name" placeholder="Sam" :maxlength="40" />
        <AppField
          v-if="needsPassphrase"
          v-model="passphrase"
          label="Passphrase"
          type="password"
          hint="This room is protected."
          :maxlength="200"
          autocomplete="current-password"
        />
        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <div v-if="closedRoom === code.trim().toUpperCase()" class="closed">
          <p>That room is closed. Reopening it puts everything back exactly as it was.</p>
          <AppButton variant="primary" :disabled="busy" @click="submitJoin(true)">
            Reopen and join
          </AppButton>
        </div>

        <AppButton v-else variant="primary" type="submit" :disabled="busy || code.length < 4">
          {{ busy ? 'Joining...' : 'Join' }}
        </AppButton>
        <AppButton variant="ghost" @click="back">Back</AppButton>
      </form>
    </section>
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
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: var(--s-2);
  /* Keeps the form in the bottom third, where a thumb lives. */
  min-height: 8rem;
}

.wordmark {
  font-family: var(--f-display);
  font-size: var(--t-2xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.tagline {
  color: var(--c-text-dim);
  text-wrap: balance;
}

.panel {
  padding-block: var(--s-5);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.error {
  color: var(--c-danger);
  font-size: var(--t-sm);
}

.closed {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
}

.closed p {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  text-wrap: pretty;
}
</style>
