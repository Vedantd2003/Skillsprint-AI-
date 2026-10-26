import type { AIProvider, JsonRequest, TextRequest } from './provider';

/**
 * Deterministic offline provider used by automated tests and for local UI work
 * without a Gemini key (AI_PROVIDER=mock). Never enabled implicitly.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';
  readonly model = 'mock-1';
  public jsonResponder?: (req: JsonRequest) => unknown;
  public textResponder?: (req: TextRequest) => string;
  public calls: { kind: 'text' | 'json'; req: TextRequest | JsonRequest }[] = [];

  async generateText(req: TextRequest) {
    this.calls.push({ kind: 'text', req });
    const last = (req.messages[req.messages.length - 1]?.content ?? '').replace(/<\/?learner_input>/g, '');
    const text =
      this.textResponder?.(req) ??
      `**Here's a simple explanation.**\n\nYou asked: "${last.slice(0, 80)}". Think of it like learning to ride a bike — one small step at a time.\n\n*Example:* a short, concrete example goes here.\n\nWould you like a few practice questions on this?`;
    return { text, usage: { inputTokens: 50, outputTokens: 60 } };
  }

  async generateJson(req: JsonRequest) {
    this.calls.push({ kind: 'json', req });
    if (this.jsonResponder) return { data: this.jsonResponder(req), usage: { inputTokens: 80, outputTokens: 200 } };
    const props = (req.jsonSchema.properties ?? {}) as Record<string, unknown>;
    let data: unknown;
    if ('questions' in props) {
      const count = Number(/(\d+) questions/.exec(req.prompt)?.[1] ?? 5);
      data = {
        title: 'Practice Quiz',
        questions: Array.from({ length: count }, (_, i) => ({
          type: i % 3 === 2 ? 'true_false' : 'multiple_choice',
          question: `Sample question ${i + 1}?`,
          options: i % 3 === 2 ? ['True', 'False'] : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: 0,
          explanation: `Explanation for question ${i + 1}.`,
        })),
      };
    } else if ('days' in props) {
      data = {
        summary: 'A focused week built from your recent results.',
        focusTopics: ['practice'],
        days: [1, 2, 3].map((d) => ({ day: d, title: `Day ${d}`, tasks: [{ type: 'revision', description: 'Review your mistakes' }] })),
      };
    } else if ('scores' in props) {
      data = {
        scores: { structure: 3, clarity: 4, relevance: 4, depth: 3 },
        overall: 7,
        strengths: ['Clear opening'],
        improvements: ['Add a concrete example with a measurable result'],
        improvedAnswer: 'An improved sample answer.',
        followUpQuestion: 'Can you tell me more about the outcome?',
      };
    } else {
      data = { question: 'Tell me about yourself.', focus: 'Introduction', tips: ['Use present-past-future structure'] };
    }
    return { data, usage: { inputTokens: 80, outputTokens: 200 } };
  }
}
