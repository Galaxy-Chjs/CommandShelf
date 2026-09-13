import type { CommandShelfApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Injected by src/preload/index.ts. */
    commandShelf: CommandShelfApi
  }
}

export {}
