import { contextBridge, ipcRenderer } from 'electron'

import { CHANNELS, type CommandShelfApi } from '@shared/ipc'
import type {
  AppInfo,
  Collection,
  Counts,
  Item,
  ItemDraft,
  ItemQuery,
  Result,
  Settings,
  Tag,
  TransferSummary,
} from '@shared/types'

/**
 * The only bridge between the renderer and Node.
 *
 * The renderer runs with `contextIsolation: true`, `nodeIntegration: false` and
 * `sandbox: true`, so this file is the complete list of things it can do. Each
 * method forwards to exactly one channel; there is no "invoke any channel"
 * escape hatch.
 */

function invoke<T>(channel: string, ...args: unknown[]): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<Result<T>>
}

/** Subscribes to a main→renderer event and returns an unsubscribe function. */
function subscribe(channel: string, listener: () => void): () => void {
  const wrapped = (): void => listener()
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const api: CommandShelfApi = {
  items: {
    list: (query: ItemQuery) => invoke<Item[]>(CHANNELS.itemsList, query),
    get: (id: string) => invoke<Item | null>(CHANNELS.itemsGet, id),
    create: (draft: ItemDraft) => invoke<Item>(CHANNELS.itemsCreate, draft),
    update: (id: string, draft: ItemDraft) => invoke<Item>(CHANNELS.itemsUpdate, id, draft),
    remove: (id: string) => invoke<{ id: string }>(CHANNELS.itemsRemove, id),
    restore: (id: string) => invoke<Item | null>(CHANNELS.itemsRestore, id),
    purge: (id: string) => invoke<{ id: string }>(CHANNELS.itemsPurge, id),
    markUsed: (id: string) => invoke<Item | null>(CHANNELS.itemsMarkUsed, id),
    setFavorite: (id: string, favorite: boolean) =>
      invoke<Item | null>(CHANNELS.itemsSetFavorite, id, favorite),
    counts: () => invoke<Counts>(CHANNELS.itemsCounts),
  },
  collections: {
    list: () => invoke<Collection[]>(CHANNELS.collectionsList),
    create: (name: string) => invoke<Collection>(CHANNELS.collectionsCreate, name),
    rename: (id: string, name: string) => invoke<Collection>(CHANNELS.collectionsRename, id, name),
    remove: (id: string) => invoke<{ id: string }>(CHANNELS.collectionsRemove, id),
    reorder: (ids: string[]) => invoke<Collection[]>(CHANNELS.collectionsReorder, ids),
  },
  tags: {
    list: () => invoke<Tag[]>(CHANNELS.tagsList),
    rename: (from: string, to: string) => invoke<Tag[]>(CHANNELS.tagsRename, from, to),
    remove: (name: string) => invoke<Tag[]>(CHANNELS.tagsRemove, name),
  },
  settings: {
    get: () => invoke<Settings>(CHANNELS.settingsGet),
    update: (patch: Partial<Settings>) => invoke<Settings>(CHANNELS.settingsUpdate, patch),
  },
  data: {
    exportJson: () => invoke<{ path: string | null; items: number }>(CHANNELS.dataExport),
    importJson: () => invoke<TransferSummary | null>(CHANNELS.dataImport),
    seedDemo: () => invoke<TransferSummary>(CHANNELS.dataSeedDemo),
    clearAll: () => invoke<{ items: number }>(CHANNELS.dataClearAll),
  },
  app: {
    info: () => invoke<AppInfo>(CHANNELS.appInfo),
    openDataDir: () => invoke<null>(CHANNELS.appOpenDataDir),
    openExternal: (url: string) => invoke<null>(CHANNELS.appOpenExternal, url),
    openPath: (path: string) => invoke<null>(CHANNELS.appOpenPath, path),
    copy: (text: string) => invoke<null>(CHANNELS.appCopyText, text),
    openPanel: () => invoke<null>(CHANNELS.appOpenPanel),
    hidePanel: () => invoke<null>(CHANNELS.appHidePanel),
    showMain: () => invoke<null>(CHANNELS.appShowMain),
    quit: () => invoke<null>(CHANNELS.appQuit),
    onFocusSearch: (listener: () => void) => subscribe(CHANNELS.eventFocusSearch, listener),
    onPanelOpened: (listener: () => void) => subscribe(CHANNELS.eventPanelOpened, listener),
    onDataChanged: (listener: () => void) => subscribe(CHANNELS.eventDataChanged, listener),
  },
}

contextBridge.exposeInMainWorld('commandShelf', api)
