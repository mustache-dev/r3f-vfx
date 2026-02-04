import * as THREE from 'three/webgpu'
import {
  VFXParticleSystem,
  isWebGPUBackend,
  needsRecreation,
  updateUniformsPartial,
} from 'core-vfx'
import type { VFXParticleSystemOptions } from 'core-vfx'

export type VFXParticlesOptions = VFXParticleSystemOptions & {
  debug?: boolean
  /** Optional fallback Object3D to display when WebGPU is not available */
  fallback?: THREE.Object3D
}

let warnedWebGL = false

export class VFXParticles {
  readonly group: THREE.Group
  private renderer: THREE.WebGPURenderer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private config: Record<string, any>
  system: VFXParticleSystem | null = null
  isEmitting = true
  private emitAccumulator = 0
  private debug: boolean
  private initialized = false
  private disabled = false

  constructor(renderer: THREE.WebGPURenderer, options?: VFXParticlesOptions) {
    this.renderer = renderer
    this.debug = options?.debug ?? false
    this.config = { ...options }
    delete this.config.debug
    delete this.config.fallback
    this.group = new THREE.Group()

    if (!isWebGPUBackend(renderer)) {
      this.disabled = true
      if (!warnedWebGL) {
        warnedWebGL = true
        console.warn(
          'r3f-vfx: WebGPU backend not detected. Particle system disabled.'
        )
      }
      if (options?.fallback) {
        this.group.add(options.fallback)
      }
    }
  }

  get object3D(): THREE.Group {
    return this.group
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get uniforms(): Record<string, { value: any }> | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.system
      ? (this.system.uniforms as unknown as Record<string, { value: any }>)
      : null
  }

  async init(): Promise<void> {
    if (this.disabled) return
    if (this.initialized) return

    if (this.debug) {
      const { DEFAULT_VALUES } = await import('debug-vfx')
      this.config = { ...DEFAULT_VALUES, ...this.config }
    }

    await this.recreateSystem()
    this.initialized = true

    if (this.debug) {
      const { renderDebugPanel } = await import('debug-vfx')
      renderDebugPanel(
        { ...this.config },
        (newValues: Record<string, unknown>) => this.setProps(newValues),
        'vanilla'
      )
    }
  }

  update(delta: number): void {
    if (this.disabled) return
    if (!this.system || !this.system.initialized) return

    // Auto-emission
    if (this.isEmitting) {
      const delay = this.system.normalizedProps.delay
      const emitCount = this.system.normalizedProps.emitCount
      const [px, py, pz] = this.system.position

      if (!delay) {
        this.system.spawn(px, py, pz, emitCount)
      } else {
        this.emitAccumulator += delta
        if (this.emitAccumulator >= delay) {
          this.emitAccumulator -= delay
          this.system.spawn(px, py, pz, emitCount)
        }
      }
    }

    this.system.update(delta)
  }

  dispose(): void {
    if (this.system) {
      this.group.remove(this.system.renderObject)
      this.system.dispose()
      this.system = null
    }
    if (this.debug) {
      import('debug-vfx').then(({ destroyDebugPanel }) => {
        destroyDebugPanel()
      })
    }
    this.initialized = false
  }

  spawn(
    x = 0,
    y = 0,
    z = 0,
    count?: number,
    overrides?: Record<string, unknown> | null
  ): void {
    if (this.disabled) return
    if (!this.system) return
    this.system.spawn(
      x,
      y,
      z,
      count ?? this.system.normalizedProps.emitCount,
      overrides ?? null
    )
  }

  start(): void {
    if (this.disabled) return
    this.isEmitting = true
    this.emitAccumulator = 0
    if (this.system) this.system.start()
  }

  stop(): void {
    if (this.disabled) return
    this.isEmitting = false
    if (this.system) this.system.stop()
  }

  clear(): void {
    if (this.disabled) return
    if (this.system) this.system.clear()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setProps(newValues: Record<string, any>): void {
    if (this.disabled) return
    this.config = { ...this.config, ...newValues }

    // Check if structural keys or feature flags changed (requires GPU pipeline rebuild)
    if (
      this.system &&
      needsRecreation(this.system.features, newValues, this.config)
    ) {
      this.recreateSystem()
      return
    }

    // Curve changes require recreation (texture is baked into compute/material pipelines)
    if (
      'fadeSizeCurve' in newValues ||
      'fadeOpacityCurve' in newValues ||
      'velocityCurve' in newValues ||
      'rotationSpeedCurve' in newValues ||
      'curveTexturePath' in newValues
    ) {
      this.recreateSystem()
      return
    }

    // Handle geometry type changes from debug panel
    if ('geometryType' in newValues || 'geometryArgs' in newValues) {
      import('debug-vfx').then(({ createGeometry, GeometryType }) => {
        const geoType = this.config.geometryType
        if (geoType === GeometryType.NONE || !geoType) {
          this.config.geometry = null
        } else {
          this.config.geometry = createGeometry(
            geoType,
            this.config.geometryArgs
          )
        }
        this.recreateSystem()
      })
      return
    }

    // Uniform-level updates (no recreation needed)
    this.applyUniformUpdates(newValues)
  }

  private async recreateSystem(): Promise<void> {
    const old = this.system
    // Clear immediately so update() no-ops while the new system initialises
    this.system = null
    if (old) {
      this.group.remove(old.renderObject)
      // Note: we intentionally skip old.dispose() here. Calling dispose()
      // destroys GPU buffers that may still be referenced by in-flight
      // WebGPU command buffers from previous frames, causing a crash.
      // The old resources become unreferenced and will be GC'd.
    }
    const s = new VFXParticleSystem(
      this.renderer,
      this.config as VFXParticleSystemOptions
    )
    await s.init()
    this.system = s
    this.group.add(s.renderObject)
    this.emitAccumulator = 0
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyUniformUpdates(newValues: Record<string, any>): void {
    if (!this.system) return

    // Handle colorStart→colorEnd fallback before calling core
    if (
      'colorStart' in newValues &&
      newValues.colorStart &&
      !this.config.colorEnd
    ) {
      // When colorEnd is null, colorEnd should mirror colorStart
      newValues = { ...newValues, colorEnd: null }
    }
    if ('colorEnd' in newValues && !newValues.colorEnd) {
      newValues = {
        ...newValues,
        colorStart: newValues.colorStart ??
          this.config.colorStart ?? ['#ffffff'],
      }
    }

    updateUniformsPartial(this.system.uniforms, newValues)

    // Non-uniform updates
    if (newValues.position) {
      this.system.setPosition(newValues.position)
    }
    if ('delay' in newValues) {
      this.system.setDelay(newValues.delay ?? 0)
    }
    if ('emitCount' in newValues) {
      this.system.setEmitCount(newValues.emitCount ?? 1)
    }
    if (newValues.autoStart !== undefined) {
      this.isEmitting = newValues.autoStart
      if (this.isEmitting) this.system.start()
      else this.system.stop()
    }
    if (this.system.material && newValues.blending !== undefined) {
      this.system.material.blending = newValues.blending
      this.system.material.needsUpdate = true
    }
  }
}
