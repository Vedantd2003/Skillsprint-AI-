import type { QuestionType } from '../../models/content';

export interface PublicQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  instructions: string;
  data: Record<string, unknown>;
  topic: string;
  difficulty: number;
}

/** Strips the answer key. Only fields safe to show before submission leave the server. */
export function toPublicQuestion(q: {
  _id: { toString(): string };
  type: string;
  prompt: string;
  instructions?: string | null;
  data?: unknown;
  topic: string;
  difficulty?: number | null;
}): PublicQuestion {
  const data = { ...((q.data as Record<string, unknown>) ?? {}) };
  return {
    id: q._id.toString(),
    type: q.type as QuestionType,
    prompt: q.prompt,
    instructions: q.instructions ?? '',
    data,
    topic: q.topic,
    difficulty: q.difficulty ?? 1,
  };
}
