# Copilot Instructions — ce-sol-crm

Project: React 18 + TypeScript 5 + Vite SPA, TailwindCSS 3, framer-motion 11, Zustand, HashRouter. Private TypeScript API backed by PostgreSQL.

## Modal / overlay rules (mandatory)

These rules exist because we shipped — and fixed — these exact bugs. Do not regress.

1. **Always portal `position: fixed` overlays to `document.body`** using `createPortal` from `react-dom`. Page subtrees contain `framer-motion` ancestors whose `transform` style turns `position: fixed` into ancestor-relative positioning, breaking centering.
2. **Portal wraps `AnimatePresence`, never the reverse.**
   - Correct: `createPortal(<AnimatePresence>{open && <motion.div .../>}</AnimatePresence>, document.body)`
   - Wrong: `<AnimatePresence>{open && createPortal(<motion.div .../>, document.body)}</AnimatePresence>` — `AnimatePresence` does not detect `React.Portal` children, so the modal never mounts and clicks appear to do nothing.
3. **Every direct child of `AnimatePresence` must have a stable `key`.**
4. **Modal panel sizing** must use `flex flex-col max-h-[min(92vh,860px)]` (or `max-h-[calc(100vh-2rem)]`) with `overflow-hidden` on the panel; the scrollable body inside uses `overflow-y-auto`; header/footer use `flex-shrink-0`. Never let the page itself scroll to reveal the modal.
5. **Outer wrapper** uses `fixed inset-0 z-[51] flex items-center justify-center p-2 sm:p-4` with `pointerEvents: 'none'` on the outer and `pointerEvents: 'all'` on the panel, so backdrop clicks remain functional.
6. Reference implementations: `src/pages/ContractsPage.tsx` (`ContractDetailModal`), `src/pages/PipelinePage.tsx` (`ModalWrap`), `src/components/shared/DetailDrawer.tsx`.

## General editing rules

- Do not rewrite git history. No `git push --force`, no amends to pushed commits, no `git reset --hard` on shared branches.
- Don't touch logic, data, or unrelated modals when fixing a UI bug. Make the smallest change that resolves the reported issue.
- Tailwind only — do not add CSS files or CSS-in-JS. Use existing CSS variables (`--bg-card`, `--bg-modal`, `--bg-raised`, `--border-default`, `--border-strong`, `--shadow-modal`).
- Validate with `get_errors` after edits. `npm test` / `tsc` are not runnable in this environment (PowerShell ExecutionPolicy + missing `node_modules`); rely on TypeScript server diagnostics.
- Prefer editing existing files over creating new ones. Do not create markdown documentation unless explicitly requested.
