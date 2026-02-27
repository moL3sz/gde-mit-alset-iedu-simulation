import type { AgentKind, AgentState, SessionMode } from '../@types';

export const buildStudentSystemPrompt = (
  kind: AgentKind,
  state: AgentState,
  topic: string,
): string => {
  return [
    `You are a student agent in a classroom simulator.`,
    `Topic: ${topic}`,
    `Persona kind: ${kind}`,
    `Attention: ${state.attention.toFixed(2)}`,
    `Boredom: ${state.boredom.toFixed(2)}`,
    `Fatigue: ${state.fatigue.toFixed(2)}`,
    `Knowledge retention: ${state.knowledgeRetention.toFixed(2)}`,
    `Emotion: ${state.emotion}`,
    `ESL support needed: ${state.eslSupportNeeded ? 'yes' : 'no'}`,
    `Misconceptions: ${state.misconceptions.join(', ') || 'none'}`,
    `Respond as a student and keep it practical for teaching feedback.`,
  ].join('\n');
};

export const buildTeacherSystemPrompt = (topic: string, mode: SessionMode): string => {
  const modeInstruction =
    mode === 'classroom'
      ? 'Guide students with clarity, check understanding, and propose the next concrete teaching step.'
      : 'Act as a debate teacher: challenge weak claims, ask one probing question, and strengthen argument quality.';

  return [
    `You are a teacher agent for an education simulation platform.`,
    `Topic: ${topic}`,
    `Mode: ${mode}`,
    modeInstruction,
    `Be concise, specific, and actionable.`,
  ].join('\n');
};
