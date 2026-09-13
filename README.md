<div align="center">

# CommandShelf

**Your commands, prompts and snippets — three seconds away.**

An Electron workspace for the commands you keep re-typing and the prompts you keep re-writing.

[![Electron](https://img.shields.io/badge/electron-44-47848f?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/react-19-58a6ff?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/sqlite-node%3Asqlite%20%2B%20FTS5-3fb950?style=flat-square&logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)
[![License](https://img.shields.io/badge/license-MIT-8b949e?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-306%20passing-3fb950?style=flat-square)](tests)
[![No telemetry](https://img.shields.io/badge/telemetry-none-8b949e?style=flat-square)](#privacy)

</div>

![CommandShelf main window](docs/images/hero.png)

Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> anywhere, type two or three letters, press
<kbd>Enter</kbd>. The text is on your clipboard, the panel is gone, and focus is back in the window
you were working in. That round trip is the entire point of this project.

Everything else — the sidebar, the tags, the collections, the editor — exists so that the round trip
has something good in it.

---

## The problem

The commands you actually need are scattered across:

```text
ChatGPT history · terminal history (already scrolled away) · a README
a half-saved commands.txt on the desktop · a VS Code tab you never saved
WeChat favourites · browser bookmarks
```

`ssh -L ...`, `hf download ...`, `CUDA_VISIBLE_DEVICES=0 ...`, the prompt you spent twenty minutes
getting right, the path to the dataset, the URL of the paper. None of it is secret, all of it is
high-frequency, and none of it lives anywhere you can reach in two seconds.

CommandShelf is one local SQLite file plus a hotkey.

## Why it is different from a notes app

**It is built around retrieval, not capture.** A snippet manager that needs
`switch window → click search → type → find → click copy → switch back → paste`
is not faster than scrolling your shell history, and you will stop using it within a week. The quick
panel is the primary interface; the management window is where you tidy up.

**Template variables are first-class.** Anything in `{{braces}}` becomes a field you fill in before
copying, with defaults pre-filled, so one entry covers every server, port and path you use it with:

```bash
ssh -L {{local_port=8888}}:localhost:{{remote_port=8888}} {{server=user@10.0.0.12}} -N
```

**Search understands what you actually type.** English queries use SQLite FTS5 with prefix terms and
BM25 ranking; queries containing Chinese fall back to substring matching, because FTS5's `unicode61`
tokenizer does not split Chinese words. Tags, collection names, titles and bodies are all searched.

**It stays small on purpose.** No sync, no account, no embedded terminal, no Markdown note-taking, no
clipboard history, no "AI assistant". The test for any feature is whether it makes finding and taking
a piece of content faster.

## Features

### The quick panel

- Global hotkey (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> by default, rebindable in Settings).
- Frameless, always-on-top, centred on whichever display the pointer is on.
- Search-as-you-type, <kbd>↑</kbd><kbd>↓</kbd> to move, <kbd>Enter</kbd> to copy and dismiss.
- Dismissed by <kbd>Esc</kbd>, by clicking away, or automatically after copying.
- Entries with variables open a fill-in form first, with a live preview of the final text.
- Remembers nothing between openings — every summon starts clean.

### Finding

- Search across title, body, tags and collection name.
- Filter by kind, collection, tag, or favourites only.
- Sort by last used, created, last modified, use count or title.
- Work entirely from the keyboard: <kbd>/</kbd> to search, <kbd>↑</kbd><kbd>↓</kbd> to select,
  <kbd>Enter</kbd> to copy, <kbd>N</kbd> new, <kbd>E</kbd> edit, <kbd>B</kbd> favourite,
  <kbd>Del</kbd> delete.

### Organising

- Five kinds — command, prompt, code snippet, link, path — each with its own colour, icon and
  default action.
- Collections (one per item) and tags (many per item), with rename, merge and delete.
- Deleting a collection keeps its items and leaves them uncategorised; deleting a tag only removes
  the label.
- Deleting an item is undoable from the toast that appears.

### Your data

- One SQLite file, WAL mode, default location shown in Settings with an "open folder" button.
- Export everything to readable JSON (collections and tags by name, so the file survives being
  imported anywhere).
- Import with duplicate detection.
- Software upgrades run explicit, additive schema migrations — never a table rebuild.
- No network access. No telemetry. No account.

## Keyboard shortcuts

| Where       | Keys                                                                       | Action                                         |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| Anywhere    | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd>                          | Show / hide the quick panel                    |
| Quick panel | <kbd>↑</kbd> <kbd>↓</kbd>                                                  | Move the selection                             |
| Quick panel | <kbd>Enter</kbd>                                                           | Copy (or open the variable form) and dismiss   |
| Quick panel | <kbd>Tab</kbd>                                                             | Open the variable form for the selected entry  |
| Quick panel | <kbd>Esc</kbd>                                                             | Back to search, then dismiss                   |
| Main window | <kbd>Ctrl</kbd>+<kbd>K</kbd> / <kbd>Ctrl</kbd>+<kbd>F</kbd> / <kbd>/</kbd> | Focus the search box                           |
| Main window | <kbd>↑</kbd> <kbd>↓</kbd>                                                  | Move the selection (works from the search box) |
| Main window | <kbd>Enter</kbd>                                                           | Copy the selected entry                        |
| Main window | <kbd>N</kbd> / <kbd>E</kbd> / <kbd>B</kbd> / <kbd>Del</kbd>                | New / edit / favourite / delete                |
| Main window | <kbd>Esc</kbd>                                                             | Clear the search, then the selection           |

Single-letter shortcuts are ignored while a text field has focus, so typing a query never triggers
them.

## Install

CommandShelf is distributed as a GitHub Release, not through a package registry.

```bash
# Windows — download the installer or the portable build
CommandShelf-1.0.0-win-x64.exe
CommandShelf-1.0.0-portable.exe

# Linux — AppImage or .deb
CommandShelf-1.0.0-linux-x86_64.AppImage
CommandShelf-1.0.0-linux-amd64.deb

# macOS
CommandShelf-1.0.0-mac-x64.dmg
```

The portable Windows build needs no installation: run it, and it keeps its database in your user
profile like any other application.

> Releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml) and are not
> code-signed, so Windows SmartScreen and macOS Gatekeeper will warn on first launch.

### From source

```bash
git clone https://github.com/Galaxy-Chjs/CommandShelf
cd CommandShelf
npm install
npm run dev          # development, with hot reload
npm run build        # production bundle in out/
npm run dist:win     # installer + portable build in release/
```

Requires Node.js 22.5 or newer — the application uses the built-in `node:sqlite` module, so there is
no native dependency to compile.

## Architecture

![Architecture](docs/architecture.svg)

Two renderers (the management window and the quick panel) talk to a single main process over a typed
IPC bridge. The main process owns everything privileged: the SQLite connection, the global hotkey,
the tray, the clipboard, file dialogs and the shell.

```text
src/main/       Node side: lifecycle, windows, tray, hotkey, SQLite, repositories
src/preload/    The complete list of things the renderer may do
src/renderer/   React: two entry points, shared component library
src/shared/     Types and pure logic used by both sides
```

Notable decisions:

- **`node:sqlite` instead of `better-sqlite3`.** A native module would need recompiling against
  Electron's ABI, Visual Studio build tools on Windows, and asar-unpacking at package time. Node 24
  is built into Electron 44 and ships SQLite with FTS5, so the app has zero native dependencies.
- **The renderer is served over a custom `app://` scheme.** Loading from `file://` gives the document
  an opaque origin, which makes `Content-Security-Policy: script-src 'self'` match nothing and
  quietly blocks the app's own bundle. A privileged scheme gives it a real origin, so the CSP means
  something.
- **Every IPC call returns a `Result` envelope.** Electron replaces a thrown error in a handler with
  `"Error invoking remote method ..."`, losing the message the UI needs to display.
- **`transact` supports nesting via savepoints.** A repository function that manages its own
  transaction can safely be called from inside another one.

See [`docs/architecture.md`](docs/architecture.md) for the full walkthrough.

## Screenshots

| Quick panel                           | Filling in variables                          |
| ------------------------------------- | --------------------------------------------- |
| ![Quick panel](docs/images/panel.png) | ![Variables](docs/images/panel-variables.png) |

| Editing an entry                  | Light theme                                |
| --------------------------------- | ------------------------------------------ |
| ![Editor](docs/images/editor.png) | ![Light theme](docs/images/hero-light.png) |

| Browsing by collection                      | Settings                              |
| ------------------------------------------- | ------------------------------------- |
| ![Collections](docs/images/collections.png) | ![Settings](docs/images/settings.png) |

Every screenshot is a real capture of the running application with the built-in example data, taken
at 2× by [`tests/e2e/screenshots.spec.ts`](tests/e2e/screenshots.spec.ts).

## Development

```bash
npm run dev            # Electron + Vite, hot reload for both renderers
npm run typecheck      # three TypeScript projects: main, renderer, e2e
npm run lint
npm test               # 250 unit and component tests
npm run e2e            # 56 end-to-end tests driving the real application
npm run screenshots    # regenerate docs/images (writes into the repository)
npm run test:coverage
npm run icons          # regenerate build/icon.png, build/icon.ico, the tray icon
```

The end-to-end suite drives the real Electron binary through Playwright. Two details worth knowing:
every launch gets a throwaway `userData` directory, so a test run can never touch your real database,
and `ELECTRON_RUN_AS_NODE` is stripped from the environment first — when that variable is set,
Electron starts as plain Node and the app never boots.

## Tech stack

| Layer        | Choice                                            |
| ------------ | ------------------------------------------------- |
| Shell        | Electron 44                                       |
| UI           | React 19, TypeScript 5.9, Tailwind CSS v4         |
| Build        | electron-vite, Vite 7, electron-builder           |
| Storage      | `node:sqlite` (SQLite + FTS5)                     |
| Highlighting | highlight.js, only the languages that matter here |
| Tests        | Vitest, Testing Library, Playwright (Electron)    |

## Privacy

CommandShelf does not make network requests. It has no updater, no analytics, no crash reporting and
no account. Everything lives in one SQLite file on your disk, whose path is shown in Settings.

## Roadmap

**Not planned.** Cloud sync, accounts, collaboration, an embedded terminal, clipboard history, a
Markdown note system, AI-generated content, a plugin API. The value of this tool is that it stays
small enough to trust with a hotkey.

**Possible later.** Named variable sets (a "server" preset that fills several fields at once),
importing shell history, usage statistics, and a VSCode extension that shares the same database.

## License

[MIT](LICENSE)
