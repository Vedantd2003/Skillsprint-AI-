# Architecture

```mermaid
flowchart LR
  subgraph Device["Android / iOS app (Expo)"]
    UI[Expo Router screens] --> RQ[TanStack Query cache<br/>persisted to AsyncStorage]
    UI --> Z[Zustand: auth, prefs,<br/>offline answer queue]
    RQ --> C[API client<br/>single-flight refresh]
    Z --> C
    C -. refresh token .-> SS[(SecureStore<br/>Keychain/Keystore)]
  end
  C -- HTTPS JSON /api/v1 --> API
  subgraph Server["Node.js API (Render)"]
    API[Express + Helmet + CORS<br/>rate limits + Zod] --> SVC[Domain services]
    SVC --> AI[AI service<br/>quotas, validation]
    AI --> P{{AIProvider interface}}
    P --> G[GeminiProvider<br/>@google/genai]
    P -.tests.-> M[MockProvider]
  end
  SVC --> DB[(MongoDB Atlas)]
  G --> GEM[Google Gemini API]
```

The mobile app never talks to Gemini or the database directly. Every rule that matters — unlocking, answer checking, XP, hearts, streaks, quotas — runs on the server.

## Backend modules

| Module | Responsibility |
|---|---|
| `auth` | Registration (with onboarding answers), login, refresh-token rotation with reuse detection, logout, password reset |
| `courses` | Catalog, course detail, **learning path builder** (`courseMap.ts`) that computes locked / available / started / completed from persisted progress |
| `lessons` | `start` (enforces prerequisites, resumes unfinished attempts), `submit` (server-side checking, idempotent per question), `complete` (idempotent, awards XP) |
| `gamification` | XP ledger, levels, streaks, hearts, achievements, daily challenges, weekly goals, leaderboards |
| `revision` | Spaced repetition queue, topic statistics, weak-topic detection |
| `ai` | Tutor chat (tutor / role-play / grammar modes), quiz generation + submission, mistake explanations, study plans, interview practice, conversation history |
| `profile` | Profile, learning and notification preferences, account deletion |
| `social` | Friend codes and friend leaderboards |
| `admin` | Content CRUD, prerequisites, publishing, AI-content review, aggregate metrics |

## Data model

| Collection | Key fields | Indexes |
|---|---|---|
| `User` | email, passwordHash (bcrypt, never selected by default), role | `email` unique |
| `UserProfile` | displayName, friendCode, learning prefs, timezone, `gamification` sub-document (XP, level, streaks, hearts, counters) | `userId` unique, `friendCode` unique, `gamification.totalXp` |
| `NotificationPreference` | reminder time, streak alerts | `userId` unique |
| `RefreshToken` | SHA-256 hash, familyId, expiresAt, revokedAt | `tokenHash` unique, TTL on `expiresAt` |
| `PasswordResetToken` | hash, expiresAt, usedAt | `tokenHash` unique, TTL |
| `Course` / `Unit` / `Lesson` | slug/key, order, published, prerequisites, xpReward | `slug`/`key` unique, `(courseId, order)` |
| `Question` | type, prompt, public `data`, **private `answer`** (`select: false`), explanation, topic | `key` unique, `(lessonId, order)` |
| `LessonAttempt` | questionIds, answers[], status, stored `result` | `(userId, lessonId, status)` |
| `UserProgress` | status, bestScore, timesCompleted | `(userId, lessonId)` unique |
| `XPTransaction` | amount, reason, **sourceKey**, day, week | `(userId, sourceKey)` **unique** |
| `IdempotencyKey` | key | `key` unique, TTL 30 days |
| `Achievement` / `UserAchievement` | metric + threshold / unlockedAt | `code` unique / `(userId, achievementId)` unique |
| `DailyActivity` | per-day XP, lessons, answers | `(userId, day)` unique |
| `DailyChallenge` | per-day challenge definition | `day` unique |
| `LeaderboardEntry` | weekly XP | `(userId, week)` unique, `(week, xp)` |
| `TopicStat` | attempts, correct, skipped | `(userId, topic)` unique |
| `RevisionItem` | SM-2 state, dueAt, wrongCount, mastered | `(userId, questionId)` unique, `(userId, mastered, dueAt)` |
| `AIConversation` / `AIMessage` | mode, context / role, content | `(userId, lastMessageAt)`; messages TTL (default 180 days) |
| `AIQuiz` | generated questions with **hidden answer key**, reviewStatus | `(userId, createdAt)` |
| `AIUsage` | per user/day/feature: requests, failures, tokens, estimated cost | `(userId, day, feature)` unique |
| `Friendship` | userId → friendId | unique pair |

Ownership is enforced in every query (`{ _id, userId }`), so another user's id simply returns 404 — there is no separate "check then fetch" step to forget.

## Gamification rules

**XP is never trusted from the client.** Rewards are written to an append-only ledger (`XPTransaction`) whose unique `(userId, sourceKey)` index makes each award idempotent:

| Event | sourceKey | Default |
|---|---|---|
| First completion of a lesson | `lesson-first:<lessonId>` | lesson's `xpReward` (15–30) |
| Perfect first completion | `perfect:<lessonId>` | 5 |
| Replay of a completed lesson | `replay:<attemptId>` | 3 |
| Unit completed | `unit:<unitId>` | unit `rewardXp` (20) |
| Daily challenge met | `challenge:<day>` | 10–20 |
| AI quiz submitted (≥1 correct) | `ai-quiz:<quizId>` | 8 |
| Revision session (5+ answers in a day) | `revision:<day>` | 5 |

