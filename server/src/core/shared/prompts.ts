import type { AgentKind, AgentState, SessionMode } from '../@types';

export interface FractionsLessonStep {
  turn: number;
  title: string;
  deliveryGoal: string;
}

const MATHEMATICS_LESSON_PLAN: ReadonlyArray<FractionsLessonStep> = [
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

const HISTORY_LESSON_PLAN: ReadonlyArray<FractionsLessonStep> = [
  { turn: 1, title: 'Lesson kickoff and timeline orientation', deliveryGoal: 'Set period boundaries and check prior historical context.' },
  { turn: 2, title: 'Historical sources basics', deliveryGoal: 'Differentiate primary and secondary sources with examples.' },
  { turn: 3, title: 'Chronology and sequencing', deliveryGoal: 'Practice ordering key events on a timeline.' },
  { turn: 4, title: 'Cause and effect foundations', deliveryGoal: 'Identify direct causes and short-term effects in one event chain.' },
  { turn: 5, title: 'Long-term factors', deliveryGoal: 'Distinguish structural background factors from immediate triggers.' },
  { turn: 6, title: 'Key actors and motivations', deliveryGoal: 'Analyze major groups and their interests.' },
  { turn: 7, title: 'Geography and history link', deliveryGoal: 'Explain how location and resources shaped decisions.' },
  { turn: 8, title: 'Multiple perspectives', deliveryGoal: 'Compare how different groups experienced the same event.' },
  { turn: 9, title: 'Claim-evidence reasoning', deliveryGoal: 'Support one historical claim with relevant source evidence.' },
  { turn: 10, title: 'Reliability and bias check', deliveryGoal: 'Evaluate source reliability, audience, and possible bias.' },
  { turn: 11, title: 'Turning points', deliveryGoal: 'Identify and justify one key turning point in the topic.' },
  { turn: 12, title: 'Continuity and change', deliveryGoal: 'Describe what changed and what remained stable over time.' },
  { turn: 13, title: 'Short comparison task', deliveryGoal: 'Compare two events by causes, actors, and outcomes.' },
  { turn: 14, title: 'Historical vocabulary practice', deliveryGoal: 'Use period-specific terms accurately in short explanations.' },
  { turn: 15, title: 'Interpretation and argument', deliveryGoal: 'Form a concise interpretation and defend it with evidence.' },
  { turn: 16, title: 'Counterargument and rebuttal', deliveryGoal: 'Address an alternative interpretation with a rebuttal.' },
  { turn: 17, title: 'Common misconceptions and correction', deliveryGoal: 'Correct timeline confusion and oversimplified causation.' },
  { turn: 18, title: 'Application to new case', deliveryGoal: 'Transfer the same analysis framework to a different event.' },
  { turn: 19, title: 'Synthesis discussion', deliveryGoal: 'Connect causes, actors, and outcomes into one coherent narrative.' },
  { turn: 20, title: 'Lesson synthesis and mini assessment', deliveryGoal: 'Summarize key insights and run a quick exit-check.' },
];

const ENGLISH_LESSON_PLAN: ReadonlyArray<FractionsLessonStep> = [
  { turn: 1, title: 'Lesson kickoff and diagnostic warm-up', deliveryGoal: 'Assess prior vocabulary and sentence fluency quickly.' },
  { turn: 2, title: 'Core vocabulary introduction', deliveryGoal: 'Teach and model key words for the topic context.' },
  { turn: 3, title: 'Pronunciation and stress patterns', deliveryGoal: 'Practice clear pronunciation with short repetition drills.' },
  { turn: 4, title: 'Sentence frame basics', deliveryGoal: 'Use simple sentence starters for structured responses.' },
  { turn: 5, title: 'Reading for gist', deliveryGoal: 'Identify main idea and supporting details in a short text.' },
  { turn: 6, title: 'Reading for details', deliveryGoal: 'Locate specific information and evidence from the passage.' },
  { turn: 7, title: 'Grammar focus: present tense', deliveryGoal: 'Apply present simple/present continuous correctly in context.' },
  { turn: 8, title: 'Grammar focus: past tense', deliveryGoal: 'Use regular and irregular past forms in short narratives.' },
  { turn: 9, title: 'Question forms and answers', deliveryGoal: 'Form WH-questions and answer in complete sentences.' },
  { turn: 10, title: 'Listening micro-task', deliveryGoal: 'Extract key points from short teacher-read input.' },
  { turn: 11, title: 'Speaking in pairs', deliveryGoal: 'Use target vocabulary in guided pair dialogue.' },
  { turn: 12, title: 'Opinion language', deliveryGoal: 'Express agreement/disagreement with simple justification.' },
  { turn: 13, title: 'Paragraph structure', deliveryGoal: 'Build topic sentence, supporting idea, and closing line.' },
  { turn: 14, title: 'Writing draft', deliveryGoal: 'Write a short paragraph using taught structures.' },
  { turn: 15, title: 'Revision and editing', deliveryGoal: 'Improve clarity, grammar, and word choice with checklist.' },
  { turn: 16, title: 'Presentation practice', deliveryGoal: 'Deliver concise spoken summary with confidence.' },
  { turn: 17, title: 'Common mistakes and correction', deliveryGoal: 'Fix recurring tense, word order, and agreement errors.' },
  { turn: 18, title: 'Application task', deliveryGoal: 'Transfer language patterns to a new prompt.' },
  { turn: 19, title: 'Synthesis discussion', deliveryGoal: 'Integrate reading, speaking, and writing in one reflection.' },
  { turn: 20, title: 'Lesson synthesis and mini assessment', deliveryGoal: 'Check vocabulary, grammar, and communication targets quickly.' },
];

const GEOGRAPHY_LESSON_PLAN: ReadonlyArray<FractionsLessonStep> = [
  { turn: 1, title: 'Lesson kickoff and map orientation', deliveryGoal: 'Activate prior map-reading and location knowledge.' },
  { turn: 2, title: 'Latitude and longitude basics', deliveryGoal: 'Identify coordinates and global position accurately.' },
  { turn: 3, title: 'Physical vs human geography', deliveryGoal: 'Differentiate natural and human-made geographic features.' },
  { turn: 4, title: 'Topographic map symbols', deliveryGoal: 'Read contour lines, elevation, and map symbols correctly.' },
  { turn: 5, title: 'Climate zones overview', deliveryGoal: 'Classify major climate zones and their characteristics.' },
  { turn: 6, title: 'Weather vs climate', deliveryGoal: 'Separate short-term weather patterns from long-term climate.' },
  { turn: 7, title: 'Water cycle and landforms', deliveryGoal: 'Connect hydrologic processes to surface features.' },
  { turn: 8, title: 'Plate tectonics foundations', deliveryGoal: 'Explain earthquakes, volcanoes, and mountain building basics.' },
  { turn: 9, title: 'Population distribution', deliveryGoal: 'Interpret why people cluster in specific regions.' },
  { turn: 10, title: 'Resource and land use', deliveryGoal: 'Analyze how resources shape settlement and economy.' },
  { turn: 11, title: 'Urbanization patterns', deliveryGoal: 'Identify drivers and effects of city growth.' },
  { turn: 12, title: 'Migration and mobility', deliveryGoal: 'Describe push-pull factors in migration flows.' },
  { turn: 13, title: 'Regional case study', deliveryGoal: 'Apply concepts to one selected country or region.' },
  { turn: 14, title: 'Map interpretation task', deliveryGoal: 'Extract and justify claims from thematic maps.' },
  { turn: 15, title: 'Data comparison', deliveryGoal: 'Compare climate/population indicators between two places.' },
  { turn: 16, title: 'Human-environment interaction', deliveryGoal: 'Assess impacts of human activity on ecosystems.' },
  { turn: 17, title: 'Common misconceptions and correction', deliveryGoal: 'Correct errors in scale, distance, and climate assumptions.' },
  { turn: 18, title: 'Problem-solving scenario', deliveryGoal: 'Propose geographic solutions for a local challenge.' },
  { turn: 19, title: 'Synthesis discussion', deliveryGoal: 'Link physical and human systems in one coherent explanation.' },
  { turn: 20, title: 'Lesson synthesis and mini assessment', deliveryGoal: 'Check map, climate, and regional reasoning in short tasks.' },
];

const BIOLOGY_LESSON_PLAN: ReadonlyArray<FractionsLessonStep> = [
  { turn: 1, title: 'Lesson kickoff and prior knowledge check', deliveryGoal: 'Assess baseline understanding of living systems.' },
  { turn: 2, title: 'Characteristics of life', deliveryGoal: 'Identify key properties shared by living organisms.' },
  { turn: 3, title: 'Cell theory basics', deliveryGoal: 'Explain cells as fundamental units of life.' },
  { turn: 4, title: 'Cell structures and function', deliveryGoal: 'Match major organelles to their roles.' },
  { turn: 5, title: 'Photosynthesis overview', deliveryGoal: 'Describe inputs, outputs, and purpose of photosynthesis.' },
  { turn: 6, title: 'Cellular respiration overview', deliveryGoal: 'Connect energy release to organism function.' },
  { turn: 7, title: 'Levels of organization', deliveryGoal: 'Move from cells to tissues, organs, and systems.' },
  { turn: 8, title: 'Genetics vocabulary', deliveryGoal: 'Define gene, chromosome, trait, and inheritance basics.' },
  { turn: 9, title: 'Simple inheritance patterns', deliveryGoal: 'Use basic dominant/recessive examples correctly.' },
  { turn: 10, title: 'Ecosystems and energy flow', deliveryGoal: 'Trace food chains/webs and trophic roles.' },
  { turn: 11, title: 'Biotic and abiotic factors', deliveryGoal: 'Classify environmental influences on organisms.' },
  { turn: 12, title: 'Adaptation and survival', deliveryGoal: 'Explain how traits support survival in habitats.' },
  { turn: 13, title: 'Classification basics', deliveryGoal: 'Group organisms using shared characteristics.' },
  { turn: 14, title: 'Homeostasis concept', deliveryGoal: 'Describe internal balance and feedback examples.' },
  { turn: 15, title: 'Human body systems link', deliveryGoal: 'Relate organ systems to coordinated function.' },
  { turn: 16, title: 'Scientific investigation task', deliveryGoal: 'Interpret a simple biology experiment setup.' },
  { turn: 17, title: 'Common misconceptions and correction', deliveryGoal: 'Correct confusion around cells, genes, and adaptation.' },
  { turn: 18, title: 'Application scenario', deliveryGoal: 'Apply biology concepts to a real-life case.' },
  { turn: 19, title: 'Synthesis discussion', deliveryGoal: 'Integrate cell, organism, and ecosystem levels.' },
  { turn: 20, title: 'Lesson synthesis and mini assessment', deliveryGoal: 'Run a concise concept check across core biology topics.' },
];

const PHYSICS_LESSON_PLAN: ReadonlyArray<FractionsLessonStep> = [
  { turn: 1, title: 'Lesson kickoff and intuition check', deliveryGoal: 'Elicit prior ideas about motion and forces.' },
  { turn: 2, title: 'Measurement and units', deliveryGoal: 'Use SI units correctly in simple contexts.' },
  { turn: 3, title: 'Speed and velocity basics', deliveryGoal: 'Distinguish distance-time from displacement-time reasoning.' },
  { turn: 4, title: 'Acceleration concept', deliveryGoal: 'Interpret changing velocity with concrete examples.' },
  { turn: 5, title: 'Forces overview', deliveryGoal: 'Identify contact and non-contact forces in scenarios.' },
  { turn: 6, title: 'Newton first law', deliveryGoal: 'Explain inertia and balanced force situations.' },
  { turn: 7, title: 'Newton second law', deliveryGoal: 'Relate force, mass, and acceleration qualitatively and numerically.' },
  { turn: 8, title: 'Newton third law', deliveryGoal: 'Recognize action-reaction pairs in everyday cases.' },
  { turn: 9, title: 'Friction and drag', deliveryGoal: 'Analyze resistive forces and their effects on motion.' },
  { turn: 10, title: 'Work and energy basics', deliveryGoal: 'Connect force and displacement to work done.' },
  { turn: 11, title: 'Kinetic and potential energy', deliveryGoal: 'Compare energy forms during motion and height changes.' },
  { turn: 12, title: 'Energy conservation idea', deliveryGoal: 'Use conservation reasoning in closed systems.' },
  { turn: 13, title: 'Power concept', deliveryGoal: 'Interpret rate of energy transfer in examples.' },
  { turn: 14, title: 'Waves fundamentals', deliveryGoal: 'Describe amplitude, frequency, and wavelength roles.' },
  { turn: 15, title: 'Light and sound comparison', deliveryGoal: 'Contrast wave behaviors across media and speed.' },
  { turn: 16, title: 'Electricity basics', deliveryGoal: 'Model simple circuits with current and voltage ideas.' },
  { turn: 17, title: 'Common misconceptions and correction', deliveryGoal: 'Correct force-motion and energy misunderstandings.' },
  { turn: 18, title: 'Application problem set', deliveryGoal: 'Apply formulas and concepts to mixed problems.' },
  { turn: 19, title: 'Synthesis discussion', deliveryGoal: 'Link motion, force, and energy into one model.' },
  { turn: 20, title: 'Lesson synthesis and mini assessment', deliveryGoal: 'Check core mechanics and waves understanding quickly.' },
];

const CHEMISTRY_LESSON_PLAN: ReadonlyArray<FractionsLessonStep> = [
  { turn: 1, title: 'Lesson kickoff and prior knowledge check', deliveryGoal: 'Probe baseline ideas about matter and change.' },
  { turn: 2, title: 'States of matter', deliveryGoal: 'Differentiate solid, liquid, gas at particle level.' },
  { turn: 3, title: 'Physical vs chemical change', deliveryGoal: 'Classify changes with evidence-based criteria.' },
  { turn: 4, title: 'Atoms and elements basics', deliveryGoal: 'Introduce atomic structure and element identity.' },
  { turn: 5, title: 'Periodic table orientation', deliveryGoal: 'Read groups, periods, and key trends at basic level.' },
  { turn: 6, title: 'Compounds and formulas', deliveryGoal: 'Interpret simple chemical formulas and composition.' },
  { turn: 7, title: 'Mixtures and separation', deliveryGoal: 'Choose methods for separating common mixtures.' },
  { turn: 8, title: 'Chemical reactions overview', deliveryGoal: 'Recognize reactants, products, and reaction signs.' },
  { turn: 9, title: 'Conservation of mass', deliveryGoal: 'Apply mass conservation in closed reaction examples.' },
  { turn: 10, title: 'Balancing equation basics', deliveryGoal: 'Balance simple equations by atom counting.' },
  { turn: 11, title: 'Acids and bases intro', deliveryGoal: 'Use pH idea and everyday acid-base examples.' },
  { turn: 12, title: 'Neutralization concept', deliveryGoal: 'Relate acid-base reactions to salt and water outcomes.' },
  { turn: 13, title: 'Concentration basics', deliveryGoal: 'Interpret dilute vs concentrated solutions.' },
  { turn: 14, title: 'Energy in reactions', deliveryGoal: 'Distinguish exothermic and endothermic changes.' },
  { turn: 15, title: 'Reaction rate factors', deliveryGoal: 'Analyze temperature, surface area, and catalyst effects.' },
  { turn: 16, title: 'Laboratory safety and method', deliveryGoal: 'Apply safe procedure and observation recording.' },
  { turn: 17, title: 'Common misconceptions and correction', deliveryGoal: 'Correct particle model and balancing errors.' },
  { turn: 18, title: 'Application scenario', deliveryGoal: 'Use chemistry concepts in real-world material context.' },
  { turn: 19, title: 'Synthesis discussion', deliveryGoal: 'Integrate structure, reaction, and evidence in explanation.' },
  { turn: 20, title: 'Lesson synthesis and mini assessment', deliveryGoal: 'Quickly assess core chemistry concepts and process skills.' },
];

const COMPUTER_SCIENCE_LESSON_PLAN: ReadonlyArray<FractionsLessonStep> = [
  { turn: 1, title: 'Lesson kickoff and baseline check', deliveryGoal: 'Assess prior knowledge of algorithms and coding logic.' },
  { turn: 2, title: 'Problem decomposition', deliveryGoal: 'Break a task into smaller solvable steps.' },
  { turn: 3, title: 'Algorithms and pseudocode', deliveryGoal: 'Express step-by-step logic clearly before coding.' },
  { turn: 4, title: 'Sequence, selection, iteration', deliveryGoal: 'Use core control structures in simple tasks.' },
  { turn: 5, title: 'Variables and data types', deliveryGoal: 'Store and manipulate values with correct types.' },
  { turn: 6, title: 'Input and output handling', deliveryGoal: 'Build interactive prompts and readable output.' },
  { turn: 7, title: 'Conditionals in practice', deliveryGoal: 'Implement if/else decisions with clear test cases.' },
  { turn: 8, title: 'Loops in practice', deliveryGoal: 'Use bounded and conditional loops safely.' },
  { turn: 9, title: 'Functions and reuse', deliveryGoal: 'Define small reusable functions with parameters.' },
  { turn: 10, title: 'Debugging fundamentals', deliveryGoal: 'Find and fix syntax, runtime, and logic errors.' },
  { turn: 11, title: 'Testing and edge cases', deliveryGoal: 'Design quick tests including boundary inputs.' },
  { turn: 12, title: 'Data structures basics', deliveryGoal: 'Use lists/arrays and key-value structures appropriately.' },
  { turn: 13, title: 'String and list operations', deliveryGoal: 'Apply common transformations in small exercises.' },
  { turn: 14, title: 'Complexity intuition', deliveryGoal: 'Reason about faster/slower solutions informally.' },
  { turn: 15, title: 'Modular design', deliveryGoal: 'Organize code into clear components.' },
  { turn: 16, title: 'Mini project implementation', deliveryGoal: 'Develop a small complete solution from plan to code.' },
  { turn: 17, title: 'Common misconceptions and correction', deliveryGoal: 'Correct loop, condition, and variable-scope mistakes.' },
  { turn: 18, title: 'Refactor and readability', deliveryGoal: 'Improve naming, structure, and maintainability.' },
  { turn: 19, title: 'Synthesis discussion', deliveryGoal: 'Connect problem solving, coding, and testing workflow.' },
  { turn: 20, title: 'Lesson synthesis and mini assessment', deliveryGoal: 'Check algorithmic thinking and implementation accuracy.' },
];

const DEFAULT_LESSON_PLAN = MATHEMATICS_LESSON_PLAN;

const TOPIC_LESSON_PLAN_MAP: Record<string, ReadonlyArray<FractionsLessonStep>> = {
  mathematics: MATHEMATICS_LESSON_PLAN,
  english: ENGLISH_LESSON_PLAN,
  history: HISTORY_LESSON_PLAN,
  geography: GEOGRAPHY_LESSON_PLAN,
  biology: BIOLOGY_LESSON_PLAN,
  physics: PHYSICS_LESSON_PLAN,
  chemistry: CHEMISTRY_LESSON_PLAN,
  computer_science: COMPUTER_SCIENCE_LESSON_PLAN,
};

const normalizeTopic = (topic: string): string => {
  return topic
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const resolveLessonPlanTopicKey = (topic: string): keyof typeof TOPIC_LESSON_PLAN_MAP => {
  const normalized = normalizeTopic(topic);

  if (
    normalized.includes('mathematics') ||
    normalized.includes('math') ||
    normalized.includes('matematika') ||
    normalized.includes('matek')
  ) {
    return 'mathematics';
  }

  if (
    normalized.includes('english') ||
    normalized.includes('angol')
  ) {
    return 'english';
  }

  if (
    normalized.includes('history') ||
    normalized.includes('tortenelem') ||
    normalized.includes('histor')
  ) {
    return 'history';
  }

  if (
    normalized.includes('geography') ||
    normalized.includes('geograph') ||
    normalized.includes('foldrajz')
  ) {
    return 'geography';
  }

  if (
    normalized.includes('biology') ||
    normalized.includes('biologia') ||
    normalized === 'bio'
  ) {
    return 'biology';
  }

  if (
    normalized.includes('physics') ||
    normalized.includes('fizika')
  ) {
    return 'physics';
  }

  if (
    normalized.includes('chemistry') ||
    normalized.includes('kemia') ||
    normalized.includes('chem')
  ) {
    return 'chemistry';
  }

  if (
    normalized.includes('computer science') ||
    normalized.includes('computer') ||
    normalized.includes('informatics') ||
    normalized.includes('informatika') ||
    normalized.includes('programming')
  ) {
    return 'computer_science';
  }

  return 'mathematics';
};

export const getLessonPlanForTopic = (topic: string): ReadonlyArray<FractionsLessonStep> => {
  const key = resolveLessonPlanTopicKey(topic);
  return TOPIC_LESSON_PLAN_MAP[key] ?? DEFAULT_LESSON_PLAN;
};

export const getLessonPlanTotalTurns = (topic: string): number => {
  return getLessonPlanForTopic(topic).length;
};

export const getLessonStepForTopic = (
  topic: string,
  turnIndex: number,
): FractionsLessonStep => {
  const lessonPlan = getLessonPlanForTopic(topic);
  const boundedTurn = Math.min(Math.max(Math.floor(turnIndex), 1), lessonPlan.length);
  return lessonPlan[boundedTurn - 1] ?? lessonPlan[0]!;
};

export const FRACTIONS_LESSON_TOTAL_TURNS = MATHEMATICS_LESSON_PLAN.length;

export const getFractionsLessonStep = (turnIndex: number): FractionsLessonStep => {
  const boundedTurn = Math.min(Math.max(Math.floor(turnIndex), 1), MATHEMATICS_LESSON_PLAN.length);
  return MATHEMATICS_LESSON_PLAN[boundedTurn - 1] ?? MATHEMATICS_LESSON_PLAN[0]!;
};

export const buildStudentSystemPrompt = (
  kind: AgentKind,
  state: AgentState,
  topic: string,
  period = 1,
): string => {
  return [
    `You are a student agent in a classroom simulator.`,
    `Topic: ${topic}`,
    `Persona: ${kind}; profile=${state.profile}; attentiveness=${state.attentiveness}/10; behavior=${state.behavior}/10; comprehension=${state.comprehension}/10.`,
    `Respond as a student and keep it practical for teaching feedback.`,
    `Always react to directed graph input messages provided in the user input.`,
    `Use the from -> to channel messages addressed to you as the primary signal.`,
    `Use only the "Student Memory Context" block from user input as your knowledge source.`,
    `Do not use other students' knowledge, hidden context, or outside facts.`,
    `If memory is missing, explicitly say you do not remember enough yet.`,
    `When uncertain, ask one short clarifying question to the teacher.`,
    `Hard rule: respond in maximum 2 sentences.`,
    `Period: Impact on focus (1=Low, 2-5=Peak, 7=Exhausted). period=${period}.`,
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
    mode === 'classroom'
      ? `Primary curriculum: topic-based structured lesson flow selected from subject map. The active step is provided in user input.`
      : undefined,
    mode === 'classroom'
      ? `If the user input says Clarification Dialogue Mode is ACTIVE, answer the student's question first and postpone introducing new lesson content.`
      : undefined,
    `When graph context is provided, analyze interaction channels and relationship signals before deciding your adaptation.`,
    `Be concise, specific, and actionable.`,
    `Hard rule: respond in maximum 10 sentences.`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
};
