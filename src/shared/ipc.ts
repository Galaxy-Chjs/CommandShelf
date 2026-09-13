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
} from './types'

/** Every IPC channel name, in one place so main and preload cannot drift. */
export const CHANNELS = {
  itemsList: 'items:list',
  itemsGet: 'items:get',
  itemsCreate: 'items:create',
  itemsUpdate: 'items:update',
  itemsRemove: 'items:remove',
  itemsRestore: 'items:restore',
  itemsPurge: 'items:purge',
  itemsMarkUsed: 'items:mark-used',
  itemsSetFavorite: 'items:set-favorite',
  itemsCounts: 'items:counts',

  collectionsList: 'collections:list',
  collectionsCreate: 'collections:create',
  collectionsRename: 'collections:rename',
  collectionsRemove: 'collections:remove',
  collectionsReorder: 'collections:reorder',

  tagsList: 'tags:list',
  tagsRename: 'tags:rename',
  tagsRemove: 'tags:remove',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  dataExport: 'data:export',
  dataImport: 'data:import',
  dataSeedDemo: 'data:seed-demo',
  dataClearAll: 'data:clear-all',

  appInfo: 'app:info',
  appOpenDataDir: 'app:open-data-dir',
  appOpenExternal: 'app:open-external',
  appOpenPath: 'app:open-path',
  appCopyText: 'app:copy-text',
  appOpenPanel: 'app:open-panel',
  appHidePanel: 'app:hide-panel',
  appShowMain: 'app:show-main',
  appQuit: 'app:quit',

  eventFocusSearch: 'event:focus-search',
  eventPanelOpened: 'event:panel-opened',
  eventDataChanged: 'event:data-changed',
} as const

/**
 * The surface preload exposes as `window.commandShelf`.
 *
 * Every method resolves to a `Result` rather than rejecting, so the renderer
 * never has to unwrap Electron's error serialisation to show a message.
 */
export interface CommandShelfApi {
  items: {
    list(query: ItemQuery): Promise<Result<Item[]>>
    get(id: string): Promise<Result<Item | null>>
    create(draft: ItemDraft): Promise<Result<Item>>
    update(id: string, draft: ItemDraft): Promise<Result<Item>>
    remove(id: string): Promise<Result<{ id: string }>>
    restore(id: string): Promise<Result<Item | null>>
    purge(id: string): Promise<Result<{ id: string }>>
    /** Null when the row no longer exists — the panel treats that as "nothing to copy". */
    markUsed(id: string): Promise<Result<Item | null>>
    setFavorite(id: string, favorite: boolean): Promise<Result<Item | null>>
    counts(): Promise<Result<Counts>>
  }
  collections: {
    list(): Promise<Result<Collection[]>>
    create(name: string): Promise<Result<Collection>>
    rename(id: string, name: string): Promise<Result<Collection>>
    remove(id: string): Promise<Result<{ id: string }>>
    reorder(ids: string[]): Promise<Result<Collection[]>>
  }
  tags: {
    list(): Promise<Result<Tag[]>>
    rename(from: string, to: string): Promise<Result<Tag[]>>
    remove(name: string): Promise<Result<Tag[]>>
  }
  settings: {
    get(): Promise<Result<Settings>>
    update(patch: Partial<Settings>): Promise<Result<Settings>>
  }
  data: {
    exportJson(): Promise<Result<{ path: string | null; items: number }>>
    importJson(): Promise<Result<TransferSummary | null>>
    seedDemo(): Promise<Result<TransferSummary>>
    clearAll(): Promise<Result<{ items: number }>>
  }
  app: {
    info(): Promise<Result<AppInfo>>
    openDataDir(): Promise<Result<null>>
    openExternal(url: string): Promise<Result<null>>
    openPath(path: string): Promise<Result<null>>
    copy(text: string): Promise<Result<null>>
    openPanel(): Promise<Result<null>>
    hidePanel(): Promise<Result<null>>
    showMain(): Promise<Result<null>>
    quit(): Promise<Result<null>>
    /** Fired when the main window asks the renderer to focus its search box. */
    onFocusSearch(listener: () => void): () => void
    /** Fired every time the quick panel becomes visible, to reset its state. */
    onPanelOpened(listener: () => void): () => void
    /** Fired after any write, so open views can refresh. */
    onDataChanged(listener: () => void): () => void
  }
}
