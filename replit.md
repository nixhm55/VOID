# VOID Music Player

A premium, local-first music player for importing, organizing, and playing a personal audio library in the browser.

## Run & Operate

- `pnpm install` — install dependencies
- `pnpm run dev` — start the Vite dev server (defaults to port 3010; `PORT`/`BASE_PATH` env vars are optional and validated)
- `pnpm run build` — production build to `dist/`
- `pnpm run serve` — preview the production build locally
- `pnpm run typecheck` — TypeScript typecheck (`tsc --noEmit`)

## Stack

- Vite 7 + React 19 + TypeScript 5.9 + Tailwind CSS 4
- pnpm workspaces (single package at repo root), Node.js 22+
- Routing: wouter (client-side SPA)
- Deployment: Vercel (`vercel.json`) and Cloudflare Pages (`public/_redirects`)

## Where things live

- `src/` — app source: `App.tsx`, `main.tsx`, `components/`, `hooks/`, `lib/`, `pages/`
- `public/` — static assets: `favicon.svg`, `robots.txt`, `_redirects` (SPA fallback `/* /index.html 200`)
- `dist/` — build output (gitignored)
- `vite.config.ts` — Vite config with safe `PORT`/`BASE_PATH` fallbacks, `@` → `src/` alias
- Root: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `pnpm-workspace.yaml`, `vercel.json`

## Architecture decisions

- Imported audio and library data stay in browser storage; do not upload personal audio to the server.
- Use IndexedDB for audio file blobs and browser-local persistence, not localStorage/base64 for audio.

## Product

VOID is a personal music player for importing local audio, organizing a library and playlists, and listening with a persistent player.

## User preferences

- Keep the VOID wordmark distinctive through subtle spacing and kerning, not oversized futuristic type or effects.
- Maintain a calm, spacious, premium macOS feel; use glass effects selectively to protect performance.
- Support intentional dark, light, and system appearance with a monochrome identity.
- No visual/UI changes without explicit request — styling in `src/`, `src/index.css` is treated as frozen.

## Gotchas

- `pnpm-workspace.yaml` overrides strip non-linux-x64 native binaries for lean installs; the four `optionalDependencies` (`@esbuild/darwin-arm64`, `@rollup/rollup-darwin-arm64`, `@tailwindcss/oxide-darwin-arm64`, `lightningcss-darwin-arm64`) restore them on macOS so local builds work. Do not remove them.
- `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` is a deliberate supply-chain defense — never disable it.
