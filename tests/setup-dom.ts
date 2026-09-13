import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { createMockApi } from '../src/renderer/src/test/mock-api'

/**
 * A default bridge implementation.
 *
 * `src/renderer/src/lib/api.ts` reads `window.commandShelf` at call time, so
 * something has to be there before any component is rendered. Tests that care
 * about the bridge replace it with their own instance.
 */
if (!window.commandShelf) {
  window.commandShelf = createMockApi().api
}

/**
 * Testing Library only self-registers its cleanup when Vitest globals are on.
 * This project imports `describe`/`it` explicitly instead, so the hook is
 * wired up here — without it, rendered trees accumulate across tests and
 * queries start matching the previous test's DOM.
 */
afterEach(() => {
  cleanup()
})
