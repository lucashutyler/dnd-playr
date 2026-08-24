<script setup>
import { computed, nextTick, ref } from 'vue'
import CharacterChooser from './CharacterChooser.vue'
import CharacterSheet from './CharacterSheet.vue'
import { useSession } from '../composables/useSession.js'

const { member, myCharacter, live, renameMe, leave } = useSession()

const editing = ref(false)
const draft = ref('')
const input = ref(null)

const myName = computed(() => member.value?.displayName || 'Unnamed')

async function edit() {
  if (!live.value) return
  draft.value = member.value?.displayName ?? ''
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

function commit() {
  editing.value = false
  if (draft.value.trim() !== member.value?.displayName) renameMe(draft.value)
}
</script>

<template>
  <div class="me">
    <CharacterSheet v-if="myCharacter" :character="myCharacter" />
    <CharacterChooser v-else />

    <!-- Your name and your seat: both about this device, not about the room. -->
    <footer class="device">
      <div class="row">
        <span class="legend">You are</span>
        <input
          v-if="editing"
          ref="input"
          v-model="draft"
          maxlength="40"
          aria-label="Your name"
          @keyup.enter="commit"
          @keyup.escape="editing = false"
          @blur="commit"
        />
        <button v-else type="button" class="myname" @click="edit">{{ myName }}</button>
      </div>
      <button type="button" class="leave" @click="leave">Leave this room on this device</button>
    </footer>
  </div>
</template>

<style scoped>
.me {
  display: flex;
  flex-direction: column;
}

.device {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin-top: var(--s-6);
  padding-top: var(--s-3);
  border-top: 1px solid var(--c-border);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.legend {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
}

.myname {
  min-height: var(--tap);
  padding-inline: var(--s-2);
  border: none;
  border-radius: var(--r-1);
  background: none;
  font-size: var(--t-md);
  font-weight: 600;
}

.myname:hover {
  background: var(--c-surface-2);
}

input {
  flex: 1;
  min-width: 0;
  min-height: var(--tap);
  padding-inline: var(--s-2);
  border: 1px solid var(--c-accent);
  border-radius: var(--r-1);
  background: var(--c-bg);
  font-size: var(--t-md);
}

.leave {
  align-self: flex-start;
  min-height: var(--tap);
  border: none;
  background: none;
  color: var(--c-text-dim);
  font-size: var(--t-sm);
}
</style>
