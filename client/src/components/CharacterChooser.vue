<script setup>
import { onMounted, ref } from 'vue'
import AppButton from './AppButton.vue'
import AppField from './AppField.vue'
import { useSession } from '../composables/useSession.js'

const { characters, members, createCharacter, claimCharacter } = useSession()

// 'pick' | 'new'
const mode = ref('pick')
const name = ref('')
const className = ref('Other')
const level = ref(1)
const classes = ref(['Other'])

onMounted(async () => {
  try {
    const res = await fetch('/api/meta')
    if (res.ok) classes.value = (await res.json()).classes
  } catch {
    // The picker still works; it just offers the one safe default.
  }
})

/** How many people are already holding this sheet. Two is normal, not a clash. */
function heldBy(characterId) {
  return members.value.filter((m) => m.characterId === characterId).length
}

function submit() {
  if (!name.value.trim()) return
  createCharacter({ name: name.value.trim(), class: className.value, level: Number(level.value) })
}
</script>

<template>
  <section class="chooser">
    <template v-if="mode === 'pick'">
      <h2 class="legend">Who are you playing?</h2>

      <ul v-if="characters.length" class="sheets">
        <li v-for="c in characters" :key="c.id">
          <button type="button" @click="claimCharacter(c.id)">
            <span class="who">
              <strong>{{ c.name }}</strong>
              <small>{{ [c.class, 'level ' + c.level].filter(Boolean).join(' · ') }}</small>
            </span>
            <span v-if="heldBy(c.id)" class="held">
              {{ heldBy(c.id) === 1 ? 'in play' : heldBy(c.id) + ' devices' }}
            </span>
          </button>
        </li>
      </ul>

      <p v-else class="empty">
        Nobody has made a character in this room yet. Yours can be the first.
      </p>

      <AppButton variant="primary" @click="mode = 'new'">Start a new character</AppButton>
    </template>

    <form v-else class="stack" @submit.prevent="submit">
      <h2 class="legend">New character</h2>

      <AppField v-model="name" label="Name" placeholder="Vex" :maxlength="60" />

      <div class="field">
        <label for="class-picker">Class</label>
        <select id="class-picker" v-model="className">
          <option v-for="c in classes" :key="c" :value="c">{{ c }}</option>
        </select>
        <p class="hint">
          Sets up the tracks your class uses. You fill in the numbers — nothing here pretends to
          know the rules.
        </p>
      </div>

      <div class="field">
        <label for="level-picker">Level</label>
        <select id="level-picker" v-model="level">
          <option v-for="n in 20" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <AppButton variant="primary" type="submit" :disabled="!name.trim()">
        Create and play
      </AppButton>
      <AppButton variant="ghost" @click="mode = 'pick'">Back</AppButton>
    </form>
  </section>
</template>

<style scoped>
.chooser {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin-block: var(--s-5);
}

.legend {
  font-family: var(--f-display);
  font-size: var(--t-lg);
  font-weight: 600;
}

.sheets {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  list-style: none;
}

.sheets button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  width: 100%;
  min-height: var(--tap-lg);
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
  box-shadow: var(--shadow-1);
  text-align: left;
}

.sheets button:hover {
  border-color: var(--c-accent);
}

.who {
  display: flex;
  flex-direction: column;
}

.who small {
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.held {
  padding: var(--s-1) var(--s-2);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
  white-space: nowrap;
}

.empty {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  text-wrap: pretty;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

label {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 500;
}

select {
  min-height: var(--tap-lg);
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
  font-size: var(--t-md);
}

.hint {
  color: var(--c-text-dim);
  font-size: var(--t-xs);
  text-wrap: pretty;
}
</style>
