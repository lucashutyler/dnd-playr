<script setup>
import { computed, nextTick, ref } from 'vue'
import { useSession } from '../composables/useSession.js'

const { characters, members, member, live, renameMe, leave } = useSession()

const editingMe = ref(false)
const draft = ref('')
const meInput = ref(null)

const myName = computed(() => member.value?.displayName || 'Unnamed')

async function editMe() {
  if (!live.value) return
  draft.value = member.value?.displayName ?? ''
  editingMe.value = true
  await nextTick()
  meInput.value?.focus()
  meInput.value?.select()
}

function commitMe() {
  editingMe.value = false
  if (draft.value.trim() !== member.value?.displayName) renameMe(draft.value)
}

/** Whoever is holding this sheet right now, and whether they are here. */
function holders(characterId) {
  return members.value.filter((m) => m.characterId === characterId)
}

const unseated = computed(() => members.value.filter((m) => !m.characterId))

function bar(character) {
  if (!character.hp.max) return 0
  return Math.round((character.hp.current / character.hp.max) * 100)
}

function tone(character) {
  const { current, max } = character.hp
  if (max > 0 && current === 0) return 'down'
  if (!max) return 'plain'
  return current * 2 <= max ? 'hurt' : 'plain'
}

/** Only tracks somebody has actually filled in are worth the glance. */
function trackedResources(character) {
  return character.resources.filter((r) => r.max > 0)
}
</script>

<template>
  <section class="party">
    <p v-if="!characters.length" class="empty">
      Nobody has made a character yet. Once someone does, the whole party shows up here — hit
      points, conditions and whatever they have left to spend.
    </p>

    <ul class="sheets">
      <li v-for="c in characters" :key="c.id" :data-tone="tone(c)">
        <header>
          <div class="who">
            <strong>{{ c.name }}</strong>
            <small>{{ [c.class, 'Level ' + c.level].filter(Boolean).join(' · ') }}</small>
          </div>
          <div class="hp">
            <span class="numbers"
              >{{ c.hp.current }}<small>/{{ c.hp.max || '—' }}</small></span
            >
            <span v-if="c.hp.temp > 0" class="temp">+{{ c.hp.temp }}</span>
          </div>
        </header>

        <div class="bar" role="presentation">
          <span :style="{ width: bar(c) + '%' }" />
        </div>

        <ul v-if="c.conditions.length" class="conditions">
          <li v-for="cond in c.conditions" :key="cond">{{ cond }}</li>
        </ul>

        <ul v-if="trackedResources(c).length" class="tracks">
          <li v-for="r in trackedResources(c)" :key="r.id">
            <span class="name">{{ r.name }}</span>
            <span v-if="r.max <= 8" class="pips" aria-hidden="true">
              <i v-for="n in r.max" :key="n" :class="{ on: r.current >= n }" />
            </span>
            <span v-else class="count">{{ r.current }}/{{ r.max }}</span>
          </li>
        </ul>

        <footer v-if="holders(c.id).length" class="holders">
          <span v-for="m in holders(c.id)" :key="m.id" :class="{ off: !m.online }">
            <i class="dot" :class="{ on: m.online }" aria-hidden="true" />
            {{ m.displayName || 'Unnamed' }}
          </span>
        </footer>
        <footer v-else class="holders idle">Nobody is holding this sheet</footer>
      </li>
    </ul>

    <footer class="you">
      <div class="row">
        <span class="legend">You are</span>
        <input
          v-if="editingMe"
          ref="meInput"
          v-model="draft"
          maxlength="40"
          aria-label="Your name"
          @keyup.enter="commitMe"
          @keyup.escape="editingMe = false"
          @blur="commitMe"
        />
        <button v-else type="button" class="myname" @click="editMe">{{ myName }}</button>
      </div>
      <button type="button" class="leave" @click="leave">Leave this room on this device</button>
    </footer>

    <section v-if="unseated.length" class="watching">
      <h3 class="legend">At the table, no character</h3>
      <ul>
        <li v-for="m in unseated" :key="m.id" :class="{ off: !m.online }">
          <i class="dot" :class="{ on: m.online }" aria-hidden="true" />
          {{ m.displayName || 'Unnamed' }}
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.party {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.empty {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  text-wrap: pretty;
}

.sheets {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  list-style: none;
}

.sheets > li {
  padding: var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
}

header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
}

.who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.who strong {
  overflow: hidden;
  font-size: var(--t-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.who small {
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.hp {
  display: flex;
  align-items: baseline;
  flex-shrink: 0;
  gap: var(--s-2);
}

.numbers {
  font-family: var(--f-display);
  font-size: var(--t-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.numbers small {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 400;
}

[data-tone='hurt'] .numbers {
  color: var(--c-accent);
}

[data-tone='down'] .numbers {
  color: var(--c-danger);
}

.temp {
  padding: 0 var(--s-2);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.bar {
  overflow: hidden;
  height: 0.375rem;
  margin-block: var(--s-2);
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

[data-tone='hurt'] .bar span {
  background: var(--c-accent);
}

[data-tone='down'] .bar span {
  background: var(--c-danger);
}

.conditions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
  margin-bottom: var(--s-2);
  list-style: none;
}

.conditions li {
  padding: 0 var(--s-2);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.tracks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-4);
  list-style: none;
}

.tracks li {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.tracks .name {
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pips {
  display: flex;
  gap: 2px;
}

.pips i {
  width: 0.5rem;
  height: 0.5rem;
  border: 1px solid var(--c-border);
  border-radius: 50%;
}

.pips i.on {
  border-color: var(--c-accent);
  background: var(--c-accent);
}

.count {
  font-family: var(--f-mono);
}

.holders {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-3);
  padding-top: var(--s-2);
  border-top: 1px solid var(--c-border);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.holders span {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
}

.holders .off {
  opacity: 0.6;
}

.holders.idle {
  font-style: italic;
}

.dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: var(--c-text-dim);
  opacity: 0.5;
}

.dot.on {
  background: var(--c-ok);
  opacity: 1;
}

.you {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding-top: var(--s-3);
  border-top: 1px solid var(--c-border);
}

.you .row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.you .legend {
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

.you input {
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

.watching .legend {
  margin-bottom: var(--s-2);
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 500;
}

.watching ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  list-style: none;
}

.watching li {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--c-text-dim);
  font-size: var(--t-sm);
}

.watching li.off {
  opacity: 0.6;
}
</style>
