import type { AgentKind, AgentProfile, AgentState } from '../@types';
import { buildStudentSystemPrompt } from '../shared/prompts';
import type { Agent, AgentRunContext, AgentRunInput, AgentRunResult } from './Agent';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const countWords = (value: string): number => {
  return value.trim().split(/\s+/).filter(Boolean).length;
};

const hasInteractiveCue = (message: string): boolean => {
  return /\?|\b(how|why|what|which|miért|hogyan|melyik|szerinted)\b/i.test(message);
};

const hasExampleCue = (message: string): boolean => {
  return /\b(example|for example|practice|recap|repeat|példa|gyakorlat|összefoglaló|ismétlés)\b/i.test(
    message,
  );
};

const hasAssessmentCue = (message: string): boolean => {
  return /\b(quiz|test|exam|assessment|grade|felmérés|mérősz|dolgozat)\b/i.test(message);
};

const buildPersonaLine = (kind: AgentKind, state: AgentState): string => {
  const stateSignalParts: string[] = [];

  if (state.boredom >= 0.65) {
    stateSignalParts.push('I am getting bored, so I need more interaction.');
  }

  if (state.fatigue >= 0.7) {
    stateSignalParts.push('I am mentally tired and need shorter steps.');
  }

  if (state.knowledgeRetention <= 0.4) {
    stateSignalParts.push('I need a quick recap to retain this better.');
  }

  if (kind === 'student_fast') {
    stateSignalParts.unshift(`Quick synthesis: I got the core quickly and can generalize it.`);
  } else if (kind === 'student_esl') {
    stateSignalParts.unshift(`Simple wording please: I understand better with short sentences.`);
  } else if (kind === 'student_distracted') {
    stateSignalParts.unshift(`I lost focus for a moment, but I am trying to reconnect.`);
  } else if (kind === 'student_emotional') {
    stateSignalParts.unshift(
      state.emotion === 'anxious'
        ? `I feel a bit anxious about this, so I need reassurance and structure.`
        : `I feel more confident if we go step by step.`,
    );
  } else {
    stateSignalParts.unshift(`I am participating as a student.`);
  }

  return stateSignalParts.join(' ');
};

const updateState = (kind: AgentKind, state: AgentState, message: string): Partial<AgentState> => {
  const wordCount = countWords(message);
  const complexity = clamp(wordCount / 42, 0, 1);

  const interactiveCue = hasInteractiveCue(message);
  const exampleCue = hasExampleCue(message);
  const assessmentCue = hasAssessmentCue(message);

  let nextFatigue = clamp(
    state.fatigue + 0.04 + complexity * 0.07 - (interactiveCue ? 0.015 : 0),
    0,
    1,
  );

  let nextBoredom = clamp(
    state.boredom + complexity * 0.08 - (interactiveCue ? 0.07 : 0.01) - (exampleCue ? 0.03 : 0),
    0,
    1,
  );

  let nextKnowledgeRetention = clamp(
    state.knowledgeRetention +
      0.03 +
      (exampleCue ? 0.08 : 0) -
      nextBoredom * 0.06 -
      nextFatigue * 0.05,
    0,
    1,
  );

  if (kind === 'student_distracted') {
    nextBoredom = clamp(nextBoredom + 0.08, 0, 1);
    nextKnowledgeRetention = clamp(nextKnowledgeRetention - 0.06, 0, 1);
  }

  if (kind === 'student_fast') {
    nextFatigue = clamp(nextFatigue - 0.03, 0, 1);
    nextKnowledgeRetention = clamp(nextKnowledgeRetention + 0.05, 0, 1);
  }

  if (kind === 'student_esl' && exampleCue) {
    nextKnowledgeRetention = clamp(nextKnowledgeRetention + 0.04, 0, 1);
  }

  const nextAttention = clamp(
    state.attention + (interactiveCue ? 0.05 : -0.02) - nextBoredom * 0.06 - nextFatigue * 0.05,
    0.2,
    1,
  );

  let nextEmotion: AgentState['emotion'] = state.emotion;

  if (assessmentCue && kind === 'student_emotional') {
    nextEmotion = 'anxious';
  } else if (nextFatigue > 0.78) {
    nextEmotion = 'frustrated';
  } else if (nextBoredom < 0.35 && nextKnowledgeRetention > 0.62) {
    nextEmotion = 'engaged';
  } else {
    nextEmotion = 'calm';
  }

  return {
    attention: nextAttention,
    boredom: nextBoredom,
    fatigue: nextFatigue,
    knowledgeRetention: nextKnowledgeRetention,
    emotion: nextEmotion,
  };
};

export class StudentAgent implements Agent {
  public readonly id: string;
  public readonly kind: AgentKind;
  public readonly name: string;

  public constructor(profile: AgentProfile) {
    this.id = profile.id;
    this.kind = profile.kind;
    this.name = profile.name;
  }

  public async run(input: AgentRunInput, context: AgentRunContext): Promise<AgentRunResult> {
    const profile = input.session.agents.find((agent) => agent.id === this.id);

    if (!profile) {
      return {
        message: 'I am missing state context, please continue with another student.',
      };
    }

    const systemPrompt = buildStudentSystemPrompt(this.kind, profile.state, context.topic);
    const llmResult = await context.llm.generateChatCompletion({
      systemPrompt,
      userPrompt: input.teacherOrUserMessage,
      temperature: 0.4,
    });

    const personaLine = buildPersonaLine(this.kind, profile.state);
    const message = `${personaLine} ${llmResult.text}`;
    context.emitToken(message.split(' ').slice(0, 6).join(' '));

    return {
      message,
      metadata: {
        model: llmResult.model,
        provider: llmResult.provider,
        persona: this.kind,
      },
      statePatch: updateState(this.kind, profile.state, input.teacherOrUserMessage),
    };
  }
}
