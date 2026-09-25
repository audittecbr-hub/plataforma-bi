import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/**
 * `true` só depois da hidratação, sem o padrão `useEffect(() => setMounted(true))`
 * (que a regra react-hooks/set-state-in-effect proíbe e que causa um render extra).
 */
export function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
