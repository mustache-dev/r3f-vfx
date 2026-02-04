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

let _warnedWebGL = false

export class VFXParticles {
  readonly group: THREE.Group
  private _renderer: THREE.WebGPURenderer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _config: Record<string, any>
  private _system: VFXParticleSystem | null = null
  private _emitting = true
  private _emitAccumulator = 0
  private _debug: boolean
  private _initialized = false
  private _disabled = false

  constructor(renderer: THREE.WebGPURenderer, options?: VFXParticlesOptions) {
    this._renderer = renderer
    this._debug = options?.debug ?? false
    this._config = { ...options }
    delete this._config.debug
    delete this._config.fallback
    this.group = new THREE.Group()

    if (!isWebGPUBackend(renderer)) {
      this._disabled = true
      if (!_warnedWebGL) {
        _warnedWebGL = true
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

  get system(): VFXParticleSystem | null {
    return this._system
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get uniforms(): Record<string, { value: any }> | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._system
      ? (this._system.uniforms as unknown as Record<string, { value: any }>)
      : null
  }

  get isEmitting(): boolean {
    return this._emitting
  }

  async init(): Promise<void> {
    if (this._disabled) return
    if (this._initialized) return

    if (this._debug) {
      const { DEFAULT_VALUES } = await import('debug-vfx')
      this._config = { ...DEFAULT_VALUES, ...this._config }
    }

    await this._recreateSystem()
    this._initialized = true

    if (this._debug) {
      const { renderDebugPanel } = await import('debug-vfx')
      renderDebugPanel(
        { ...this._config },
        (newValues: Record<string, unknown>) => this.setProps(newValues),
        'vanilla'
      )
    }
  }

  update(delta: number): void {
    if (this._disabled) return
    if (!this._system || !this._system.initialized) return

    // Auto-emission
    if (this._emitting) {
      const delay = this._system.normalizedProps.delay
      const emitCount = this._system.normalizedProps.emitCount
      const [px, py, pz] = this._system.position

      if (!delay) {
        this._system.spawn(px, py, pz, emitCount)
      } else {
        this._emitAccumulator += delta
        if (this._emitAccumulator >= delay) {
          this._emitAccumulator -= delay
          this._system.spawn(px, py, pz, emitCount)
        }
      }
    }

    this._system.update(delta)
  }

  dispose(): void {
    if (this._system) {
      this.group.remove(this._system.renderObject)
      this._system.dispose()
      this._system = null
    }
    if (this._debug) {
      import('debug-vfx').then(({ destroyDebugPanel }) => {
        destroyDebugPanel()
      })
    }
    this._initialized = false
  }

  spawn(
    x = 0,
    y = 0,
    z = 0,
    count?: number,
    overrides?: Record<string, unknown> | null
  ): void {
    if (this._disabled) return
    if (!this._system) return
    this._system.spawn(
      x,
      y,
      z,
      count ?? this._system.normalizedProps.emitCount,
      overrides ?? null
    )
  }

  start(): void {
    if (this._disabled) return
    this._emitting = true
    this._emitAccumulator = 0
    if (this._system) this._system.start()
  }

  stop(): void {
    if (this._disabled) return
    this._emitting = false
    if (this._system) this._system.stop()
  }

  clear(): void {
    if (this._disabled) return
    if (this._system) this._system.clear()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setProps(newValues: Record<string, any>): void {
    if (this._disabled) return
    this._config = { ...this._config, ...newValues }

    // Check if structural keys or feature flags changed (requires GPU pipeline rebuild)
    if (
      this._system &&
      needsRecreation(this._system.features, newValues, this._config)
    ) {
      this._recreateSystem()
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
      this._recreateSystem()
      return
    }

    // Handle geometry type changes from debug panel
    if ('geometryType' in newValues || 'geometryArgs' in newValues) {
      import('debug-vfx').then(({ createGeometry, GeometryType }) => {
        const geoType = this._config.geometryType
        if (geoType === GeometryType.NONE || !geoType) {
          this._config.geometry = null
        } else {
          this._config.geometry = createGeometry(
            geoType,
            this._config.geometryArgs
          )
        }
        this._recreateSystem()
      })
      return
    }

    // Uniform-level updates (no recreation needed)
    this._applyUniformUpdates(newValues)
  }

  private async _recreateSystem(): Promise<void> {
    const old = this._system
    // Clear immediately so update() no-ops while the new system initialises
    this._system = null
    if (old) {
      this.group.remove(old.renderObject)
      // Note: we intentionally skip old.dispose() here. Calling dispose()
      // destroys GPU buffers that may still be referenced by in-flight
      // WebGPU command buffers from previous frames, causing a crash.
      // The old resources become unreferenced and will be GC'd.
    }
    const s = new VFXParticleSystem(
      this._renderer,
      this._config as VFXParticleSystemOptions
    )
    await s.init()
    this._system = s
    this.group.add(s.renderObject)
    this._emitAccumulator = 0
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _applyUniformUpdates(newValues: Record<string, any>): void {
    if (!this._system) return

    // Handle colorStart→colorEnd fallback before calling core
    if (
      'colorStart' in newValues &&
      newValues.colorStart &&
      !this._config.colorEnd
    ) {
      // When colorEnd is null, colorEnd should mirror colorStart
      newValues = { ...newValues, colorEnd: null }
    }
    if ('colorEnd' in newValues && !newValues.colorEnd) {
      newValues = {
        ...newValues,
        colorStart: newValues.colorStart ??
          this._config.colorStart ?? ['#ffffff'],
      }
    }

    updateUniformsPartial(this._system.uniforms, newValues)

    // Non-uniform updates
    if (newValues.position) {
      this._system.setPosition(newValues.position)
    }
    if ('delay' in newValues) {
      this._system.setDelay(newValues.delay ?? 0)
    }
    if ('emitCount' in newValues) {
      this._system.setEmitCount(newValues.emitCount ?? 1)
    }
    if (newValues.autoStart !== undefined) {
      this._emitting = newValues.autoStart
      if (this._emitting) this._system.start()
      else this._system.stop()
    }
    if (this._system.material && newValues.blending !== undefined) {
      this._system.material.blending = newValues.blending
      this._system.material.needsUpdate = true
    }
  }
}
