<script setup lang="ts">
import { shallowRef, ref, watch, onUnmounted } from 'vue'
import { useTresContext, useLoop } from '@tresjs/core'
import { useGLTF } from '@tresjs/cientos'
import * as THREE from 'three/webgpu'
import { useKeyboard } from './composables'
import { damp } from 'three/src/math/MathUtils.js'

const keys = useKeyboard()
const { camera: cameraCtx } = useTresContext()
const { onBeforeRender } = useLoop()

const meshRef = shallowRef<THREE.Group | null>(null)
const modelRef = shallowRef<THREE.Group | null>(null)

// Load model
const { state: gltfState } = useGLTF('/witch-test.glb')

// Animation state
let currentAnimName = 'idle-sword'
let baseAnimName = 'idle-sword'
let isAttackingFlag = false
let comboIdx = 0
let nextAttackQueuedFlag = false
let targetRot = 0
let attackPressedPrev = false

let mixer: THREE.AnimationMixer | null = null
let animActions: Record<string, THREE.AnimationAction> = {}
const velocity = new THREE.Vector3()

const ATTACK_COMBO = ['sword-attack-01', 'sword-attack-03', 'sword-attack-04']
const walkSpeed = 5
const runSpeed = 10

function playAnimation(name: string, fadeIn = 0.2) {
  if (currentAnimName === name) return

  if (currentAnimName && animActions[currentAnimName]) {
    animActions[currentAnimName].fadeOut(fadeIn)
  }

  if (animActions[name]) {
    const action = animActions[name].reset().fadeIn(fadeIn).play()
    if (name === 'run') {
      action.setEffectiveTimeScale(2)
    }
    if (ATTACK_COMBO.includes(name)) {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    }
  }

  currentAnimName = name
}

function doAttack() {
  if (!isAttackingFlag) {
    isAttackingFlag = true
    comboIdx = 0
    nextAttackQueuedFlag = false
    playAnimation(ATTACK_COMBO[0], 0.1)
  } else {
    nextAttackQueuedFlag = true
  }
}

function onAnimationFinished(e: { action: THREE.AnimationAction }) {
  const finishedName = e.action.getClip().name
  if (ATTACK_COMBO.includes(finishedName)) {
    if (nextAttackQueuedFlag && comboIdx < ATTACK_COMBO.length - 1) {
      comboIdx++
      nextAttackQueuedFlag = false
      playAnimation(ATTACK_COMBO[comboIdx], 0.1)
    } else {
      isAttackingFlag = false
      comboIdx = 0
      nextAttackQueuedFlag = false
      playAnimation(baseAnimName, 0.2)
    }
  }
}

// Setup model when loaded
watch(gltfState, (state) => {
  if (!state?.scene) return

  const scene = state.scene

  // Setup shadows and hide sword
  scene.traverse((child: THREE.Object3D) => {
    if ('isMesh' in child && (child as THREE.Mesh).isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
    if (child.name === 'Cylinder001') {
      child.visible = false
    }
  })

  // Setup animations
  mixer = new THREE.AnimationMixer(scene)
  mixer.addEventListener('finished', onAnimationFinished as any)

  animActions = {}
  for (const clip of state.animations) {
    animActions[clip.name] = mixer.clipAction(clip)
  }

  // Start animations
  if (animActions['wind']) {
    animActions['wind'].play()
  }
  playAnimation('idle-sword')
}, { immediate: true })

// Frame loop
onBeforeRender(({ delta }) => {
  if (!meshRef.value) return

  // Update animation mixer
  if (mixer) {
    mixer.update(delta)
  }

  const k = keys.value

  // Attack edge detection
  if (k.attack && !attackPressedPrev) {
    doAttack()
  }
  attackPressedPrev = k.attack

  // Movement
  const moveX = (k.right ? 1 : 0) - (k.left ? 1 : 0)
  const moveZ = (k.backward ? 1 : 0) - (k.forward ? 1 : 0)
  const speed = k.run ? runSpeed : walkSpeed

  velocity.set(moveX, 0, moveZ).normalize().multiplyScalar(speed * delta)

  const isMoving = moveX !== 0 || moveZ !== 0

  meshRef.value.position.add(velocity)
  meshRef.value.position.y = -1.2

  // Rotation
  if (isMoving && modelRef.value) {
    targetRot = Math.atan2(-moveX, -moveZ)

    const cur = modelRef.value.rotation.y
    const diff = targetRot - cur
    let shortestDiff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI
    if (shortestDiff < -Math.PI) shortestDiff += Math.PI * 2

    modelRef.value.rotation.y = damp(cur, cur + shortestDiff, 10, delta)
  }

  // Animation state
  const newAnim = isMoving ? (k.run ? 'run' : 'walk') : 'idle'
  const animName = newAnim === 'idle' ? 'idle-sword' : newAnim
  if (animName !== baseAnimName) {
    baseAnimName = animName
    if (!isAttackingFlag) {
      playAnimation(animName)
    }
  }

  // Camera follow
  const cam = cameraCtx.activeCamera.value
  if (cam && meshRef.value) {
    cam.position.x = damp(cam.position.x, meshRef.value.position.x, 4, delta)
    cam.position.z = damp(cam.position.z, meshRef.value.position.z + 5, 4, delta)
  }
})

onUnmounted(() => {
  if (mixer) {
    mixer.removeEventListener('finished', onAnimationFinished as any)
    mixer.stopAllAction()
  }
})
</script>

<template>
  <TresPerspectiveCamera
    :position="[0, 3, 10]"
    :fov="45"
    :rotation="[-Math.PI / 6, 0, 0]"
  />

  <TresGroup ref="meshRef">
    <TresGroup ref="modelRef">
      <primitive v-if="gltfState?.scene" :object="gltfState.scene" />
    </TresGroup>
  </TresGroup>
</template>
