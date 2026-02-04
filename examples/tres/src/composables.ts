import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Simple memoization helper - evaluates the factory once.
 */
export function useMemo<T>(factory: () => T): T {
  return factory()
}

/**
 * Keyboard state composable.
 * Returns a reactive object tracking which keys are pressed.
 */
export function useKeyboard() {
  const keys = ref<Record<string, boolean>>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false,
    attack: false,
  })

  const keyMap: Record<string, string> = {
    ArrowUp: 'forward',
    KeyW: 'forward',
    ArrowDown: 'backward',
    KeyS: 'backward',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ShiftLeft: 'run',
    ShiftRight: 'run',
    KeyE: 'attack',
  }

  function onKeyDown(e: KeyboardEvent) {
    const action = keyMap[e.code]
    if (action) keys.value[action] = true
  }

  function onKeyUp(e: KeyboardEvent) {
    const action = keyMap[e.code]
    if (action) keys.value[action] = false
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  })

  return keys
}
