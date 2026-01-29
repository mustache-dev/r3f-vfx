import type { ThreeToJSXElements } from '@react-three/fiber'
import type * as THREE from 'three/webgpu'

declare module '@react-three/fiber' {
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}
