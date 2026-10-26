# SkillSprint AI

**Learn smarter. Practice daily. Level up.**

A gamified learning and training app for students, job seekers and developers: five-minute interactive lessons, a Google Gemini AI tutor that speaks English, Hindi and Marathi, mock interviews, coding drills and spaced-repetition revision — all backed by a secure Node.js API.

| | |
|---|---|
| **Mobile** | React Native + Expo SDK 58, TypeScript (strict), Expo Router, TanStack Query, Zustand, React Hook Form + Zod, Reanimated, SecureStore, Notifications |
| **Backend** | Node.js 22, Express, TypeScript, MongoDB (Mongoose), Zod, JWT + rotating refresh tokens, bcrypt, Helmet, rate limiting |
| **AI** | Google Gemini via the official `@google/genai` SDK, server-side only, structured JSON output validated with Zod |
| **Ops** | GitHub Actions CI, Render Blueprint, EAS Build, MongoDB Atlas |

## Repository layout

```
skillsprint-ai/
├── backend/                 Express API
│   ├── src/
│   │   ├── config/env.ts        Validated environment variables
│   │   ├── models/              18+ Mongoose models with indexes
│   │   ├── modules/
│   │   │   ├── auth/            Register, login, refresh rotation, password reset
│   │   │   ├── courses/         Catalog + learning path / unlock engine
│   │   │   ├── lessons/         Start → submit → complete, server-side answer checking
│   │   │   ├── gamification/    XP ledger, levels, streaks, hearts, achievements, challenges, leaderboard
│   │   │   ├── revision/        Spaced repetition (SM-2 style), weak topics
│   │   │   ├── ai/              Provider interface, Gemini provider, prompts, schemas, quotas
│   │   │   ├── profile/         Profile, settings, account deletion
│   │   │   ├── social/          Friend codes
│   │   │   └── admin/           Content management API + metrics
│   │   ├── seed/                Repeatable seed: 10 courses, 57 lessons, 237 questions
│   │   └── openapi.ts           OpenAPI 3.1 document (served at /api/v1/openapi.json)
│   └── tests/                   86 Vitest + Supertest tests
├── mobile/                  Expo app
│   ├── src/app/                 Expo Router screens (onboarding, auth, tabs, lesson player, tutor…)
│   ├── src/components/          Design-system components (PrimaryButton, LessonCard, QuizOption…)
│   ├── src/lesson/              Pure lesson state machine + answer drafts
│   ├── src/store/               Zustand stores (auth, prefs, offline queue)
│   ├── src/api/                 Typed API client with single-flight token refresh
│   └── __tests__/               38 Jest + Testing Library tests
├── docs/                    Architecture, API and deployment guides
├── .github/workflows/ci.yml Lint, typecheck, tests, build, Android bundle
└── render.yaml              Render Blueprint for the API
```

## Quick start (local)

**Prerequisites:** Node.js 20+ (22 recommended), a MongoDB database (Atlas free tier or local `mongod`), Android Studio emulator or a phone with a development build.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env          # then fill in MONGODB_URI, JWT_ACCESS_SECRET, GEMINI_API_KEY
npm run seed                  # loads courses, lessons, questions and achievements (safe to re-run)
npm run dev                   # http://localhost:4000  (health: /health, docs: /api/v1/openapi.json)
```

Verify Gemini connectivity with your real key:

```bash
npm run test:gemini-live
```

### 2. Mobile app

```bash
cd mobile
npm install
cp .env.example .env          # set EXPO_PUBLIC_API_URL (see below)
npx expo start                # press "a" for Android
```

`EXPO_PUBLIC_API_URL` must point at the backend from the device's point of view:

| Where the app runs | Value |
|---|---|
| Android emulator | `http://10.0.2.2:4000/api/v1` |
| Physical phone on the same Wi-Fi | `http://<your-computer-LAN-IP>:4000/api/v1` |
| Production | `https://<your-render-service>.onrender.com/api/v1` |

