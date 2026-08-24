<script setup>
import { computed, ref } from 'vue'
import { useSession } from '../composables/useSession.js'

const { session, live, error, setPassphrase, setLocked, setArchived, setSlug } = useSession()

const editingSlug = ref(false)
const slugDraft = ref('')

const open = ref(false)
const editingPassphrase = ref(false)
const passphrase = ref('')

// Closing a room is the one thing here that earns a confirmation rather than
// just an undo offer, so it asks you to type the code back.
const closing = ref(false)
const confirmCode = ref('')

const codeMatches = computed(
  () => confirmCode.value.trim().toLowerCase() === session.value.urlId.toLowerCase(),
)

function startSlugEdit() {
  slugDraft.value = session.value.slug ?? ''
  editingSlug.value = true
}

function saveSlug() {
  const value = slugDraft.value.trim().toLowerCase()
  if (value.length < 3) return
  setSlug(value)
  editingSlug.value = false
}

function savePassphrase() {
  const value = passphrase.value.trim()
  if (value.length < 4) return
  setPassphrase(value)
  passphrase.value = ''
  editingPassphrase.value = false
}

function clearPassphrase() {
  setPassphrase(null)
  passphrase.value = ''
  editingPassphrase.value = false
}

function closeRoom() {
  if (!codeMatches.value) return
  setArchived(true)
  confirmCode.value = ''
  closing.value = false
}
</script>

<template>
  <section class="settings">
    <button type="button" class="disclose" :aria-expanded="open" @click="open = !open">
      Room settings
      <span aria-hidden="true">{{ open ? '−' : '+' }}</span>
    </button>

    <div v-if="open" class="body">
      <div class="setting">
        <div class="label">
          <strong>Passphrase</strong>
          <small>{{
            session.hasPassphrase
              ? 'Set. New players need it to join.'
              : 'None. The link alone gets anyone in.'
          }}</small>
        </div>

        <div v-if="editingPassphrase" class="edit">
          <input
            v-model="passphrase"
            type="password"
            autocomplete="new-password"
            placeholder="At least four characters"
            maxlength="200"
            aria-label="New passphrase"
            @keyup.enter="savePassphrase"
          />
          <button
            type="button"
            class="primary"
            :disabled="passphrase.trim().length < 4"
            @click="savePassphrase"
          >
            Save
          </button>
          <button type="button" @click="editingPassphrase = false">Cancel</button>
        </div>
        <div v-else class="row">
          <button type="button" :disabled="!live" @click="editingPassphrase = true">
            {{ session.hasPassphrase ? 'Change' : 'Set one' }}
          </button>
          <button
            v-if="session.hasPassphrase"
            type="button"
            :disabled="!live"
            @click="clearPassphrase"
          >
            Clear
          </button>
        </div>
      </div>

      <div class="setting">
        <div class="label">
          <strong>Custom link</strong>
          <small v-if="session.slug">
            This room answers to <code>/room/c/{{ session.slug }}</code> as well as its generated
            link.
          </small>
          <small v-else-if="!session.hasPassphrase">
            Set a passphrase first. A name somebody picked is easy to guess, so it is only offered
            once there is a passphrase actually holding the door.
          </small>
          <small v-else>Give the room a name people can remember.</small>
        </div>

        <div v-if="editingSlug" class="edit">
          <input
            v-model="slugDraft"
            placeholder="samsroom"
            maxlength="32"
            autocapitalize="off"
            aria-label="Custom link"
            @keyup.enter="saveSlug"
          />
          <button
            type="button"
            class="primary"
            :disabled="slugDraft.trim().length < 3"
            @click="saveSlug"
          >
            Claim
          </button>
          <button type="button" @click="editingSlug = false">Cancel</button>
        </div>
        <div v-else class="row">
          <button type="button" :disabled="!live || !session.hasPassphrase" @click="startSlugEdit">
            {{ session.slug ? 'Change' : 'Claim a name' }}
          </button>
          <button v-if="session.slug" type="button" :disabled="!live" @click="setSlug(null)">
            Release
          </button>
        </div>
        <p v-if="error" class="oops" role="alert">{{ error }}</p>
      </div>

      <div class="setting">
        <div class="label">
          <strong>Lock</strong>
          <small>{{
            session.locked
              ? 'Locked. Nobody new can join, and everyone here stays.'
              : 'Open. Anyone with the link can join.'
          }}</small>
        </div>
        <div class="row">
          <button type="button" :disabled="!live" @click="setLocked(!session.locked)">
            {{ session.locked ? 'Unlock' : 'Lock the room' }}
          </button>
        </div>
      </div>

      <div class="setting">
        <div class="label">
          <strong>Close this room</strong>
          <small>
            Takes it out of use without deleting anything. Characters, the ledger and the whole
            history stay put, and it reopens from its link.
          </small>
        </div>

        <div v-if="closing" class="edit">
          <input
            v-model="confirmCode"
            :placeholder="'Type ' + session.urlId + ' to confirm'"
            maxlength="16"
            autocapitalize="off"
            aria-label="Confirm the room link"
          />
          <button type="button" class="danger" :disabled="!codeMatches" @click="closeRoom">
            Close it
          </button>
          <button type="button" @click="closing = false">Cancel</button>
        </div>
        <div v-else class="row">
          <button type="button" class="danger" :disabled="!live" @click="closing = true">
            Close this room
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings {
  padding-top: var(--s-3);
  border-top: 1px solid var(--c-border);
}

.disclose {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: var(--tap);
  border: none;
  background: none;
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 500;
}

.body {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  margin-top: var(--s-2);
}

.setting {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.label {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}

.label strong {
  font-size: var(--t-sm);
}

.label small {
  color: var(--c-text-dim);
  font-size: var(--t-xs);
  text-wrap: pretty;
}

.row,
.edit {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.edit input {
  flex: 1;
  min-width: 8rem;
  min-height: var(--tap);
  padding-inline: var(--s-3);
  border: 1px solid var(--c-accent);
  border-radius: var(--r-2);
  background: var(--c-bg);
  font-size: var(--t-md);
}

button {
  min-height: var(--tap);
  padding-inline: var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-bg);
  font-size: var(--t-sm);
}

button:disabled {
  opacity: 0.5;
}

.primary {
  border-color: transparent;
  background: var(--c-accent);
  color: var(--c-on-accent);
}

.danger {
  border-color: var(--c-danger);
  color: var(--c-danger);
}

.oops {
  color: var(--c-danger);
  font-size: var(--t-xs);
}

code {
  font-family: var(--f-mono);
}
</style>
