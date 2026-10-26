/**
 * OpenAPI 3.1 description of the SkillSprint REST API, served at
 * GET /api/v1/openapi.json. Kept next to the code so it ships with each deploy.
 */
type Op = {
  summary: string;
  tags: string[];
  auth?: boolean;
  body?: Record<string, unknown>;
  params?: string[];
  query?: Record<string, Record<string, unknown>>;
  responses?: Record<string, string>;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

function op(o: Op) {
  const parameters = [
    ...(o.params ?? []).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string', pattern: '^[a-f0-9]{24}$' } })),
    ...Object.entries(o.query ?? {}).map(([name, schema]) => ({ name, in: 'query', required: false, schema })),
  ];
  return {
    summary: o.summary,
    tags: o.tags,
    ...(o.auth === false ? { security: [] } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(o.body ? { requestBody: { required: true, content: { 'application/json': { schema: o.body } } } } : {}),
    responses: {
      ...Object.fromEntries(Object.entries(o.responses ?? { 200: 'OK' }).map(([code, d]) => [code, { description: d, content: { 'application/json': { schema: ref('Success') } } }])),
      400: { description: 'Validation error', content: { 'application/json': { schema: ref('Error') } } },
      ...(o.auth === false ? {} : { 401: { description: 'Unauthenticated', content: { 'application/json': { schema: ref('Error') } } } }),
      429: { description: 'Rate limited', content: { 'application/json': { schema: ref('Error') } } },
    },
  };
}

const page = { page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 } };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = { type: 'string' };
const id = { type: 'string', pattern: '^[a-f0-9]{24}$' };

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'SkillSprint AI API',
    version: '1.0.0',
    description:
      'Gamified learning & AI tutoring API. All responses use the envelope `{ success, data, meta? }` or `{ success: false, error: { code, message, details?, requestId } }`. Collection endpoints accept `page` and `limit`.',
  },
  servers: [{ url: '/api/v1' }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Success: obj({ success: { const: true }, data: {}, meta: {} }, ['success', 'data']),
      Error: obj(
        { success: { const: false }, error: obj({ code: str, message: str, details: {}, requestId: str }, ['code', 'message']) },
        ['success', 'error'],
      ),
      Answer: {
        description:
          'Per question type: multiple_choice → option index; true_false → boolean; fill_blank/short_answer/code_output/code_fill → string; word_order → string[]; match_pairs → number[] (right index for each left item); flashcard → { knew: boolean }',
        oneOf: [{ type: 'integer' }, { type: 'boolean' }, { type: 'string' }, { type: 'array' }, obj({ knew: { type: 'boolean' } })],
      },
    },
  },
  paths: {
    '/auth/register': {
      post: op({
        summary: 'Create an account (optionally with onboarding answers)',
        tags: ['Auth'],
        auth: false,
        body: obj({ email: str, password: { type: 'string', minLength: 8 }, displayName: str, onboarding: { type: 'object' } }, ['email', 'password', 'displayName']),
        responses: { 201: 'Account created; returns user and token pair' },
      }),
    },
    '/auth/login': { post: op({ summary: 'Sign in', tags: ['Auth'], auth: false, body: obj({ email: str, password: str }, ['email', 'password']) }) },
    '/auth/refresh': { post: op({ summary: 'Rotate refresh token (single use, reuse revokes family)', tags: ['Auth'], auth: false, body: obj({ refreshToken: str }, ['refreshToken']) }) },
    '/auth/logout': { post: op({ summary: 'Revoke the refresh token family', tags: ['Auth'], auth: false, body: obj({ refreshToken: str }, ['refreshToken']) }) },
    '/auth/forgot-password': { post: op({ summary: 'Request a password reset code (always 202)', tags: ['Auth'], auth: false, body: obj({ email: str }, ['email']), responses: { 202: 'Accepted' } }) },
    '/auth/reset-password': { post: op({ summary: 'Reset password with a code; signs out all sessions', tags: ['Auth'], auth: false, body: obj({ token: str, password: str }, ['token', 'password']) }) },
    '/auth/me': { get: op({ summary: 'Current account', tags: ['Auth'] }) },

    '/courses': { get: op({ summary: 'Published course catalog with my progress', tags: ['Courses'], query: { ...page, category: str, track: str, level: str } }) },
    '/courses/{courseId}': { get: op({ summary: 'Course detail with unit summaries', tags: ['Courses'], params: ['courseId'] }) },
    '/courses/{courseId}/units': { get: op({ summary: 'Learning path: units and lessons with lock state', tags: ['Courses'], params: ['courseId'] }) },
    '/courses/{courseId}/enroll': { post: op({ summary: 'Set as current course', tags: ['Courses'], params: ['courseId'] }) },

    '/lessons/{lessonId}': { get: op({ summary: 'Lesson detail and my status', tags: ['Lessons'], params: ['lessonId'] }) },
    '/lessons/{lessonId}/start': { post: op({ summary: 'Start or resume an attempt (403 LESSON_LOCKED if prerequisites unmet). Returns questions without answers.', tags: ['Lessons'], params: ['lessonId'] }) },
    '/lessons/{lessonId}/submit': {
      post: op({
        summary: 'Check one answer server-side. Idempotent per question. 403 OUT_OF_HEARTS when hearts are exhausted.',
        tags: ['Lessons'],
        params: ['lessonId'],
        body: obj({ attemptId: id, questionId: id, answer: ref('Answer'), skip: { type: 'boolean' } }, ['attemptId', 'questionId']),
      }),
    },
    '/lessons/{lessonId}/complete': {
      post: op({ summary: 'Finish an attempt. Awards XP exactly once (idempotent); returns summary & unlocked lessons.', tags: ['Lessons'], params: ['lessonId'], body: obj({ attemptId: id }, ['attemptId']) }),
    },

    '/progress/me': { get: op({ summary: 'Progress, accuracy by topic, revision counts, gamification', tags: ['Progress'] }) },
    '/progress/me/weekly': { get: op({ summary: 'XP per day for the current week', tags: ['Progress'] }) },
    '/progress/me/weak-topics': { get: op({ summary: 'Weak topics computed from real answers', tags: ['Progress'] }) },
    '/revision/due': { get: op({ summary: 'Spaced-repetition items due now', tags: ['Revision'], query: { limit: { type: 'integer' }, topic: str } }) },
    '/revision/practice': { get: op({ summary: 'Practice questions for a topic', tags: ['Revision'], query: { topic: str, limit: { type: 'integer' } } }) },
    '/revision/submit': { post: op({ summary: 'Answer a revision question; reschedules it', tags: ['Revision'], body: obj({ questionId: id, answer: ref('Answer'), skip: { type: 'boolean' } }, ['questionId']) }) },

    '/gamification/me': { get: op({ summary: 'XP, level, streak, hearts, daily/weekly goals, challenge', tags: ['Gamification'] }) },
    '/leaderboard': { get: op({ summary: 'Leaderboard (display names only)', tags: ['Gamification'], query: { ...page, scope: { enum: ['weekly', 'alltime', 'friends'] } } }) },
    '/achievements': { get: op({ summary: 'All achievements with my progress', tags: ['Gamification'] }) },
    '/challenges/daily': { get: op({ summary: "Today's challenge and my progress", tags: ['Gamification'] }) },
    '/friends': {
      get: op({ summary: 'My friends', tags: ['Social'] }),
      post: op({ summary: 'Add a friend by friend code', tags: ['Social'], body: obj({ friendCode: str }, ['friendCode']), responses: { 201: 'Added' } }),
    },
    '/friends/{friendId}': { delete: op({ summary: 'Remove a friend', tags: ['Social'], params: ['friendId'] }) },

    '/ai/status': { get: op({ summary: 'Whether AI features are configured', tags: ['AI'] }) },
    '/ai/tutor/chat': {
      post: op({
        summary: 'Chat with the Gemini tutor (modes: tutor, roleplay, grammar). Rate limited and daily quota.',
        tags: ['AI'],
        body: obj({ conversationId: id, message: { type: 'string', maxLength: 2000 }, language: str, mode: { enum: ['tutor', 'roleplay', 'grammar'] }, lessonId: id, scenario: str }, ['message']),
      }),
    },
    '/ai/quizzes/generate': {
      post: op({ summary: 'Generate a validated quiz (answer key kept server-side)', tags: ['AI'], body: obj({ topic: str, difficulty: { enum: ['easy', 'medium', 'hard'] }, count: { type: 'integer', minimum: 3, maximum: 10 }, language: str, lessonId: id }, ['topic']), responses: { 201: 'Quiz created' } }),
    },
    '/ai/quizzes/{quizId}': { get: op({ summary: 'Get my generated quiz (no answers)', tags: ['AI'], params: ['quizId'] }) },
    '/ai/quizzes/{quizId}/submit': { post: op({ summary: 'Submit quiz answers; returns score and explanations', tags: ['AI'], params: ['quizId'], body: obj({ answers: { type: 'array', items: obj({ questionId: str, answer: { type: 'integer' } }) } }, ['answers']) }) },
    '/ai/explanations': { post: op({ summary: 'Explain a mistake on a curated question', tags: ['AI'], body: obj({ questionId: id, givenAnswer: str, language: str }, ['questionId', 'givenAnswer']) }) },
    '/ai/study-plan': { post: op({ summary: 'Personalised study plan from verified performance data', tags: ['AI'], body: obj({ days: { type: 'integer' }, focus: str, language: str }) }) },
    '/ai/interview/practice': {
      post: op({ summary: 'Get an interview question, or evaluate an answer (estimate)', tags: ['AI'], body: obj({ mode: { enum: ['hr', 'technical'] }, role: str, question: str, answer: str, previousQuestions: { type: 'array', items: str } }, ['mode', 'role']) }),
    },
    '/ai/conversations': { get: op({ summary: 'My tutor conversations', tags: ['AI'], query: page }) },
    '/ai/conversations/{conversationId}': {
      get: op({ summary: 'Conversation with messages (page 1 = latest)', tags: ['AI'], params: ['conversationId'], query: page }),
      delete: op({ summary: 'Delete a conversation and its messages', tags: ['AI'], params: ['conversationId'] }),
    },

    '/profile/me': {
      get: op({ summary: 'My profile, preferences and stats', tags: ['Profile'] }),
      patch: op({ summary: 'Update profile, learning and notification preferences', tags: ['Profile'], body: { type: 'object' } }),
      delete: op({ summary: 'Delete my account and all data (password required)', tags: ['Profile'], body: obj({ password: str }, ['password']) }),
    },

    '/admin/courses': { get: op({ summary: 'List all courses', tags: ['Admin'], query: page }), post: op({ summary: 'Create course', tags: ['Admin'], body: { type: 'object' }, responses: { 201: 'Created' } }) },
    '/admin/courses/{id}': { patch: op({ summary: 'Edit course', tags: ['Admin'], params: ['id'], body: { type: 'object' } }) },
    '/admin/courses/{id}/units': { get: op({ summary: 'Units of a course', tags: ['Admin'], params: ['id'] }) },
    '/admin/units': { post: op({ summary: 'Create unit', tags: ['Admin'], body: { type: 'object' }, responses: { 201: 'Created' } }) },
    '/admin/units/{id}': { patch: op({ summary: 'Edit unit', tags: ['Admin'], params: ['id'], body: { type: 'object' } }) },
    '/admin/units/{id}/lessons': { get: op({ summary: 'Lessons of a unit', tags: ['Admin'], params: ['id'] }) },
    '/admin/lessons': { post: op({ summary: 'Create lesson (with prerequisites)', tags: ['Admin'], body: { type: 'object' }, responses: { 201: 'Created' } }) },
    '/admin/lessons/{id}': { patch: op({ summary: 'Edit lesson / prerequisites', tags: ['Admin'], params: ['id'], body: { type: 'object' } }) },
    '/admin/lessons/{id}/questions': { get: op({ summary: 'Question bank for a lesson (with answer keys)', tags: ['Admin'], params: ['id'] }) },
    '/admin/questions': { post: op({ summary: 'Create question (answer key validated)', tags: ['Admin'], body: { type: 'object' }, responses: { 201: 'Created' } }) },
    '/admin/questions/{id}': {
      patch: op({ summary: 'Edit question', tags: ['Admin'], params: ['id'], body: { type: 'object' } }),
      delete: op({ summary: 'Delete question', tags: ['Admin'], params: ['id'] }),
    },
    '/admin/{kind}/{id}/publish': { post: op({ summary: 'Publish/unpublish a course, unit or lesson (kind = courses|units|lessons)', tags: ['Admin'], params: ['id'], body: obj({ published: { type: 'boolean' } }, ['published']) }) },
    '/admin/ai-quizzes': { get: op({ summary: 'AI-generated quizzes awaiting review', tags: ['Admin'], query: { ...page, status: str } }) },
    '/admin/ai-quizzes/{id}/review': { post: op({ summary: 'Approve/reject AI content', tags: ['Admin'], params: ['id'], body: obj({ status: { enum: ['approved', 'rejected'] } }, ['status']) }) },
    '/admin/metrics': { get: op({ summary: 'Aggregate usage metrics (no personal data)', tags: ['Admin'] }) },
  },
};
