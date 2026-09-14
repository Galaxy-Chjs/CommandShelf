/**
 * Domain types shared by the main process, the preload bridge and the renderer.
 *
 * Nothing in this folder may import Electron, Node or React: it is the contract
 * that both sides compile against.
 */

export const ITEM_KINDS = ['command', 'prompt', 'snippet', 'link', 'path'] as const

export type ItemKind = (typeof ITEM_KINDS)[number]

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === 'string' && (ITEM_KINDS as readonly string[]).includes(value)
}

export interface Item {
  id: string
  title: string
  body: string
  kind: ItemKind
  /** Syntax highlighting language for snippets, e.g. `python`. */
  language: string | null
  collectionId: string | null
  favorite: boolean
  useCount: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  tags: string[]
}

export interface ItemDraft {
  title: string
  body: string
  kind: ItemKind
  language?: string | null
  collectionId?: string | null
  tags?: string[]
  favorite?: boolean
}

export interface Collection {
  id: string
  name: string
  sortOrder: number
  createdAt: string
  itemCount: number
}

export interface Tag {
  id: string
  name: string
  itemCount: number
}

/**
 * `relevance` is not offered in the sort menu: it is what the quick panel uses
 * while a query is active, so that the best match wins over the newest one.
 */
export type SortKey = 'recent' | 'created' | 'updated' | 'usage' | 'title' | 'relevance'

export const SORT_KEYS: readonly SortKey[] = ['recent', 'created', 'updated', 'usage', 'title']

export function isSortKey(value: unknown): value is SortKey {
  return (
    typeof value === 'string' &&
    (['recent', 'created', 'updated', 'usage', 'title', 'relevance'] as string[]).includes(value)
  )
}

/**
 * Reserved values for `ItemQuery.collection`. Collection ids are UUIDs, so
 * neither sentinel can collide with a real id.
 */
export const COLLECTION_ALL = '__all__'
export const COLLECTION_NONE = '__none__'

export interface ItemQuery {
  text: string
  kinds: ItemKind[]
  /** `COLLECTION_ALL`, `COLLECTION_NONE`, or a collection id. */
  collection: string
  tag: string | null
  favoriteOnly: boolean
  sort: SortKey
  limit: number
  offset: number
  /** Include soft-deleted rows (used by the trash view and by undo). */
  includeDeleted?: boolean
}

export function defaultQuery(): ItemQuery {
  return {
    text: '',
    kinds: [],
    collection: COLLECTION_ALL,
    tag: null,
    favoriteOnly: false,
    sort: 'recent',
    limit: 200,
    offset: 0,
  }
}

export interface Counts {
  all: number
  favorite: number
  uncategorized: number
  byKind: Record<ItemKind, number>
  byCollection: Record<string, number>
}

export type ThemeMode = 'dark' | 'light' | 'system'

export interface Settings {
  theme: ThemeMode
  hotkey: string
  launchAtLogin: boolean
  hideAfterCopy: boolean
  panelWidth: number
  panelMaxResults: number
  /** True once the first-run guidance has been dismissed. */
  onboardingDone: boolean
}

export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  hotkey: DEFAULT_HOTKEY,
  launchAtLogin: false,
  hideAfterCopy: true,
  panelWidth: 680,
  panelMaxResults: 8,
  onboardingDone: false,
}

/**
 * Every IPC call resolves to a `Result` instead of rejecting. Electron turns a
 * thrown error in a handler into an unhelpful "Error invoking remote method"
 * string; an explicit envelope keeps the real message and lets the UI show it.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface TransferSummary {
  items: number
  collections: number
  tags: number
  skipped: number
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  dataDir: string
  databasePath: string
  schemaVersion: number
  hotkeyRegistered: boolean
  loginItem: LoginItemState
}

/**
 * What the operating system currently has registered for auto-start.
 *
 * Deliberately separate from the stored `launchAtLogin` preference: the switch
 * can be on while nothing is registered — on Linux, where Electron does not
 * implement login items, or in development, where `process.execPath` is the
 * Electron build tool rather than the app. Settings shows this so the switch
 * cannot silently lie.
 */
export interface LoginItemState {
  /** False on platforms where Electron has no login-item support. */
  supported: boolean
  /** False when running from source, where auto-start is deliberately skipped. */
  packaged: boolean
  registered: boolean
}

export interface PanelRequest {
  /** Pre-fills the panel search box, e.g. with the current selection. */
  query?: string
}
