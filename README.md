# Campus Events

College event management: students find events, register solo or as a team, and check in with a QR ticket; coordinators run their events; admins manage everything and see reports.

Final-year project. The full spec and the 12-week build plan live in the project spec doc. This repo is at **Phase 4 (tickets, check-in, dashboards), the MVP**: students sign up, register solo or as a team and get a QR ticket; coordinators scan it with a phone camera at the door and export registrations; admins see attendance across the college. Emails with the QR, results, certificates and feedback come next.

## Tech stack

| Layer          | Choice                                                            |
| -------------- | ----------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, Cache Components) + TypeScript            |
| UI             | Tailwind CSS 4, shadcn/ui (Base UI), lucide-react, light and dark |
| Database       | PostgreSQL 17 (Docker locally, Neon in production)                |
| ORM            | Prisma 7 with the `pg` driver adapter                             |
| Tests          | Vitest (unit, integration); Playwright arrives in Phase 6         |
| CI and hosting | GitHub Actions; Vercel                                            |

## Run it locally

You need Node.js 24 and Docker Desktop.

```bash
cp .env.example .env          # then set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and AUTH_SECRET
docker compose up -d          # PostgreSQL on localhost:5432
npm install                   # also generates the Prisma client
npm run db:deploy             # create the tables
npm run db:seed               # departments, categories, venues, first admin
npm run dev                   # http://localhost:3000
```

Log in at `/login` with the seed admin's email and password. Without `RESEND_API_KEY`, emails (verify email, reset password) are printed in the terminal running `npm run dev`; open the link from there.

## Logins and roles

| Role        | Gets                                                    | Can't open                      |
| ----------- | ------------------------------------------------------- | ------------------------------- |
| Visitor     | Home, sign up, log in                                   | `/profile`, `/manage/*` (login) |
| Student     | Profile, registration, teams, My events, QR ticket      | `/manage/*` (403)               |
| Coordinator | Their events: edit, registrations and exports, check-in | Admin pages (403)               |
| Admin       | Everything: users, master data, every event, reports    | —                               |