Only after a ledger insert succeeds are the cached totals, daily activity and weekly leaderboard incremented. `reconcileXp()` can rebuild cached totals from the ledger. Lesson completion is additionally claimed through an `IdempotencyKey` (`complete:<attemptId>`): exactly one concurrent request performs the work; duplicates wait for and return the stored result. Tests fire four simultaneous completions and assert one ledger row.

**Levels:** level L needs `50 × L × (L − 1)` XP (L2 = 100, L3 = 300, L5 = 1000).

**Streaks and timezones:** a learning day is the calendar date in the learner's own IANA timezone (captured from the device at sign-up, editable, default `Asia/Kolkata`). Completing a lesson or answering a revision question correctly marks the day active. Next day → +1; same day → unchanged; a gap of 2+ days → restarts at 1. The displayed streak drops to 0 once a full day is missed, and the dashboard flags "at risk" streaks.

**Hearts:** 5 max. A wrong answer in a regular lesson costs one (review lessons and revision are free). One heart refills every 30 minutes, and each correct revision answer earns one back. Running out pauses the lesson — the attempt is saved and resumes exactly where it stopped, so no progress is ever lost.

**Unlocking:** a lesson unlocks when its prerequisites are completed (explicit, or by default the previous lesson in course order). Checkpoints require 70%. The rule lives in one function (`buildCourseMap`) used by both the path view and `POST /lessons/:id/start`.

## Answer checking

Every question type is checked deterministically on the server (`answerChecker.ts`): option index, boolean, normalised text (case, whitespace and punctuation-insensitive), exact word order, full match mapping, self-graded flashcards, keyword rubrics for short answers, and normalised text for code output / code fill. **User code is never executed.** Coding practice uses predict-the-output and fix-the-blank formats; a sandboxed runner (e.g. Judge0) could be added behind the same interface later. Answer keys are stored with `select: false` and stripped by `toPublicQuestion()`; tests assert no key fields appear in `start` or revision responses.

## AI design and safety

- **Provider interface** (`provider.ts`): `generateText` and `generateJson`. `GeminiProvider` uses `@google/genai` with per-request timeouts (AbortController), exponential backoff retries for 429/5xx/timeouts, and token usage capture. `MockProvider` makes the suite deterministic. Swapping providers touches one file.
- **Structured output:** quizzes, study plans and interview feedback request JSON with a JSON Schema (`responseJsonSchema`) and are re-validated with Zod. Quizzes are validated question by question — malformed items (bad index, duplicate options, missing explanation, wrong type, duplicate questions) are dropped; if too few survive, the model is asked once more, then the request fails safely with `AI_INVALID_OUTPUT`.
- **Answer keys stay on the server** for AI quizzes too; scoring happens on submit. AI quizzes live in their own collection, flagged `unreviewed`, separate from curated content, and the app labels them as AI-generated.
- **Grounding in real data:** the tutor's lesson context, weak topics and study-plan lesson list come from the database, never from the client. Study-plan lesson ids returned by the model are checked against the provided list; unknown ids are removed.
- **Prompt-injection defence:** learner text is wrapped in `<learner_input>` tags and the system instruction states that tagged content is data, not instructions; secrets never appear in prompts.
- **Quotas and cost:** per-user per-minute rate limit, per-user daily request quota, max input length (2,000 chars for chat), output token caps, and per-feature usage/cost tracking visible in `/admin/metrics`.
- **Failures:** provider errors map to stable codes (`AI_NOT_CONFIGURED`, `AI_BUSY`, `AI_UNAVAILABLE`, `AI_BLOCKED`, `AI_INVALID_OUTPUT`) with friendly messages; no prompts, keys, stack traces or upstream details reach the client. Logs carry the request id and error kind only.
- **Estimates are labelled:** interview scores and explanations carry `isEstimate: true` and an in-app disclaimer.

## Security & privacy

- bcrypt password hashing (cost 12 in production); constant-work login to avoid user enumeration; generic responses for forgot-password.
- 15-minute HS256 access tokens (issuer/audience checked) + opaque 30-day refresh tokens stored only as SHA-256 hashes, rotated on every use; reuse of a rotated token revokes the entire family. Password reset signs out all sessions.
- Refresh tokens on the device live in SecureStore (Keychain / Android Keystore), never AsyncStorage. Access tokens are memory-only.
- Every request body, query and path param is Zod-validated with `.strict()` objects (no mass assignment), `express-mongo-sanitize` strips `$`/`.` keys, 64 KB body limit, Helmet headers, allow-listed CORS, global and per-route rate limits (auth endpoints per IP + email).
- Leaderboards and friend lists expose only display name, avatar seed, level and XP; learners can opt out. Emails are only ever returned to their owner.
- Account deletion (password-confirmed) removes the user's documents from every collection.
- Tutor chats are disclosed in-app as stored, deletable per conversation, and expire automatically (TTL).

## Mobile app

- **Navigation:** Expo Router with `Stack.Protected` guards — signed-out users can only reach onboarding/auth; signed-in users reach tabs and feature screens.
- **State:** server state in TanStack Query (persisted cache for offline viewing of course metadata and dashboard), client state in Zustand.
- **Lesson player:** a pure reducer (`lessonMachine.ts`) drives answer → check → feedback → next → complete; unit-tested independently of React.
- **Offline:** NetInfo feeds React Query's online manager and an offline banner. If submitting an answer fails due to the network, it is saved to a persisted queue and clearly labelled "saved on this device, not yet synced"; the queue flushes on reconnect. Because the server is idempotent per (attempt, question) and per completion, retries can't duplicate progress or XP. XP is only shown after the server confirms completion.
- **Design system:** tokens in `theme/tokens.ts` (light + dark), Bricolage Grotesque for headings, Atkinson Hyperlegible for body text, 48 dp minimum touch targets, accessibility labels/roles/states throughout, and Settings switches for sound, animation (reduced motion) and haptics.
