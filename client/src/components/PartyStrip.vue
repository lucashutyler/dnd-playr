<script setup>
import { computed, ref } from 'vue'
import { useSession } from '../composables/useSession.js'

const { characters, members, member } = useSession()

// One open at a time. Everything else stays one line so the whole party fits
// above the fight rather than pushing it off the screen.
const openId = ref(null)

const unseated = computed(() => members.value.filter((m) => !m.characterId))

function holders(characterId) {
  return members.value.filter((m) => m.characterId === characterId)
}

const isMine = (character) => character.id === member.value?.characterId

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

function anyoneOnline(characterId) {
  return holders(characterId).some((m) => m.online)
}
</script>

<template>
  <section class="strip">
    <p v-if="!characters.length" class="empty">
      Nobody has made a character yet. Once somebody does, the party shows up here, above whatever
      it is fighting.
    </p>

    <ul v-else class="party">
      <li v-for="c in characters" :key="c.id" :data-tone="tone(c)">
        <button
          type="button"
          class="row"
          :aria-expanded="openId === c.id"
          @click="openId = openId === c.id ? null : c.id"
        >
          <span class="who">
            <i class="dot" :class="{ on: anyoneOnline(c.id) }" aria-hidden="true" />
            <span class="name" :class="{ mine: isMine(c) }">{{ c.name }}</span>
          </span>

          <span class="track" aria-hidden="true">
            <span class="fill" :style="{ width: bar(c) + '%' }" />
          </span>

          <span class="numbers">
            {{ c.hp.current }}<small>/{{ c.hp.max || '—' }}</small>
            <em v-if="c.hp.temp > 0">+{{ c.hp.temp }}</em>
          </span>
        </button>

        <ul v-if="c.conditions.length" class="conditions">
          <li v-for="cond in c.conditions" :key="cond">{{ cond }}</li>
        </ul>

        <div v-if="openId === c.id" class="detail">
          <p class="sub">
            {{ [c.class, 'Level ' + c.level, 'AC ' + c.ac].filter(Boolean).join(' · ') }}
          </p>

          <ul v-if="trackedResources(c).length" class="tracks">
            <li v-for="r in trackedResources(c)" :key="r.id">
              <span>{{ r.name }}</span>
              <strong>{{ r.current }}/{{ r.max }}</strong>
            </li>
          </ul>
          <p v-else class="sub">Nothing tracked yet.</p>

          <p class="sub">
            <template v-if="holders(c.id).length">
              Played by
              {{
                holders(c.id)
                  .map((m) => m.displayName || 'Unnamed')
                  .join(', ')
              }}
            </template>
            <template v-else>Nobody is holding this sheet</template>
          </p>
        </div>
      </li>
    </ul>

    <div v-if="unseated.length" class="also">
      <span class="sub">Also here</span>
      <ul>
        <li v-for="m in unseated" :key="m.id" :class="{ off: !m.online }">
          {{ m.displayName || 'Unnamed' }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
/*
 * Sticks to the top so the party stays visible while the enemy list scrolls
 * underneath it. Capped, because a big party must not eat the fight.
 */
.strip {
  position: sticky;
  top: 0;
  z-index: 10;
  max-height: 45dvh;
  overflow-y: auto;
  margin: 0 calc(-1 * var(--s-4));
  padding: var(--s-2) var(--s-4) var(--s-3);
  border-bottom: 1px solid var(--c-border);
  background: var(--c-bg);
}

.empty {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  text-wrap: pretty;
}

.party {
  list-style: none;
}

.party > li + li {
  margin-top: var(--s-1);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  width: 100%;
  min-height: var(--tap);
  padding: 0;
  border: none;
  background: none;
  text-align: left;
}

.who {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  /* Fixed share of the row so every bar starts at the same place. */
  flex: 0 0 7.5rem;
  min-width: 0;
}

.name {
  overflow: hidden;
  font-size: var(--t-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name.mine {
  font-weight: 700;
}

.dot {
  flex-shrink: 0;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: var(--c-text-dim);
  opacity: 0.4;
}

.dot.on {
  background: var(--c-ok);
  opacity: 1;
}

.track {
  flex: 1;
  overflow: hidden;
  height: 0.5rem;
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
}

.fill {
  display: block;
  height: 100%;
  border-radius: var(--r-pill);
  background: var(--c-ok);
  transition: width 0.2s ease;
}

[data-tone='hurt'] .fill {
  background: var(--c-accent);
}

[data-tone='down'] .fill {
  background: var(--c-danger);
}

.numbers {
  flex: 0 0 auto;
  min-width: 4.5rem;
  font-size: var(--t-sm);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.numbers small {
  color: var(--c-text-dim);
}

.numbers em {
  margin-left: var(--s-1);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
  font-style: normal;
}

[data-tone='hurt'] .numbers {
  color: var(--c-accent);
}

[data-tone='down'] .numbers {
  color: var(--c-danger);
}

.conditions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
  margin-left: 7.5rem;
  list-style: none;
}

.conditions li {
  padding: 0 var(--s-2);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.detail {
  margin: var(--s-2) 0 var(--s-3) 7.5rem;
  padding-left: var(--s-3);
  border-left: 2px solid var(--c-border);
}

.sub {
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.tracks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1) var(--s-3);
  margin-block: var(--s-1);
  list-style: none;
}

.tracks li {
  display: flex;
  gap: var(--s-1);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.tracks strong {
  color: var(--c-text);
  font-variant-numeric: tabular-nums;
}

/* Chips rather than a comma list: the separator is the gap, which cannot
   fail to render, and it matches how conditions are shown. */
.also {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-2);
}

.also ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
  list-style: none;
}

.also li {
  padding: 0 var(--s-2);
  border-radius: var(--r-pill);
  background: var(--c-surface-2);
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}

.also .off {
  opacity: 0.55;
}
</style>