- Passwords are hashed with bcrypt; logins are Auth.js JWT cookies.
- Every page and server action calls `requireRole()` (`src/server/session.ts`), which re-reads the user from the database. `src/proxy.ts` adds a fast redirect or HTTP 403 from the cookie, using the rules in `src/lib/access.ts`.
- Changing a role, deactivating an account or resetting a password bumps `users.session_version`, which signs that user out everywhere.
- Email links (verify, reset) are single-use and stored only as SHA-256 hashes (`auth_tokens`).
- Google sign-in turns on when `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `ALLOWED_EMAIL_DOMAIN` are all set, and accepts only that domain.

## Registration rules

- Every change that touches seats first locks the event's row (`SELECT … FOR UPDATE`, `src/server/services/registrations.ts`), so changes to one event happen one at a time. A test fires 50 parallel registrations at a 10-seat event and gets exactly 10 confirmed and 40 waitlisted.
- A team registers when enough members accept to reach the minimum size, and loses its place if it drops below it. Every member has their own registration row. "A seat is taken by" decides whether a team uses one seat or one per member.
- When a seat frees up, the waitlist is walked in order and each place that fits is promoted. A team too big for the seats left stays at the front while a smaller one behind it goes in.
- Registering, cancelling and team changes all end when registration closes. Once people have joined, an event can't switch between solo and team, change its team settings, or lower its limit below the seats taken.
- Rules that need no database live in `src/lib/registrations.ts`. The event page uses them to explain a disabled button and the service uses them to refuse the request.

## Tickets and check-in

- Each confirmed person gets their own ticket code, like `K7QM-3XRT-9PWA-HC2D`: 10 random characters and a 6-character signature made with `AUTH_SECRET` (`src/lib/tickets.ts`). It isn't a database id, and the same code works in the QR or typed by hand. Cancelling kills the code; registering again issues a new one.
- `/manage/check-in/<event>` reads QR codes with the phone camera (`jsqr` on camera frames) and shows name, photo, roll number, team and a live counter. Browsers only offer the camera on https or localhost, so phones need the deployed site; if the camera fails, search by name, roll number, team or ticket code works the same.
- A check-in only updates a confirmed registration not yet checked in, in one statement, so two phones scanning one ticket can't both succeed. A second scan says who let them in and when. Mistakes can be undone. Check-ins, undos and exports are all written to `audit_logs`.
- Check-in opens a day before an event starts and closes a day after it ends.
- Registrations can be filtered and exported as CSV or Excel, and an export holds exactly what the filters show. Ticket codes are never exported, and CSV cells that a spreadsheet would run as formulas are neutralised.
- The attendance rate on `/manage/reports` only counts finished events where at least one person was checked in. An event that never scanned anyone didn't take attendance, and counting it would read as everyone staying away.

### API

Under `/api/v1`, for signed-in admins and that event's coordinators. Errors look like `{ "error": { "code": "...", "message": "..." } }`.

| Method | Path                                                                                        | Purpose                                         |
| ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| GET    | `/events/:id/checkin`                                                                       | Live counter: registered and checked in         |
| POST   | `/events/:id/checkin`                                                                       | Check in; body `ticketCode` or `registrationId` |
| DELETE | `/events/:id/checkin/:registrationId`                                                       | Undo a check-in                                 |
| GET    | `/events/:id/checkin/search?q=`                                                             | Find a confirmed person                         |
| GET    | `/events/:id/registrations?format=json\|csv\|xlsx&q=&status=&attendance=&department=&year=` | List or export registrations                    |

## Scripts

| Script                     | What it does                                                 |
| -------------------------- | ------------------------------------------------------------ |
| `npm run dev`              | Start the dev server                                         |
| `npm run lint`             | ESLint                                                       |
| `npm run typecheck`        | Generate route types, then `tsc --noEmit`                    |
| `npm test`                 | Unit tests (Vitest); no database needed                      |
| `npm run test:integration` | Tests against a real database (`docker compose up -d` first) |
| `npm run format`           | Format with Prettier (`format:check` only checks)            |
| `npm run db:migrate`       | Create a new migration after editing `schema.prisma`         |
| `npm run db:deploy`        | Apply pending migrations                                     |
| `npm run db:seed`          | Insert or update master data (safe to re-run)                |
| `npm run db:studio`        | Browse the database in Prisma Studio                         |

Integration tests create their own `<database>_test` database on the same server and wipe it as they go. They refuse to run against anything but a local `_test` database, so they can't reach your development data or Neon.

## Folder layout

```
legacy-flask/          the original Flask prototype, kept for the report (tag v0-flask-prototype)
prisma/                schema.prisma (16 tables), migrations/, seed.ts
src/app/               pages and layouts (App Router)
src/components/        ui/ (shadcn) and shared components
src/lib/               Prisma client, Zod schemas, access rules, email, uploads
src/server/auth*.ts    Auth.js setup; session.ts has getCurrentUser() and requireRole()
src/server/actions/    server actions called by forms (check the role, validate, call a service)
src/server/services/   business rules and data access, shared by pages, actions and API routes
src/proxy.ts           login redirect and 403 before a page renders
src/generated/prisma/  generated Prisma client (not committed)
tests/unit/            Vitest tests of rules that need no database
tests/integration/     Vitest tests against a real PostgreSQL database
```

## Deploy (Vercel + Neon)

1. Create a Neon project and copy two connection strings: the **pooled** one and the **direct** one.
2. Import this GitHub repo in Vercel. Add environment variables: `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `AUTH_SECRET`, and for real emails `RESEND_API_KEY` and `EMAIL_FROM`. Profile photos need `CLOUDINARY_URL` in production.
3. Deploy. The `vercel-build` script runs `prisma migrate deploy` before `next build`, so every deploy brings the database schema up to date.
4. Seed once from your laptop: put the Neon strings and the admin variables in `.env`, run `npm run db:seed`, then switch `.env` back to local.

Preview deployments run migrations too. Before previews matter, install Neon's Vercel integration so each preview gets its own database branch instead of touching production.

## Workflow

One branch per feature (`feat/auth`, `feat/events`, ...), a pull request into `main`, and CI (lint, format, typecheck, unit tests, migrations, seed, integration tests) must pass before merging.
