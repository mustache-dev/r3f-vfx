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
import {
  createCombinedCurveTexture,
  createDefaultCurveTexture,
  loadCurveTextureFromPath,
  CurveChannel,
} from './curves'
import { isWebGPUBackend } from './utils'
import {
  cpuInit,
  cpuSpawn,
  cpuUpdate,
  extractCPUArrays,
  markAllDirty,
  markUpdateDirty,
  type CPUStorageArrays,
} from './webgl-fallback'

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
  private renderer: THREE.WebGPURenderer
  nextIndex = 0
  initialized = false
  isEmitting: boolean
  private emitAccumulator = 0
  private turbulenceSpeed: number
  position: [number, number, number]
  private _isWebGL: boolean
  private _cpuArrays: CPUStorageArrays | null = null

  constructor(
    renderer: THREE.WebGPURenderer,
    options: VFXParticleSystemOptions
  ) {
    this.renderer = renderer
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

    // Handle curve texture synchronously (bake inline curves or use defaults)
    if (
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

    // Set curve enabled flags from inline curve data
    const u = this.uniforms as unknown as UniformAccessor
    u.fadeSizeCurveEnabled.value = options.fadeSizeCurve ? 1 : 0
    u.fadeOpacityCurveEnabled.value = options.fadeOpacityCurve ? 1 : 0
    u.velocityCurveEnabled.value = options.velocityCurve ? 1 : 0
    u.rotationSpeedCurveEnabled.value = options.rotationSpeedCurve ? 1 : 0

    // Detect backend
    this._isWebGL = !isWebGPUBackend(renderer)

    if (this._isWebGL) {
      // CPU fallback: extract typed arrays, skip compute shader creation
      this._cpuArrays = extractCPUArrays(this.storage)
      this.computeInit = null
      this.computeSpawn = null
      this.computeUpdate = null
    } else {
      // Create compute shaders (WebGPU path)
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
    }

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
    this.isEmitting = np.autoStart
    this.turbulenceSpeed = np.turbulence?.speed ?? 1
    this.position = [...np.position]
  }

  async init(): Promise<void> {
    if (this.initialized) return

    if (this._isWebGL) {
      cpuInit(this._cpuArrays!, this.normalizedProps.maxParticles)
      markAllDirty(this.storage)
    } else {
      await (
        this.renderer as unknown as {
          computeAsync: (c: unknown) => Promise<void>
        }
      ).computeAsync(this.computeInit)
    }

    // If curveTexturePath is set, load async and update texture in-place
    if (this.options.curveTexturePath) {
      try {
        const result = await loadCurveTextureFromPath(
          this.options.curveTexturePath
        )
        // Copy loaded RGBA data into existing texture in-place
        const src = result.texture.image.data as Float32Array
        const dst = this.curveTexture.image.data as Float32Array
        dst.set(src)
        this.curveTexture.needsUpdate = true
        result.texture.dispose()

        // Update curve-enabled uniforms from loaded channel bitmask
        const u = this.uniforms as unknown as UniformAccessor
        u.fadeSizeCurveEnabled.value =
          result.activeChannels & CurveChannel.SIZE ? 1 : 0
        u.fadeOpacityCurveEnabled.value =
          result.activeChannels & CurveChannel.OPACITY ? 1 : 0
        u.velocityCurveEnabled.value =
          result.activeChannels & CurveChannel.VELOCITY ? 1 : 0
        u.rotationSpeedCurveEnabled.value =
          result.activeChannels & CurveChannel.ROTATION_SPEED ? 1 : 0
      } catch (err) {
        console.warn(
          `Failed to load curve texture: ${this.options.curveTexturePath}, using baked/default`,
          err
        )
        // Keep the synchronously created texture (baked or default)
      }
    }

    this.initialized = true
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
    this.initialized = false
    this.nextIndex = 0
  }

  spawn(
    x: number,
    y: number,
    z: number,
    count = 20,
    overrides: Record<string, unknown> | null = null
  ): void {
    if (!this.initialized || !this.renderer) return

    const restore = applySpawnOverrides(this.uniforms, overrides)

    const u = this.uniforms as unknown as UniformAccessor

    const startIdx = this.nextIndex
    const endIdx = (startIdx + count) % this.normalizedProps.maxParticles

    u.spawnPosition.value.set(x, y, z)
    u.spawnIndexStart.value = startIdx
    u.spawnIndexEnd.value = endIdx
    u.spawnSeed.value = Math.random() * 10000

    this.nextIndex = endIdx

    if (this._isWebGL) {
      cpuSpawn(
        this._cpuArrays!,
        this.uniforms,
        this.normalizedProps.maxParticles
      )
      markAllDirty(this.storage)
    } else {
      ;(
        this.renderer as unknown as {
          computeAsync: (c: unknown) => Promise<void>
        }
      ).computeAsync(this.computeSpawn)
    }

    if (restore) restore()
  }

  async update(delta: number): Promise<void> {
    if (!this.initialized || !this.renderer) return

    const u = this.uniforms as unknown as UniformAccessor
    u.deltaTime.value = delta
    u.turbulenceTime.value += delta * this.turbulenceSpeed

    if (this._isWebGL) {
      cpuUpdate(
        this._cpuArrays!,
        this.uniforms,
        this.curveTexture,
        this.normalizedProps.maxParticles,
        {
          turbulence: this.features.turbulence,
          attractors: this.features.attractors,
          collision: this.features.collision,
          rotation: this.features.rotation,
        }
      )
      markUpdateDirty(this.storage, this.features.rotation)
    } else {
      await (
        this.renderer as unknown as {
          computeAsync: (c: unknown) => Promise<void>
        }
      ).computeAsync(this.computeUpdate)
    }
  }

  autoEmit(delta: number): void {
    if (!this.isEmitting) return

    const [px, py, pz] = this.position
    const currentDelay = this.normalizedProps.delay
    const currentEmitCount = this.normalizedProps.emitCount

    if (!currentDelay) {
      this.spawn(px, py, pz, currentEmitCount)
    } else {
      this.emitAccumulator += delta

      if (this.emitAccumulator >= currentDelay) {
        this.emitAccumulator -= currentDelay
        this.spawn(px, py, pz, currentEmitCount)
      }
    }
  }

  start(): void {
    this.isEmitting = true
    this.emitAccumulator = 0
  }

  stop(): void {
    this.isEmitting = false
  }

  clear(): void {
    if (this._isWebGL) {
      cpuInit(this._cpuArrays!, this.normalizedProps.maxParticles)
      markAllDirty(this.storage)
    } else {
      ;(
        this.renderer as unknown as {
          computeAsync: (c: unknown) => Promise<void>
        }
      ).computeAsync(this.computeInit)
    }
    this.nextIndex = 0
  }

  updateProps(props: Partial<BaseParticleProps>): void {
    const np = normalizeProps({ ...this.options, ...props })
    updateUniforms(this.uniforms, np)
  }

  setPosition(position: [number, number, number]): void {
    this.position = [...position]
  }

  setDelay(delay: number): void {
    this.normalizedProps.delay = delay
  }

  setEmitCount(emitCount: number): void {
    this.normalizedProps.emitCount = emitCount
  }

  setTurbulenceSpeed(speed: number): void {
    this.turbulenceSpeed = speed
  }

  setCurveTexture(texture: THREE.DataTexture): void {
    this.curveTexture = texture
  }
}
