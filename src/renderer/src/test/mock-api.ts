import type { CommandShelfApi } from '@shared/ipc'
import {
  DEFAULT_SETTINGS,
  type AppInfo,
  type Collection,
  type Counts,
  type Item,
  type ItemDraft,
  type ItemQuery,
  type Result,
  type Settings,
  type Tag,
  type TransferSummary,
} from '@shared/types'

/**
 * An in-memory stand-in for the preload bridge.
 *
 * The renderer reaches the main process only through `window.commandShelf`, so
 * replacing that object is enough to test the whole UI without Electron. Every
 * call is recorded, which is how tests assert that copying wrote the expected
 * text.
 */

export interface RecordedCall {
  channel: string
  args: unknown[]
}

export interface MockApi {
  api: CommandShelfApi
  calls: RecordedCall[]
  /** Text passed to `app.copy`, in order. */
  copied: string[]
  /** The live item list, so a test can inspect what was written. */
  items: Item[]
  settings: Settings
  /** Makes the next listing fail, to exercise the error state. */
  failNextList: (message: string) => void
  callsFor: (channel: string) => RecordedCall[]
}

export function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: overrides.id ?? `item-${Math.random().toString(36).slice(2, 9)}`,
    title: 'a command',
    body: 'ssh host',
    kind: 'command',
    language: null,
    collectionId: null,
    favorite: false,
    useCount: 0,
    lastUsedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
    tags: [],
    ...overrides,
  }
}

