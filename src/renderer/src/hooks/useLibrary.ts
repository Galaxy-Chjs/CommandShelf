import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  defaultQuery,
  type Collection,
  type Counts,
  type Item,
  type ItemQuery,
  type Tag,
} from '@shared/types'

import { api } from '../lib/api'
import { useDebouncedValue } from './useDebouncedValue'

/**
 * Owns one view's worth of library data: the current query, the matching items,
 * and the sidebar metadata (collections, tags, counts).
 *
 * Both entry points use this — the management window with a debounce, the quick
 * panel without one. Every fetch is stamped so a slow response from an earlier
 * keystroke can never overwrite a newer one.
 */

export interface LibraryOptions {
  initialQuery?: Partial<ItemQuery>
  /** Milliseconds to wait after the last keystroke before searching. */
  debounceMs?: number
  /** Reload when the main process reports a write. Default true. */
  listenToDataChanges?: boolean
}

export interface Library {
  query: ItemQuery
  setQuery: (patch: Partial<ItemQuery>) => void
  resetQuery: () => void
  items: Item[]
  collections: Collection[]
  tags: Tag[]
  counts: Counts | null
  loading: boolean
  error: string | null
  /** Forces an immediate refetch of everything. */
  reload: () => void
  /**
   * Replaces one item in place.
   *
   * Recording a use deliberately does not broadcast a change — refetching would
   * reorder the "最近使用" list under the user's cursor — so the caller patches
   * the row it already has to keep the visible counter honest.
   */
  patchItem: (updated: Item) => void
}

export function useLibrary(options: LibraryOptions = {}): Library {
  const { initialQuery, debounceMs = 0, listenToDataChanges = true } = options

  const [query, setQueryState] = useState<ItemQuery>(() => ({
    ...defaultQuery(),
    ...initialQuery,
  }))
  const [items, setItems] = useState<Item[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState(0)

  const debouncedText = useDebouncedValue(query.text, debounceMs)
  const effectiveQuery = useMemo(() => ({ ...query, text: debouncedText }), [query, debouncedText])

  const requestId = useRef(0)

  useEffect(() => {
    const ticket = ++requestId.current
    let cancelled = false

    void (async () => {
      setLoading(true)
      const result = await api.items.list(effectiveQuery)
      if (cancelled || ticket !== requestId.current) return
      if (result.ok) {
        setItems(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [effectiveQuery, token])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [collectionsResult, tagsResult, countsResult] = await Promise.all([
        api.collections.list(),
        api.tags.list(),
        api.items.counts(),
      ])
      if (cancelled) return
      if (collectionsResult.ok) setCollections(collectionsResult.data)
      if (tagsResult.ok) setTags(tagsResult.data)
      if (countsResult.ok) setCounts(countsResult.data)
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!listenToDataChanges) return
    return api.app.onDataChanged(() => setToken((value) => value + 1))
  }, [listenToDataChanges])

  const setQuery = useCallback((patch: Partial<ItemQuery>) => {
    setQueryState((current) => {
      const next = { ...current, ...patch }
      // Any change to the filter set invalidates the current page offset.
      if (patch.offset === undefined) next.offset = 0
      if (patch.limit !== undefined) next.limit = patch.limit
      return next
    })
  }, [])

  const resetQuery = useCallback(() => {
    setQueryState((current) => ({ ...defaultQuery(), limit: current.limit }))
  }, [])

  const reload = useCallback(() => setToken((value) => value + 1), [])

  const patchItem = useCallback((updated: Item) => {
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }, [])

  return {
    query,
    setQuery,
    resetQuery,
    items,
    collections,
    tags,
    counts,
    loading,
    error,
    reload,
    patchItem,
  }
}
