/**
 * Live connectivity check against the real Gemini API (not part of the
 * automated test suite). Requires GEMINI_API_KEY in the environment.
 *   npm run test:gemini-live
 */
import { env } from '../config/env';
import { GeminiProvider } from '../modules/ai/gemini.provider';
import { QUIZ_JSON_SCHEMA, validateQuiz } from '../modules/ai/schemas';

async function main() {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  const gemini = new GeminiProvider(env.GEMINI_API_KEY);
  console.log(`Model: ${gemini.model}`);

  const t0 = Date.now();
  const text = await gemini.generateText({
    system: 'You are a concise tutor.',
    messages: [{ role: 'user', content: 'In one sentence, what is a React hook?' }],
    maxOutputTokens: 200,
  });
  console.log(`✔ text (${Date.now() - t0} ms, ${text.usage.inputTokens}/${text.usage.outputTokens} tokens): ${text.text}`);

  const t1 = Date.now();
  const quiz = await gemini.generateJson({
    system: 'Write accurate quizzes. correctAnswer is a 0-based index.',
    prompt: 'Create an easy quiz with 3 questions about JavaScript const and let.',
    jsonSchema: QUIZ_JSON_SCHEMA,
    maxOutputTokens: 1500,
  });
  const v = validateQuiz(quiz.data, 3);
  console.log(`✔ structured quiz (${Date.now() - t1} ms): ${v.valid.length} valid, ${v.rejected} rejected`);
  if (!v.ok) throw new Error('Quiz failed validation');
}

main().catch((err) => {
  console.error('✘ Gemini smoke test failed:', err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
