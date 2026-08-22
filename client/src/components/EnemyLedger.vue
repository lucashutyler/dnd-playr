<script setup>
import { computed, nextTick, ref } from 'vue'
import { useSession } from '../composables/useSession.js'

const {
  enemies,
  memberName,
  addEnemy,
  damageEnemy,
  healEnemy,
  updateEnemy,
  removeEnemy,
  reorderEnemies,
  newEncounter,
} = useSession()

// One enemy open at a time keeps the list scannable on a phone.
const openId = ref(null)
const editingId = ref(null)
const labelDraft = ref('')
const amount = ref(5)

const adding = ref(false)
const newLabel = ref('')
const newInput = ref(null)

const anyLive = computed(() => enemies.value.length > 0)

function toggle(enemy) {
  openId.value = openId.value === enemy.id ? null : enemy.id
  editingId.value = null
  amount.value = 5
}

function clean() {
  return Math.max(1, Math.min(999, Number(amount.value) || 0))
}

function hit(enemy, direction) {
  const n = clean()
  if (direction === 'damage') damageEnemy(enemy.id, n)
  else healEnemy(enemy.id, n)
}

/** Who has contributed what, before the blow-by-blow. */
function contributions(enemy) {
  const totals = new Map()
  for (const h of enemy.hits) totals.set(h.memberId, (totals.get(h.memberId) ?? 0) + h.delta)
  return [...totals.entries()]
    .map(([memberId, total]) => ({ memberId, total, name: memberName(memberId) }))
    .sort((a, b) => b.total - a.total)
}

async function startAdding() {
  adding.value = true
  await nextTick()
  newInput.value?.focus()
}

function commitAdd() {
  const label = newLabel.value.trim()
  if (!label) return
  addEnemy(label)
  newLabel.value = ''
  // Stay open: enemies arrive in batches, not one at a time.
  newInput.value?.focus()
}

function startRename(enemy) {
  editingId.value = enemy.id
  labelDraft.value = enemy.label
}

function commitRename(enemy) {
  const label = labelDraft.value.trim()
  if (label && label !== enemy.label) updateEnemy(enemy.id, { label })
  editingId.value = null
}

function move(enemy, by) {
  const ids = enemies.value.map((e) => e.id)
  const from = ids.indexOf(enemy.id)
  const to = from + by
  if (to < 0 || to >= ids.length) return
  ids.splice(to, 0, ...ids.splice(from, 1))
  reorderEnemies(ids)
}
</script>

<template>
  <section class="ledger">
    <header class="top">
      <h2 class="legend">The fight</h2>
      <button v-if="anyLive" type="button" class="wipe" @click="newEncounter()">
        New encounter
      </button>
    </header>

    <p v-if="!anyLive" class="empty">
      Nothing here yet. Add whatever the table is calling them — "big guy with the axe" is a
      perfectly good name.
    </p>

    <ul>
      <li v-for="e in enemies" :key="e.id" :class="['enemy', e.status]">
        <button type="button" class="head" :aria-expanded="openId === e.id" @click="toggle(e)">
          <span class="label">
            {{ e.label }}
            <small v-if="e.status !== 'active'">{{ e.status }}</small>
          </span>
          <span class="tally">
            <strong>{{ e.damageTotal }}</strong>
            <small>{{ e.hits.length }} {{ e.hits.length === 1 ? 'hit' : 'hits' }}</small>
          </span>
        </button>

        <div v-if="openId === e.id" class="body">
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
            <button type="button" class="act act--damage" @click="hit(e, 'damage')">
              <span class="sign">+</span>
              <span class="what">damage</span>
            </button>
            <button type="button" class="act act--heal" @click="hit(e, 'heal')">
              <span class="sign">−</span>
              <span class="what">it healed</span>
            </button>
          </div>

          <div v-if="e.hits.length" class="history">
            <div class="who">
              <span v-for="c in contributions(e)" :key="c.memberId">
                {{ c.name }} <strong>{{ c.total }}</strong>
              </span>
            </div>
            <ol>
              <li v-for="h in [...e.hits].reverse()" :key="h.id">
                <span>{{ memberName(h.memberId) }}</span>
                <span :class="h.delta < 0 ? 'healed' : 'dealt'">
                  {{ h.delta < 0 ? '−' + -h.delta : '+' + h.delta }}
                </span>
              </li>
            </ol>
          </div>

          <div v-if="editingId === e.id" class="rename">
            <input
              v-model="labelDraft"
              maxlength="60"
              aria-label="Enemy name"
              @keyup.enter="commitRename(e)"
            />
            <button type="button" class="save" @click="commitRename(e)">Save</button>
          </div>

          <div class="admin">
            <button type="button" @click="startRename(e)">Rename</button>
            <button
              type="button"
              @click="
                updateEnemy(e.id, { status: e.status === 'defeated' ? 'active' : 'defeated' })
              "
            >
              {{ e.status === 'defeated' ? 'Back up' : 'Down' }}
            </button>
            <button
              type="button"
              @click="updateEnemy(e.id, { status: e.status === 'fled' ? 'active' : 'fled' })"
            >
              {{ e.status === 'fled' ? 'Returned' : 'Fled' }}
            </button>
            <button type="button" @click="move(e, -1)">Up</button>
            <button type="button" @click="move(e, 1)">Down</button>
            <button type="button" class="danger" @click="removeEnemy(e.id)">Remove</button>
          </div>
        </div>
      </li>
    </ul>

    <form v-if="adding" class="add" @submit.prevent="commitAdd">
      <input
        ref="newInput"
        v-model="newLabel"
        placeholder="Big guy with the axe"
        maxlength="60"
        aria-label="New enemy"
      />
      <button type="submit" class="save" :disabled="!newLabel.trim()">Add</button>
      <button type="button" @click="adding = false">Done</button>
    </form>
    <button v-else type="button" class="add-btn" @click="startAdding">Add an enemy</button>
  </section>
