# 📦 BASELINE — What I Inherited (Not Mine)

Snapshot of the repo exactly as received, before any of my changes.
Recorded 2026-11-09. My changes are tracked in [`../MY-CHANGES.md`](../MY-CHANGES.md).

- **Baseline commit:** `ce9a4749bdced2c0ee8c358dec447bfb82eb56ea` — "Add files via upload"
- **Original author:** Jeicel Mae A. Ortega
- **Files:** 107 — full list in [`baseline-files.txt`](baseline-files.txt)

## What the app is

A **Municipal Engineering Office (Mabini) Local Road management system** —
Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS + shadcn/Radix UI,
with a local SQLite database (`better-sqlite3`, schema in `database-schema.sql`,
auto-created as `data/local-road.sqlite` by `src/lib/local-database.ts`).

### Inherited feature modules (`src/app/components/`)
| Module | Purpose (as inherited) |
|---|---|
| `Dashboard.tsx` | Main dashboard |
| `LocalRoadForm.tsx` / `LocalRoadList.tsx` | Road inventory CRUD |
| `InspectionModule.tsx` | Road inspections |
| `MaintenanceModule.tsx` | Maintenance records |
| `ProjectProgressModule.tsx` | Project progress tracking |
| `AIPredictionModule.tsx` + `src/lib/ai.ts` | AI priority/prediction (AI Gateway; `index.ts` at root is a standalone example script) |
| `AnalyticsDashboard.tsx` / `ReportsModule.tsx` / `PrintDocument.tsx` | Analytics, reports, printing |
| `UserManagementModule.tsx` | Users, roles, auth status |
| `LoginPage.tsx` | Login (lockout + master-password helpers in `src/lib/`) |
| `Sidebar.tsx`, `SystemArchitecture.tsx`, `ConfirmActionDialog.tsx` | Shell / misc |
| `components/ui/*` (~40 files) | Stock shadcn/ui components — upstream library code |

### Inherited API routes (`src/app/api/`)
`local-road`, `inspections`, `maintenance`, `activity-logs`, `ai-priority`, `health`,
and `auth/` (`login`, `logout`-style `status`, `lock-status`, `unlock`,
`request-password-reset`, `reset-password`).

### Notable inherited quirks
- **No `.gitignore`** existed at baseline (I added one — see MY-CHANGES.md).
- Mixed structure: a Vite-style `src/main.tsx` and `src/styles/*` sit alongside the
  Next.js `src/app/*` — appears to be a merged/converted project.
- README states materials are for academic/learning purposes only.
