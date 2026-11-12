# Frontend architecture: `src/` layout

| Folder | Holds |
|---|---|
| `src/app/` | Composition root: `main.tsx` (the Vite entry, referenced by `index.html`), `App.tsx`, and `layout/` (the shell sidebars that combine several features). |
| `src/config/` | Runtime config (`env.ts` SOCKET_URL, `rtc.ts` RTC_CONFIG, `storageKeys.ts`), re-exported from `config/index.ts`. |
| `src/entries/` | Extra Vite entries besides the app, e.g. `phobia-test/main.jsx` for `phobia-test.html`. |
| `src/features/` | One folder per product feature, e.g. `chat/`, `call/`, `voice-room/`, `activities/<name>/`, `games/<name>/`. |
| `src/shared/` | Code used by two or more features: `ui/` (generic components), `hooks/`, `lib/` (non-React helpers, incl. `guards.ts` for narrowing socket payloads), `services/` (socket, audio singletons; `socket/SocketLike.ts` is the socket interface features depend on), `types.ts` (domain shapes shared by features: users, presence, attachments). |
| `src/styles/` | Global CSS (`index.css`, Tailwind entry). |

Nothing else lives in the `src/` root, not even a README, so this document sits in the project root.

## Inside a feature (`src/features/<name>/`)

- `components/`: React components.
- `hooks/`: React hooks.
- `lib/`: non-React logic, including the stateful classes hooks wrap (e.g. `call/lib/CallSession.ts`, `voice-room/lib/VoiceSession.ts`). It can have sub-folders, e.g. `games/empire/lib/empire3d/` and `games/phobia/lib/engine/`.

Put code in a feature when only that feature imports it. Move it to `shared/` once a second feature needs it. Decide by who actually imports it, not by its name.

## Imports: direct file paths, no barrels

Import the file itself, e.g. `../../call/components/DMCallButton`. Features have no `index.ts` barrels.

Reason: import order is module evaluation order, and some modules run code at import time. The clearest case is Prism. `prismjs/components/prism-*` registers grammars as soon as it is imported, and `prism-markup` redefines `Prism.languages.markup`. That wipes out the inline CSS/JS grammars that `prism-css` and `prism-javascript` attach to it. `src/features/chat/components/MessageContent.tsx` and `src/features/activities/code-editor/components/CodeEditorView.tsx` both import Prism components, and whichever is evaluated first decides the final grammar. A barrel such as `src/features/voice-room/index.ts` would pull in `VoiceRoomView`, and through it `CodeEditorView`, earlier than intended. That breaks `<style>`/`<script>` highlighting in chat HTML code blocks.

Rules:
- When adding or reordering imports in `src/app/App.tsx` (or any module in the main chunk), check that evaluation order does not change for modules with import-time side effects. These are side-effect-only imports (`import 'x'`), CSS imports, and module-level writes to globals.
- Heavy games (`games/arena`, `games/empire`, `games/phobia`) are loaded with `lazy(() => import('<component file>'))`. Never import them statically, or they end up in the main chunk.

## TypeScript conventions

- Socket payloads arrive as `unknown`. Each feature narrows them in its `types.ts` (`parseX` / `isX` functions) before use; malformed payloads are ignored.
- Stateful non-React logic (WebRTC peers, audio graphs, players, socket request wrappers) lives in classes with private `#fields` and an explicit `start()`/`stop()` (or `destroy()`) lifecycle. Hooks are thin adapters: they create the instance, call `start`/`stop` in an effect, and read state with `useSyncExternalStore` where the class owns it.
- Game views that are still JavaScript but are rendered from TypeScript have a `.d.ts` next to them declaring their props (`games/arena/components/GameView.d.ts`, `games/empire/components/MiskolcEmpireView.d.ts`). Delete them when those files become `.tsx`.
