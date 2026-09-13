import type { CommandShelfApi } from '@shared/ipc'
import type { Result } from '@shared/types'

/**
 * The preload bridge.
 *
 * Exposed through a Proxy that resolves `window.commandShelf` on each access
 * rather than capturing it once at module load. In the app the two are
 * equivalent, but resolving lazily means a test can install a fresh in-memory
 * bridge without having to re-import every module that touches it — and no
 * module can end up holding a stale reference.
 */
export const api = new Proxy({} as CommandShelfApi, {
  get(_target, property) {
    return Reflect.get(window.commandShelf as object, property)
  },
})

export class ApiError extends Error {
  override name = 'ApiError'
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Convenience for the many handlers that only care about the failure text. */
export function errorText(result: Result<unknown>): string | null {
  return result.ok ? null : result.error
}
