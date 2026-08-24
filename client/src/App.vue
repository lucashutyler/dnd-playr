<script setup>
import { onMounted, ref } from 'vue'
import LandingView from './components/LandingView.vue'
import RoomView from './components/RoomView.vue'
import { useSession } from './composables/useSession.js'

const { inRoom, resume } = useSession()

// Distinct from the composable's status: this only covers the first paint, so
// a stored token does not flash the landing screen before it resolves.
const booted = ref(false)

onMounted(async () => {
  await resume()
  booted.value = true

  // Everything in here navigates with replaceState, so this mostly fires when
  // somebody edits the address bar. Re-deriving is cheaper than guessing.
  window.addEventListener('popstate', () => {
    resume()
  })
})
</script>

<template>
  <div v-if="!booted" class="boot" aria-busy="true">
    <p>...</p>
  </div>
  <RoomView v-else-if="inRoom" />
  <LandingView v-else />
</template>

<style scoped>
.boot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  color: var(--c-text-dim);
  font-size: var(--t-xl);
  letter-spacing: 0.3em;
}
</style>
