# API reference

Base URL: `/api/v1`. The machine-readable OpenAPI 3.1 document is served at **`GET /api/v1/openapi.json`** (import it into Postman, Insomnia or Swagger UI). Health check: `GET /health` (outside the versioned prefix).

## Conventions

**Authentication:** `Authorization: Bearer <accessToken>` on everything except the public auth endpoints. Access tokens last 15 minutes; refresh with `POST /auth/refresh`.

**Success envelope**

```json
{ "success": true, "data": { … }, "meta": { "page": 1, "limit": 20, "total": 57, "totalPages": 3 } }
```

`meta` appears on paginated collections, which accept `?page=` (≥1) and `?limit=` (1–100).

**Error envelope**

```json
{ "success": false, "error": { "code": "LESSON_LOCKED", "message": "Complete the previous lessons to unlock this one", "details": [ … ], "requestId": "…" } }
```

Every response carries an `x-request-id` header; quote it when reporting problems.

| HTTP | Common codes |
|---|---|
| 400 | `BAD_REQUEST` (validation, with `details[]` per field), `INVALID_RESET_TOKEN` |
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN` |
| 403 | `FORBIDDEN`, `LESSON_LOCKED`, `OUT_OF_HEARTS` |
| 404 | `NOT_FOUND` (also returned for resources owned by someone else) |
| 409 | `EMAIL_TAKEN`, `LESSON_INCOMPLETE`, `ATTEMPT_CLOSED`, `LESSON_EMPTY` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 422 | `AI_BLOCKED` |
| 429 | `RATE_LIMITED`, `AI_DAILY_QUOTA` |
| 502 | `AI_INVALID_OUTPUT` |
| 503 | `AI_NOT_CONFIGURED`, `AI_BUSY`, `AI_UNAVAILABLE` |

## Endpoints

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{ email, password, displayName, onboarding? }` → `{ user, tokens }`. Password: 8+ chars with a letter and a number. |
| POST | `/auth/login` | `{ email, password }` → `{ user, tokens }` |
| POST | `/auth/refresh` | `{ refreshToken }` → `{ tokens }`. Single use; reuse revokes the session family. |
| POST | `/auth/logout` | `{ refreshToken }` |
| POST | `/auth/forgot-password` | `{ email }` → always 202 |
| POST | `/auth/reset-password` | `{ token, password }` — signs out all sessions |
| GET | `/auth/me` | Current account + onboarding status |

### Courses & lessons
| Method | Path | Notes |
|---|---|---|
| GET | `/courses?category=&track=&level=` | Published catalog with my progress |
| GET | `/courses/:courseId` | Detail, units summary, next lesson |
| GET | `/courses/:courseId/units` | Learning path with per-lesson `status` (`locked`/`available`/`started`/`completed`) |
| POST | `/courses/:courseId/enroll` | Set as current course |
| GET | `/lessons/:lessonId` | Lesson detail + my status |
| POST | `/lessons/:lessonId/start` | Starts or resumes an attempt. Returns questions **without answers** and hearts. |
| POST | `/lessons/:lessonId/submit` | `{ attemptId, questionId, answer \| skip: true }` → `{ correct, correctAnswer, explanation, hearts, progress }`. Idempotent per question. |
| POST | `/lessons/:lessonId/complete` | `{ attemptId }` → XP breakdown, unlocked lessons, achievements, streak. Idempotent (`alreadyCompleted: true` on repeats). |

**Answer formats by question type**

| Type | `answer` |
|---|---|
| `multiple_choice` | option index (`number`) |
| `true_false` | `boolean` |
| `fill_blank`, `short_answer`, `code_output`, `code_fill` | `string` |
| `word_order` | `string[]` (the words in order) |
| `match_pairs` | `number[]` — for each left item, the index of its right item |
| `flashcard` | `{ "knew": boolean }` |