</template>

<style scoped>
.ledger {
  margin-top: var(--s-6);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}

.legend {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 500;
}

.wipe {
  min-height: var(--tap);
  padding-inline: var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: none;
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.empty {
  margin-top: var(--s-2);
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  text-wrap: pretty;
}

ul {
  margin-top: var(--s-2);
  list-style: none;
}

.enemy {
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
}

.enemy + .enemy {
  margin-top: var(--s-2);
}

/* Still on the list, just clearly done with. */
.enemy.defeated,
.enemy.fled {
  opacity: 0.6;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  width: 100%;
  min-height: var(--tap-lg);
  padding: var(--s-2) var(--s-3);
  border: none;
  background: none;
  text-align: left;
}

.label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.label small {
  color: var(--c-text-dim);
  font-size: var(--t-xs);
  text-transform: capitalize;
}

.enemy.defeated .label,
.enemy.fled .label {
  text-decoration: line-through;
  text-decoration-color: var(--c-text-dim);
}

.tally {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}

.tally strong {
  color: var(--c-accent);
  font-family: var(--f-display);
  font-size: var(--t-xl);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.tally small {
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.body {
  padding: 0 var(--s-3) var(--s-3);
  border-top: 1px solid var(--c-border);
}

.amount {
  display: flex;
  gap: var(--s-2);
  margin-block: var(--s-3);
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

.act {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 3.5rem;
  border: 1px solid transparent;
  border-radius: var(--r-2);
  color: var(--c-on-accent);
}

.act:active {
  transform: translateY(1px);
}

.sign {
  font-size: var(--t-lg);
  font-weight: 700;
  line-height: 1;
}

.what {
  font-size: var(--t-xs);
  opacity: 0.85;
}

/* Dealing damage is the good outcome here, so it takes the accent. */
.act--damage {
  background: var(--c-accent);
}

.act--heal {
  background: var(--c-surface-2);
  color: var(--c-text-dim);
}

.history {
  margin-top: var(--s-3);
  padding-top: var(--s-3);
  border-top: 1px solid var(--c-border);
}

.who {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-bottom: var(--s-2);
}

.who span {
  padding: var(--s-1) var(--s-2);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.who strong {
  color: var(--c-text);
  font-variant-numeric: tabular-nums;
}

.history ol {
  max-height: 11rem;
  overflow-y: auto;
  list-style: none;
}

.history ol li {
  display: flex;
  justify-content: space-between;
  padding: var(--s-1) 0;
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.history ol li + li {
  border-top: 1px dashed var(--c-border);
}

.dealt {
  color: var(--c-accent);
  font-variant-numeric: tabular-nums;
}

.healed {
  color: var(--c-ok);
  font-variant-numeric: tabular-nums;
}

.rename {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-3);
}

.rename input {
  flex: 1;
  min-height: var(--tap);
  padding: var(--s-2);
  border: 1px solid var(--c-accent);
  border-radius: var(--r-1);
  background: var(--c-bg);
  font-size: var(--t-md);
}

.admin {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-3);
}

.admin button {
  min-height: var(--tap);
  padding-inline: var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-1);
  background: var(--c-bg);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.admin .danger {
  color: var(--c-danger);
}

.add {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-2);
}

.add input {
  flex: 1;
  min-width: 0;
  min-height: var(--tap-lg);
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--c-accent);
  border-radius: var(--r-2);
  background: var(--c-bg);
  font-size: var(--t-md);
}

.add button {
  min-height: var(--tap-lg);
  padding-inline: var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-bg);
  font-size: var(--t-sm);
}

.save {
  border-color: transparent !important;
  background: var(--c-accent) !important;
  color: var(--c-on-accent);
}

.save:disabled {
  opacity: 0.5;
}

.add-btn {
  width: 100%;
  min-height: var(--tap-lg);
  margin-top: var(--s-2);
  border: 1px dashed var(--c-border);
  border-radius: var(--r-2);
  background: none;
  color: var(--c-text-dim);
  font-size: var(--t-sm);
}
</style>
