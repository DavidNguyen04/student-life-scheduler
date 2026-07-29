# Student Life Scheduler

A web app to schedule coursework, time off, workouts, sleep, and meals — with syllabus-first course creation and optional Canvas sync.

## Features

- **Syllabus-first courses** — upload PDF or paste HTML/text; parser extracts assignments and exams
- **Unified calendar** — sleep, meals, workouts, time off, coursework, and study suggestions
- **Dashboard** — today's agenda, upcoming assignments/exams, priority focus list
- **Canvas sync (Phase 2)** — connect with PAT to sync courses, assignments, and calendar events
- **Grade prioritization (Phase 3)** — assignments ranked by urgency and grade risk
- **Course chatbot (Phase 4)** — RAG over syllabus content for coursework guidance

## Setup

```bash
# Prerequisites: Node 22+, PostgreSQL
createdb student_life_scheduler

cp .env.example .env   # or edit .env directly
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), register an account, and add your first syllabus.

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth secret (generate with `openssl rand -hex 32`) |
| `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000`) |
| `ENCRYPTION_KEY` | 64-char hex key for Canvas token encryption |
| `OPENAI_API_KEY` | Optional — enables full chatbot responses and embeddings |

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npx prisma studio` — browse database
