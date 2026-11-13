# Security notes — dependencies

**Checked:** 2026-11-12 · **Branch:** `arena/0da75355-mabini-meo`

## What was updated on 2026-11-12

| Package | Was | Now | Why |
|---|---|---|---|
| `next` | 14.2.15 | **14.2.35** | Last patch of the 14.2 line — picks up every fix that exists for 14.x |
| `eslint-config-next` | 14.2.15 | **14.2.35** | Kept in step with `next` (dev only, never shipped) |
| `postcss` | 8.4.41 | **8.5.32** | Clears the source-map path-traversal advisories (build time) |
| `sharp` | 0.33.5 | **0.35.5** | Clears the libvips/image advisories |
| `react-router` | 7.13.0 | **7.18.5** | Clears the 7.18.1-and-below advisories |

Verified after the update: `tsc --noEmit` clean, **143/143 tests**, `npm run build` OK.

## What `npm audit` still reports on `next`, and why it is not a 14.x problem

`npm audit` marks `next` critical because several advisories list ranges such as
`>=13.0.0 <15.5.27`. **No 14.x release fixes them** — the fixes landed in
15.5.16 / 15.5.21 / 15.5.24 / 15.5.27 and in Next 16, and `npm audit` therefore
proposes Next **16.4.6** (a major upgrade). The same is true of the
`eslint-config-next` / `@typescript-eslint` findings: they clear only with majors, and
they are development-time packages that never reach the deployed site.

**Reachability in this application** (checked file by file):

| Advisory family | Applies here? | Why |
|---|---|---|
| Server Actions (DoS, unbounded payload, SSRF, unauthenticated Server Function disclosure) | **No** | No `"use server"` anywhere; the app talks to `/api/*` route handlers only. |
| Middleware / Proxy (redirect cache poisoning, SSRF via middleware, i18n bypass) | **No** | There is no `src/middleware.ts`. |
| Rewrites (request smuggling, attacker-controlled destination host) | **No** | `next.config.js` sets no `rewrites`. |
| `next/image` optimizer (SVG/AVIF RCE, disk-cache growth, DoS) | **Reduced** | No `next/image` is used. `next.config.js` now disables AVIF (`images.formats: ['image/webp']`), refuses SVG and allows no remote patterns. |
| RSC cache confusion / cache-busting poisoning | **Reduced** | Pages are client components reading `/api/*`; nothing is cached across users by the framework. |

## The recommendation, as its own task

Moving to a version that clears the remaining findings means **Next 15.5.27 or newer**
(or Next 16), and for the App Router that brings **React 19** with it — a major upgrade
of the framework and the renderer at once, touching every component and the four
MUI/radix-heavy screens. It should be its own branch with a full pass over login,
session cookies, every list, both print views, the AI module and the mobile layout.

It was deliberately **not** done at the end of this branch: the office is using the
system, and a framework-plus-renderer swap deserves its own review rather than riding
along with the workflow fixes.

## Standing checklist for whoever takes that task

1. Branch from `main`, bump `next` + `react` + `react-dom` + `@types/react` together.
2. `experimental.typedRoutes` is already `false`; delete the `experimental` block if the
   option is gone.
3. `useSearchParams()` (only used in `src/app/reset-password/page.tsx`) stays a client
   hook — no change expected.
4. Re-run: `./node_modules/.bin/tsc --noEmit`, `node --test tests/*.test.cjs`,
   `npm run build`, then the manual pass listed above.
5. Re-check `npm audit` — the `next` line should finally be clean.
