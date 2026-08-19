<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

This is a single Next.js 16 (Turbopack) app backed by PostgreSQL via Prisma 7. Standard commands live in `README.md` and `package.json` scripts; the notes below only cover non-obvious cloud caveats. The update script already runs `npm install` (its `postinstall` runs `prisma generate` into `src/generated/prisma`).

- **PostgreSQL is installed in the base environment but is NOT auto-started.** Start it before running the app, migrations, or anything that touches the DB: `sudo pg_ctlcluster 16 main start`. Database `student_life_scheduler` (owner `postgres`, password `postgres`) already exists in the base environment.
- **`.env` is git-ignored** and lives on disk in the base environment with a working local config (`DATABASE_URL="postgresql://postgres:postgres@localhost:5432/student_life_scheduler"`, plus generated `AUTH_SECRET`/`ENCRYPTION_KEY`, `NEXTAUTH_URL=http://localhost:3000`). If it is ever missing, recreate it from `.env.example` with those values.
- **Apply migrations** after starting Postgres with `npx prisma migrate deploy` (idempotent; use `npx prisma migrate dev` when creating new migrations).
- **Run the dev server** with `npm run dev` (Turbopack, http://localhost:3000). Middleware protects `/dashboard`, `/calendar`, `/courses`, `/settings`, `/syllabus` — you must register/log in first.
- **`OPENAI_API_KEY` is optional.** Auth, courses, the unified calendar, and scheduling all work without it (the code has graceful fallbacks). Only syllabus LLM parsing (`/syllabus/add` → "Parse syllabus") and full chatbot replies require a real key; set it in `.env` to enable them.
- **Lint:** `npm run lint`. There are a few pre-existing lint errors/warnings in the app code (e.g. `src/components/theme-provider.tsx`, `src/components/calendar/legend-edit-modal.tsx`) — these are not environment problems.
- There is **no automated test suite** (no `test` script). Validate changes manually via the dev server.