The app uses native modules (SecureStore, notifications, audio, Reanimated), so use a **development build** rather than Expo Go:

```bash
npx eas-cli@latest build --profile development --platform android   # cloud build, installable APK
# or, with Android Studio installed locally:
npx expo run:android
```

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB connection string (Atlas `mongodb+srv://…`) |
| `JWT_ACCESS_SECRET` | ✅ | ≥32 random characters for signing access tokens |
| `GEMINI_API_KEY` | for AI | Google AI Studio key — server-side only |
| `GEMINI_MODEL` | | Model id, default `gemini-flash-latest` (change without code edits) |
| `AI_PROVIDER` | | `gemini` (default) or `mock` for offline UI work |
| `CORS_ORIGINS` | | Comma-separated browser origins; native apps send no Origin |
| `AI_DAILY_REQUEST_LIMIT`, `AI_PER_MINUTE_LIMIT` | | Per-user AI quotas (defaults 60/day, 10/min) |
| `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_OUTPUT_TOKENS` | | Gemini call limits |
| `XP_*`, `HEARTS_MAX`, `HEART_REFILL_MINUTES` | | Configurable rewards and limits |
| `DEFAULT_TIMEZONE` | | Fallback timezone for streak days (default `Asia/Kolkata`) |
| `EXPOSE_DEV_RESET_TOKEN` | | Dev only: return password-reset codes in the API response (refused in production) |

See `backend/.env.example` for the full list with comments.

### Mobile (`mobile/.env`)

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend base URL. Public, bundled into the app — never put secrets in `EXPO_PUBLIC_*`. |

## Configuring Gemini

1. Create a key at <https://aistudio.google.com/apikey>.
2. Put it in `backend/.env` as `GEMINI_API_KEY=…` (locally) or in the Render dashboard (production). It never goes in the mobile app or in Git.
3. Optionally set `GEMINI_MODEL` (default `gemini-flash-latest`).
4. Run `npm run test:gemini-live` to confirm text and structured-JSON generation both work.

Without a key the API still runs: AI endpoints return a clear `AI_NOT_CONFIGURED` error and the app shows a notice, while lessons and revision keep working.

## Configuring MongoDB Atlas

1. Create a free **M0** cluster at <https://cloud.mongodb.com> (region: Mumbai `ap-south-1` is closest for India).
2. **Database Access →** add a user with a strong password and the *readWrite* role.
3. **Network Access →** allow your IP for local work; for Render, allow `0.0.0.0/0` (Render's free tier has no static IP) — the database user password is then the main protection, so make it long and random.
4. **Connect → Drivers →** copy the `mongodb+srv://…` string, add the database name (`/skillsprint`) and set it as `MONGODB_URI`.
5. Run `npm run seed` once against it. Indexes are created automatically on startup.

## Tests and quality checks

```bash
# backend — needs a MongoDB at TEST_MONGODB_URI (default mongodb://127.0.0.1:27017/skillsprint_test)
cd backend && npm run lint && npm run typecheck && npm test && npm run build

# mobile
cd mobile && npx eslint . && npx tsc --noEmit && npx jest && npx expo export --platform android
```

CI runs all of the above on every push and pull request, with a real MongoDB 7 service container.

## Admin and content

Promote an account, then sign in again to get an admin token:

```bash
cd backend && npm run make-admin -- you@example.com
```

Admins manage courses, units, lessons (with prerequisites), question banks, publishing and AI-quiz review through `/api/v1/admin/*` — see [docs/API.md](docs/API.md#admin-workflow). Curated content lives in `backend/src/seed/content/*.ts`; editing those files and re-running `npm run seed` updates content in place without touching learner data.

## More documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, data model, gamification rules, AI safety, security
- [docs/API.md](docs/API.md) — endpoint reference, response envelope, error codes, admin workflow
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Render, Atlas, EAS Android builds, production checklist
