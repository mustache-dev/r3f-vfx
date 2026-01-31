import * as THREE from 'three/webgpu'
import type {
  VFXParticleSystemOptions,
  NormalizedParticleProps,
  BaseParticleProps,
} from './types'
import type {
  ParticleStorageArrays,
  ParticleUniforms,
  ShaderFeatures,
} from './shaders/types'
import { normalizeProps } from './utils'
import { createUniforms, updateUniforms, applySpawnOverrides } from './uniforms'
import {
  resolveFeatures,
  createStorageArrays,
  createRenderObject,
} from './storage'
import {
  createInitCompute,
  createSpawnCompute,
  createUpdateCompute,
  createParticleMaterial,
} from './shaders'
import { createCombinedCurveTexture, createDefaultCurveTexture } from './curves'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UniformAccessor = Record<string, { value: any }>

export class VFXParticleSystem {
  // GPU resources (public, read-only)
  readonly uniforms: ParticleUniforms
  readonly storage: ParticleStorageArrays
  readonly features: ShaderFeatures
  renderObject: THREE.Sprite | THREE.InstancedMesh
  material: THREE.Material
  curveTexture: THREE.DataTexture
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computeInit: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computeSpawn: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computeUpdate: any
  readonly options: VFXParticleSystemOptions
  readonly normalizedProps: NormalizedParticleProps

  // Internal state
  private _renderer: THREE.WebGPURenderer
  private _nextIndex = 0
  private _initialized = false
  private _emitting: boolean
  private _emitAccumulator = 0
  private _turbulenceSpeed: number
  private _position: [number, number, number]

  constructor(
    renderer: THREE.WebGPURenderer,
    options: VFXParticleSystemOptions,
    curveTexture?: THREE.DataTexture,
    curveTextureChannels?: {
      sizeEnabled: boolean
      opacityEnabled: boolean
      velocityEnabled: boolean
      rotationSpeedEnabled: boolean
    }
  ) {
    this._renderer = renderer
    this.options = options

    // Normalize props
    this.normalizedProps = normalizeProps(options)

    // Apply depthTest and renderOrder overrides
    if (options.depthTest !== undefined) {
      this.normalizedProps.depthTest = options.depthTest
    }
    if (options.renderOrder !== undefined) {
      this.normalizedProps.renderOrder = options.renderOrder
    }

    const np = this.normalizedProps

    // Resolve features
    this.features = resolveFeatures(options)

    // Create uniforms
    this.uniforms = createUniforms(np)

    // Create storage arrays
    this.storage = createStorageArrays(np.maxParticles, this.features)

    // Handle curve texture
    if (curveTexture) {
      this.curveTexture = curveTexture
    } else if (
      options.fadeSizeCurve ||
      options.fadeOpacityCurve ||
      options.velocityCurve ||
      options.rotationSpeedCurve
    ) {
      this.curveTexture = createCombinedCurveTexture(
        options.fadeSizeCurve ?? null,
        options.fadeOpacityCurve ?? null,
        options.velocityCurve ?? null,
        options.rotationSpeedCurve ?? null
      )
    } else {
      this.curveTexture = createDefaultCurveTexture()
    }

    // Set curve enabled flags
    const u = this.uniforms as unknown as UniformAccessor
    if (curveTextureChannels) {
      u.fadeSizeCurveEnabled.value = curveTextureChannels.sizeEnabled ? 1 : 0
      u.fadeOpacityCurveEnabled.value = curveTextureChannels.opacityEnabled
        ? 1
        : 0
      u.velocityCurveEnabled.value = curveTextureChannels.velocityEnabled
        ? 1
        : 0
      u.rotationSpeedCurveEnabled.value =
        curveTextureChannels.rotationSpeedEnabled ? 1 : 0
    } else {
      u.fadeSizeCurveEnabled.value = options.fadeSizeCurve ? 1 : 0
      u.fadeOpacityCurveEnabled.value = options.fadeOpacityCurve ? 1 : 0
      u.velocityCurveEnabled.value = options.velocityCurve ? 1 : 0
      u.rotationSpeedCurveEnabled.value = options.rotationSpeedCurve ? 1 : 0
    }

    // Create compute shaders
    this.computeInit = createInitCompute(this.storage, np.maxParticles)
    this.computeSpawn = createSpawnCompute(
      this.storage,
      this.uniforms,
      np.maxParticles
    )
    this.computeUpdate = createUpdateCompute(
      this.storage,
      this.uniforms,
      this.curveTexture,
      np.maxParticles,
      {
        turbulence: this.features.turbulence,
        attractors: this.features.attractors,
        collision: this.features.collision,
        rotation: this.features.rotation,
        perParticleColor: this.features.perParticleColor,
      }
    )

    // Create material
    this.material = createParticleMaterial(
      this.storage,
      this.uniforms,
      this.curveTexture,
      {
        alphaMap: np.alphaMap,
        flipbook: np.flipbook,
        appearance: np.appearance,
        lighting: np.lighting,
        softParticles: np.softParticles,
        geometry: np.geometry,
        orientToDirection: np.orientToDirection,
        shadow: np.shadow,
        blending: np.blending,
        opacityNode: options.opacityNode ?? null,
        colorNode: options.colorNode ?? null,
        backdropNode: options.backdropNode ?? null,
        alphaTestNode: options.alphaTestNode ?? null,
        castShadowNode: options.castShadowNode ?? null,
      }
    )

    // Create render object
    this.renderObject = createRenderObject(
      np.geometry,
      this.material,
      np.maxParticles,
      np.shadow
    )

    // Internal state
    this._emitting = np.autoStart
    this._turbulenceSpeed = np.turbulence?.speed ?? 1
    this._position = [...np.position]
  }

