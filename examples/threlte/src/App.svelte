<script lang="ts">
  import { Canvas } from '@threlte/core'
  import { WebGPURenderer } from 'three/webgpu'
  import Scene from './Scene.svelte'

  const createRenderer = (canvas: HTMLCanvasElement) => {
    const renderer = new WebGPURenderer({
      canvas,
      antialias: true,
      alpha: false,
      forceWebGL: false,
    })
    return renderer
  }
</script>

<Canvas {createRenderer} shadows>
  <Scene />
</Canvas>
