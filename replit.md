# VOID Music Player

A premium, local-first music player for importing, organizing, and playing a personal audio library in the browser.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/void-player run dev` — run the VOID web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/void-player/` — VOID music player web app
- `artifacts/api-server/` — shared API scaffold; VOID's library is browser-local
- `artifacts/mockup-sandbox/` — design canvas preview service

## Architecture decisions

- Imported audio and library data are intended to stay in browser storage; do not upload personal audio to the server.
- Use IndexedDB for audio file blobs and browser-local persistence, not localStorage/base64 for audio.

## Product

VOID is a personal music player for importing local audio, organizing a library and playlists, and listening with a persistent player.

## User preferences

- Keep the VOID wordmark distinctive through subtle spacing and kerning, not oversized futuristic type or effects.
- Maintain a calm, spacious, premium macOS feel; use glass effects selectively to protect performance.
- Support intentional dark, light, and system appearance with a monochrome identity.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
