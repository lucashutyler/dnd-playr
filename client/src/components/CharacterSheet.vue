<script setup>
import { ref } from 'vue'
import HpBlock from './HpBlock.vue'
import ResourceList from './ResourceList.vue'
import { useSession } from '../composables/useSession.js'

const props = defineProps({
  character: { type: Object, required: true },
})

const { updateCharacter, releaseCharacter, takeRest } = useSession()

const addingCondition = ref(false)
const conditionDraft = ref('')

// Free text is the rule; this is only a shortcut for the usual suspects.
const SUGGESTED = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
]

function setConditions(next) {
  updateCharacter({ conditions: next })
}

function addCondition(name) {
  const value = (name ?? conditionDraft.value).trim()
  if (!value) return
  if (!props.character.conditions.includes(value)) {
    setConditions([...props.character.conditions, value])
  }
  conditionDraft.value = ''
  addingCondition.value = false
}

function removeCondition(name) {
  setConditions(props.character.conditions.filter((c) => c !== name))
}
</script>

<template>
  <section class="sheet">
    <header class="who">
      <h2>{{ character.name }}</h2>
      <p class="sub">
        {{ [character.class, 'Level ' + character.level].filter(Boolean).join(' · ') }}
        <span class="ac">AC {{ character.ac }}</span>
      </p>
    </header>

    <HpBlock :character="character" />

    <section class="conditions">
      <h3 class="legend">Conditions</h3>
      <ul>
        <li v-for="c in character.conditions" :key="c">
          <button type="button" @click="removeCondition(c)">
            {{ c }} <span aria-hidden="true">×</span>
            <span class="sr">remove</span>
          </button>
        </li>
        <li>
          <button type="button" class="add" @click="addingCondition = !addingCondition">
            + add
          </button>
        </li>
      </ul>

      <div v-if="addingCondition" class="picker">
        <form @submit.prevent="addCondition()">
          <input
            v-model="conditionDraft"
            placeholder="Anything you like"
            maxlength="40"
            aria-label="Condition"
          />
        </form>
        <div class="suggested">
          <button v-for="s in SUGGESTED" :key="s" type="button" @click="addCondition(s)">
            {{ s }}
          </button>
        </div>
      </div>
    </section>

    <ResourceList :resources="character.resources" />

    <section class="rests">
      <button type="button" @click="takeRest('short')">Short rest</button>
      <button type="button" @click="takeRest('long')">Long rest</button>
    </section>

    <button type="button" class="release" @click="releaseCharacter">
      Put {{ character.name }} down
    </button>
  </section>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  margin-block: var(--s-4);
}

.who {
  margin-bottom: var(--s-3);
  text-align: center;
}

.who h2 {
  font-family: var(--f-display);
  font-size: var(--t-xl);
  font-weight: 600;
}

.sub {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
}

.ac {
  margin-left: var(--s-2);
  padding: var(--s-1) var(--s-2);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  font-size: var(--t-xs);
}

.conditions {
  margin-top: var(--s-5);
}

.legend {
  margin-bottom: var(--s-2);
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 500;
}

.conditions ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  list-style: none;
}

.conditions li button {
  min-height: var(--tap);
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  font-size: var(--t-sm);
}

.conditions li button.add {
  border-style: dashed;
  background: none;
  color: var(--c-text-dim);
}

.picker {
  margin-top: var(--s-3);
}

.picker input {
  width: 100%;
  min-height: var(--tap);
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--c-accent);
  border-radius: var(--r-2);
  background: var(--c-bg);
  font-size: var(--t-md);
}

.suggested {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-2);
}

.suggested button {
  min-height: var(--tap);
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-bg);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.rests {
  display: flex;
  gap: var(--s-3);
  margin-top: var(--s-5);
}

.rests button {
  flex: 1;
  min-height: var(--tap-lg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
  font-size: var(--t-md);
}

.release {
  min-height: var(--tap);
  margin-top: var(--s-5);
  border: none;
  background: none;
  color: var(--c-text-dim);
  font-size: var(--t-sm);
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
