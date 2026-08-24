<script setup>
import EnemyLedger from './EnemyLedger.vue'
import PartyStrip from './PartyStrip.vue'
import RoomSettings from './RoomSettings.vue'
</script>

<template>
  <!--
    The shared half of the app. Party above, what it is fighting below, on one
    screen — during a fight those two numbers are read together, and having
    them on separate tabs meant flipping back and forth mid-turn.
  -->
  <div class="table">
    <PartyStrip />
    <EnemyLedger />
    <RoomSettings />
  </div>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}
</style>
