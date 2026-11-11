# Frontend architecture: `src/` layout

| Folder | Holds |
|---|---|
| `src/app/` | Composition root: `main.jsx` (the Vite entry, referenced by `index.html`), `App.jsx`, and `layout/` (the shell sidebars that combine several features). |
| `src/config/` | Runtime config (`env.ts` SOCKET_URL, `rtc.ts` RTC_CONFIG, `storageKeys.ts`), re-exported from `config/index.ts`. |
| `src/entries/` | Extra Vite entries besides the app, e.g. `phobia-test/main.jsx` for `phobia-test.html`. |
| `src/features/` | One folder per product feature, e.g. `chat/`, `call/`, `voice-room/`, `activities/<name>/`, `games/<name>/`. |
| `src/shared/` | Code used by two or more features: `ui/` (generic components), `hooks/`, `lib/` (non-React helpers), `services/` (socket, audio singletons). |
| `src/styles/` | Global CSS (`index.css`, Tailwind entry). |

Nothing else lives in the `src/` root, not even a README, so this document sits in the project root.

## Inside a feature (`src/features/<name>/`)

- `components/`: React components.
- `hooks/`: React hooks.
- `lib/`: non-React logic. It can have sub-folders, e.g. `games/empire/lib/empire3d/` and `games/phobia/lib/engine/`.

Put code in a feature when only that feature imports it. Move it to `shared/` once a second feature needs it. Decide by who actually imports it, not by its name.

## Imports: direct file paths, no barrels

Import the file itself, e.g. `../../call/components/DMCallButton`. Features have no `index.js` barrels.

Reason: import order is module evaluation order, and some modules run code at import time. The clearest case is Prism. `prismjs/components/prism-*` registers grammars as soon as it is imported, and `prism-markup` redefines `Prism.languages.markup`. That wipes out the inline CSS/JS grammars that `prism-css` and `prism-javascript` attach to it. `src/features/chat/components/MessageContent.jsx` and `src/features/activities/code-editor/components/CodeEditorView.jsx` both import Prism components, and whichever is evaluated first decides the final grammar. A barrel such as `src/features/voice-room/index.js` would pull in `VoiceRoomView`, and through it `CodeEditorView`, earlier than intended. That breaks `<style>`/`<script>` highlighting in chat HTML code blocks.

Rules:
- When adding or reordering imports in `src/app/App.jsx` (or any module in the main chunk), check that evaluation order does not change for modules with import-time side effects. These are side-effect-only imports (`import 'x'`), CSS imports, and module-level writes to globals.
- Heavy games (`games/arena`, `games/empire`, `games/phobia`) are loaded with `lazy(() => import('<component file>'))`. Never import them statically, or they end up in the main chunk.
