# Campus Events

College event management: students find events, register solo or as a team, and check in with a QR ticket; coordinators run their events; admins manage everything and see reports.

Final-year project. The full spec and the 12-week build plan live in the project spec doc. This repo is at **Phase 0 (foundation)**: the app shell, the database schema and the home page are in place; logins and event pages come next.

## Tech stack

| Layer          | Choice                                                            |
| -------------- | ----------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, Cache Components) + TypeScript            |
| UI             | Tailwind CSS 4, shadcn/ui (Base UI), lucide-react, light and dark |
| Database       | PostgreSQL 17 (Docker locally, Neon in production)                |
| ORM            | Prisma 7 with the `pg` driver adapter                             |
| Tests          | Vitest (unit); Playwright arrives in Phase 6                      |
| CI and hosting | GitHub Actions; Vercel                                            |

## Run it locally

You need Node.js 24 and Docker Desktop.

```bash
cp .env.example .env          # then set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD
docker compose up -d          # PostgreSQL on localhost:5432
npm install                   # also generates the Prisma client
npm run db:deploy             # create the tables
npm run db:seed               # departments, categories, venues, first admin
npm run dev                   # http://localhost:3000
```

## Scripts

| Script               | What it does                                         |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | Start the dev server                                 |
| `npm run lint`       | ESLint                                               |
| `npm run typecheck`  | Generate route types, then `tsc --noEmit`            |
| `npm test`           | Unit tests (Vitest)                                  |
| `npm run format`     | Format with Prettier (`format:check` only checks)    |
| `npm run db:migrate` | Create a new migration after editing `schema.prisma` |
| `npm run db:deploy`  | Apply pending migrations                             |
| `npm run db:seed`    | Insert or update master data (safe to re-run)        |
| `npm run db:studio`  | Browse the database in Prisma Studio                 |

## Folder layout

```
legacy-flask/          the original Flask prototype, kept for the report (tag v0-flask-prototype)
prisma/                schema.prisma (15 tables), migrations/, seed.ts
src/app/               pages and layouts (App Router)
src/components/        ui/ (shadcn) and shared components
src/lib/               Prisma client, nav menus, helpers
src/server/services/   business rules and data access, shared by pages, actions and API routes
src/generated/prisma/  generated Prisma client (not committed)
tests/unit/            Vitest tests
```

## Deploy (Vercel + Neon)

1. Create a Neon project and copy two connection strings: the **pooled** one and the **direct** one.
2. Import this GitHub repo in Vercel. Add environment variables: `DATABASE_URL` (pooled) and `DIRECT_URL` (direct).
3. Deploy. The `vercel-build` script runs `prisma migrate deploy` before `next build`, so every deploy brings the database schema up to date.
4. Seed once from your laptop: put the Neon strings and the admin variables in `.env`, run `npm run db:seed`, then switch `.env` back to local.

Preview deployments run migrations too. Before previews matter, install Neon's Vercel integration so each preview gets its own database branch instead of touching production.

## Workflow

One branch per feature (`feat/auth`, `feat/events`, ...), a pull request into `main`, and CI (lint, format, typecheck, tests, migrations, seed) must pass before merging.
