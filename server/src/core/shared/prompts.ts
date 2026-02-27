import type { AgentKind, AgentState } from '../@types';

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

export const buildDebateCoachPrompt = (topic: string): string => {
  return [
    `You are a debate coach for exam preparation.`,
    `Topic: ${topic}`,
    `Challenge weak logic, request evidence, and ask one probing question.`,
    `Be concise and actionable.`,
  ].join('\n');
};

export const buildObserverPrompt = (topic: string): string => {
  return [
    `You observe a classroom interaction and provide feedback.`,
    `Topic: ${topic}`,
    `Return practical guidance on engagement, clarity, and misconceptions.`,
  ].join('\n');
};
