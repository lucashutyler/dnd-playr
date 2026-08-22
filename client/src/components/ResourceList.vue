<script setup>
import { ref } from 'vue'
import { useSession } from '../composables/useSession.js'

const props = defineProps({
  resources: { type: Array, required: true },
})

const { addResource, adjustResource, updateResource, removeResource, reorderResources } =
  useSession()

const editing = ref(null)
const adding = ref(false)
const draft = ref({ name: '', max: 0, resetsOn: 'long' })

const RESETS = [
  ['short', 'Short rest'],
  ['long', 'Long rest'],
  ['never', 'Never'],
]

const PIP_LIMIT = 8

function startEdit(resource) {
  editing.value = resource.id
  draft.value = { name: resource.name, max: resource.max, resetsOn: resource.resetsOn }
}

function commitEdit(resource) {
  const name = draft.value.name.trim()
  if (!name) return
  updateResource(resource.id, {
    name,
    max: Math.max(0, Math.min(999, Number(draft.value.max) || 0)),
    resetsOn: draft.value.resetsOn,
  })
  editing.value = null
}

function move(resource, by) {
  const ids = props.resources.map((r) => r.id)
  const from = ids.indexOf(resource.id)
  const to = from + by
  if (to < 0 || to >= ids.length) return
  ids.splice(to, 0, ...ids.splice(from, 1))
  reorderResources(ids)
}

function startAdd() {
  draft.value = { name: '', max: 0, resetsOn: 'long' }
  adding.value = true
}

function commitAdd() {
  const name = draft.value.name.trim()
  if (!name) return
  addResource({
    name,
    max: Math.max(0, Math.min(999, Number(draft.value.max) || 0)),
    resetsOn: draft.value.resetsOn,
  })
  adding.value = false
}
</script>

<template>
  <section class="tracks">
    <h2 class="legend">Resources</h2>

    <p v-if="!resources.length" class="empty">
      Nothing to spend yet. Spell slots, rage, ki, bardic inspiration and anyone's homebrew all live
      here as the same kind of row.
    </p>

    <ul>
      <li v-for="r in resources" :key="r.id">
        <div v-if="editing !== r.id" class="row">
          <div class="what">
            <span class="name">{{ r.name }}</span>
            <span v-if="r.max && r.max <= PIP_LIMIT" class="pips" aria-hidden="true">
              <i v-for="n in r.max" :key="n" :class="{ on: r.current >= n }" />
            </span>
            <span v-else class="count"
              >{{ r.current }}<small>/{{ r.max || '—' }}</small></span
            >
          </div>

          <div class="controls">
            <button
              type="button"
              class="step"
              :disabled="r.current === 0"
              :aria-label="'Spend one ' + r.name"
              @click="adjustResource(r.id, -1)"
            >
              −
            </button>
            <button
              type="button"
              class="step"
              :disabled="r.max > 0 && r.current >= r.max"
              :aria-label="'Restore one ' + r.name"
              @click="adjustResource(r.id, 1)"
            >
              +
            </button>
            <button type="button" class="cog" :aria-label="'Edit ' + r.name" @click="startEdit(r)">
              ⋯
            </button>
          </div>
        </div>

        <form v-else class="edit" @submit.prevent="commitEdit(r)">
          <input v-model="draft.name" maxlength="60" aria-label="Track name" />
          <div class="edit-row">
            <label>
              <span>Max</span>
              <input v-model="draft.max" type="number" inputmode="numeric" min="0" max="999" />
            </label>
            <label>
              <span>Comes back on</span>
              <select v-model="draft.resetsOn">
                <option v-for="[value, text] in RESETS" :key="value" :value="value">
                  {{ text }}
                </option>
              </select>
            </label>
          </div>
          <div class="edit-actions">
            <button type="submit" class="save">Save</button>
            <button type="button" @click="move(r, -1)">Up</button>
            <button type="button" @click="move(r, 1)">Down</button>
            <button type="button" class="danger" @click="removeResource(r.id)">Remove</button>
            <button type="button" @click="editing = null">Cancel</button>
          </div>
        </form>
      </li>
    </ul>

    <form v-if="adding" class="edit add" @submit.prevent="commitAdd">
      <input
        v-model="draft.name"
        placeholder="Superiority Dice"
        maxlength="60"
        aria-label="New track name"
      />
      <div class="edit-row">
        <label>
          <span>Max</span>
          <input v-model="draft.max" type="number" inputmode="numeric" min="0" max="999" />
        </label>
        <label>
          <span>Comes back on</span>
          <select v-model="draft.resetsOn">
            <option v-for="[value, text] in RESETS" :key="value" :value="value">{{ text }}</option>
          </select>
        </label>
      </div>
      <div class="edit-actions">
        <button type="submit" class="save" :disabled="!draft.name.trim()">Add</button>
        <button type="button" @click="adding = false">Cancel</button>
      </div>
    </form>

    <button v-else type="button" class="add-btn" @click="startAdd">Add a track</button>
  </section>
</template>

<style scoped>
.tracks {
  margin-top: var(--s-5);
}

.legend {
  margin-bottom: var(--s-2);
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 500;
}

.empty {
  margin-bottom: var(--s-3);
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  text-wrap: pretty;
}

ul {
  list-style: none;
}

li {
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
}

li + li {
  margin-top: var(--s-2);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
}

.what {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  min-width: 0;
}

.name {
  overflow: hidden;
  font-size: var(--t-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pips {
  display: flex;
  gap: 3px;
}

.pips i {
  width: 0.75rem;
  height: 0.75rem;
  border: 1.5px solid var(--c-border);
  border-radius: 50%;
}

.pips i.on {
  border-color: var(--c-accent);
  background: var(--c-accent);
}

.count {
  color: var(--c-text-dim);
  font-family: var(--f-mono);
  font-size: var(--t-sm);
}

.controls {
  display: flex;
  flex-shrink: 0;
  gap: var(--s-2);
}

.step {
  width: var(--tap);
  height: var(--tap);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-bg);
  font-size: var(--t-lg);
}

.step:disabled {
  opacity: 0.3;
}

.cog {
  width: var(--tap);
  height: var(--tap);
  border: none;
  border-radius: var(--r-2);
  background: none;
  color: var(--c-text-dim);
}

.edit {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-3);
}

.add {
  margin-top: var(--s-2);
  border: 1px solid var(--c-accent);
  border-radius: var(--r-2);
  background: var(--c-surface);
}

.edit input,
.edit select {
  min-height: var(--tap);
  padding: var(--s-2);
  border: 1px solid var(--c-border);
  border-radius: var(--r-1);
  background: var(--c-bg);
  font-size: var(--t-md);
}

.edit-row {
  display: flex;
  gap: var(--s-2);
}

.edit-row label {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--s-1);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.edit-actions button {
  min-height: var(--tap);
  padding-inline: var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-1);
  background: var(--c-bg);
  font-size: var(--t-sm);
}

.edit-actions .save {
  border-color: transparent;
  background: var(--c-accent);
  color: var(--c-on-accent);
}

.edit-actions .danger {
  color: var(--c-danger);
}

.add-btn {
  width: 100%;
  min-height: var(--tap);
  margin-top: var(--s-2);
  border: 1px dashed var(--c-border);
  border-radius: var(--r-2);
  background: none;
  color: var(--c-text-dim);
  font-size: var(--t-sm);
}
</style>