export function createMockApi(
  options: {
    items?: Item[]
    collections?: Collection[]
    tags?: Tag[]
    settings?: Partial<Settings>
    info?: Partial<AppInfo>
  } = {},
): MockApi {
  const calls: RecordedCall[] = []
  const items: Item[] = [...(options.items ?? [])]
  const collections: Collection[] = [...(options.collections ?? [])]
  const tags: Tag[] = [...(options.tags ?? [])]
  let settings: Settings = { ...DEFAULT_SETTINGS, ...options.settings }
  let listError: string | null = null

  const info: AppInfo = {
    version: '1.0.0',
    electron: '44.0.0',
    chrome: '152.0.0',
    node: '24.0.0',
    platform: 'win32',
    dataDir: 'C:\\tmp\\commandshelf',
    databasePath: 'C:\\tmp\\commandshelf\\commandshelf.db',
    schemaVersion: 1,
    hotkeyRegistered: true,
    ...options.info,
  }

  const record = (channel: string, ...args: unknown[]): void => {
    calls.push({ channel, args })
  }

  const ok = <T>(data: T): Promise<Result<T>> => Promise.resolve({ ok: true, data })

  function computeCounts(): Counts {
    const live = items.filter((item) => item.deletedAt === null)
    const byKind: Counts['byKind'] = {
      command: 0,
      prompt: 0,
      snippet: 0,
      link: 0,
      path: 0,
    }
    const byCollection: Record<string, number> = {}
    for (const item of live) {
      byKind[item.kind] += 1
      if (item.collectionId)
        byCollection[item.collectionId] = (byCollection[item.collectionId] ?? 0) + 1
    }
    return {
      all: live.length,
      favorite: live.filter((item) => item.favorite).length,
      uncategorized: live.filter((item) => item.collectionId === null).length,
      byKind,
      byCollection,
    }
  }

  function matches(item: Item, query: ItemQuery): boolean {
    if (!query.includeDeleted && item.deletedAt) return false
    if (query.kinds.length > 0 && !query.kinds.includes(item.kind)) return false
    if (query.favoriteOnly && !item.favorite) return false
    if (query.tag && !item.tags.some((tag) => tag.toLowerCase() === query.tag?.toLowerCase())) {
      return false
    }
    if (query.collection === '__none__' && item.collectionId !== null) return false
    if (query.collection !== '__all__' && query.collection !== '__none__') {
      if (item.collectionId !== query.collection) return false
    }
    const text = query.text.trim().toLowerCase()
    if (!text) return true
    const haystack = [item.title, item.body, ...item.tags].join('\n').toLowerCase()
    return text.split(/\s+/).every((token) => haystack.includes(token))
  }

  const api: CommandShelfApi = {
    items: {
      list: (query: ItemQuery) => {
        record('items:list', query)
        if (listError) {
          const message = listError
          listError = null
          return Promise.resolve({ ok: false as const, error: message })
        }
        const filtered = items.filter((item) => matches(item, query))
        return ok(filtered.slice(query.offset, query.offset + query.limit))
      },
      get: (id: string) => ok(items.find((item) => item.id === id) ?? null),
      create: (draft: ItemDraft) => {
        const created = makeItem({
          ...draft,
          language: draft.language ?? null,
          collectionId: draft.collectionId ?? null,
          tags: draft.tags ?? [],
          favorite: draft.favorite ?? false,
          title: draft.title || draft.body.split('\n')[0] || '未命名',
        })
        items.unshift(created)
        return ok(created)
      },
      update: (id: string, draft: ItemDraft) => {
        const index = items.findIndex((item) => item.id === id)
        const existing = items[index] as Item
        const updated: Item = {
          ...existing,
          ...draft,
          language: draft.language ?? null,
          collectionId: draft.collectionId ?? null,
          tags: draft.tags ?? [],
          favorite: draft.favorite ?? false,
        }
        items[index] = updated
        return ok(updated)
      },
      remove: (id: string) => {
        const item = items.find((entry) => entry.id === id)
        if (item) item.deletedAt = '2025-01-02T00:00:00.000Z'
        return ok({ id })
      },
      restore: (id: string) => {
        const item = items.find((entry) => entry.id === id)
        if (item) item.deletedAt = null
        return ok(item ?? null)
      },
      purge: (id: string) => {
        const index = items.findIndex((item) => item.id === id)
        if (index >= 0) items.splice(index, 1)
        return ok({ id })
      },
      markUsed: (id: string) => {
        record('items:mark-used', id)
        const item = items.find((entry) => entry.id === id)
        if (item) item.useCount += 1
        return ok(item ?? null)
      },
      setFavorite: (id: string, favorite: boolean) => {
        const item = items.find((entry) => entry.id === id)
        if (item) item.favorite = favorite
        return ok(item ?? null)
      },
      counts: () => ok(computeCounts()),
    },
    collections: {
      list: () => ok([...collections]),
      create: (name: string) => {
        const created: Collection = {
          id: `collection-${collections.length + 1}`,
          name,
          sortOrder: collections.length,
          createdAt: '2025-01-01T00:00:00.000Z',
          itemCount: 0,
        }
        collections.push(created)
        return ok(created)
      },
      rename: (id: string, name: string) => {
        const collection = collections.find((entry) => entry.id === id) as Collection
        collection.name = name
        return ok(collection)
      },
      remove: (id: string) => {
        const index = collections.findIndex((entry) => entry.id === id)
        if (index >= 0) collections.splice(index, 1)
        return ok({ id })
      },
      reorder: (ids: string[]) => {
        ids.forEach((id, index) => {
          const collection = collections.find((entry) => entry.id === id)
          if (collection) collection.sortOrder = index
        })
        return ok([...collections])
      },
    },
    tags: {
      list: () => ok([...tags]),
      rename: (from: string, to: string) => {
        const tag = tags.find((entry) => entry.name === from)
        if (tag) tag.name = to
        return ok([...tags])
      },
      remove: (name: string) => {
        const index = tags.findIndex((entry) => entry.name === name)
        if (index >= 0) tags.splice(index, 1)
        return ok([...tags])
      },
    },
    settings: {
      get: () => ok({ ...settings }),
      update: (patch: Partial<Settings>) => {
        settings = { ...settings, ...patch }
        return ok({ ...settings })
      },
    },
    data: {
      exportJson: () => ok({ path: 'C:\\tmp\\export.json', items: items.length }),
      importJson: () =>
        ok({ items: 0, collections: 0, tags: 0, skipped: 0 } satisfies TransferSummary),
      seedDemo: () => ok({ items: 3, collections: 1, tags: 2, skipped: 0 }),
      clearAll: () => {
        const count = items.length
        items.length = 0
        return ok({ items: count })
      },
    },
    app: {
      info: () => ok({ ...info }),
      openDataDir: () => ok(null),
      openExternal: (url: string) => {
        record('app:open-external', url)
        return ok(null)
      },
      openPath: (path: string) => {
        record('app:open-path', path)
        return ok(null)
      },
      copy: (text: string) => {
        record('app:copy', text)
        return ok(null)
      },
      openPanel: () => ok(null),
      hidePanel: () => ok(null),
      showMain: () => ok(null),
      quit: () => ok(null),
      onFocusSearch: () => () => {},
      onPanelOpened: () => () => {},
      onDataChanged: () => () => {},
    },
  }

  // Expose the recorded copy calls separately: almost every interaction test
  // ends by asserting on them.
  const copied: string[] = []
  const originalCopy = api.app.copy
  api.app.copy = (text: string) => {
    copied.push(text)
    return originalCopy(text)
  }

  return {
    api,
    calls,
    copied,
    items,
    get settings() {
      return settings
    },
    failNextList: (message: string) => {
      listError = message
    },
    callsFor: (channel: string) => calls.filter((call) => call.channel === channel),
  }
}
