<script setup lang="ts">
import { useMemo } from './composables'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  positionWorld,
  fract,
  vec3,
  float,
  step,
  max,
} from 'three/tsl'

const mat = useMemo(() => {
  const m = new MeshStandardNodeMaterial({
    transparent: true,
    roughness: 0.8,
    metalness: 0.2,
  })

  const gridSize = float(1.0)
  const lineWidth = float(0.03)

  const gridPos = positionWorld.xz.div(gridSize)
  const gridFract = fract(gridPos)

  const lineX = step(gridFract.x, lineWidth).add(
    step(float(1).sub(gridFract.x), lineWidth)
  )
  const lineZ = step(gridFract.y, lineWidth).add(
    step(float(1).sub(gridFract.y), lineWidth)
  )
  const grid = max(lineX, lineZ)

  const gridColor = vec3(0.1, 0.2, 0.5).add(vec3(0.3, 0.6, 0.8).mul(grid))

  m.colorNode = gridColor

  return m
})
</script>

<template>
  <TresMesh
    receive-shadow
    :material="mat"
    :position="[0, -1, 0]"
    :rotation="[-Math.PI / 2, 0, 0]"
  >
    <TresPlaneGeometry :args="[100, 100, 200, 200]" />
  </TresMesh>
</template>
