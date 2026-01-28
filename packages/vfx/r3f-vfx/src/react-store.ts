import { coreStore, type CoreState } from 'core-vfx';
import { useStore } from 'zustand';

function useVFXStoreImpl(): CoreState;
function useVFXStoreImpl<T>(selector: (state: CoreState) => T): T;
function useVFXStoreImpl<T>(selector?: (state: CoreState) => T) {
  return useStore(coreStore, selector!);
}

export const useVFXStore = Object.assign(useVFXStoreImpl, {
  getState: coreStore.getState,
  setState: coreStore.setState,
  subscribe: coreStore.subscribe,
  getInitialState: coreStore.getInitialState,
});
