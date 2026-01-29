import { createStore } from 'zustand/vanilla'

export type ParticleSystemRef = {
  spawn: (
    x: number,
    y: number,
    z: number,
    count: number,
    overrides?: Record<string, unknown> | null
  ) => void
  start: () => void
  stop: () => void
  clear: () => void
  isEmitting: boolean
  uniforms: Record<string, unknown>
}

export type EmitOptions = {
  x?: number
  y?: number
  z?: number
  count?: number
  overrides?: Record<string, unknown> | null
}

export type CoreState = {
  particles: Record<string, ParticleSystemRef>
  registerParticles: (name: string, ref: ParticleSystemRef) => void
  unregisterParticles: (name: string) => void
  getParticles: (name: string) => ParticleSystemRef | null
  emit: (name: string, options?: EmitOptions) => boolean
  start: (name: string) => boolean
  stop: (name: string) => boolean
  clear: (name: string) => boolean
  isEmitting: (name: string) => boolean
  getUniforms: (name: string) => Record<string, unknown> | null
}

/**
 * VFX Store - Centralized management for VFX particle systems
 *
 * Allows multiple VFXEmitter components to share a single VFXParticles instance,
 * avoiding extra draw calls while enabling emission from multiple positions.
 *
 * Usage:
 *
 * // Register a particle system
 * <VFXParticles ref={(ref) => registerParticles("sparks", ref)} ... />
 *
 * // Or use the VFXParticles name prop with auto-registration
 * <VFXParticles name="sparks" ... />
 *
 * // Emit from anywhere using VFXEmitter (no extra draw calls!)
 * <VFXEmitter name="sparks" position={[1, 0, 0]} emitCount={10} />
 * <VFXEmitter name="sparks" position={[-1, 0, 0]} emitCount={5} />
 *
 * // Or emit programmatically
 * const emit = useVFXStore(s => s.emit);
 * emit("sparks", { x: 0, y: 1, z: 0, count: 20 });
 */

export const coreStore = createStore<CoreState>()((set, get) => ({
  // Registered particle systems: { name: ref }
  particles: {},

  /**
   * Register a VFXParticles instance by name
   * @param name - Unique identifier for this particle system
   * @param ref - The ref object from VFXParticles (with spawn, start, stop methods)
   */
  registerParticles: (name, ref) => {
    if (!name || !ref) return
    set((state) => ({
      particles: { ...state.particles, [name]: ref },
    }))
  },

  /**
   * Unregister a VFXParticles instance
   * @param name - Name of the particle system to unregister
   */
  unregisterParticles: (name) => {
    set((state) => {
      const { [name]: _, ...rest } = state.particles
      return { particles: rest }
    })
  },

  /**
   * Get a registered particle system by name
   * @param name - Name of the particle system
   * @returns The particle system ref or null
   */
  getParticles: (name) => {
    return get().particles[name] || null
  },

  /**
   * Emit particles from a registered system
   * @param name - Name of the particle system
   * @param options - Emission options
   * @param options.x - X position offset
   * @param options.y - Y position offset
   * @param options.z - Z position offset
   * @param options.count - Number of particles to emit
   * @param options.overrides - Spawn parameter overrides
   * @returns True if emission was successful
   */
  emit: (name, { x = 0, y = 0, z = 0, count = 20, overrides = null } = {}) => {
    const particles = get().particles[name]
    if (!particles?.spawn) {
      console.warn(
        `VFXStore: No particle system registered with name "${name}"`
      )
      return false
    }
    particles.spawn(x, y, z, count, overrides)
    return true
  },

  /**
   * Start auto-emission on a registered particle system
   * @param name - Name of the particle system
   * @returns True if successful
   */
  start: (name) => {
    const particles = get().particles[name]
    if (!particles?.start) {
      console.warn(
        `VFXStore: No particle system registered with name "${name}"`
      )
      return false
    }
    particles.start()
    return true
  },

  /**
   * Stop auto-emission on a registered particle system
   * @param name - Name of the particle system
   * @returns True if successful
   */
  stop: (name) => {
    const particles = get().particles[name]
    if (!particles?.stop) {
      console.warn(
        `VFXStore: No particle system registered with name "${name}"`
      )
      return false
    }
    particles.stop()
    return true
  },

  /**
   * Clear all particles from a registered system
   * @param name - Name of the particle system
   * @returns True if successful
   */
  clear: (name) => {
    const particles = get().particles[name]
    if (!particles?.clear) {
      console.warn(
        `VFXStore: No particle system registered with name "${name}"`
      )
      return false
    }
    particles.clear()
    return true
  },

  /**
   * Check if a particle system is currently emitting
   * @param name - Name of the particle system
   * @returns True if emitting
   */
  isEmitting: (name) => {
    const particles = get().particles[name]
    return particles?.isEmitting ?? false
  },

  /**
   * Get the uniforms object for direct manipulation
   * @param name - Name of the particle system
   * @returns The uniforms object or null
   */
  getUniforms: (name) => {
    const particles = get().particles[name]
    return particles?.uniforms || null
  },
}))
