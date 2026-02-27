import type { DebateRubric } from '../@types';

export interface RubricInput {
  topic: string;
  userMessage: string;
  coachMessage: string;
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const includesEvidenceSignal = (text: string): boolean => {
  return /\b(data|study|source|evidence|because|for example|according to)\b/i.test(text);
};

export const scoreDebateRubric = (input: RubricInput): DebateRubric => {
  const userLength = input.userMessage.trim().split(/\s+/).length;
  const coachLength = input.coachMessage.trim().split(/\s+/).length;

  const argumentStrength = clamp(Math.round(userLength / 6), 1, 10);
  const evidenceUse = includesEvidenceSignal(input.userMessage) ? 8 : 4;
  const clarity = clamp(10 - Math.round(Math.abs(userLength - 28) / 6), 1, 10);
  const rebuttal = clamp(Math.round(coachLength / 7), 1, 10);
  const overall = Math.round((argumentStrength + evidenceUse + clarity + rebuttal) / 4);

  const feedback = `On '${input.topic}', strengthen evidence and sharpen rebuttal precision.`;

  return {
    argumentStrength,
    evidenceUse,
    clarity,
    rebuttal,
    overall,
    feedback,
  };
};
