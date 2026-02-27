import type { AgentKind, AgentState, SessionMode } from '../@types';

export interface FractionsLessonStep {
  turn: number;
  title: string;
  deliveryGoal: string;
}

const FRACTIONS_LESSON_PLAN: ReadonlyArray<FractionsLessonStep> = [
  { turn: 1, title: 'Lesson kickoff and prior knowledge check', deliveryGoal: 'Introduce fractions as parts of a whole with quick diagnostics.' },
  { turn: 2, title: 'Numerator and denominator basics', deliveryGoal: 'Clarify denominator as equal parts and numerator as selected parts.' },
  { turn: 3, title: 'Fractions in visual models', deliveryGoal: 'Use area and set models to show equivalent partitioning.' },
  { turn: 4, title: 'Unit fractions', deliveryGoal: 'Reinforce 1/n meaning with concrete examples.' },
  { turn: 5, title: 'Building fractions from unit fractions', deliveryGoal: 'Represent a/b as repeated 1/b units.' },
  { turn: 6, title: 'Equivalent fractions concept', deliveryGoal: 'Show why multiplying numerator and denominator by same number preserves value.' },
  { turn: 7, title: 'Simplifying fractions', deliveryGoal: 'Practice reducing to simplest form using common factors.' },
  { turn: 8, title: 'Comparing fractions with same denominator', deliveryGoal: 'Use numerator comparison when denominator is fixed.' },
  { turn: 9, title: 'Comparing fractions with same numerator', deliveryGoal: 'Use denominator logic when numerator is fixed.' },
  { turn: 10, title: 'Common denominator strategy', deliveryGoal: 'Compare unlike fractions through common denominators.' },
  { turn: 11, title: 'Fractions on number line', deliveryGoal: 'Place and estimate fractions on number lines.' },
  { turn: 12, title: 'Improper fractions', deliveryGoal: 'Interpret numerator greater than denominator.' },
  { turn: 13, title: 'Mixed numbers conversion', deliveryGoal: 'Convert between improper fractions and mixed numbers.' },
  { turn: 14, title: 'Addition with like denominators', deliveryGoal: 'Add numerators and preserve denominator meaningfully.' },
  { turn: 15, title: 'Subtraction with like denominators', deliveryGoal: 'Subtract numerators in contextual examples.' },
  { turn: 16, title: 'Addition with unlike denominators', deliveryGoal: 'Apply common denominator before adding.' },
  { turn: 17, title: 'Subtraction with unlike denominators', deliveryGoal: 'Apply common denominator before subtracting.' },
  { turn: 18, title: 'Word problems and modeling', deliveryGoal: 'Translate real situations into fraction operations.' },
  { turn: 19, title: 'Common misconceptions and correction', deliveryGoal: 'Address errors such as adding denominators directly.' },
  { turn: 20, title: 'Lesson synthesis and mini assessment', deliveryGoal: 'Summarize core ideas and run a short exit-check.' },
];

export const FRACTIONS_LESSON_TOTAL_TURNS = FRACTIONS_LESSON_PLAN.length;

export const getFractionsLessonStep = (turnIndex: number): FractionsLessonStep => {
  const boundedTurn = Math.min(Math.max(Math.floor(turnIndex), 1), FRACTIONS_LESSON_PLAN.length);
  return FRACTIONS_LESSON_PLAN[boundedTurn - 1] ?? FRACTIONS_LESSON_PLAN[0]!;
};

export const buildStudentSystemPrompt = (
  kind: AgentKind,
  state: AgentState,
  topic: string,
): string => {
  return [
    `You are a student agent in a classroom simulator.`,
    `Topic: ${topic}`,
    `Persona kind: ${kind}`,
    `Attentiveness (0-10): ${state.attentiveness}`,
    `Behavior (0-10): ${state.behavior}`,
    `Comprehension (0-10): ${state.comprehension}`,
    `Profile: ${state.profile}`,
    `Respond as a student and keep it practical for teaching feedback.`,
    `Always react to directed graph input messages provided in the user input.`,
    `Use the from -> to channel messages addressed to you as the primary signal.`,
    `Do not follow FRACTIONS_LESSON_PLAN directly unless it appears in your directed input.`,
    `Use only the "Student Memory Context" block from user input as your knowledge source.`,
    `Do not use other students' knowledge, hidden context, or outside facts.`,
    `If memory is missing, explicitly say you do not remember enough yet.`,
    `Hard rule: respond in maximum 2 sentences.`,
  ].join('\n');
};

export const buildTeacherSystemPrompt = (topic: string, mode: SessionMode): string => {
  const modeInstruction =
    mode === 'classroom'
      ? 'Guide students with clarity, check understanding, and propose the next concrete teaching step.'
      : 'Act as a debate teacher: challenge weak claims, ask one probing question, and strengthen argument quality.';
  const fractionsPlan =
    mode === 'classroom'
      ? FRACTIONS_LESSON_PLAN.map(
          (step) => `${step.turn}. ${step.title}: ${step.deliveryGoal}`,
        ).join(' | ')
      : undefined;

  return [
    `You are a teacher agent for an education simulation platform.`,
    `Topic: ${topic}`,
    `Mode: ${mode}`,
    modeInstruction,
    mode === 'classroom'
      ? `Primary curriculum for this simulation: grade 5-6 fractions with a fixed 20-turn lesson plan.`
      : undefined,
    fractionsPlan ? `Lesson plan: ${fractionsPlan}` : undefined,
    `When graph context is provided, analyze interaction channels and relationship signals before deciding your adaptation.`,
    `Be concise, specific, and actionable.`,
    `Hard rule: respond in maximum 10 sentences.`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
};
