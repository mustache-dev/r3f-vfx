import { coreStore, type CoreState } from 'core-vfx';
import { useStore } from 'zustand';

export function useVFXStore(): CoreState;
export function useVFXStore<T>(selector: (state: CoreState) => T): T;
export function useVFXStore<T>(selector?: (state: CoreState) => T) {
  return useStore(coreStore, selector!);
}
