import { Vector3, Quaternion } from 'three/webgpu'
import type { Quaternion as QuaternionType } from 'three'
import type { EmitterControllerOptions } from './types'
import type { ParticleSystemRef } from './core-store'

// Reusable temp objects for transforms (avoid allocations in update loop)
const tempVec = new Vector3()

export class EmitterController {
  private system: ParticleSystemRef | null = null
  isEmitting: boolean
  private emitAccumulator = 0
  private hasEmittedOnce = false
  private options: EmitterControllerOptions

  constructor(options: EmitterControllerOptions) {
    this.options = { ...options }
    this.isEmitting = options.autoStart ?? true
  }

  setSystem(system: ParticleSystemRef | null): void {
    this.system = system
  }

  getSystem(): ParticleSystemRef | null {
    return this.system
  }

  updateOptions(options: Partial<EmitterControllerOptions>): void {
    this.options = { ...this.options, ...options }
    if (options.autoStart !== undefined) {
      this.isEmitting = options.autoStart
      if (options.autoStart) {
        this.hasEmittedOnce = false
        this.emitAccumulator = 0
      }
    }
  }

  // Transform a direction range by quaternion
  transformDirectionByQuat(
    dirRange: [[number, number], [number, number], [number, number]],
    quat: QuaternionType
  ): [[number, number], [number, number], [number, number]] {
    const minDir = tempVec.set(dirRange[0][0], dirRange[1][0], dirRange[2][0])
    minDir.applyQuaternion(quat)

    const maxDir = new Vector3(dirRange[0][1], dirRange[1][1], dirRange[2][1])
    maxDir.applyQuaternion(quat)

    return [
      [Math.min(minDir.x, maxDir.x), Math.max(minDir.x, maxDir.x)],
      [Math.min(minDir.y, maxDir.y), Math.max(minDir.y, maxDir.y)],
      [Math.min(minDir.z, maxDir.z), Math.max(minDir.z, maxDir.z)],
    ]
  }

  update(
    delta: number,
    worldPosition: { x: number; y: number; z: number },
    worldQuaternion?: QuaternionType
  ): void {
    if (!this.isEmitting) return

    const loop = this.options.loop ?? true
    if (!loop && this.hasEmittedOnce) return

    const delay = this.options.delay ?? 0

    if (delay <= 0) {
      const success = this.emitAtPosition(worldPosition, worldQuaternion)
      if (success) this.hasEmittedOnce = true
    } else {
      this.emitAccumulator += delta

      if (this.emitAccumulator >= delay) {
        this.emitAccumulator -= delay
        const success = this.emitAtPosition(worldPosition, worldQuaternion)
        if (success) this.hasEmittedOnce = true
      }
    }
  }

  emit(emitOverrides: Record<string, unknown> | null = null): boolean {
    if (!this.system?.spawn) return false

    // This version needs position from the framework wrapper
    // Use [0,0,0] as default - framework wrappers should use emitAtPosition
    return this.doEmit({ x: 0, y: 0, z: 0 }, undefined, emitOverrides)
  }

  emitAtPosition(
    worldPosition: { x: number; y: number; z: number },
    worldQuaternion?: QuaternionType,
    emitOverrides: Record<string, unknown> | null = null
  ): boolean {
    return this.doEmit(worldPosition, worldQuaternion, emitOverrides)
  }

  burst(
    count: number,
    worldPosition: { x: number; y: number; z: number },
    worldQuaternion?: QuaternionType
  ): boolean {
    if (!this.system?.spawn) return false

    const direction = this.options.direction
    let emitDir = direction

    if (this.options.localDirection && direction && worldQuaternion) {
      emitDir = this.transformDirectionByQuat(direction, worldQuaternion)
    }

    const finalOverrides = emitDir
      ? { ...this.options.overrides, direction: emitDir }
      : this.options.overrides

    this.system.spawn(
      worldPosition.x,
      worldPosition.y,
      worldPosition.z,
      count ?? this.options.emitCount ?? 10,
      finalOverrides
    )

    if (this.options.onEmit) {
      this.options.onEmit({
        position: [worldPosition.x, worldPosition.y, worldPosition.z],
        count: count ?? this.options.emitCount ?? 10,
        direction: emitDir,
      })
    }

    return true
  }

  start(): void {
    this.isEmitting = true
    this.hasEmittedOnce = false
    this.emitAccumulator = 0
  }

  stop(): void {
    this.isEmitting = false
  }

  private doEmit(
    worldPosition: { x: number; y: number; z: number },
    worldQuaternion?: QuaternionType,
    emitOverrides: Record<string, unknown> | null = null
  ): boolean {
    if (!this.system?.spawn) return false

    const direction = this.options.direction
    let emitDir = direction

    if (this.options.localDirection && direction && worldQuaternion) {
      emitDir = this.transformDirectionByQuat(direction, worldQuaternion)
    }

    // Check if emit-time overrides include a direction
    const emitTimeDirection = emitOverrides?.direction as
      | [[number, number], [number, number], [number, number]]
      | undefined

    let finalDir = emitDir
    if (emitTimeDirection && this.options.localDirection && worldQuaternion) {
      finalDir = this.transformDirectionByQuat(
        emitTimeDirection,
        worldQuaternion
      )
    } else if (emitTimeDirection) {
      finalDir = emitTimeDirection
    }

    // Merge: component overrides -> emit-time overrides (without direction) -> final direction
    const { direction: _, ...emitOverridesWithoutDir } = emitOverrides || {}
    const mergedOverrides = {
      ...this.options.overrides,
      ...emitOverridesWithoutDir,
    }
    const finalOverrides = finalDir
      ? { ...mergedOverrides, direction: finalDir }
      : mergedOverrides

    const emitCount = this.options.emitCount ?? 10

    this.system.spawn(
      worldPosition.x,
      worldPosition.y,
      worldPosition.z,
      emitCount,
      finalOverrides
    )

    if (this.options.onEmit) {
      this.options.onEmit({
        position: [worldPosition.x, worldPosition.y, worldPosition.z],
        count: emitCount,
        direction: finalDir,
      })
    }

    return true
  }
}
