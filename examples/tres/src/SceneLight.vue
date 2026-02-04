<script setup lang="ts">
</script>

<template>
  <TresDirectionalLight
    cast-shadow
    :position="[5, 10, 5]"
    :intensity="3"
    color="#ffe7bd"
    :shadow-bias="-0.0001"
    :shadow-mapSize-width="2048"
    :shadow-mapSize-height="2048"
    :shadow-camera-left="-20"
    :shadow-camera-right="20"
    :shadow-camera-top="20"
    :shadow-camera-bottom="-20"
    :shadow-camera-near="0.1"
    :shadow-camera-far="50"
  />
  <TresAmbientLight :intensity="0.3" />
</template>
