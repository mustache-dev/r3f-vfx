import { VFXParticles, Appearance, EmitterShape } from 'r3f-vfx'

export const Spark = () => {
  return (
    <VFXParticles
      name="spark"
      autoStart={false}
      maxParticles={2000}
      position={[0, 0, 0]}
      size={[0.05, 0.1]}
      delay={0.2}
      colorStart={['#ffff00', '#ffffff']}
      colorEnd={['#ff6600', '#331100']}
      fadeSize={[1, 0.3]}
      fadeOpacity={[1, 0]}
      gravity={[0, -3, 0]}
      lifetime={[0.5, 1]}
      direction={[
        [-1, 1],
        [-1, 1],
        [-1, 1],
      ]}
      speed={[1, 4]}
      friction={0.98}
      appearance={Appearance.CIRCULAR}
      intensity={8}
      emitterShape={EmitterShape.POINT}
      emitCount={10}
    />
  )
}
