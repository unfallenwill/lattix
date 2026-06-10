import { useSyncExternalStore } from 'react'
import type { DataStore } from '../store/data-store.js'

// Re-render the consumer whenever the store emits.
export function useDataStore<T>(store: DataStore, selector: (s: DataStore) => T): T {
  return useSyncExternalStore(
    (l) => store.subscribe(l),
    () => selector(store),
  )
}
