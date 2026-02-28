import type { AgentKind, AgentProfile, AgentState, Turn } from '../@types';
import { buildStudentSystemPrompt } from '../shared/prompts';
import { limitToSentences } from '../shared/text';
import type { Agent, AgentRunContext, AgentRunInput, AgentRunResult } from './Agent';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const round1 = (value: number): number => {
  return Math.round(value * 10) / 10;
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
    .map((line) => toCompactLine(line, 150))
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
        return `Teacher said: ${toCompactLine(turn.content, 110)}`;
      }

      return `I said earlier: ${toCompactLine(turn.content, 110)}`;
    });
};

const getKnowledgeWindow = (state: AgentState): number => {
  const memorySignal = clamp(
    state.comprehension * 0.5 + state.attentiveness * 0.35 + state.behavior * 0.15,
    0,
    10,
  );

  return Math.max(1, Math.round(1 + (memorySignal / 10) * 4));
};

const buildMemoryConstrainedPrompt = (instruction: string, knowledgeLines: string[]): string => {
  return [
    'Student Memory Context (allowed knowledge):',
    ...knowledgeLines.map((line, index) => `${index + 1}. ${line}`),
    '',
    'Task:',
    instruction,
    '',
    'Response rules:',
    '- Use only Student Memory Context and keep it concise.',
    '- If memory is not enough, ask one short clarification question.',
    '- If teacher guidance exists in memory, do not answer with "I do not remember".',
  ].join('\n');
};

const ensureTeacherQuestion = (message: string, kind: AgentKind): string => {
  if (/\?/.test(message)) {
    return message;
  }

  const question = kind === 'Autistic'
    ? 'Teacher, can you break this into short steps?'
    : 'Teacher, can you give one quick example for this?';

  return limitToSentences(`${message} ${question}`, 2);
};

const hasTeacherGuidanceInKnowledge = (knowledgeLines: string[]): boolean => {
  return knowledgeLines.some((line) => {
    const lowered = line.toLowerCase();
    return (
      lowered.includes('teacher') &&
      (lowered.includes('teacher_to_student') ||
        lowered.includes('teacher_broadcast') ||
        lowered.includes('teacher said'))
    );
  });
};

const getStateFloors = (kind: AgentKind): {
  attentiveness: number;
  behavior: number;
  comprehension: number;
} => {
  if (kind === 'ADHD') {
    return {
      attentiveness: 1.5,
      behavior: 1.5,
      comprehension: 1,
    };
  }

  if (kind === 'Autistic') {
    return {
      attentiveness: 2.5,
      behavior: 2,
      comprehension: 1.5,
    };
  }

  if (kind === 'Typical') {
    return {
      attentiveness: 2.5,
      behavior: 2,
      comprehension: 1.5,
    };
  }

  return {
    attentiveness: 2,
    behavior: 2,
    comprehension: 1,
  };
};

const updateState = (kind: AgentKind, state: AgentState, message: string): Partial<AgentState> => {
  const wordCount = countWords(message);
  const complexity = clamp(wordCount / 55, 0, 1);

  const interactiveCue = hasInteractiveCue(message);
  const exampleCue = hasExampleCue(message);
  const assessmentCue = hasAssessmentCue(message);
  const floors = getStateFloors(kind);

  let nextAttentiveness = clamp(
    state.attentiveness +
      (interactiveCue ? 0.8 : -0.2) +
      (exampleCue ? 0.2 : 0) -
      complexity * 0.6 -
      (assessmentCue ? 0.15 : 0),
    floors.attentiveness,
    10,
  );
  let nextBehavior = clamp(
    state.behavior +
      (interactiveCue ? 0.45 : -0.15) +
      (exampleCue ? 0.2 : 0) -
      (assessmentCue ? 0.2 : 0),
    floors.behavior,
    10,
  );
  let nextComprehension = clamp(
    state.comprehension +
      (exampleCue ? 1.1 : 0.45) +
      (interactiveCue ? 0.35 : 0) -
      complexity * 0.45,
    floors.comprehension,
    10,
  );

  if (state.attentiveness <= floors.attentiveness + 0.8) {
    nextAttentiveness = clamp(nextAttentiveness + 0.4, floors.attentiveness, 10);
  }

  if (kind === 'ADHD') {
    nextAttentiveness = clamp(nextAttentiveness - 0.3, floors.attentiveness, 10);
    nextBehavior = clamp(nextBehavior - 0.25, floors.behavior, 10);
  }

  if (kind === 'Autistic' && exampleCue) {
    nextComprehension = clamp(nextComprehension + 0.6, floors.comprehension, 10);
  }

  return {
    attentiveness: round1(nextAttentiveness),
    behavior: round1(nextBehavior),
    comprehension: round1(nextComprehension),
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
    const stimulusFallback = toCompactLine(
      input.stateStimulusText ?? input.teacherOrUserMessage,
      140,
    );
    const minimumDirectKnowledge = stimulusFallback
      ? [`Direct graph message fallback: ${stimulusFallback}`]
      : [];
    const knowledgePool =
      explicitKnowledge.length > 0
        ? explicitKnowledge
        : fallbackKnowledge.length > 0
          ? fallbackKnowledge
          : minimumDirectKnowledge;
    const knowledgeWindow = getKnowledgeWindow(profile.state);
    const allowedKnowledge = knowledgePool.slice(-knowledgeWindow);
    const hasTeacherGuidance = hasTeacherGuidanceInKnowledge(allowedKnowledge);

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

    const shouldAskTeacherFollowUp =
      allowedKnowledge.length <= 1 ||
      profile.state.comprehension < 6 ||
      profile.state.attentiveness < 5 ||
      profile.state.behavior < 5;
    let baseMessage =
      limitToSentences(llmResult.text, 2) ||
      'I need one short clarification before I can answer this clearly.';
    if (hasTeacherGuidance && /\bi do not remember\b/i.test(baseMessage)) {
      baseMessage =
        'I understand better now from your explanation, and I can try the first step.';
    }
    const message = shouldAskTeacherFollowUp
      ? ensureTeacherQuestion(baseMessage, this.kind)
      : baseMessage;
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