  async init(): Promise<void> {
    if (this._initialized) return
    await (
      this._renderer as unknown as {
        computeAsync: (c: unknown) => Promise<void>
      }
    ).computeAsync(this.computeInit)
    this._initialized = true
  }

  dispose(): void {
    if (this.material) {
      this.material.dispose()
    }
    if (this.renderObject) {
      if (this.renderObject.geometry && !this.normalizedProps.geometry) {
        this.renderObject.geometry.dispose()
      }
    }
    this._initialized = false
    this._nextIndex = 0
  }

  spawn(
    x: number,
    y: number,
    z: number,
    count = 20,
    overrides: Record<string, unknown> | null = null
  ): void {
    if (!this._initialized || !this._renderer) return

    const restore = applySpawnOverrides(this.uniforms, overrides)

    const u = this.uniforms as unknown as UniformAccessor

    const startIdx = this._nextIndex
    const endIdx = (startIdx + count) % this.normalizedProps.maxParticles

    u.spawnPosition.value.set(x, y, z)
    u.spawnIndexStart.value = startIdx
    u.spawnIndexEnd.value = endIdx
    u.spawnSeed.value = Math.random() * 10000

    this._nextIndex = endIdx
    ;(
      this._renderer as unknown as {
        computeAsync: (c: unknown) => Promise<void>
      }
    ).computeAsync(this.computeSpawn)

    if (restore) restore()
  }

  async update(delta: number): Promise<void> {
    if (!this._initialized || !this._renderer) return

    const u = this.uniforms as unknown as UniformAccessor
    u.deltaTime.value = delta
    u.turbulenceTime.value += delta * this._turbulenceSpeed

    await (
      this._renderer as unknown as {
        computeAsync: (c: unknown) => Promise<void>
      }
    ).computeAsync(this.computeUpdate)
  }

  autoEmit(delta: number): void {
    if (!this._emitting) return

    const [px, py, pz] = this._position
    const currentDelay = this.normalizedProps.delay
    const currentEmitCount = this.normalizedProps.emitCount

    if (!currentDelay) {
      this.spawn(px, py, pz, currentEmitCount)
    } else {
      this._emitAccumulator += delta

      if (this._emitAccumulator >= currentDelay) {
        this._emitAccumulator -= currentDelay
        this.spawn(px, py, pz, currentEmitCount)
      }
    }
  }

  start(): void {
    this._emitting = true
    this._emitAccumulator = 0
  }

  stop(): void {
    this._emitting = false
  }

  clear(): void {
    ;(
      this._renderer as unknown as {
        computeAsync: (c: unknown) => Promise<void>
      }
    ).computeAsync(this.computeInit)
    this._nextIndex = 0
  }

  updateProps(props: Partial<BaseParticleProps>): void {
    const np = normalizeProps({ ...this.options, ...props })
    updateUniforms(this.uniforms, np)
  }

  setPosition(position: [number, number, number]): void {
    this._position = [...position]
  }

  setDelay(delay: number): void {
    this.normalizedProps.delay = delay
  }

  setEmitCount(emitCount: number): void {
    this.normalizedProps.emitCount = emitCount
  }

  setTurbulenceSpeed(speed: number): void {
    this._turbulenceSpeed = speed
  }

  setCurveTexture(texture: THREE.DataTexture): void {
    this.curveTexture = texture
  }

  get isEmitting(): boolean {
    return this._emitting
  }

  set isEmitting(value: boolean) {
    this._emitting = value
  }

  get initialized(): boolean {
    return this._initialized
  }

  set initialized(value: boolean) {
    this._initialized = value
  }

  get nextIndex(): number {
    return this._nextIndex
  }

  set nextIndex(value: number) {
    this._nextIndex = value
  }

  get position(): [number, number, number] {
    return this._position
  }
}
