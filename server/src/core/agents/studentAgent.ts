import type { AgentKind, AgentProfile, AgentState, Turn } from '../@types';
import { buildStudentSystemPrompt } from '../shared/prompts';
import { limitToSentences } from '../shared/text';
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

const toCompactLine = (value: string, maxLength: number): string => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1)}…`;
};

const normalizeKnowledgeLines = (lines: string[] | undefined): string[] => {
  if (!Array.isArray(lines)) {
    return [];
  }

  return lines
    .map((line) => toCompactLine(line, 220))
    .filter(Boolean)
    .filter((line, index, all) => all.indexOf(line) === index);
};

const buildFallbackKnowledgeFromRecentTurns = (recentTurns: Turn[], studentId: string): string[] => {
  return recentTurns
    .filter(
      (turn) =>
        turn.role === 'teacher' || (turn.role === 'agent' && turn.agentId === studentId),
    )
    .slice(-6)
    .map((turn) => {
      if (turn.role === 'teacher') {
        return `Teacher said: ${toCompactLine(turn.content, 160)}`;
      }

      return `I said earlier: ${toCompactLine(turn.content, 160)}`;
    });
};

const getKnowledgeWindow = (state: AgentState): number => {
  const memorySignal = clamp(
    state.knowledgeRetention * 0.55 +
      state.attention * 0.2 -
      state.fatigue * 0.15 -
      state.boredom * 0.1,
    0,
    1,
  );

  return Math.max(1, Math.round(1 + memorySignal * 7));
};

const buildMemoryConstrainedPrompt = (instruction: string, knowledgeLines: string[]): string => {
  return [
    'Student Memory Context (ONLY allowed knowledge source):',
    ...knowledgeLines.map((line, index) => `${index + 1}. ${line}`),
    '',
    'Current classroom task:',
    instruction,
    '',
    'Response rules:',
    '- Use only Student Memory Context.',
    '- If memory is not enough, explicitly say you do not remember enough yet.',
    '- Keep response concise for a classroom simulation.',
  ].join('\n');
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
    const explicitKnowledge = normalizeKnowledgeLines(input.allowedKnowledge);
    const fallbackKnowledge = buildFallbackKnowledgeFromRecentTurns(input.recentTurns, this.id);
    const knowledgePool = explicitKnowledge.length > 0 ? explicitKnowledge : fallbackKnowledge;
    const knowledgeWindow = getKnowledgeWindow(profile.state);
    const allowedKnowledge = knowledgePool.slice(-knowledgeWindow);

    if (allowedKnowledge.length === 0) {
      return {
        message: 'I do not remember enough from class notes yet. Can we quickly review this part?',
        metadata: {
          provider: 'memory_guard',
          persona: this.kind,
          memoryItemsUsed: 0,
        },
        statePatch: updateState(
          this.kind,
          profile.state,
          input.stateStimulusText ?? input.teacherOrUserMessage,
        ),
      };
    }

    const llmResult = await context.llm.generateChatCompletion({
      systemPrompt,
      userPrompt: buildMemoryConstrainedPrompt(input.teacherOrUserMessage, allowedKnowledge),
      temperature: 0.4,
      maxTokens: 180,
    });

    const message =
      limitToSentences(llmResult.text, 2) ||
      'I need one short clarification before I can answer this clearly.';
    context.emitToken(message.split(' ').slice(0, 6).join(' '));

    return {
      message,
      metadata: {
        model: llmResult.model,
        provider: llmResult.provider,
        persona: this.kind,
        memoryItemsUsed: allowedKnowledge.length,
      },
      statePatch: updateState(
        this.kind,
        profile.state,
        input.stateStimulusText ?? input.teacherOrUserMessage,
      ),
    };
  }
}
