<script setup>
import { computed, nextTick, ref } from 'vue'
import { useSession } from '../composables/useSession.js'

const props = defineProps({
  character: { type: Object, required: true },
})

const { damage, heal, updateCharacter, setDeathSaves } = useSession()

const amount = ref(1)
const editingMax = ref(false)
const maxDraft = ref(0)
const maxInput = ref(null)

const editingTemp = ref(false)
const tempDraft = ref(0)
const tempInput = ref(null)

const hp = computed(() => props.character.hp)
// Down means down, not "has not filled in a max yet".
const down = computed(() => hp.value.max > 0 && hp.value.current === 0)

const filled = computed(() => {
  if (!hp.value.max) return 0
  return Math.round((hp.value.current / hp.value.max) * 100)
})

/** Bloodied is half or less, and it is the only threshold worth colouring. */
const tone = computed(() => {
  if (down.value) return 'down'
  if (!hp.value.max) return 'plain'
  return hp.value.current * 2 <= hp.value.max ? 'hurt' : 'plain'
})

function apply(direction) {
  const n = Math.max(1, Math.min(999, Number(amount.value) || 0))
  if (direction === 'damage') damage(n)
  else heal(n)
}

async function editMax() {
  maxDraft.value = hp.value.max
  editingMax.value = true
  await nextTick()
  maxInput.value?.focus()
  maxInput.value?.select()
}

function commitMax() {
  editingMax.value = false
  const next = Math.max(0, Math.min(9999, Number(maxDraft.value) || 0))
  if (next !== hp.value.max) updateCharacter({ hpMax: next })
}

/**
 * Temporary hit points are granted, not healed, so they are set rather than
 * added to. Whoever cast the spell tells you the number.
 */
async function editTemp() {
  tempDraft.value = hp.value.temp
  editingTemp.value = true
  await nextTick()
  tempInput.value?.focus()
  tempInput.value?.select()
}

function commitTemp() {
  editingTemp.value = false
  const next = Math.max(0, Math.min(9999, Number(tempDraft.value) || 0))
  if (next !== hp.value.temp) updateCharacter({ hpTemp: next })
}

/** Tapping the nth pip sets that many, or clears it if it was already there. */
function markDeath(kind, n) {
  const saves = props.character.deathSaves
  const next = saves[kind] === n ? n - 1 : n
  setDeathSaves(
    kind === 'successes' ? next : saves.successes,
    kind === 'failures' ? next : saves.failures,
  )
}
</script>

<template>
  <section class="hp" :data-tone="tone">
    <div class="readout">
      <span class="current">{{ hp.current }}</span>
      <button v-if="!editingMax" class="max" type="button" @click="editMax">
        / {{ hp.max || '—' }}
      </button>
      <input
        v-else
        ref="maxInput"
        v-model="maxDraft"
        class="max-edit"
        type="number"
        inputmode="numeric"
        min="0"
        max="9999"
        aria-label="Maximum hit points"
        @keyup.enter="commitMax"
        @blur="commitMax"
      />
      <input
        v-if="editingTemp"
        ref="tempInput"
        v-model="tempDraft"
        class="temp-edit"
        type="number"
        inputmode="numeric"
        min="0"
        max="9999"
        aria-label="Temporary hit points"
        @keyup.enter="commitTemp"
        @blur="commitTemp"
      />
      <button v-else class="temp" :class="{ none: hp.temp === 0 }" type="button" @click="editTemp">
        {{ hp.temp > 0 ? '+' + hp.temp + ' temp' : '+ temp' }}
      </button>
    </div>

    <div class="bar" role="presentation">
      <span :style="{ width: filled + '%' }" />
    </div>

    <div class="amount">
      <button
        v-for="n in [1, 5, 10]"
        :key="n"
        type="button"
        class="chip"
        :class="{ on: Number(amount) === n }"
        @click="amount = n"
      >
        {{ n }}
      </button>
      <input
        v-model="amount"
        class="custom"
        type="number"
        inputmode="numeric"
        min="1"
        max="999"
        aria-label="Amount"
      />
    </div>

    <div class="actions">
      <button type="button" class="act act--damage" @click="apply('damage')">
        <span class="sign">−</span>
        <span class="what">damage</span>
      </button>
      <button type="button" class="act act--heal" @click="apply('heal')">
        <span class="sign">+</span>
        <span class="what">heal</span>
      </button>
    </div>

    <div v-if="down" class="deaths">
      <p class="legend">Death saves</p>
      <div v-for="kind in ['successes', 'failures']" :key="kind" class="row">
        <span class="label">{{ kind === 'successes' ? 'Saves' : 'Fails' }}</span>
        <button
          v-for="n in 3"
          :key="n"
          type="button"
          class="pip"
          :class="[kind, { on: character.deathSaves[kind] >= n }]"
          :aria-label="kind + ' ' + n"
          :aria-pressed="character.deathSaves[kind] >= n"
          @click="markDeath(kind, n)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.hp {
  padding: var(--s-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-3);
  background: var(--c-surface);
  box-shadow: var(--shadow-1);
}

