<script setup lang="ts">
import { shallowRef, watch, onUnmounted } from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import * as THREE from 'three/webgpu'
import { pass, mrt, output, velocity } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'

const props = withDefaults(
  defineProps<{
    bloomStrength?: number
    bloomRadius?: number
    bloomThreshold?: number
    enableSmaa?: boolean
  }>(),
  {
    bloomStrength: 0.15,
    bloomRadius: 0.1,
    bloomThreshold: 0,
    enableSmaa: true,
  }
)

const { renderer, scene, camera, sizes } = useTresContext()
const postProcessingRef = shallowRef<THREE.PostProcessing | null>(null)

function setupPostProcessing() {
  const r = renderer.instance as unknown as THREE.WebGPURenderer
  const s = scene.value
  const c = camera.activeCamera.value
  if (!r || !s || !c) return

  const scenePass = pass(s, c, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })

  scenePass.setMRT(
    mrt({
      output: output,
      velocity: velocity,
    })
  )

  const scenePassColor = scenePass.getTextureNode('output')

  const bloomPass = bloom(
    scenePassColor,
    props.bloomStrength,
    props.bloomRadius,
    props.bloomThreshold
  )
  const withBloom = scenePassColor.add(bloomPass)

  const finalOutput = props.enableSmaa ? smaa(withBloom) : withBloom

  const postProcessing = new THREE.PostProcessing(r)
  postProcessing.outputNode = finalOutput
  postProcessingRef.value = postProcessing

  if (postProcessingRef.value.setSize) {
    postProcessingRef.value.setSize(sizes.width.value, sizes.height.value)
    postProcessingRef.value.needsUpdate = true
  }
}

watch(
  [() => renderer.instance, scene, () => camera.activeCamera.value],
  () => {
    if (renderer.instance && scene.value && camera.activeCamera.value) {
      setupPostProcessing()
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  postProcessingRef.value = null
})

const { render } = useLoop()

render((notifySuccess: () => void) => {
  if (postProcessingRef.value) {
    const r = renderer.instance as unknown as THREE.WebGPURenderer
    r.clear()
    postProcessingRef.value.render()
  }
  notifySuccess()
})
</script>

<template></template>
