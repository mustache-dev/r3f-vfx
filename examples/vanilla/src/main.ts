import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { VFXParticles } from 'vanilla-vfx'
import './index.css'

async function main() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x2a1a0e)

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.set(0, 1, 3)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGPURenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.enableDamping = true

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

  const particles = new VFXParticles(renderer, { debug: true })
  scene.add(particles.object3D)
  await particles.init()

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  const clock = new THREE.Clock()

  function animate() {
    requestAnimationFrame(animate)
    controls.update()
    particles.update(clock.getDelta())
    renderer.render(scene, camera)
  }

  animate()
}

main()