.readout {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--s-2);
}

.current {
  font-family: var(--f-display);
  font-size: 3rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.hp[data-tone='hurt'] .current {
  color: var(--c-accent);
}

.hp[data-tone='down'] .current {
  color: var(--c-danger);
}

.max,
.max-edit {
  border: none;
  background: none;
  color: var(--c-text-dim);
  font-size: var(--t-lg);
  font-variant-numeric: tabular-nums;
}

.max-edit {
  width: 4.5rem;
  border-bottom: 2px solid var(--c-accent);
  text-align: center;
}

.temp,
.temp-edit {
  min-height: var(--tap);
  padding: var(--s-1) var(--s-3);
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.temp.none {
  opacity: 0.55;
}

.temp-edit {
  width: 4.5rem;
  border: 1px solid var(--c-accent);
  font-size: var(--t-sm);
  text-align: center;
}

.bar {
  overflow: hidden;
  height: 0.5rem;
  margin-block: var(--s-3);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
}

.bar span {
  display: block;
  height: 100%;
  border-radius: var(--r-pill);
  background: var(--c-ok);
  transition: width 0.2s ease;
}

.hp[data-tone='hurt'] .bar span {
  background: var(--c-accent);
}

.hp[data-tone='down'] .bar span {
  background: var(--c-danger);
}

.amount {
  display: flex;
  gap: var(--s-2);
  margin-bottom: var(--s-3);
}

.chip {
  flex: 1;
  min-height: var(--tap);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-bg);
  font-variant-numeric: tabular-nums;
}

.chip.on {
  border-color: var(--c-accent);
  background: var(--c-accent);
  color: var(--c-on-accent);
}

.custom {
  width: 5rem;
  min-height: var(--tap);
  padding-inline: var(--s-2);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-bg);
  font-size: var(--t-md);
  text-align: center;
}

.actions {
  display: flex;
  gap: var(--s-3);
}

/* The two most-tapped buttons in the app. Oversized on purpose. */
.act {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 4rem;
  border: 1px solid transparent;
  border-radius: var(--r-2);
  color: var(--c-on-accent);
}

.act:active {
  transform: translateY(1px);
}

.sign {
  font-size: var(--t-xl);
  font-weight: 700;
  line-height: 1;
}

.what {
  font-size: var(--t-xs);
  opacity: 0.85;
}

.act--damage {
  background: var(--c-danger);
}

.act--heal {
  background: var(--c-ok);
}

.deaths {
  margin-top: var(--s-4);
  padding-top: var(--s-3);
  border-top: 1px solid var(--c-border);
}

.legend {
  margin-bottom: var(--s-2);
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 500;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: var(--tap);
}

.row .label {
  width: 3.5rem;
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.pip {
  width: 2rem;
  height: 2rem;
  border: 2px solid var(--c-border);
  border-radius: 50%;
  background: transparent;
}

.pip.on.successes {
  border-color: var(--c-ok);
  background: var(--c-ok);
}

.pip.on.failures {
  border-color: var(--c-danger);
  background: var(--c-danger);
}
</style>
