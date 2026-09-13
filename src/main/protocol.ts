import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { net, protocol } from 'electron'

/**
 * Serves the built renderer over a privileged `app://` scheme instead of
 * `file://`.
 *
 * Loading the bundle from `file://` breaks two things at once: the document
 * origin is opaque, so a `Content-Security-Policy` of `script-src 'self'`
 * matches nothing and silently blocks the app's own bundle, and ES module
 * loading is subject to file-origin restrictions. A `standard`, `secure`
 * scheme gives the renderer a real origin, which makes the CSP meaningful and
 * module loading ordinary.
 *
 * Must be called before `app.whenReady()`.
 */

export const APP_SCHEME = 'app'
const APP_ORIGIN = `${APP_SCHEME}://commandshelf`

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

/** `app://commandshelf/index.html` */
export function rendererUrl(page: 'index' | 'panel'): string {
  return `${APP_ORIGIN}/${page}.html`
}

/**
 * Registers the handler. Call after the app is ready.
 *
 * `rendererRoot` is the absolute path of the built renderer directory.
 */
export function serveRenderer(rendererRoot: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url)
    const decoded = decodeURIComponent(pathname)

    // Resolve, then confirm the result is still inside the renderer directory:
    // a request for `/../../etc/passwd` must not escape it.
    const target = normalize(join(rendererRoot, decoded))
    if (target !== rendererRoot && !target.startsWith(rendererRoot + sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      return await net.fetch(pathToFileURL(target).toString())
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })
}
