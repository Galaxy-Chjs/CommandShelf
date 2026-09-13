import type { CommandShelfApi } from '@shared/ipc'

/**
 * The preload bridge, as seen from inside `page.evaluate` callbacks.
 *
 * The e2e project compiles separately from the renderer, so it needs its own
 * declaration of what the page can reach.
 */
declare global {
  interface Window {
    commandShelf: CommandShelfApi
  }
}

export {}
