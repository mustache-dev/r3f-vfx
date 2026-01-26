import { create } from 'zustand';

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
export const useVFXStore = create((set, get) => ({
  // Registered particle systems: { name: ref }
  particles: {},

  /**
   * Register a VFXParticles instance by name
   * @param {string} name - Unique identifier for this particle system
   * @param {object} ref - The ref object from VFXParticles (with spawn, start, stop methods)
   */
  registerParticles: (name, ref) => {
    if (!name || !ref) return;
    set((state) => ({
      particles: { ...state.particles, [name]: ref },
    }));
  },

  /**
   * Unregister a VFXParticles instance
   * @param {string} name - Name of the particle system to unregister
   */
  unregisterParticles: (name) => {
    set((state) => {
      const { [name]: _, ...rest } = state.particles;
      return { particles: rest };
    });
  },

  /**
   * Get a registered particle system by name
   * @param {string} name - Name of the particle system
   * @returns {object|null} The particle system ref or null
   */
  getParticles: (name) => {
    return get().particles[name] || null;
  },

  /**
   * Emit particles from a registered system
   * @param {string} name - Name of the particle system
   * @param {object} options - Emission options
   * @param {number} [options.x=0] - X position offset
   * @param {number} [options.y=0] - Y position offset
   * @param {number} [options.z=0] - Z position offset
   * @param {number} [options.count=20] - Number of particles to emit
   * @param {object} [options.overrides] - Spawn parameter overrides
   * @returns {boolean} True if emission was successful
   */
  emit: (name, { x = 0, y = 0, z = 0, count = 20, overrides = null } = {}) => {
    const particles = get().particles[name];
    if (!particles?.spawn) {
      console.warn(
        `VFXStore: No particle system registered with name "${name}"`
      );
      return false;
    }
    particles.spawn(x, y, z, count, overrides);
    return true;
  },

  /**
   * Start auto-emission on a registered particle system
   * @param {string} name - Name of the particle system
   * @returns {boolean} True if successful
   */
  start: (name) => {
    const particles = get().particles[name];
    if (!particles?.start) {
      console.warn(
        `VFXStore: No particle system registered with name "${name}"`
      );
      return false;
    }
    particles.start();
    return true;
  },

  /**
   * Stop auto-emission on a registered particle system
   * @param {string} name - Name of the particle system
   * @returns {boolean} True if successful
   */
  stop: (name) => {
    const particles = get().particles[name];
    if (!particles?.stop) {
      console.warn(
        `VFXStore: No particle system registered with name "${name}"`
      );
      return false;
    }
    particles.stop();
    return true;
  },

  /**
   * Clear all particles from a registered system
   * @param {string} name - Name of the particle system
   * @returns {boolean} True if successful
   */
  clear: (name) => {
    const particles = get().particles[name];
    if (!particles?.clear) {
      console.warn(
        `VFXStore: No particle system registered with name "${name}"`
      );
      return false;
    }
    particles.clear();
    return true;
  },

  /**
   * Check if a particle system is currently emitting
   * @param {string} name - Name of the particle system
   * @returns {boolean} True if emitting
   */
  isEmitting: (name) => {
    const particles = get().particles[name];
    return particles?.isEmitting ?? false;
  },

  /**
   * Get the uniforms object for direct manipulation
   * @param {string} name - Name of the particle system
   * @returns {object|null} The uniforms object or null
   */
  getUniforms: (name) => {
    const particles = get().particles[name];
    return particles?.uniforms || null;
  },
}));

export default useVFXStore;
