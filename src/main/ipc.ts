import { ipcMain } from 'electron'

import { CHANNELS } from '@shared/ipc'
import type { ItemDraft, ItemQuery, Result, Settings } from '@shared/types'

import { getContext } from './context'
import * as controller from './controller'
import {
  createCollection,
  listCollections,
  removeCollection,
  renameCollection,
  reorderCollections,
} from './repo/collections'
import {
  createItem,
  getCounts,
  getItem,
  listItems,
  markUsed,
  purgeItem,
  removeItem,
  refreshSearchIndex,
  restoreItem,
  setFavorite,
  updateItem,
} from './repo/items'
import { listTags, removeTag, renameTag } from './repo/tags'

/**
 * Channel registration.
 *
 * Every handler resolves to a `Result` rather than rejecting: Electron replaces
 * a thrown error with "Error invoking remote method ...", losing the message
 * the UI needs to display. Wrapping here means no repository function has to
 * know it is being called over IPC.
 */

type Handler<T> = (...args: never[]) => T | Promise<T>

function handle<T>(channel: string, handler: Handler<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<Result<T>> => {
    try {
      return { ok: true, data: await (handler as (...rest: unknown[]) => T | Promise<T>)(...args) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`[commandshelf] ${channel}: ${message}\n`)
      return { ok: false, error: message }
    }
  })
}

function asId(value: unknown, label = 'id'): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`缺少参数：${label}`)
  return value
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`参数 ${label} 必须是字符串`)
  return value
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`参数 ${label} 必须是数组`)
  return value.filter((entry): entry is string => typeof entry === 'string')
}

export function registerIpc(): void {
  const db = () => getContext().db

  /* ------------------------------------------------------------------ items */
  handle(CHANNELS.itemsList, (query: unknown) => listItems(db(), query as Partial<ItemQuery>))

  handle(CHANNELS.itemsGet, (id: unknown) => getItem(db(), asId(id)))

  handle(CHANNELS.itemsCreate, (draft: unknown) => {
    const created = createItem(db(), draft as ItemDraft)
    controller.notifyDataChanged()
    return created
  })

  handle(CHANNELS.itemsUpdate, (id: unknown, draft: unknown) => {
    const updated = updateItem(db(), asId(id), draft as ItemDraft)
    controller.notifyDataChanged()
    return updated
  })

  handle(CHANNELS.itemsRemove, (id: unknown) => {
    const target = asId(id)
    removeItem(db(), target)
    controller.notifyDataChanged()
    return { id: target }
  })

  handle(CHANNELS.itemsRestore, (id: unknown) => {
    const restored = restoreItem(db(), asId(id))
    controller.notifyDataChanged()
    return restored
  })

  handle(CHANNELS.itemsPurge, (id: unknown) => {
    const target = asId(id)
    purgeItem(db(), target)
    controller.notifyDataChanged()
    return { id: target }
  })

  // Deliberately does not broadcast: bumping a use count reorders the "最近使用"
  // list, and reshuffling the list the user is looking at would be worse than a
  // slightly stale counter that corrects itself on the next query.
  handle(CHANNELS.itemsMarkUsed, (id: unknown) => markUsed(db(), asId(id)))

  handle(CHANNELS.itemsSetFavorite, (id: unknown, favorite: unknown) => {
    const updated = setFavorite(db(), asId(id), favorite === true)
    controller.notifyDataChanged()
    return updated
  })

  handle(CHANNELS.itemsCounts, () => getCounts(db()))

  /* ------------------------------------------------------------ collections */
  handle(CHANNELS.collectionsList, () => listCollections(db()))

  handle(CHANNELS.collectionsCreate, (name: unknown) => {
    const created = createCollection(db(), asString(name, 'name'))
    controller.notifyDataChanged()
    return created
  })

  handle(CHANNELS.collectionsRename, (id: unknown, name: unknown) => {
    const updated = renameCollection(db(), asId(id), asString(name, 'name'))
    controller.notifyDataChanged()
    return updated
  })

  handle(CHANNELS.collectionsRemove, (id: unknown) => {
    const target = asId(id)
    removeCollection(db(), target)
    controller.notifyDataChanged()
    return { id: target }
  })

  handle(CHANNELS.collectionsReorder, (ids: unknown) => {
    const result = reorderCollections(db(), asStringArray(ids, 'ids'))
    controller.notifyDataChanged()
    return result
  })

  /* ------------------------------------------------------------------- tags */
  handle(CHANNELS.tagsList, () => listTags(db()))

  handle(CHANNELS.tagsRename, (from: unknown, to: unknown) => {
    const tags = renameTag(db(), asString(from, 'from'), asString(to, 'to'))
    // Tag names are part of the indexed document, so the index must follow.
    refreshSearchIndex(db())
    controller.notifyDataChanged()
    return tags
  })

  handle(CHANNELS.tagsRemove, (name: unknown) => {
    const tags = removeTag(db(), asString(name, 'name'))
    refreshSearchIndex(db())
    controller.notifyDataChanged()
    return tags
  })

  /* --------------------------------------------------------------- settings */
  handle(CHANNELS.settingsGet, () => getContext().settings)

  handle(CHANNELS.settingsUpdate, (patch: unknown) =>
    controller.applySettings((patch ?? {}) as Partial<Settings>),
  )

  /* ------------------------------------------------------------------- data */
  handle(CHANNELS.dataExport, () => controller.exportToFile())
  handle(CHANNELS.dataImport, () => controller.importFromFile())
  handle(CHANNELS.dataSeedDemo, () => controller.loadDemoData())
  handle(CHANNELS.dataClearAll, () => controller.clearAllData())

  /* -------------------------------------------------------------------- app */
  handle(CHANNELS.appInfo, () => controller.appInfo())
  handle(CHANNELS.appOpenDataDir, () => {
    controller.revealDataDir()
    return null
  })
  handle(CHANNELS.appOpenExternal, (url: unknown) => {
    controller.openExternal(asString(url, 'url'))
    return null
  })
  handle(CHANNELS.appOpenPath, (path: unknown) => {
    controller.openPath(asString(path, 'path'))
    return null
  })
  handle(CHANNELS.appCopyText, (text: unknown) => {
    controller.copyToClipboard(asString(text, 'text'))
    return null
  })
  handle(CHANNELS.appOpenPanel, () => {
    controller.showPanel()
    return null
  })
  handle(CHANNELS.appHidePanel, () => {
    controller.hidePanel()
    return null
  })
  handle(CHANNELS.appShowMain, () => {
    controller.showMainWindow()
    return null
  })
  handle(CHANNELS.appQuit, () => {
    controller.requestQuit()
    return null
  })
}
