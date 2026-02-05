import * as THREE from 'three/webgpu'
import {
  abs,
  cameraPosition,
  color,
  float,
  fract,
  max,
  mix,
  positionLocal,
  positionWorld,
  step,
  texture,
  uv,
  vec3,
  vec4,
} from 'three/tsl'
import { pass, mrt, output, velocity } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VFXParticles } from 'vanilla-vfx'
import { damp } from 'three/src/math/MathUtils.js'
import './index.css'

// ---------------------------------------------------------------------------
// Attack combo
// ---------------------------------------------------------------------------
const ATTACK_COMBO = [
  'sword-attack-01',
  'sword-attack-03',
  'sword-attack-04',
] as const

async function main() {
  // =========================================================================
  // Scene setup
  // =========================================================================
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x2a1a0e)

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.set(0, 3, 10)
  camera.rotation.set(-Math.PI / 6, 0, 0)

  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    forceWebGL: false,
  })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  // =========================================================================
  // Lighting
  // =========================================================================
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffe7bd, 3)
  directionalLight.position.set(5, 10, 5)
  directionalLight.castShadow = true
  directionalLight.shadow.bias = -0.0001
  directionalLight.shadow.mapSize.set(2048, 2048)
  directionalLight.shadow.camera.left = -20
  directionalLight.shadow.camera.right = 20
  directionalLight.shadow.camera.top = 20
  directionalLight.shadow.camera.bottom = -20
  directionalLight.shadow.camera.near = 0.1
  directionalLight.shadow.camera.far = 50
  scene.add(directionalLight)

  // =========================================================================
  // Floor (TSL grid material)
  // =========================================================================
  const floorMat = new THREE.MeshStandardNodeMaterial({
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
  const gridColor = vec3(0.5, 0.4, 0.1).add(vec3(0.8, 0.7, 0.3).mul(grid))
  floorMat.colorNode = gridColor

  const zDist = abs(positionWorld.z.sub(cameraPosition.z))
  const dropAmount = zDist.mul(zDist).mul(0.008)
  floorMat.positionNode = positionLocal.add(vec3(0, 0, dropAmount.negate()))

  const floorGeo = new THREE.PlaneGeometry(100, 100, 200, 200)
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.receiveShadow = true
  floor.position.y = -1
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  // =========================================================================
  // Witch model
  // =========================================================================
  const playerGroup = new THREE.Group()
  const modelGroup = new THREE.Group()
  playerGroup.add(modelGroup)
  scene.add(playerGroup)

  let mixer: THREE.AnimationMixer | null = null
  const actions: Record<string, THREE.AnimationAction> = {}
  let currentAnimationName = 'idle-sword'
  let isAttacking = false
  let comboIndex = 0
  let nextAttackQueued = false
  let baseAnimation = 'idle-sword'

  const playAnimation = (name: string, fadeIn = 0.2) => {
    if (currentAnimationName === name) return
    if (currentAnimationName && actions[currentAnimationName]) {
      actions[currentAnimationName].fadeOut(fadeIn)
    }
    const action = actions[name]
    if (action) {
      action.reset().fadeIn(fadeIn).play()
      if (name === 'run') {
        action.setEffectiveTimeScale(2)
      }
      if (ATTACK_COMBO.includes(name as (typeof ATTACK_COMBO)[number])) {
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
      }
    }
    currentAnimationName = name
  }

  const triggerAttack = () => {
    if (!isAttacking) {
      isAttacking = true
      comboIndex = 0
      nextAttackQueued = false
      playAnimation(ATTACK_COMBO[0], 0.1)
    } else {
      nextAttackQueued = true
    }
  }

  const gltf = await new GLTFLoader().loadAsync('./witch-test.glb')
  const witchScene = gltf.scene
  modelGroup.add(witchScene)

  witchScene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
    if (child.name === 'Cylinder001') {
      child.visible = false
    }
  })

  mixer = new THREE.AnimationMixer(witchScene)
  for (const clip of gltf.animations) {
    actions[clip.name] = mixer.clipAction(clip)
  }

  mixer.addEventListener('finished', (e: { action: THREE.AnimationAction }) => {
    const finishedName = e.action.getClip().name
    if (ATTACK_COMBO.includes(finishedName as (typeof ATTACK_COMBO)[number])) {
      if (nextAttackQueued && comboIndex < ATTACK_COMBO.length - 1) {
        comboIndex++
        nextAttackQueued = false
        playAnimation(ATTACK_COMBO[comboIndex], 0.1)
      } else {
        isAttacking = false
        comboIndex = 0
        nextAttackQueued = false
        playAnimation(baseAnimation, 0.2)
      }
    }
  })

  // Play wind + idle
  actions['wind']?.play()
  playAnimation('idle-sword')

  // =========================================================================
  // Keyboard controls
  // =========================================================================
  const keys: Record<string, boolean> = {}
  let attackEdge = false

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true
  })
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false
    if (e.code === 'KeyE') attackEdge = false
  })

  const isForward = () => keys['ArrowUp'] || keys['KeyW']
  const isBackward = () => keys['ArrowDown'] || keys['KeyS']
  const isLeft = () => keys['ArrowLeft'] || keys['KeyA']
  const isRight = () => keys['ArrowRight'] || keys['KeyD']
  const isRun = () => keys['ShiftLeft'] || keys['ShiftRight']
  const isAttackKey = () => keys['KeyE']

  // =========================================================================
  // Player movement state
  // =========================================================================
  const walkSpeed = 5
  const runSpeed = 10
  const vel = new THREE.Vector3()
  let targetRotation = 0

  // =========================================================================
  // Boom particle effect
  // =========================================================================
  const smokeTexture = await new THREE.TextureLoader().loadAsync(
    './smoke-ww.png'
  )
  smokeTexture.colorSpace = THREE.SRGBColorSpace

  const blackColor = color('#FFE25B').mul(10)
  const whiteColor = color('#FED44C')
  const black2 = color('#A0251F').mul(10)
  const white2 = color('#692522')
  const black3 = color('#ececec')
  const white3 = color('#3c3c3c')

  const colorNode = (progress: ReturnType<typeof float>) => {
    const vUv = uv()
    const tileSize = 1.0 / 3.0
    const centerTileUV = vUv.mul(tileSize).add(vec3(tileSize, tileSize, 0))
    const smokeColor = texture(smokeTexture, centerTileUV)
    const grayscale = smokeColor.r
    const smoothProgress = progress.smoothstep(0, 0.5)

    const color1 = mix(blackColor, black2, smoothProgress)
    const color2 = mix(whiteColor, white2, smoothProgress)
    const endProgress = progress.smoothstep(0.5, 1)
    const finalColor1 = mix(color1, black3, endProgress)
    const finalColor2 = mix(color2, white3, endProgress)
    const finalColor = mix(finalColor1, finalColor2, grayscale)

    return vec4(
      finalColor.mul(endProgress.oneMinus()),
      smokeColor.a.sub(endProgress)
    )
  }

  const fallbackTexture = await new THREE.TextureLoader().loadAsync(
    './fallback.png'
  )
  const createFallbackSprite = () => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: fallbackTexture })
    )
    sprite.scale.set(3, 3, 1)
    return sprite
  }

  const particles = new VFXParticles(renderer, {
    fallback: createFallbackSprite(),
    autoStart: false,
    curveTexturePath: './boom-2.bin',
    emitCount: 100,
    delay: 2,
    size: [0.52, 0.86],
    speed: [0.6, 0.6],
    lifetime: [2, 2.5],
    startPositionAsDirection: true,
    rotation: [
      [0, 0],
      [-Math.PI * 2, Math.PI * 2],
      [0, 0],
    ],
    rotationSpeed: [
      [0, 0],
      [-3, 3],
      [0, 0],
    ],
    appearance: 'default',
    lighting: 'basic',
    emitterShape: 2,
    emitterRadius: [0, 0.21],
    colorNode: ({ progress }: { progress: ReturnType<typeof float> }) =>
      colorNode(progress),
  })
  scene.add(particles.object3D)
  await particles.init()
  particles.stop()

  // Boom trajectory state
  const gravity = -9.8
  const upSpeed = 6
  const outSpeed = 3
  const boomVectors = Array(5)
    .fill(null)
    .map(() => new THREE.Vector3())
  const boomVelocities = Array(5)
    .fill(null)
    .map((_, i) => {
      const angle = (Math.PI * 2 * i) / 5
      return new THREE.Vector3(
        Math.cos(angle) * outSpeed,
        upSpeed,
        Math.sin(angle) * outSpeed
      )
    })
  let boomTimer = 0

  // =========================================================================
  // Debug particles (default, next to boom)
  // =========================================================================
  const debugParticles = new VFXParticles(renderer, {
    fallback: createFallbackSprite(),
    debug: true,
  })
  debugParticles.object3D.position.set(5, 0, 0)
  scene.add(debugParticles.object3D)
  await debugParticles.init()

  // =========================================================================
  // Post-processing
  // =========================================================================
  const scenePass = pass(scene, camera, {
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
  const bloomPass = bloom(scenePassColor, 0.15, 0.1, 0)
  const withBloom = scenePassColor.add(bloomPass)
  const finalOutput = smaa(withBloom)

  const postProcessing = new THREE.PostProcessing(renderer)
  postProcessing.outputNode = finalOutput

  // =========================================================================
  // Resize
  // =========================================================================
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // =========================================================================
  // Animation loop
  // =========================================================================
  const clock = new THREE.Clock()

  function animate() {
    requestAnimationFrame(animate)
    const delta = clock.getDelta()

    // -- Mixer --
    mixer?.update(delta)

    // -- Attack edge detection --
    if (isAttackKey() && !attackEdge) {
      attackEdge = true
      triggerAttack()
    } else if (!isAttackKey()) {
      attackEdge = false
    }

    // -- Player movement --
    const moveX = (isRight() ? 1 : 0) - (isLeft() ? 1 : 0)
    const moveZ = (isBackward() ? 1 : 0) - (isForward() ? 1 : 0)
    const speed = isRun() ? runSpeed : walkSpeed
    const isMoving = moveX !== 0 || moveZ !== 0

    vel
      .set(moveX, 0, moveZ)
      .normalize()
      .multiplyScalar(speed * delta)
    playerGroup.position.add(vel)
    playerGroup.position.y = -1.2

    if (isMoving) {
      targetRotation = Math.atan2(-moveX, -moveZ)
      const currentRotation = modelGroup.rotation.y
      const diff = targetRotation - currentRotation
      let shortestDiff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI
      if (shortestDiff < -Math.PI) shortestDiff += Math.PI * 2
      modelGroup.rotation.y = damp(
        currentRotation,
        currentRotation + shortestDiff,
        10,
        delta
      )
    }

    // -- Animation state --
    const newAnim = isMoving ? (isRun() ? 'run' : 'walk') : 'idle'
    if (newAnim !== baseAnimation) {
      baseAnimation = newAnim
      if (!isAttacking) {
        playAnimation(newAnim === 'idle' ? 'idle-sword' : newAnim)
      }
    }

    // -- Camera follow --
    camera.position.x = damp(
      camera.position.x,
      playerGroup.position.x,
      4,
      delta
    )
    camera.position.z = damp(
      camera.position.z,
      playerGroup.position.z + 5,
      4,
      delta
    )

    // -- Boom particle trajectories --
    boomTimer += delta
    for (let i = 0; i < 5; i++) {
      boomVelocities[i].y += gravity * delta
      boomVectors[i].addScaledVector(boomVelocities[i], delta)

      particles.spawn(boomVectors[i].x, boomVectors[i].y, boomVectors[i].z, 1, {
        emitterShape: 2,
        emitterRadius: [0, 0],
        size: [0.1, 0.3],
        speed: [1.2, 1.2],
      })
    }

    if (boomTimer > 2) {
      particles.spawn(0, -0.5, 0, 100, {
        emitterShape: 4,
        emitterRadius: [0, 0.01],
        size: [0.3, 0.4],
        speed: [1.2, 1.2],
      })
      particles.spawn(0, 0, 0, 100)

      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5
        boomVectors[i].set(0, -0.5, 0)
        boomVelocities[i].set(
          Math.cos(angle) * outSpeed,
          upSpeed,
          Math.sin(angle) * outSpeed
        )
      }
      boomTimer = 0
    }

    // -- Particles --
    particles.update(delta)
    debugParticles.update(delta)

    // -- Render --
    postProcessing.render()
  }

  animate()
}

main()
