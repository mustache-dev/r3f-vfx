import { ref, onUnmounted, type Ref } from 'vue'
import { coreStore, type CoreState } from 'core-vfx'

export function useVFXStore(): Ref<CoreState>
export function useVFXStore<T>(selector: (state: CoreState) => T): Ref<T>
export function useVFXStore<T>(selector?: (state: CoreState) => T): Ref<T> {
  const pick = selector ?? ((s: CoreState) => s as unknown as T)
  const state = ref(pick(coreStore.getState())) as Ref<T>

  const unsubscribe = coreStore.subscribe((s) => {
    state.value = pick(s)
  })

  onUnmounted(unsubscribe)

  return state
}

// Attach static methods for imperative usage
useVFXStore.getState = coreStore.getState
useVFXStore.setState = coreStore.setState
useVFXStore.subscribe = coreStore.subscribe