### Progress, revision & gamification
| Method | Path | Notes |
|---|---|---|
| GET | `/progress/me` | Course progress, accuracy, topic accuracy, revision counts, gamification summary |
| GET | `/progress/me/weekly` | XP per day this week (learner's timezone) |
| GET | `/progress/me/weak-topics` | Computed from real answers (`source: "performance_data"`) |
| GET | `/revision/due?limit=&topic=` | Due spaced-repetition items |
| GET | `/revision/practice?topic=` | Practice questions for a weak topic |
| POST | `/revision/submit` | `{ questionId, answer \| skip }` → result, next due date, hearts |
| GET | `/gamification/me` | XP, level, streak, hearts, daily/weekly goals, challenge, recent achievements |
| GET | `/leaderboard?scope=weekly\|alltime\|friends` | Display names and XP only |
| GET | `/achievements` | All achievements with my progress |
| GET | `/challenges/daily` | Today's challenge and progress |
| GET/POST/DELETE | `/friends`, `/friends/:friendId` | Friend codes |

### AI (Gemini)
All AI endpoints are rate limited per user (`AI_PER_MINUTE_LIMIT`) and count toward a daily quota (`AI_DAILY_REQUEST_LIMIT`).

| Method | Path | Body |
|---|---|---|
| GET | `/ai/status` | — |
| POST | `/ai/tutor/chat` | `{ message ≤2000, conversationId?, language?: en\|hi\|mr…, mode?: tutor\|roleplay\|grammar, lessonId?, scenario? }` |
| POST | `/ai/quizzes/generate` | `{ topic, difficulty?, count 3–10, language?, lessonId? }` → quiz without answers |
| GET | `/ai/quizzes/:quizId` | My quiz (no answers) |
| POST | `/ai/quizzes/:quizId/submit` | `{ answers: [{ questionId, answer }] }` → score, explanations, XP (once) |
| POST | `/ai/explanations` | `{ questionId, givenAnswer }` — explains a mistake using the authoritative answer |
| POST | `/ai/study-plan` | `{ days 1–14, focus? }` — built from verified progress |
| POST | `/ai/interview/practice` | `{ mode: hr\|technical, role }` → question; add `{ question, answer }` → scored feedback (estimate) |
| GET | `/ai/conversations` | Paginated |
| GET | `/ai/conversations/:id` | Messages, page 1 = latest |
| DELETE | `/ai/conversations/:id` | Deletes conversation and messages |

### Profile
| Method | Path | Notes |
|---|---|---|
| GET | `/profile/me` | Profile, preferences, notifications, stats |
| PATCH | `/profile/me` | Any of: `displayName, tutorLanguage, uiLanguage, learningGoal, interests, skillLevel, dailyXpGoal, timezone, currentCourseId, onboardingComplete, showOnLeaderboard, preferences{theme,sound,animations,haptics}, notifications{…}` |
| DELETE | `/profile/me` | `{ password }` — permanently deletes the account and all data |

## Admin workflow

1. Create an account in the app, then run `npm run make-admin -- you@example.com` in `backend/`.
2. Sign in again (the role is embedded in the new access token).
3. Use the admin endpoints (all require the admin role):

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/admin/courses` | List / create course (`published` defaults to `false`) |
| PATCH | `/admin/courses/:id` | Edit |
| GET | `/admin/courses/:id/units` · POST `/admin/units` · PATCH `/admin/units/:id` | Units |
| GET | `/admin/units/:id/lessons` · POST `/admin/lessons` · PATCH `/admin/lessons/:id` | Lessons, incl. `prerequisites: [lessonId]` (same course only) |
| GET | `/admin/lessons/:id/questions` | Question bank with answer keys |
| POST/PATCH/DELETE | `/admin/questions`, `/admin/questions/:id` | Questions — answer keys are validated against the question type |
| POST | `/admin/{courses\|units\|lessons}/:id/publish` | `{ published: boolean }` |
| GET | `/admin/ai-quizzes?status=unreviewed` | AI-generated content queue |
| POST | `/admin/ai-quizzes/:id/review` | `{ status: approved\|rejected }` |
| GET | `/admin/metrics` | Users, completions, AI usage and estimated cost (aggregate only) |

Example — add a question:

```bash
curl -X POST "$API/admin/questions" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{
  "lessonId": "<lessonId>", "key": "python:loops:extra-1", "order": 10,
  "type": "code_output", "prompt": "What does this print?",
  "data": { "code": "print(len(\"hello\"))", "language": "python" },
  "answer": { "accepted": ["5"] },
  "explanation": "len counts the 5 characters in \"hello\".", "topic": "Python strings"
}'
```

For bulk content, prefer editing `backend/src/seed/content/*.ts` (reviewed in Git) and running `npm run seed`.
