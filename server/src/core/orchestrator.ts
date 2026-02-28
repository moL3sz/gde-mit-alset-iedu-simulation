import { randomUUID } from 'node:crypto';

import type {
  AgentKind,
  AgentProfile,
  AssignmentAuthority,
  ClassroomPhase,
  ClassroomKnowledgeCheck,
  CommunicationActivation,
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionResponse,
  InteractionType,
  PostTurnResponse,
  Session,
  SessionEvent,
  SessionEventType,
  SimulationChannel,
  StudentLiveAction,
  SubmitTaskAssignmentRequest,
  SubmitTaskAssignmentResponse,
  SubmitSupervisorHintResponse,
  TaskAssignment,
  TaskGroup,
  TaskWorkMode,
  SessionMode,
  Turn,
  TurnRole,
} from './@types';
import { StudentAgent } from './agents/studentAgent';
import { TeacherAgent } from './agents/teacherAgent';
import type { SessionMemory } from './memory/sessionMemory';
import { AppError } from './shared/errors/app-error';
import {
  FRACTIONS_LESSON_TOTAL_TURNS,
  getFractionsLessonStep,
  type FractionsLessonStep,
} from './shared/prompts';
import {
  activateCommunicationEdge,
  createSessionCommunicationGraph,
  resetCurrentTurnEdgeActivity,
} from './tools/communicationGraph';
import type { LlmTool } from './tools/llm';
import { scoreDebateRubric } from './tools/rubric';
import { applySafetyGuards } from './tools/safety';
import { logger } from './shared/logger';
import { AppDataSource } from '../database/data-source';
import { ClassRoom } from '../database/entities/ClassRoom';

const TEACHER_AGENT_ID = 'teacher';
const PRACTICE_PHASE_START_TURN = Math.ceil(FRACTIONS_LESSON_TOTAL_TURNS / 3) + 1;
const REVIEW_PHASE_START_TURN = Math.ceil((FRACTIONS_LESSON_TOTAL_TURNS * 2) / 3) + 1;
const STUDENT_TO_STUDENT_BOREDOM_THRESHOLD = 4.2;
const MIN_STUDENT_ACTION_DELAY_MS = 120;
const MAX_STUDENT_ACTION_DELAY_MS = 900;
const INATTENTIVE_ATTENTION_THRESHOLD = 4.5;
const INTERACTIVE_BOARD_ACTIVATE_RATIO = 0.45;
const INTERACTIVE_BOARD_DEACTIVATE_RATIO = 0.2;
const INTERACTIVE_BOARD_RECOVERY_AVERAGE_ATTENTION = 6.5;
const INTERACTIVE_BOARD_ACTIVATE_BOOST = 1.2;
const INTERACTIVE_BOARD_SUSTAIN_BOOST = 0.35;
const TEACHER_BEHAVIOR_RESPONSE_THRESHOLD = 3;
const MAX_DISTRACTION_STREAK = 6;
const BOREDOM_AVERAGE_TRIGGER = 4.9;
const BOREDOM_RISE_DELTA_TRIGGER = 0.22;
const BOREDOM_RISE_STREAK_TRIGGER = 2;
const ENGAGEMENT_JOKE_COOLDOWN_TURNS = 3;
const KNOWLEDGE_CHECK_INTERVAL_TURNS = 3;
const KNOWLEDGE_CHECK_EXPIRY_TURNS = 2;
const POST_PRAISE_EXTRA_DECAY_FACTOR = 0.22;
const POST_PRAISE_EXTRA_DISTRACTION = 0.06;
const SIMULATION_TARGET_SECONDS = 45 * 60;

const ON_TASK_ACTION_LIBRARY: ReadonlyArray<{
  code: StudentLiveAction['code'];
  label: string;
  severity: StudentLiveAction['severity'];
}> = [
  { code: 'listening', label: 'Paying attention', severity: 'success' },
  { code: 'note_taking', label: 'Taking notes', severity: 'success' },
  { code: 'task_focus', label: 'Working on the task', severity: 'info' },
  { code: 'peer_support', label: 'Helping a peer briefly', severity: 'info' },
];

const OFF_TASK_ACTION_LIBRARY: ReadonlyArray<{
  code: StudentLiveAction['code'];
  label: string;
  severity: StudentLiveAction['severity'];
}> = [
  { code: 'pen_clicking', label: 'Pen clicking', severity: 'warning' },
  { code: 'looking_out_window', label: 'Looking out the window', severity: 'warning' },
  { code: 'playing_with_object', label: 'Playing with an object', severity: 'warning' },
  { code: 'desk_doodling', label: 'Doodling on paper', severity: 'warning' },
  { code: 'side_talking', label: 'Side talking', severity: 'warning' },
];

const nowIso = (): string => new Date().toISOString();
const round1 = (value: number): number => Math.round(value * 10) / 10;
const countWords = (value: string): number => {
  return value.trim().split(/\s+/).filter(Boolean).length;
};
const topicStopwords = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'then',
  'into',
  'about',
  'your',
  'you',
  'are',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'their',
  'there',
  'have',
  'has',
  'had',
  'just',
  'very',
  'short',
  'step',
  'steps',
  'lesson',
  'focus',
  'goal',
  'current',
  'turn',
]);

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const clampInt = (value: number, min: number, max: number): number => {
  return clamp(Math.floor(value), min, max);
};

const estimateBoredness = (state: AgentProfile['state']): number => {
  return clamp(10 - (state.attentiveness * 0.6 + state.behavior * 0.4), 0, 10);
};

const estimateFatigue = (state: AgentProfile['state']): number => {
  return clamp(10 - (state.attentiveness * 0.7 + state.comprehension * 0.3), 0, 10);
};

const stableRoll = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }

  return hash / 0xffffffff;
};

const estimateSpeechSeconds = (
  text: string,
  speaker: 'teacher' | 'student',
): number => {
  const words = countWords(text);
  if (words <= 0) {
    return 2;
  }

  const wordsPerMinute = speaker === 'teacher' ? 130 : 115;
  const base = (words / wordsPerMinute) * 60;
  const sentenceCount = text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
  const pauseSeconds = Math.max(0, sentenceCount - 1) * 0.45;
  return clamp(Math.round(base + pauseSeconds), 2, 45);
};

const getStudentStateFloors = (kind: AgentKind): {
  attentiveness: number;
  behavior: number;
} => {
  if (kind === 'ADHD') {
    return {
      attentiveness: 1.5,
      behavior: 1.5,
    };
  }

  if (kind === 'Autistic' || kind === 'Typical') {
    return {
      attentiveness: 2.5,
      behavior: 2,
    };
  }

  return {
    attentiveness: 2,
    behavior: 2,
  };
};

const isStudentKind = (kind: AgentKind): boolean => {
  return (
    kind === 'ADHD' ||
    kind === 'Autistic' ||
    kind === 'Typical'
  );
};

export interface AgentTurnEmission {
  sessionId: string;
  mode: SessionMode;
  channel: SimulationChannel;
  topic: string;
  requestTurnId: string;
  emittedTurn: Turn;
}

export type AgentTurnEmissionHandler = (payload: AgentTurnEmission) => void;

type StudentInteractionAction = 'student_to_teacher' | 'student_to_student' | 'silent';

interface StudentInteractionPlan {
  studentId: string;
  action: StudentInteractionAction;
  peerTargetId?: string;
  delayMs: number;
  boredness: number;
  fatigue: number;
}

interface StudentQuestionSignal {
  studentId: string;
  studentName: string;
  question: string;
  turnId: string;
  askedAt: string;
}

interface StudentLiveActionSignal {
  studentId: string;
  studentName: string;
  liveAction: StudentLiveAction;
  distractionScore: number;
  distractionProbability: number;
  distractionStreak: number;
  needsTeacherIntervention: boolean;
}

interface InteractiveBoardDecision {
  nextActive: boolean;
  changed: boolean;
  reason: 'low_attention_detected' | 'attention_recovered' | 'stable';
  inattentiveCount: number;
  totalStudents: number;
  inattentiveRatio: number;
  averageAttentiveness: number;
}

interface BoredomJokeDecision {
  runtime: NonNullable<Session['classroomRuntime']>;
  shouldInjectJoke: boolean;
  averageBoredness: number;
  borednessDelta: number;
  boredomRiseStreak: number;
}

export class Orchestrator {
  public constructor(
    private readonly memory: SessionMemory,
    private readonly llmTool: LlmTool,
  ) {}

  public async createSession(input: CreateSessionRequest): Promise<CreateSessionResponse> {
    const mode = input.mode;
    const channel: SimulationChannel = input.channel ?? 'unsupervised';
    const classroomId = input.classroomId;

    if (!classroomId) {
      throw new AppError(400, 'ClassroomId is required.');
    }
    const agents = await this.buildDefaultAgents(mode, classroomId);

    if (!input.topic.trim()) {
      throw new AppError(400, 'Topic is required.');
    }

    const communicationGraph = createSessionCommunicationGraph(mode, agents, input.config);

    const session = this.memory.createSession({
      mode,
      channel,
      topic: input.topic.trim(),
      config: input.config,
      agents,
      communicationGraph,
    });

    const event = this.createEvent(session.id, 'session_created', {
      mode: session.mode,
      channel: session.channel,
      topic: session.topic,
      agents: session.agents.map((agent) => ({ id: agent.id, kind: agent.kind })),
    });

    this.memory.appendEvents(session.id, [event]);

    return {
      sessionId: session.id,
      mode: session.mode,
      channel: session.channel,
    };
  }

  public getSessionSummary(sessionId: string): GetSessionResponse {
    const session = this.memory.getSession(sessionId);

    if (!session) {
      throw new AppError(404, `Session ${sessionId} not found.`);
    }

    return {
      sessionId: session.id,
      mode: session.mode,
      channel: session.channel,
      topic: session.topic,
      agents: session.agents,
      lastTurns: session.turns.slice(-8),
      metrics: session.metrics,
      communicationGraph: session.communicationGraph,
      classroomRuntime: session.classroomRuntime,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  public async processTurn(
    sessionId: string,
    teacherOrUserMessage: string,
    onAgentTurnEmission?: AgentTurnEmissionHandler,
  ): Promise<PostTurnResponse> {
    const session = this.memory.getSession(sessionId);

    if (!session) {
      throw new AppError(404, `Session ${sessionId} not found.`);
    }

    const trimmedMessage = teacherOrUserMessage.trim();

    if (!trimmedMessage) {
      throw new AppError(400, 'teacherOrUserMessage cannot be empty.');
    }

    resetCurrentTurnEdgeActivity(session.communicationGraph);

    const safety = applySafetyGuards(trimmedMessage);
    const requestTurn = this.createTurn(
      session.id,
      session.mode === 'classroom' ? 'teacher' : 'user',
      safety.cleanedText,
    );

    const turnEvents: SessionEvent[] = [
      this.createEvent(session.id, 'turn_received', {
        requestTurnId: requestTurn.id,
        mode: session.mode,
        channel: session.channel,
      }),
    ];

    this.memory.appendTurn(session.id, requestTurn);

    if (safety.flags.length > 0) {
      turnEvents.push(
        this.createEvent(session.id, 'safety_notice', {
          requestTurnId: requestTurn.id,
          flags: safety.flags,
        }),
      );
    }

    if (safety.blocked) {
      const blockedTurn = this.createTurn(
        session.id,
        'system',
        safety.reason ?? 'Request blocked by safety policy.',
      );
      this.memory.appendTurn(session.id, blockedTurn);
      this.memory.appendEvents(session.id, turnEvents);

      const blockedSession = this.mustGetSession(session.id);

      return {
        turnId: requestTurn.id,
        transcript: blockedSession.turns.slice(-12),
        events: turnEvents,
        metrics: blockedSession.metrics,
        communicationGraph: blockedSession.communicationGraph,
      };
    }

    if (session.mode === 'classroom') {
      await this.processClassroomTurn(session.id, requestTurn, turnEvents, onAgentTurnEmission);
    } else {
      await this.processDebateTurn(session.id, requestTurn, turnEvents, onAgentTurnEmission);
    }

    this.memory.appendEvents(session.id, turnEvents);
    const updatedSession = this.mustGetSession(session.id);

    return {
      turnId: requestTurn.id,
      transcript: updatedSession.turns.slice(-12),
      events: turnEvents,
      metrics: updatedSession.metrics,
      communicationGraph: updatedSession.communicationGraph,
    };
  }

  public submitSupervisorHint(sessionId: string, hintText: string): SubmitSupervisorHintResponse {
    const session = this.mustGetSession(sessionId);
    const cleanedHint = hintText.trim();

    if (!cleanedHint) {
      throw new AppError(400, 'hintText cannot be empty.');
    }

    if (session.channel !== 'supervised') {
      throw new AppError(400, 'Supervisor hint is only supported in supervised sessions.');
    }

    if (session.mode !== 'classroom') {
      throw new AppError(400, 'Supervisor hint is only supported in classroom mode.');
    }

    this.memory.pushSupervisorHint(sessionId, cleanedHint);

    const event = this.createEvent(sessionId, 'supervisor_hint_received', {
      hintText: cleanedHint,
    });
    this.memory.appendEvents(sessionId, [event]);

    return {
      sessionId,
      channel: session.channel,
      hintText: cleanedHint,
      createdAt: event.createdAt,
      eventId: event.id,
    };
  }

  public submitTaskAssignment(
    sessionId: string,
    input: SubmitTaskAssignmentRequest,
  ): SubmitTaskAssignmentResponse {
    const session = this.mustGetSession(sessionId);
    if (session.mode !== 'classroom') {
      throw new AppError(400, 'Task assignment is only supported in classroom mode.');
    }

    const runtime = session.classroomRuntime;
    if (!runtime) {
      throw new AppError(500, 'Classroom runtime is missing for task assignment.');
    }

    const students = session.agents.filter((agent) => isStudentKind(agent.kind));
    if (students.length === 0) {
      throw new AppError(500, 'No student agents available for task assignment.');
    }

    const mode = input.mode;
    const shouldAutonomousGroup = Boolean(input.autonomousGrouping) || session.channel === 'unsupervised';
    const groups = shouldAutonomousGroup
      ? this.buildAutonomousTaskGroups(mode, students.map((student) => student.id))
      : this.normalizeUserTaskGroups(mode, input.groups, students.map((student) => student.id));
    const assignedBy: AssignmentAuthority = shouldAutonomousGroup
      ? 'teacher_agent'
      : 'supervisor_user';
    const assignment: TaskAssignment = {
      mode,
      groups,
      assignedBy,
      assignedAt: nowIso(),
      lessonTurn: runtime.lessonTurn,
    };

    const updatedSession = this.memory.updateClassroomRuntime(sessionId, (current) => {
      const base = current ?? {
        lessonTurn: runtime.lessonTurn,
        phase: 'practice',
        paused: false,
        completed: false,
        completedAt: undefined,
        completionReason: undefined,
        pendingTaskAssignment: false,
        interactiveBoardActive: false,
        simulatedElapsedSeconds: 0,
        simulatedTotalSeconds: SIMULATION_TARGET_SECONDS,
        pendingDistractionCounts: {},
        previousAverageBoredness: undefined,
        boredomRiseStreak: 0,
        lastEngagementJokeTurn: undefined,
        activeKnowledgeCheck: undefined,
      };

      return {
        ...base,
        lessonTurn: runtime.lessonTurn,
        phase: 'practice',
        paused: false,
        pendingTaskAssignment: false,
        activeTaskAssignment: assignment,
      };
    });

    const event = this.createEvent(sessionId, 'task_assignment_submitted', {
      mode,
      groups,
      assignedBy,
      lessonTurn: runtime.lessonTurn,
    });
    this.memory.appendEvents(sessionId, [event]);

    return {
      sessionId,
      channel: session.channel,
      mode,
      groups,
      assignedBy,
      createdAt: event.createdAt,
      eventId: event.id,
      classroomRuntime: updatedSession.classroomRuntime,
    };
  }

  private async processClassroomTurn(
    sessionId: string,
    requestTurn: Turn,
    eventCollector: SessionEvent[],
    onAgentTurnEmission?: AgentTurnEmissionHandler,
  ): Promise<void> {
    const session = this.mustGetSession(sessionId);
    const teacherProfile = session.agents.find((agent) => agent.kind === 'Teacher');
    const studentProfiles = session.agents.filter((agent) => isStudentKind(agent.kind));

    if (!teacherProfile) {
      throw new AppError(500, 'No teacher agent configured for classroom mode.');
    }

    if (studentProfiles.length === 0) {
      throw new AppError(500, 'No student agents configured for classroom mode.');
    }

    const classroomConfig = session.config.classroom ?? {};
    const minResponders = clampInt(classroomConfig.minResponders ?? 2, 1, studentProfiles.length);
    const maxResponders = clampInt(
      classroomConfig.maxResponders ?? 4,
      minResponders,
      studentProfiles.length,
    );
    const span = maxResponders - minResponders + 1;
    const responderCount = minResponders + ((session.turns.length + session.events.length) % span);

    const startIndex = (session.turns.length + eventCollector.length) % studentProfiles.length;
    const orderedStudents = [
      ...studentProfiles.slice(startIndex),
      ...studentProfiles.slice(0, startIndex),
    ];
    let selectedStudents = orderedStudents.slice(0, responderCount);
    let runtime = this.ensureClassroomRuntime(sessionId, 1, 'lecture');
    const lessonTurn = this.resolveLessonTurnFromRuntime(runtime);
    const phase = this.resolveClassroomPhaseFromRuntime(runtime);
    runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase);
    if (!runtime.completed && this.isSimulationTimeCompleted(runtime)) {
      runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
        completed: true,
        completedAt: nowIso(),
        completionReason: 'simulation_time_completed',
        paused: true,
      });
    }

    if (runtime.completed) {
      this.rollbackRequestTurnForPause(sessionId, requestTurn.id);
      eventCollector.push(
        this.createEvent(
          sessionId,
          'session_completed',
          {
            lessonTurn: runtime.lessonTurn,
            completedAt: runtime.completedAt ?? nowIso(),
            reason: runtime.completionReason ?? 'simulation_time_completed',
          },
          requestTurn.id,
          teacherProfile.id,
        ),
      );
      return;
    }
    let cycleSpeechSeconds = 0;
    let cycleInteractionSeconds = 1.5;
    let activeClarification = runtime.activeClarification;
    const supervisorHint =
      session.channel === 'supervised' ? this.memory.consumeSupervisorHint(sessionId) : undefined;
    this.applyNaturalPerTurnStateDecay(
      sessionId,
      requestTurn.id,
      lessonTurn,
      phase,
      studentProfiles,
      runtime.interactiveBoardActive,
    );

    const latestQuestion = this.extractLatestStudentQuestion(session);
    if (
      latestQuestion &&
      latestQuestion.turnId !== activeClarification?.askedTurnId &&
      latestQuestion.turnId !== runtime.lastClarifiedQuestionTurnId
    ) {
      const askingStudent = studentProfiles.find(
        (candidate) => candidate.id === latestQuestion.studentId,
      );
      const requiredResponseCount =
        askingStudent && askingStudent.state.comprehension < 5 ? 2 : 1;

      activeClarification = {
        studentId: latestQuestion.studentId,
        studentName: latestQuestion.studentName,
        question: latestQuestion.question,
        askedTurnId: latestQuestion.turnId,
        askedAt: latestQuestion.askedAt,
        teacherResponseCount: 0,
        requiredResponseCount,
      };

      runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
        activeClarification,
      });
    }

    const clarificationTargetProfile = activeClarification
      ? studentProfiles.find((candidate) => candidate.id === activeClarification?.studentId)
      : undefined;

    if (activeClarification && !clarificationTargetProfile) {
      activeClarification = undefined;
      runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
        activeClarification: undefined,
      });
    }

    if (activeClarification && clarificationTargetProfile) {
      selectedStudents = [clarificationTargetProfile];
    }

    if (supervisorHint) {
      eventCollector.push(
        this.createEvent(
          sessionId,
          'supervisor_hint_applied',
          {
            requestTurnId: requestTurn.id,
            hintText: supervisorHint,
          },
          requestTurn.id,
          teacherProfile.id,
        ),
      );
    }

    if (phase === 'practice' && !runtime.activeTaskAssignment) {
      if (session.channel === 'supervised') {
        runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
          paused: true,
          pendingTaskAssignment: true,
          activeTaskAssignment: undefined,
        });

        eventCollector.push(
          this.createEvent(
            sessionId,
            'task_assignment_required',
            {
              lessonTurn,
              phase,
              modeOptions: ['individual', 'pair', 'group'],
            },
            requestTurn.id,
            teacherProfile.id,
          ),
        );
        this.rollbackRequestTurnForPause(sessionId, requestTurn.id);
        return;
      }

      const autonomousMode = this.pickAutonomousTaskMode(lessonTurn);
      const autonomousGroups = this.buildAutonomousTaskGroups(
        autonomousMode,
        studentProfiles.map((student) => student.id),
      );
      const autonomousAssignment: TaskAssignment = {
        mode: autonomousMode,
        groups: autonomousGroups,
        assignedBy: 'teacher_agent',
        assignedAt: nowIso(),
        lessonTurn,
      };
      runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
        paused: false,
        pendingTaskAssignment: false,
        activeTaskAssignment: autonomousAssignment,
      });

      eventCollector.push(
        this.createEvent(
          sessionId,
          'task_assignment_submitted',
          {
            lessonTurn,
            phase,
            mode: autonomousMode,
            groups: autonomousGroups,
            assignedBy: 'teacher_agent',
            autonomous: true,
          },
          requestTurn.id,
          teacherProfile.id,
        ),
      );
    }

    const interactiveBoardDecision = this.resolveInteractiveBoardMode(
      studentProfiles,
      runtime.interactiveBoardActive,
    );
    const interactiveBoardActive = interactiveBoardDecision.nextActive;

    if (interactiveBoardDecision.changed) {
      runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
        interactiveBoardActive,
      });

      eventCollector.push(
        this.createEvent(
          sessionId,
          'interactive_board_mode_changed',
          {
            interactiveBoardActive,
            reason: interactiveBoardDecision.reason,
            inattentiveCount: interactiveBoardDecision.inattentiveCount,
            totalStudents: interactiveBoardDecision.totalStudents,
            inattentiveRatio: Number(interactiveBoardDecision.inattentiveRatio.toFixed(4)),
            averageAttentiveness: Number(
              interactiveBoardDecision.averageAttentiveness.toFixed(4),
            ),
          },
          requestTurn.id,
          teacherProfile.id,
        ),
      );
    }

    if (interactiveBoardActive) {
      this.applyInteractiveBoardAttentionBoost(
        sessionId,
        studentProfiles.map((student) => student.id),
        interactiveBoardDecision.changed,
      );
    }

    const liveActionResolution = this.resolveStudentLiveActions(
      sessionId,
      requestTurn.id,
      studentProfiles,
      runtime,
      lessonTurn,
      phase,
      interactiveBoardActive,
    );
    runtime = liveActionResolution.runtime;
    const liveActionSignals = liveActionResolution.signals;
    const behaviorAlertSignals = liveActionSignals.filter(
      (signal) => signal.needsTeacherIntervention,
    );
    const behaviorAlertStudentIds = behaviorAlertSignals.map((signal) => signal.studentId);
    const behaviorAlertLines = behaviorAlertSignals.map(
      (signal) =>
        `${signal.studentName}: repeated off-task action (${signal.liveAction.label}), streak threshold reached.`,
    );
    const boredomJokeDecision = this.resolveBoredomJokeDecision(
      sessionId,
      lessonTurn,
      phase,
      runtime,
      studentProfiles,
    );
    runtime = boredomJokeDecision.runtime;

    if (!activeClarification) {
      for (const student of studentProfiles) {
        this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
          from: TEACHER_AGENT_ID,
          to: student.id,
          interactionType: 'teacher_broadcast',
          payload: {
            actionType: 'teacher_broadcast',
            text: requestTurn.content,
            scope: 'classroom',
          },
        });
      }

      for (const student of selectedStudents) {
        this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
          from: TEACHER_AGENT_ID,
          to: student.id,
          interactionType: 'teacher_to_student',
          payload: {
            actionType: 'teacher_to_student',
            text: requestTurn.content,
          },
        });
      }
    } else if (clarificationTargetProfile) {
      this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
        from: TEACHER_AGENT_ID,
        to: clarificationTargetProfile.id,
        interactionType: 'teacher_to_student',
        payload: {
          actionType: 'teacher_to_student',
          phase: 'clarification_kickoff',
          text: `We are clarifying your question now: ${activeClarification.question}`,
        },
      });
    }

    const teacherMode:
      | 'clarification_dialogue'
      | 'lesson_delivery'
      | 'behavior_intervention'
      | 'engagement_joke'
      | 'lesson_closure' =
      activeClarification
        ? 'clarification_dialogue'
        : behaviorAlertLines.length > 0
          ? 'behavior_intervention'
          : this.isNearSimulationEnd(runtime)
            ? 'lesson_closure'
          : boredomJokeDecision.shouldInjectJoke
            ? 'engagement_joke'
            : 'lesson_delivery';
    const activeKnowledgeCheck = runtime.activeKnowledgeCheck;
    const shouldPromptKnowledgeCheck =
      !activeClarification &&
      !activeKnowledgeCheck &&
      behaviorAlertLines.length === 0 &&
      lessonTurn % KNOWLEDGE_CHECK_INTERVAL_TURNS === 0;
    const lessonStepTurn = activeClarification ? Math.max(lessonTurn - 1, 1) : lessonTurn;
    const lessonStep = getFractionsLessonStep(lessonStepTurn);
    const graphContext = this.buildTeacherGraphContext(session, selectedStudents);
    const assignmentContext = runtime.activeTaskAssignment
      ? this.describeTaskAssignment(runtime.activeTaskAssignment)
      : 'No active task assignment.';
    const studentStateSnapshot = selectedStudents.map((student) => {
      return `${student.name} => attentiveness=${student.state.attentiveness}, behavior=${student.state.behavior}, comprehension=${student.state.comprehension}, profile=${student.state.profile}`;
    });
    const recentStudentSignals = session.turns
      .filter(
        (turn) =>
          turn.role === 'agent' &&
          Boolean(turn.agentId) &&
          selectedStudents.some((student) => student.id === turn.agentId),
      )
      .slice(-Math.max(2, selectedStudents.length))
      .map((turn) => {
        const student = selectedStudents.find((candidate) => candidate.id === turn.agentId);
        return `${student?.name ?? turn.agentId}: ${turn.content}`;
      });
    const liveActionSnapshot = liveActionSignals
      .slice(0, 10)
      .map(
        (signal) =>
          `${signal.studentName}: ${signal.liveAction.label} [${signal.liveAction.kind}] p=${signal.distractionProbability.toFixed(2)} streak=${signal.distractionStreak}`,
      );
    const teacherInput = [
      `You are in parallel real-time classroom loop mode.`,
      `Lesson turn: ${lessonStep.turn}/${FRACTIONS_LESSON_TOTAL_TURNS}`,
      `Teacher response mode: ${teacherMode}`,
      `Classroom phase: ${phase}`,
      `Current lesson focus: ${lessonStep.title}`,
      `Delivery goal for this turn: ${lessonStep.deliveryGoal}`,
      `Task assignment context: ${assignmentContext}`,
      `Interactive board mode: ${interactiveBoardActive ? 'ON' : 'OFF'}`,
      `Incoming instruction to adapt: ${requestTurn.content}`,
      `Recent student signals from prior cycles:`,
      ...recentStudentSignals,
      session.channel === 'unsupervised'
        ? `Autonomous adaptation signals from student states:`
        : undefined,
      ...(session.channel === 'unsupervised' ? studentStateSnapshot : []),
      `Live student activity signals this cycle:`,
      ...liveActionSnapshot,
      `Boredness trend: average=${boredomJokeDecision.averageBoredness.toFixed(2)}, delta=${boredomJokeDecision.borednessDelta.toFixed(2)}, riseStreak=${boredomJokeDecision.boredomRiseStreak}.`,
      behaviorAlertLines.length > 0 ? `Behavior alert signals:` : undefined,
      ...behaviorAlertLines,
      behaviorAlertLines.length > 0
        ? `Rule: first redirect the highlighted students in one short classroom-management move, then continue the lesson.`
        : undefined,
      boredomJokeDecision.shouldInjectJoke
        ? `Engagement rule: boredom is rising. Add exactly one short, classroom-safe joke related to the topic, then continue the lesson step.`
        : undefined,
      activeKnowledgeCheck
        ? `Pending knowledge check from turn ${activeKnowledgeCheck.lessonTurn}: "${activeKnowledgeCheck.questionText}". Acknowledge correct student answers before moving on.`
        : undefined,
      shouldPromptKnowledgeCheck
        ? `Knowledge-check rule: ask one short topic-related check question to students this turn.`
        : undefined,
      `Graph relationship signals:`,
      ...graphContext.relationshipSignals,
      `Current active channels this cycle:`,
      ...graphContext.activeChannelSignals,
      activeClarification
        ? `Clarification Dialogue Mode is ACTIVE.`
        : undefined,
      activeClarification
        ? `Student to help first: ${activeClarification.studentName} (${activeClarification.studentId}).`
        : undefined,
      activeClarification
        ? `Student question to answer now: ${activeClarification.question}`
        : undefined,
      activeClarification
        ? `Rule: answer this question first with short steps and one quick check question. Do not introduce the next new lesson concept yet.`
        : undefined,
      teacherMode === 'lesson_closure'
        ? `Closure rule: finalize the lesson now with a concise wrap-up, key takeaways, and one short positive ending line.`
        : undefined,
      supervisorHint ? `Supervisor hint: ${supervisorHint}` : undefined,
      activeClarification
        ? `Output exactly one clarification response for the asking student now.`
        : teacherMode === 'lesson_closure'
          ? `Output exactly one lesson-closing teacher message now.`
          : `Output exactly one teacher micro-step for the class now, aligned to this lesson turn.`,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');
    const studentInputById = new Map<
      string,
      { prompt: string; memoryLines: string[]; allowedKnowledge: string[]; stimulusText: string }
    >();

    for (const profile of selectedStudents) {
      const memoryLines = this.buildStudentMemoryLines(
        session,
        profile,
        assignmentContext,
      );
      const prompt = this.buildStudentClassroomInput(
        profile,
        assignmentContext,
        memoryLines,
      );
      const stimulusText = this.buildStudentStimulusFromGraph(session, profile.id);
      const allowedKnowledge = this.buildAllowedKnowledgeFromGraphMemory(
        profile,
        memoryLines,
        stimulusText,
        activeClarification ? activeClarification.question : requestTurn.content,
      );

      studentInputById.set(profile.id, { prompt, memoryLines, allowedKnowledge, stimulusText });
    }

    const teacherAgent = new TeacherAgent(teacherProfile);
    let teacherResponseTargetIds: string[] = [];
    let passiveListenerTargetIds: string[] = [];
    let teacherProducedResponse = false;
    let knowledgeCheckAskedTurnId: string | undefined;
    const interactionPlans = this.buildStudentInteractionPlans(
      session,
      requestTurn.id,
      selectedStudents,
      studentProfiles,
    );

    eventCollector.push(
      this.createEvent(
        sessionId,
        'agent_started',
        {
          requestTurnId: requestTurn.id,
          executionMode: 'parallel_realtime_loop',
          lessonTurn: lessonStep.turn,
        },
        requestTurn.id,
        teacherProfile.id,
      ),
    );

    const teacherRun = async (): Promise<void> => {
      const teacherResult = await teacherAgent.run(
        {
          teacherOrUserMessage: teacherInput,
          session: this.mustGetSession(sessionId),
          recentTurns: this.mustGetSession(sessionId).turns.slice(-12),
        },
        {
          llm: this.llmTool,
          topic: session.topic,
          emitToken: (token) => {
            eventCollector.push(
              this.createEvent(
                sessionId,
                'agent_token',
                { token, executionMode: 'parallel_realtime_loop' },
                requestTurn.id,
                teacherProfile.id,
              ),
            );
          },
        },
      );
      const teacherMessage =
        teacherMode === 'lesson_closure'
          ? this.ensureLessonClosureMessage(teacherResult.message)
          : teacherResult.message;
      const teacherSpeechSeconds = estimateSpeechSeconds(teacherMessage, 'teacher');
      cycleSpeechSeconds += teacherSpeechSeconds;
      cycleInteractionSeconds += 0.9;

      const teacherTurn = this.createTurn(
        sessionId,
        'teacher',
        teacherMessage,
        teacherProfile.id,
        {
          kind: teacherProfile.kind,
          lessonTurn: lessonStep.turn,
          lessonFocus: lessonStep.title,
          teacherMode,
          speechSeconds: teacherSpeechSeconds,
          requestTurnId: requestTurn.id,
          clarificationTargetId: activeClarification?.studentId,
          clarificationAskedTurnId: activeClarification?.askedTurnId,
          ...(teacherResult.metadata ?? {}),
        },
      );
      this.memory.appendTurn(sessionId, teacherTurn);
      this.emitAgentTurnEmission(
        session,
        requestTurn.id,
        teacherTurn,
        onAgentTurnEmission,
      );

      const teacherFollowUpTargets =
        activeClarification && clarificationTargetProfile
          ? [clarificationTargetProfile]
          : Array.from(
              new Map(
                [...selectedStudents, ...studentProfiles.filter((student) =>
                  behaviorAlertStudentIds.includes(student.id),
                )].map((student) => [student.id, student]),
              ).values(),
            );

      const createdKnowledgeCheck =
        !activeClarification && !runtime.activeKnowledgeCheck
          ? this.tryCreateKnowledgeCheck({
              teacherTurn,
              teacherMessage: teacherMessage,
              lessonTurn,
              lessonStep,
              topic: session.topic,
              targetStudentIds: teacherFollowUpTargets.map((student) => student.id),
            })
          : undefined;
      if (createdKnowledgeCheck) {
        runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
          activeKnowledgeCheck: createdKnowledgeCheck,
        });
        knowledgeCheckAskedTurnId = createdKnowledgeCheck.askedTurnId;
      }

      teacherResponseTargetIds = teacherFollowUpTargets.map((student) => student.id);
      teacherProducedResponse = teacherMessage.trim().length > 0;
      for (const student of teacherFollowUpTargets) {
        this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
          from: TEACHER_AGENT_ID,
          to: student.id,
          interactionType: 'teacher_to_student',
          payload: {
            actionType: createdKnowledgeCheck ? 'teacher_question' : 'teacher_to_student',
            text: teacherMessage,
            phase: createdKnowledgeCheck
              ? 'knowledge_check'
              : activeClarification
                ? 'clarification_follow_up'
                : 'follow_up',
            lessonTurn: lessonStep.turn,
            clarificationTargetId: activeClarification?.studentId,
          },
        });
      }

      if (activeClarification && teacherMessage.trim().length > 0) {
        const passiveListeners = studentProfiles.filter(
          (student) => student.id !== activeClarification?.studentId,
        );
        passiveListenerTargetIds = passiveListeners.map((student) => student.id);
        const overhearText = this.summarizeTeacherResponseForOverhear(teacherMessage);

        for (const listener of passiveListeners) {
          this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
            from: TEACHER_AGENT_ID,
            to: listener.id,
            interactionType: 'teacher_broadcast',
            payload: {
              actionType: 'teacher_broadcast',
              phase: 'clarification_overhear',
              confidence: 'low',
              sourceStudentId: activeClarification.studentId,
              text: overhearText,
            },
          });
        }
      } else {
        passiveListenerTargetIds = [];
      }

      let clarificationResolved: boolean | undefined;
      if (activeClarification) {
        const nextResponseCount = activeClarification.teacherResponseCount + 1;
        const responseSeemsSufficient = this.isClarificationExplanationSufficient(
          teacherMessage,
        );
        clarificationResolved =
          responseSeemsSufficient &&
          nextResponseCount >= activeClarification.requiredResponseCount;

        runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
          activeClarification: clarificationResolved
            ? undefined
            : {
                ...activeClarification,
                teacherResponseCount: nextResponseCount,
              },
          lastClarifiedQuestionTurnId: clarificationResolved
            ? activeClarification.askedTurnId
            : runtime.lastClarifiedQuestionTurnId,
        });
      }

      eventCollector.push(
        this.createEvent(
          sessionId,
          'agent_done',
          {
            preview: teacherMessage.slice(0, 90),
            executionMode: 'parallel_realtime_loop',
            lessonTurn: lessonStep.turn,
            teacherMode,
            clarificationResolved: clarificationResolved ?? null,
          },
          requestTurn.id,
          teacherProfile.id,
        ),
      );
    };

    const studentRuns = interactionPlans.map((plan) => {
      return (async (): Promise<void> => {
        const profile = selectedStudents.find((item) => item.id === plan.studentId);
        if (!profile) {
          return;
        }

        await this.waitFor(plan.delayMs);

        eventCollector.push(
          this.createEvent(
            sessionId,
            'agent_started',
            {
              requestTurnId: requestTurn.id,
              executionMode: 'parallel_realtime_loop',
              lessonTurn: lessonStep.turn,
              action: plan.action,
              boredness: Number(plan.boredness.toFixed(2)),
              fatigue: Number(plan.fatigue.toFixed(2)),
              delayMs: plan.delayMs,
            },
            requestTurn.id,
            profile.id,
          ),
        );

        if (plan.action === 'silent') {
          cycleInteractionSeconds += 0.8;
          const floors = getStudentStateFloors(profile.kind);
          this.memory.updateAgentState(sessionId, profile.id, {
            attentiveness: clamp(
              Math.round((profile.state.attentiveness - 0.6) * 10) / 10,
              floors.attentiveness,
              10,
            ),
            behavior: clamp(
              Math.round((profile.state.behavior - 0.4) * 10) / 10,
              floors.behavior,
              10,
            ),
          });

          eventCollector.push(
            this.createEvent(
              sessionId,
              'agent_done',
              {
                preview: 'silent_cycle',
                executionMode: 'parallel_realtime_loop',
                lessonTurn: lessonStep.turn,
                action: 'silent',
              },
              requestTurn.id,
              profile.id,
            ),
          );
          return;
        }

        const agent = new StudentAgent(profile);
        const studentInput = studentInputById.get(profile.id);
        const interactionDirective = this.buildStudentInteractionDirective(
          plan,
          studentProfiles,
        );
        const result = await agent.run(
          {
            teacherOrUserMessage:
              `${studentInput?.prompt ??
                this.buildStudentClassroomInput(
                  profile,
                  assignmentContext,
                  [],
                )}\n${interactionDirective}`,
            session: this.mustGetSession(sessionId),
            recentTurns: this.mustGetSession(sessionId).turns.slice(-8),
            allowedKnowledge: studentInput?.allowedKnowledge ?? [],
            stateStimulusText: studentInput?.stimulusText ?? requestTurn.content,
          },
          {
            llm: this.llmTool,
            topic: session.topic,
            emitToken: (token) => {
              eventCollector.push(
                this.createEvent(
                  sessionId,
                  'agent_token',
                  { token, executionMode: 'parallel_realtime_loop' },
                  requestTurn.id,
                  profile.id,
                ),
              );
            },
          },
        );
        const studentSpeechSeconds = estimateSpeechSeconds(result.message, 'student');
        cycleSpeechSeconds += studentSpeechSeconds;
        cycleInteractionSeconds += 0.6;

        const studentTurn = this.createTurn(
          sessionId,
          'agent',
          result.message,
          profile.id,
          {
            kind: profile.kind,
            lessonTurn: lessonStep.turn,
            lessonFocus: lessonStep.title,
            speechSeconds: studentSpeechSeconds,
            requestTurnId: requestTurn.id,
            ...(result.metadata ?? {}),
          },
        );
        this.memory.appendTurn(sessionId, studentTurn);
        this.emitAgentTurnEmission(
          session,
          requestTurn.id,
          studentTurn,
          onAgentTurnEmission,
        );

        if (plan.action === 'student_to_student' && plan.peerTargetId) {
          this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
            from: profile.id,
            to: plan.peerTargetId,
            interactionType: 'student_to_student',
            payload: {
              actionType: 'student_to_student',
              trigger: 'state_driven_realtime_loop',
              text: result.message,
              lessonTurn: lessonStep.turn,
              boredness: Number(plan.boredness.toFixed(2)),
              fatigue: Number(plan.fatigue.toFixed(2)),
            },
          });
        } else {
          this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
            from: profile.id,
            to: TEACHER_AGENT_ID,
            interactionType: 'student_to_teacher',
            payload: {
              actionType: 'student_to_teacher',
              trigger: 'state_driven_realtime_loop',
              text: result.message,
              lessonTurn: lessonStep.turn,
              boredness: Number(plan.boredness.toFixed(2)),
              fatigue: Number(plan.fatigue.toFixed(2)),
            },
          });
        }

        if (result.statePatch && Object.keys(result.statePatch).length > 0) {
          this.memory.updateAgentState(sessionId, profile.id, result.statePatch);
        }

        eventCollector.push(
          this.createEvent(
            sessionId,
            'agent_done',
            {
              preview: result.message.slice(0, 90),
              executionMode: 'parallel_realtime_loop',
              lessonTurn: lessonStep.turn,
              action: plan.action,
            },
            requestTurn.id,
            profile.id,
          ),
        );
      })();
    });

    const participantRuns = [teacherRun(), ...studentRuns];
    const runOutcomes = await Promise.allSettled(participantRuns);
    const firstFailure = runOutcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );

    if (firstFailure) {
      throw new AppError(500, `Parallel classroom loop failed: ${String(firstFailure.reason)}`);
    }

    if (teacherProducedResponse && teacherResponseTargetIds.length > 0) {
      this.applyTeacherResponseAttentivenessBoost(
        sessionId,
        teacherResponseTargetIds,
        teacherMode,
        passiveListenerTargetIds,
      );
    }

    runtime = this.evaluateKnowledgeCheckResponses({
      sessionId,
      requestTurn,
      lessonTurn,
      phase,
      lessonStep,
      runtime,
      teacherProfile,
      eventCollector,
      onAgentTurnEmission,
      knowledgeCheckAskedTurnId,
    });

    const spokenSecondsThisRequest = this.calculateSpokenSecondsForRequest(
      sessionId,
      requestTurn.id,
    );
    const interactionSecondsThisRequest = Number(
      (cycleInteractionSeconds + selectedStudents.length * 0.25).toFixed(2),
    );
    runtime = this.advanceSimulationTime(
      sessionId,
      runtime,
      spokenSecondsThisRequest + interactionSecondsThisRequest,
    );

    if (this.isSimulationTimeCompleted(runtime)) {
      const completionLessonTurn = this.resolveLessonTurnFromRuntime(runtime);
      const completionPhase = this.resolveClassroomPhaseFromRuntime(runtime);
      runtime = this.ensureClassroomRuntime(sessionId, completionLessonTurn, completionPhase, {
        completed: true,
        completedAt: nowIso(),
        completionReason: 'simulation_time_completed',
        paused: true,
      });
      eventCollector.push(
        this.createEvent(
          sessionId,
          'session_completed',
          {
            lessonTurn: runtime.lessonTurn,
            reason: 'simulation_time_completed',
            simulatedElapsedSeconds: runtime.simulatedElapsedSeconds ?? 0,
            simulatedTotalSeconds: runtime.simulatedTotalSeconds ?? SIMULATION_TARGET_SECONDS,
          },
          requestTurn.id,
          teacherProfile.id,
        ),
      );
    }

    if (runtime.phase === 'review' && runtime.activeTaskAssignment) {
      this.applyTaskReviewForTurn(
        sessionId,
        requestTurn.id,
        runtime.activeTaskAssignment,
        eventCollector,
      );
      runtime = this.ensureClassroomRuntime(sessionId, runtime.lessonTurn, runtime.phase, {
        lastReviewTurn: runtime.lessonTurn,
      });
    }

    this.updateClassroomMetrics(sessionId);
  }

  private async processDebateTurn(
    sessionId: string,
    requestTurn: Turn,
    eventCollector: SessionEvent[],
    onAgentTurnEmission?: AgentTurnEmissionHandler,
  ): Promise<void> {
    const session = this.mustGetSession(sessionId);
    const teacherProfile = session.agents.find((agent) => agent.kind === 'Teacher');

    if (!teacherProfile) {
      throw new AppError(500, 'Debate mode requires a teacher agent.');
    }

    this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
      from: 'user',
      to: TEACHER_AGENT_ID,
      interactionType: 'user_to_teacher',
      payload: {
        actionType: 'user_to_teacher',
        text: requestTurn.content,
      },
    });

    const teacherAgent = new TeacherAgent(teacherProfile);

    eventCollector.push(
      this.createEvent(
        sessionId,
        'agent_started',
        { requestTurnId: requestTurn.id },
        requestTurn.id,
        teacherProfile.id,
      ),
    );

    const teacherResult = await teacherAgent.run(
      {
        teacherOrUserMessage: requestTurn.content,
        session,
        recentTurns: session.turns.slice(-8),
      },
      {
        llm: this.llmTool,
        topic: session.topic,
        emitToken: (token) => {
          eventCollector.push(
            this.createEvent(
              sessionId,
              'agent_token',
              { token },
              requestTurn.id,
              teacherProfile.id,
            ),
          );
        },
      },
    );
    const teacherSpeechSeconds = estimateSpeechSeconds(teacherResult.message, 'teacher');

    const teacherTurn = this.createTurn(
      sessionId,
      'teacher',
      teacherResult.message,
      teacherProfile.id,
      {
        kind: teacherProfile.kind,
        speechSeconds: teacherSpeechSeconds,
        requestTurnId: requestTurn.id,
        ...(teacherResult.metadata ?? {}),
      },
    );
    this.memory.appendTurn(sessionId, teacherTurn);
    this.emitAgentTurnEmission(
      session,
      requestTurn.id,
      teacherTurn,
      onAgentTurnEmission,
    );

    this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
      from: TEACHER_AGENT_ID,
      to: 'user',
      interactionType: 'teacher_to_user',
      payload: {
        actionType: 'teacher_to_user',
        text: teacherResult.message,
      },
    });

    eventCollector.push(
      this.createEvent(
        sessionId,
        'agent_done',
        {
          preview: teacherResult.message.slice(0, 90),
        },
        requestTurn.id,
        teacherProfile.id,
      ),
    );

    const rubric = scoreDebateRubric({
      topic: session.topic,
      userMessage: requestTurn.content,
      teacherMessage: teacherTurn.content,
    });

    this.memory.updateMetrics(sessionId, {
      rubric,
      engagement: Math.max(0, Math.min(100, (rubric.argumentStrength + rubric.rebuttal) * 5)),
      clarity: rubric.clarity * 10,
      misconceptionsDetected: 0,
    });

    eventCollector.push(
      this.createEvent(
        sessionId,
        'score_update',
        {
          rubric,
        },
        requestTurn.id,
        teacherProfile.id,
      ),
    );
  }

  private emitAgentTurnEmission(
    session: Session,
    requestTurnId: string,
    emittedTurn: Turn,
    onAgentTurnEmission?: AgentTurnEmissionHandler,
  ): void {
    if (!onAgentTurnEmission) {
      return;
    }

    if (emittedTurn.role !== 'teacher' && emittedTurn.role !== 'agent') {
      return;
    }

    onAgentTurnEmission({
      sessionId: session.id,
      mode: session.mode,
      channel: session.channel,
      topic: session.topic,
      requestTurnId,
      emittedTurn,
    });
  }

  private rollbackRequestTurnForPause(sessionId: string, requestTurnId: string): void {
    const session = this.mustGetSession(sessionId);
    const lastTurn = session.turns[session.turns.length - 1];

    if (!lastTurn || lastTurn.id !== requestTurnId) {
      return;
    }

    session.turns.pop();
    session.metrics.turnCount = session.turns.length;
    session.updatedAt = nowIso();
  }

  private resolveClassroomPhase(lessonTurn: number): ClassroomPhase {
    if (lessonTurn < PRACTICE_PHASE_START_TURN) {
      return 'lecture';
    }

    if (lessonTurn < REVIEW_PHASE_START_TURN) {
      return 'practice';
    }

    return 'review';
  }

  private resolveLessonTurnFromRuntime(
    runtime: NonNullable<Session['classroomRuntime']>,
  ): number {
    const total = Math.max(1, runtime.simulatedTotalSeconds ?? SIMULATION_TARGET_SECONDS);
    const elapsed = clamp(runtime.simulatedElapsedSeconds ?? 0, 0, total);
    const progress = clamp(elapsed / total, 0, 1);
    return this.resolveLessonTurnFromProgress(progress);
  }

  private resolveClassroomPhaseFromRuntime(
    runtime: NonNullable<Session['classroomRuntime']>,
  ): ClassroomPhase {
    return this.resolveClassroomPhase(this.resolveLessonTurnFromRuntime(runtime));
  }

  private resolveLessonTurnFromProgress(progress: number): number {
    const boundedProgress = clamp(progress, 0, 1);
    return clampInt(
      Math.floor(boundedProgress * FRACTIONS_LESSON_TOTAL_TURNS) + 1,
      1,
      FRACTIONS_LESSON_TOTAL_TURNS,
    );
  }

  private isSimulationTimeCompleted(
    runtime: NonNullable<Session['classroomRuntime']>,
  ): boolean {
    const total = Math.max(1, runtime.simulatedTotalSeconds ?? SIMULATION_TARGET_SECONDS);
    const elapsed = Math.max(0, runtime.simulatedElapsedSeconds ?? 0);
    return elapsed >= total - 0.01;
  }

  private isNearSimulationEnd(
    runtime: NonNullable<Session['classroomRuntime']>,
    thresholdSeconds = 120,
  ): boolean {
    const total = Math.max(1, runtime.simulatedTotalSeconds ?? SIMULATION_TARGET_SECONDS);
    const elapsed = clamp(runtime.simulatedElapsedSeconds ?? 0, 0, total);
    return total - elapsed <= Math.max(1, thresholdSeconds);
  }

  private ensureClassroomRuntime(
    sessionId: string,
    lessonTurn: number,
    phase: ClassroomPhase,
    patch?: Partial<Session['classroomRuntime']>,
  ): NonNullable<Session['classroomRuntime']> {
    const updated = this.memory.updateClassroomRuntime(sessionId, (current) => {
      const base = current ?? {
        lessonTurn,
        phase,
        paused: false,
        completed: false,
        completedAt: undefined,
        completionReason: undefined,
        pendingTaskAssignment: false,
        interactiveBoardActive: false,
        simulatedElapsedSeconds: 0,
        simulatedTotalSeconds: SIMULATION_TARGET_SECONDS,
        pendingDistractionCounts: {},
        previousAverageBoredness: undefined,
        boredomRiseStreak: 0,
        lastEngagementJokeTurn: undefined,
        activeKnowledgeCheck: undefined,
      };

      return {
        ...base,
        lessonTurn,
        phase,
        ...(patch ?? {}),
      };
    });

    if (!updated.classroomRuntime) {
      throw new AppError(500, 'Failed to initialize classroom runtime.');
    }

    return updated.classroomRuntime;
  }

  private pickAutonomousTaskMode(lessonTurn: number): TaskWorkMode {
    if (lessonTurn <= PRACTICE_PHASE_START_TURN + 2) {
      return 'individual';
    }

    if (lessonTurn <= REVIEW_PHASE_START_TURN - 1) {
      return 'pair';
    }

    return 'group';
  }

  private buildAutonomousTaskGroups(mode: TaskWorkMode, studentIds: string[]): TaskGroup[] {
    if (mode === 'individual') {
      return studentIds.map((studentId, index) => ({
        id: `individual_${index + 1}`,
        studentIds: [studentId],
      }));
    }

    if (mode === 'pair') {
      const groups: TaskGroup[] = [];
      for (let index = 0; index < studentIds.length; index += 2) {
        const pair = studentIds.slice(index, index + 2);
        groups.push({
          id: `pair_${groups.length + 1}`,
          studentIds: pair,
        });
      }
      return groups;
    }

    const groups: TaskGroup[] = [];
    const targetGroupCount = Math.max(2, Math.ceil(studentIds.length / 3));
    for (let index = 0; index < targetGroupCount; index += 1) {
      groups.push({
        id: `group_${index + 1}`,
        studentIds: [],
      });
    }

    for (let index = 0; index < studentIds.length; index += 1) {
      const groupIndex = index % targetGroupCount;
      const group = groups[groupIndex];
      if (group) {
        group.studentIds.push(studentIds[index]!);
      }
    }

    return groups.filter((group) => group.studentIds.length > 0);
  }

  private normalizeUserTaskGroups(
    mode: TaskWorkMode,
    inputGroups: TaskGroup[] | undefined,
    validStudentIds: string[],
  ): TaskGroup[] {
    const validStudentIdSet = new Set(validStudentIds);
    const groups = (inputGroups ?? [])
      .map((group, index) => ({
        id: group.id?.trim() || `group_${index + 1}`,
        studentIds: [...new Set(group.studentIds.filter((studentId) => validStudentIdSet.has(studentId)))],
      }))
      .filter((group) => group.studentIds.length > 0);

    if (mode === 'individual') {
      return validStudentIds.map((studentId, index) => ({
        id: `individual_${index + 1}`,
        studentIds: [studentId],
      }));
    }

    if (groups.length === 0) {
      throw new AppError(400, 'groups are required for pair/group assignment in supervised mode.');
    }

    const assignedStudents = new Set<string>();
    for (const group of groups) {
      if (mode === 'pair' && group.studentIds.length > 2) {
        throw new AppError(400, 'Pair mode groups can contain maximum 2 students.');
      }

      for (const studentId of group.studentIds) {
        if (assignedStudents.has(studentId)) {
          throw new AppError(400, `Student ${studentId} is assigned in multiple groups.`);
        }
        assignedStudents.add(studentId);
      }
    }

    return groups;
  }

  private describeTaskAssignment(assignment: TaskAssignment): string {
    const groupSummary = assignment.groups
      .map((group) => `${group.id}=[${group.studentIds.join(',')}]`)
      .join('; ');
    return `mode=${assignment.mode}, assignedBy=${assignment.assignedBy}, groups=${groupSummary}`;
  }

  private applyTaskReviewForTurn(
    sessionId: string,
    turnId: string,
    assignment: TaskAssignment,
    eventCollector: SessionEvent[],
  ): void {
    const session = this.mustGetSession(sessionId);
    const studentById = new Map(
      session.agents.filter((agent) => isStudentKind(agent.kind)).map((student) => [student.id, student]),
    );

    for (const group of assignment.groups) {
      for (const studentId of group.studentIds) {
        const student = studentById.get(studentId);
        if (!student) {
          continue;
        }

        const performanceSignal =
          student.state.attentiveness * 0.35 +
          student.state.comprehension * 0.45 +
          student.state.behavior * 0.2;

        
        const solved = performanceSignal >= 5.5;
        const comprehensionDelta = solved ? 1 : -1;
        const behaviorDelta = solved ? 1 : -1;

        this.memory.updateAgentState(sessionId, student.id, {
          comprehension: clamp(
            student.state.comprehension + comprehensionDelta,
            0,
            10,
          ),
          behavior: clamp(student.state.behavior + behaviorDelta, 0, 10),
        });

        this.activateGraphEdgeWithEvent(sessionId, turnId, eventCollector, {
          from: TEACHER_AGENT_ID,
          to: student.id,
          interactionType: 'teacher_to_student',
          payload: {
            actionType: 'task_feedback',
            text: solved
              ? 'Teacher check: solution accepted, comprehension improved.'
              : 'Teacher check: correction needed, comprehension reduced.',
            solved,
            assignmentMode: assignment.mode,
          },
        });
      }
    }

    eventCollector.push(
      this.createEvent(
        sessionId,
        'task_review_completed',
        {
          lessonTurn: assignment.lessonTurn,
          mode: assignment.mode,
          groups: assignment.groups,
        },
        turnId,
        TEACHER_AGENT_ID,
      ),
    );
  }

  private getClassroomLessonTurnIndex(session: Session): number {
    const instructorTurns = session.turns.filter(
      (turn) => turn.role === 'teacher' && !turn.agentId,
    ).length;

    return clampInt(instructorTurns, 1, FRACTIONS_LESSON_TOTAL_TURNS);
  }

  private extractLatestStudentQuestion(session: Session): StudentQuestionSignal | undefined {
    const studentById = new Map(
      session.agents
        .filter((agent) => isStudentKind(agent.kind))
        .map((student) => [student.id, student]),
    );

    const recentStudentTurns = session.turns
      .filter((turn) => turn.role === 'agent' && Boolean(turn.agentId))
      .slice(-16);

    for (let index = recentStudentTurns.length - 1; index >= 0; index -= 1) {
      const candidate = recentStudentTurns[index];
      if (!candidate?.agentId) {
        continue;
      }

      const student = studentById.get(candidate.agentId);
      if (!student) {
        continue;
      }

      if (!this.isStudentQuestionMessage(candidate.content)) {
        continue;
      }

      return {
        studentId: student.id,
        studentName: student.name,
        question: this.truncatePayloadText(candidate.content, 260),
        turnId: candidate.id,
        askedAt: candidate.createdAt,
      };
    }

    return undefined;
  }

  private isStudentQuestionMessage(message: string): boolean {
    const compact = message.trim();
    if (!compact) {
      return false;
    }

    if (compact.includes('?')) {
      return true;
    }

    return /\b(can|could|why|how|what|which|help|miert|miért|hogyan|melyik|segit|segít)\b/i.test(
      compact,
    );
  }

  private isClarificationExplanationSufficient(message: string): boolean {
    const compact = message.trim();
    if (!compact) {
      return false;
    }

    const sentenceCount = compact
      .split(/[.!?]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0).length;

    const hasExplanationCue = /\b(step|first|second|because|means|for example|example)\b/i.test(
      compact,
    );
    const hasCheckForUnderstanding = compact.includes('?');

    return sentenceCount >= 2 && hasExplanationCue && hasCheckForUnderstanding;
  }

  private buildStudentMemoryLines(
    session: Session,
    student: AgentProfile,
    assignmentContext: string,
  ): string[] {
    const nodeLabelById = new Map(
      session.communicationGraph.nodes.map((node) => [node.id, node.label]),
    );
    const directGraphMessages = session.communicationGraph.currentTurnActivations
      .filter((activation) => activation.to === student.id)
      .slice(-4)
      .map((activation) => {
        const fromLabel = nodeLabelById.get(activation.from) ?? activation.from;
        const payloadText =
          typeof activation.payload?.text === 'string' && activation.payload.text.trim().length > 0
            ? this.truncatePayloadText(activation.payload.text, 180)
            : `Action=${activation.interactionType}`;
        const isLowWeight = this.isLowConfidenceActivation(activation);
        const prefix = isLowWeight
          ? 'Overheard graph message (low weight):'
          : 'Direct graph message:';

        return `${prefix} ${fromLabel} -> ${student.name} (${activation.interactionType}): ${payloadText}`;
      });
    const teacherResponseMemory = session.communicationGraph.activations
      .filter(
        (activation) =>
          activation.from === TEACHER_AGENT_ID &&
          activation.to === student.id &&
          (activation.interactionType === 'teacher_to_student' ||
            activation.interactionType === 'teacher_broadcast'),
      )
      .slice(-6)
      .map((activation) => {
        const payloadText =
          typeof activation.payload?.text === 'string' && activation.payload.text.trim().length > 0
            ? this.truncatePayloadText(activation.payload.text, 170)
            : `Action=${activation.interactionType}`;
        const isLowWeight = this.isLowConfidenceActivation(activation);
        const prefix = isLowWeight
          ? 'Overheard graph message (low weight):'
          : 'Direct graph message:';

        return `${prefix} Teacher memory -> ${student.name} (${activation.interactionType}): ${payloadText}`;
      });
    const selfMemory = session.turns
      .filter((turn) => turn.role === 'agent' && turn.agentId === student.id)
      .slice(-2)
      .map((turn) => `I said earlier: ${this.truncatePayloadText(turn.content, 170)}`);

    const uniqueTeacherAndGraphMessages = Array.from(
      new Set([...directGraphMessages, ...teacherResponseMemory]),
    );
    const graphInputSummary =
      uniqueTeacherAndGraphMessages.length > 0
        ? uniqueTeacherAndGraphMessages
        : ['No direct graph message reached me this cycle.'];

    return [
      `Graph-driven mode: only use direct channel messages addressed to me.`,
      `Task assignment context: ${this.truncatePayloadText(assignmentContext, 170)}`,
      ...graphInputSummary,
      ...selfMemory,
    ];
  }

  private applyTeacherResponseAttentivenessBoost(
    sessionId: string,
    studentIds: string[],
    teacherMode:
      | 'clarification_dialogue'
      | 'lesson_delivery'
      | 'behavior_intervention'
      | 'engagement_joke'
      | 'lesson_closure',
    passiveListenerIds: string[] = [],
  ): void {
    const session = this.mustGetSession(sessionId);
    const increment =
      teacherMode === 'clarification_dialogue'
        ? 0.9
        : teacherMode === 'behavior_intervention'
          ? 0.7
          : teacherMode === 'engagement_joke'
            ? 0.65
            : teacherMode === 'lesson_closure'
              ? 0.45
          : 0.5;
    const uniqueStudentIds = Array.from(new Set(studentIds));
    const passiveIncrement = teacherMode === 'clarification_dialogue' ? 0.25 : 0.15;
    const uniquePassiveIds = Array.from(new Set(passiveListenerIds)).filter(
      (studentId) => !uniqueStudentIds.includes(studentId),
    );

    for (const studentId of uniqueStudentIds) {
      const student = session.agents.find(
        (agent) => agent.id === studentId && isStudentKind(agent.kind),
      );
      if (!student) {
        continue;
      }

      const floors = getStudentStateFloors(student.kind);
      const nextAttentiveness = clamp(
        Math.round((student.state.attentiveness + increment) * 10) / 10,
        floors.attentiveness,
        10,
      );

      this.memory.updateAgentState(sessionId, student.id, {
        attentiveness: nextAttentiveness,
      });
    }

    for (const studentId of uniquePassiveIds) {
      const student = session.agents.find(
        (agent) => agent.id === studentId && isStudentKind(agent.kind),
      );
      if (!student) {
        continue;
      }

      const floors = getStudentStateFloors(student.kind);
      const nextAttentiveness = clamp(
        Math.round((student.state.attentiveness + passiveIncrement) * 10) / 10,
        floors.attentiveness,
        10,
      );

      this.memory.updateAgentState(sessionId, student.id, {
        attentiveness: nextAttentiveness,
      });
    }
  }

  private resolveInteractiveBoardMode(
    students: AgentProfile[],
    currentActive: boolean,
  ): InteractiveBoardDecision {
    const totalStudents = students.length;
    if (totalStudents === 0) {
      return {
        nextActive: currentActive,
        changed: false,
        reason: 'stable',
        inattentiveCount: 0,
        totalStudents: 0,
        inattentiveRatio: 0,
        averageAttentiveness: 0,
      };
    }

    const inattentiveCount = students.filter(
      (student) => student.state.attentiveness <= INATTENTIVE_ATTENTION_THRESHOLD,
    ).length;
    const inattentiveRatio = inattentiveCount / totalStudents;
    const averageAttentiveness =
      students.reduce((total, student) => total + student.state.attentiveness, 0) / totalStudents;

    if (!currentActive && inattentiveRatio >= INTERACTIVE_BOARD_ACTIVATE_RATIO) {
      return {
        nextActive: true,
        changed: true,
        reason: 'low_attention_detected',
        inattentiveCount,
        totalStudents,
        inattentiveRatio,
        averageAttentiveness,
      };
    }

    if (
      currentActive &&
      inattentiveRatio <= INTERACTIVE_BOARD_DEACTIVATE_RATIO &&
      averageAttentiveness >= INTERACTIVE_BOARD_RECOVERY_AVERAGE_ATTENTION
    ) {
      return {
        nextActive: false,
        changed: true,
        reason: 'attention_recovered',
        inattentiveCount,
        totalStudents,
        inattentiveRatio,
        averageAttentiveness,
      };
    }

    return {
      nextActive: currentActive,
      changed: false,
      reason: 'stable',
      inattentiveCount,
      totalStudents,
      inattentiveRatio,
      averageAttentiveness,
    };
  }

  private applyInteractiveBoardAttentionBoost(
    sessionId: string,
    studentIds: string[],
    activatedThisTurn: boolean,
  ): void {
    const session = this.mustGetSession(sessionId);
    const increment = activatedThisTurn
      ? INTERACTIVE_BOARD_ACTIVATE_BOOST
      : INTERACTIVE_BOARD_SUSTAIN_BOOST;
    const uniqueStudentIds = Array.from(new Set(studentIds));

    for (const studentId of uniqueStudentIds) {
      const student = session.agents.find(
        (agent) => agent.id === studentId && isStudentKind(agent.kind),
      );
      if (!student) {
        continue;
      }

      const floors = getStudentStateFloors(student.kind);
      const nextAttentiveness = clamp(
        Math.round((student.state.attentiveness + increment) * 10) / 10,
        floors.attentiveness,
        10,
      );

      this.memory.updateAgentState(sessionId, student.id, {
        attentiveness: nextAttentiveness,
      });
    }
  }

  private calculateSpokenSecondsForRequest(
    sessionId: string,
    requestTurnId: string,
  ): number {
    const session = this.mustGetSession(sessionId);
    const spokenSeconds = session.turns
      .filter((turn) => {
        if (!turn.metadata || typeof turn.metadata !== 'object') {
          return false;
        }

        return turn.metadata.requestTurnId === requestTurnId;
      })
      .reduce((sum, turn) => {
        const speechSecondsRaw = turn.metadata?.speechSeconds;
        const speechSeconds =
          typeof speechSecondsRaw === 'number' && Number.isFinite(speechSecondsRaw)
            ? speechSecondsRaw
            : 0;
        return sum + speechSeconds;
      }, 0);

    return Number(spokenSeconds.toFixed(2));
  }

  private advanceSimulationTime(
    sessionId: string,
    runtime: NonNullable<Session['classroomRuntime']>,
    additionalSeconds: number,
  ): NonNullable<Session['classroomRuntime']> {
    const safeAdditionalSeconds = Math.max(0, Number(additionalSeconds.toFixed(2)));
    const total = Math.max(1, runtime.simulatedTotalSeconds ?? SIMULATION_TARGET_SECONDS);
    const elapsed = clamp(runtime.simulatedElapsedSeconds ?? 0, 0, total);
    const nextElapsed = clamp(elapsed + safeAdditionalSeconds, 0, total);
    const nextProgress = clamp(nextElapsed / total, 0, 1);
    const nextLessonTurn = this.resolveLessonTurnFromProgress(nextProgress);
    const nextPhase = this.resolveClassroomPhase(nextLessonTurn);

    return this.ensureClassroomRuntime(sessionId, nextLessonTurn, nextPhase, {
      simulatedElapsedSeconds: Number(nextElapsed.toFixed(2)),
      simulatedTotalSeconds: total,
    });
  }

  private ensureLessonClosureMessage(message: string): string {
    const compact = message.trim();
    if (!compact) {
      return 'Great work today. We completed the lesson and this class is now finished.';
    }

    if (/\b(class is finished|lesson is complete|we are done|that concludes)\b/i.test(compact)) {
      return compact;
    }

    return `${compact} That concludes today's lesson, great effort everyone.`;
  }

  private applyNaturalPerTurnStateDecay(
    sessionId: string,
    requestTurnId: string,
    lessonTurn: number,
    phase: ClassroomPhase,
    students: AgentProfile[],
    interactiveBoardActive: boolean,
  ): void {
    const lessonProgress = clamp(
      lessonTurn / Math.max(1, FRACTIONS_LESSON_TOTAL_TURNS),
      0,
      1,
    );
    const phaseMultiplier =
      phase === 'lecture' ? 1 : phase === 'practice' ? 1.1 : 1.18;
    const boardMitigation = interactiveBoardActive ? 0.08 : 0;

    for (const student of students) {
      const floors = getStudentStateFloors(student.kind);
      const comprehensionFloor =
        student.kind === 'ADHD' ? 1 : student.kind === 'Autistic' || student.kind === 'Typical' ? 1.5 : 1;
      const boredomSignal = estimateBoredness(student.state) / 10;
      const fatigueSignal = estimateFatigue(student.state) / 10;
      const postPraiseFatigueTurns = clampInt(
        student.state.postPraiseFatigueTurns ?? 0,
        0,
        8,
      );
      const postPraiseDecayBoost = clamp(
        student.state.postPraiseDecayBoost ?? 0,
        0,
        0.5,
      );
      const postPraiseDecayMultiplier =
        postPraiseFatigueTurns > 0
          ? 1 + postPraiseDecayBoost + POST_PRAISE_EXTRA_DECAY_FACTOR
          : 1;

      const attentionRoll = stableRoll(
        `${sessionId}:${requestTurnId}:${student.id}:decay:attentiveness`,
      );
      const behaviorRoll = stableRoll(
        `${sessionId}:${requestTurnId}:${student.id}:decay:behavior`,
      );
      const comprehensionRoll = stableRoll(
        `${sessionId}:${requestTurnId}:${student.id}:decay:comprehension`,
      );

      const attentivenessDecay = clamp(
        (0.05 + attentionRoll * 0.16 + lessonProgress * 0.13 + fatigueSignal * 0.08) *
          phaseMultiplier *
          postPraiseDecayMultiplier -
          boardMitigation,
        0.02,
        0.48,
      );
      const behaviorDecay = clamp(
        (0.03 + behaviorRoll * 0.1 + lessonProgress * 0.09 + boredomSignal * 0.06) *
          phaseMultiplier *
          postPraiseDecayMultiplier -
          boardMitigation * 0.45,
        0.01,
        0.35,
      );
      const comprehensionDecay = clamp(
        (0.02 +
          comprehensionRoll * 0.08 +
          lessonProgress * 0.07 +
          (student.state.attentiveness < 5 ? 0.035 : 0)) *
          phaseMultiplier *
          postPraiseDecayMultiplier -
          boardMitigation * 0.3,
        0.01,
        0.28,
      );

      const nextAttentiveness = clamp(
        round1(student.state.attentiveness - attentivenessDecay),
        floors.attentiveness,
        10,
      );
      const nextBehavior = clamp(
        round1(student.state.behavior - behaviorDecay),
        floors.behavior,
        10,
      );
      const nextComprehension = clamp(
        round1(student.state.comprehension - comprehensionDecay),
        comprehensionFloor,
        10,
      );
      const nextPostPraiseFatigueTurns = Math.max(0, postPraiseFatigueTurns - 1);
      const nextPostPraiseDecayBoost =
        nextPostPraiseFatigueTurns > 0
          ? Number((postPraiseDecayBoost * 0.92).toFixed(3))
          : undefined;

      this.memory.updateAgentState(sessionId, student.id, {
        attentiveness: nextAttentiveness,
        behavior: nextBehavior,
        comprehension: nextComprehension,
        postPraiseFatigueTurns:
          nextPostPraiseFatigueTurns > 0 ? nextPostPraiseFatigueTurns : undefined,
        postPraiseDecayBoost: nextPostPraiseDecayBoost,
      });
    }
  }

  private resolveBoredomJokeDecision(
    sessionId: string,
    lessonTurn: number,
    phase: ClassroomPhase,
    runtime: NonNullable<Session['classroomRuntime']>,
    students: AgentProfile[],
  ): BoredomJokeDecision {
    if (students.length === 0) {
      return {
        runtime,
        shouldInjectJoke: false,
        averageBoredness: 0,
        borednessDelta: 0,
        boredomRiseStreak: runtime.boredomRiseStreak ?? 0,
      };
    }

    const averageBoredness =
      students.reduce((sum, student) => sum + estimateBoredness(student.state), 0) /
      students.length;
    const previousAverage =
      runtime.previousAverageBoredness ?? averageBoredness;
    const borednessDelta = averageBoredness - previousAverage;
    const previousRiseStreak = runtime.boredomRiseStreak ?? 0;
    const nextRiseStreak =
      borednessDelta >= BOREDOM_RISE_DELTA_TRIGGER
        ? previousRiseStreak + 1
        : Math.max(0, previousRiseStreak - 1);
    const turnsSinceLastJoke =
      typeof runtime.lastEngagementJokeTurn === 'number'
        ? lessonTurn - runtime.lastEngagementJokeTurn
        : Number.POSITIVE_INFINITY;
    const cooldownPassed = turnsSinceLastJoke >= ENGAGEMENT_JOKE_COOLDOWN_TURNS;
    const phaseEligible = phase === 'lecture' || phase === 'practice';
    const shouldInjectJoke =
      phaseEligible &&
      cooldownPassed &&
      averageBoredness >= BOREDOM_AVERAGE_TRIGGER &&
      nextRiseStreak >= BOREDOM_RISE_STREAK_TRIGGER;

    const updatedRuntime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
      previousAverageBoredness: Number(averageBoredness.toFixed(4)),
      boredomRiseStreak: shouldInjectJoke ? 0 : nextRiseStreak,
      lastEngagementJokeTurn: shouldInjectJoke
        ? lessonTurn
        : runtime.lastEngagementJokeTurn,
    });

    return {
      runtime: updatedRuntime,
      shouldInjectJoke,
      averageBoredness: Number(averageBoredness.toFixed(4)),
      borednessDelta: Number(borednessDelta.toFixed(4)),
      boredomRiseStreak: shouldInjectJoke ? 0 : nextRiseStreak,
    };
  }

  private tryCreateKnowledgeCheck(input: {
    teacherTurn: Turn;
    teacherMessage: string;
    lessonTurn: number;
    lessonStep: FractionsLessonStep;
    topic: string;
    targetStudentIds: string[];
  }): ClassroomKnowledgeCheck | undefined {
    if (!this.isKnowledgeCheckQuestion(input.teacherMessage)) {
      return undefined;
    }

    const questionText = this.extractFirstQuestionSentence(input.teacherMessage);
    if (!questionText) {
      return undefined;
    }

    const uniqueTargets = Array.from(
      new Set(input.targetStudentIds.filter((studentId) => studentId.trim().length > 0)),
    );
    if (uniqueTargets.length === 0) {
      return undefined;
    }

    const expectedKeywords = this.extractExpectedKnowledgeKeywords(
      input.topic,
      input.lessonStep,
    );

    return {
      askedTurnId: input.teacherTurn.id,
      askedAt: input.teacherTurn.createdAt,
      lessonTurn: input.lessonTurn,
      questionText,
      targetStudentIds: uniqueTargets,
      expectedKeywords,
      evaluatedStudentIds: [],
      expiresAtLessonTurn: input.lessonTurn + KNOWLEDGE_CHECK_EXPIRY_TURNS,
    };
  }

  private evaluateKnowledgeCheckResponses(input: {
    sessionId: string;
    requestTurn: Turn;
    lessonTurn: number;
    phase: ClassroomPhase;
    lessonStep: FractionsLessonStep;
    runtime: NonNullable<Session['classroomRuntime']>;
    teacherProfile: AgentProfile;
    eventCollector: SessionEvent[];
    onAgentTurnEmission?: AgentTurnEmissionHandler;
    knowledgeCheckAskedTurnId?: string;
  }): NonNullable<Session['classroomRuntime']> {
    const knowledgeCheck = input.runtime.activeKnowledgeCheck;
    if (!knowledgeCheck) {
      return input.runtime;
    }

    if (
      input.knowledgeCheckAskedTurnId &&
      knowledgeCheck.askedTurnId === input.knowledgeCheckAskedTurnId
    ) {
      return input.runtime;
    }

    if (input.lessonTurn > knowledgeCheck.expiresAtLessonTurn) {
      return this.ensureClassroomRuntime(input.sessionId, input.lessonTurn, input.phase, {
        activeKnowledgeCheck: undefined,
      });
    }

    const session = this.mustGetSession(input.sessionId);
    const askedTurnIndex = session.turns.findIndex(
      (turn) => turn.id === knowledgeCheck.askedTurnId,
    );
    if (askedTurnIndex < 0) {
      return this.ensureClassroomRuntime(input.sessionId, input.lessonTurn, input.phase, {
        activeKnowledgeCheck: undefined,
      });
    }

    const evaluatedStudentIds = new Set(knowledgeCheck.evaluatedStudentIds);
    const targetStudentSet = new Set(knowledgeCheck.targetStudentIds);
    const candidateTurns = session.turns
      .slice(askedTurnIndex + 1)
      .filter(
        (turn) =>
          turn.role === 'agent' &&
          Boolean(turn.agentId) &&
          targetStudentSet.has(turn.agentId ?? '') &&
          !evaluatedStudentIds.has(turn.agentId ?? ''),
      );

    if (candidateTurns.length === 0) {
      return input.runtime;
    }

    const praisedStudents: AgentProfile[] = [];
    for (const turn of candidateTurns) {
      const studentId = turn.agentId;
      if (!studentId) {
        continue;
      }

      evaluatedStudentIds.add(studentId);
      const student = session.agents.find(
        (agent) => agent.id === studentId && isStudentKind(agent.kind),
      );
      if (!student) {
        continue;
      }

      const isCorrect = this.isLikelyCorrectKnowledgeAnswer(
        turn.content,
        knowledgeCheck.expectedKeywords,
      );
      if (!isCorrect) {
        continue;
      }

      praisedStudents.push(student);
      const floors = getStudentStateFloors(student.kind);
      const nextComprehensionFloor =
        student.kind === 'ADHD'
          ? 1
          : student.kind === 'Autistic' || student.kind === 'Typical'
            ? 1.5
            : 1;
      const nextPostPraiseFatigueTurns = clampInt(
        (student.state.postPraiseFatigueTurns ?? 0) + 3,
        0,
        8,
      );
      const nextPostPraiseDecayBoost = Number(
        clamp((student.state.postPraiseDecayBoost ?? 0) + 0.1, 0.08, 0.5).toFixed(3),
      );

      this.memory.updateAgentState(input.sessionId, student.id, {
        attentiveness: clamp(round1(student.state.attentiveness + 0.7), floors.attentiveness, 10),
        behavior: clamp(round1(student.state.behavior + 0.45), floors.behavior, 10),
        comprehension: clamp(
          round1(student.state.comprehension + 1),
          nextComprehensionFloor,
          10,
        ),
        liveAction: {
          code: 'task_focus',
          kind: 'on_task',
          label: 'Answered correctly',
          severity: 'success',
          at: nowIso(),
        },
        distractionStreak: 0,
        postPraiseFatigueTurns: nextPostPraiseFatigueTurns,
        postPraiseDecayBoost: nextPostPraiseDecayBoost,
      });

      this.activateGraphEdgeWithEvent(
        input.sessionId,
        input.requestTurn.id,
        input.eventCollector,
        {
          from: TEACHER_AGENT_ID,
          to: student.id,
          interactionType: 'teacher_to_student',
          payload: {
            actionType: 'teacher_praise',
            text: `${student.name}, excellent answer. You connected the idea correctly.`,
            sourceKnowledgeCheckTurnId: knowledgeCheck.askedTurnId,
          },
        },
      );
    }

    const unresolvedTargetIds = knowledgeCheck.targetStudentIds.filter(
      (studentId) => !evaluatedStudentIds.has(studentId),
    );
    let nextRuntime = this.ensureClassroomRuntime(
      input.sessionId,
      input.lessonTurn,
      input.phase,
      {
        activeKnowledgeCheck:
          unresolvedTargetIds.length > 0
            ? {
                ...knowledgeCheck,
                evaluatedStudentIds: Array.from(evaluatedStudentIds),
              }
            : undefined,
      },
    );

    if (praisedStudents.length > 0) {
      const praiseText = this.buildKnowledgePraiseText(
        praisedStudents,
        input.lessonStep,
      );
      const praiseSpeechSeconds = estimateSpeechSeconds(praiseText, 'teacher');
      const praiseTurn = this.createTurn(
        input.sessionId,
        'teacher',
        praiseText,
        input.teacherProfile.id,
        {
          kind: input.teacherProfile.kind,
          lessonTurn: input.lessonTurn,
          lessonFocus: input.lessonStep.title,
          teacherMode: 'knowledge_check_praise',
          speechSeconds: praiseSpeechSeconds,
          requestTurnId: input.requestTurn.id,
          sourceKnowledgeCheckTurnId: knowledgeCheck.askedTurnId,
        },
      );

      this.memory.appendTurn(input.sessionId, praiseTurn);
      this.emitAgentTurnEmission(
        session,
        input.requestTurn.id,
        praiseTurn,
        input.onAgentTurnEmission,
      );

      input.eventCollector.push(
        this.createEvent(
          input.sessionId,
          'agent_done',
          {
            executionMode: 'parallel_realtime_loop',
            lessonTurn: input.lessonTurn,
            action: 'knowledge_check_praise',
            praisedStudentIds: praisedStudents.map((student) => student.id),
          },
          input.requestTurn.id,
          input.teacherProfile.id,
        ),
      );

      if (nextRuntime.activeKnowledgeCheck) {
        nextRuntime = this.ensureClassroomRuntime(
          input.sessionId,
          input.lessonTurn,
          input.phase,
          {
            activeKnowledgeCheck: {
              ...nextRuntime.activeKnowledgeCheck,
              evaluatedStudentIds: Array.from(evaluatedStudentIds),
            },
          },
        );
      }
    }

    return nextRuntime;
  }

  private buildKnowledgePraiseText(
    praisedStudents: AgentProfile[],
    lessonStep: FractionsLessonStep,
  ): string {
    if (praisedStudents.length === 1) {
      const student = praisedStudents[0];
      return `${student?.name}, great answer on ${lessonStep.title.toLowerCase()}. Keep that clear thinking.`;
    }

    const names = praisedStudents.map((student) => student.name).join(', ');
    return `Great responses, ${names}. You connected the key idea in ${lessonStep.title.toLowerCase()} correctly.`;
  }

  private isKnowledgeCheckQuestion(message: string): boolean {
    const compact = message.trim();
    if (!compact || !compact.includes('?')) {
      return false;
    }

    return /\b(what|why|how|which|can|explain|compare|define|numerator|denominator|fraction)\b/i.test(
      compact,
    );
  }

  private extractFirstQuestionSentence(message: string): string | undefined {
    const compact = message.replace(/\s+/g, ' ').trim();
    if (!compact) {
      return undefined;
    }

    const sentences = compact.split(/(?<=[.!?])\s+/);
    const question = sentences.find((sentence) => sentence.includes('?'));
    if (!question) {
      return undefined;
    }

    return this.truncatePayloadText(question, 220);
  }

  private extractExpectedKnowledgeKeywords(
    topic: string,
    lessonStep: FractionsLessonStep,
  ): string[] {
    const source = `${topic} ${lessonStep.title} ${lessonStep.deliveryGoal}`.toLowerCase();
    const tokens = source
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .filter((token) => !topicStopwords.has(token));
    return Array.from(new Set(tokens)).slice(0, 10);
  }

  private isLikelyCorrectKnowledgeAnswer(
    studentMessage: string,
    expectedKeywords: string[],
  ): boolean {
    const compact = studentMessage.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!compact) {
      return false;
    }

    if (/\b(i don'?t know|not sure|cannot remember|do not remember)\b/i.test(compact)) {
      return false;
    }

    const answerTokens = new Set(
      compact
        .replace(/[^a-z0-9\s/]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 2),
    );
    const keywordHits = expectedKeywords.filter((keyword) => answerTokens.has(keyword)).length;
    const hasFractionPattern = /\b\d+\s*\/\s*\d+\b/.test(compact);
    const hasMathReasoningCue = /\b(because|denominator|numerator|equal|same|part|whole)\b/.test(
      compact,
    );
    const wordCount = compact.split(/\s+/).filter(Boolean).length;

    let score = 0;
    score += keywordHits * 0.45;
    score += hasFractionPattern ? 0.45 : 0;
    score += hasMathReasoningCue ? 0.4 : 0;
    score += wordCount >= 6 ? 0.3 : 0;

    return score >= 0.9;
  }

  private resolveStudentLiveActions(
    sessionId: string,
    requestTurnId: string,
    students: AgentProfile[],
    runtime: NonNullable<Session['classroomRuntime']>,
    lessonTurn: number,
    phase: ClassroomPhase,
    interactiveBoardActive: boolean,
  ): {
    runtime: NonNullable<Session['classroomRuntime']>;
    signals: StudentLiveActionSignal[];
  } {
    const previousCounts = runtime.pendingDistractionCounts ?? {};
    const nextCounts: Record<string, number> = { ...previousCounts };
    const signals: StudentLiveActionSignal[] = [];

    for (const student of students) {
      const distractionScore = clamp(
        (10 - student.state.attentiveness) * 0.5 +
          (10 - student.state.behavior) * 0.35 +
          (10 - student.state.comprehension) * 0.15,
        0,
        10,
      );
      const phaseAdjustment =
        phase === 'lecture' ? 0.06 : phase === 'practice' ? 0.03 : -0.01;
      const boardAdjustment = interactiveBoardActive ? -0.14 : 0;
      const postPraisePenalty =
        (student.state.postPraiseFatigueTurns ?? 0) > 0
          ? POST_PRAISE_EXTRA_DISTRACTION +
            clamp(student.state.postPraiseDecayBoost ?? 0, 0, 0.5) * 0.4
          : 0;
      const distractionProbability = clamp(
        0.1 + distractionScore * 0.07 + phaseAdjustment + boardAdjustment + postPraisePenalty,
        0.05,
        0.9,
      );
      const roll = stableRoll(`${sessionId}:${requestTurnId}:${student.id}:live_action_roll`);
      const isOffTask = roll < distractionProbability;
      const actionTemplate = this.pickStudentLiveActionTemplate(
        isOffTask ? OFF_TASK_ACTION_LIBRARY : ON_TASK_ACTION_LIBRARY,
        `${sessionId}:${requestTurnId}:${student.id}:live_action_pick`,
      );
      const previousStreak = clampInt(
        nextCounts[student.id] ?? student.state.distractionStreak ?? 0,
        0,
        MAX_DISTRACTION_STREAK,
      );
      const preResetStreak = isOffTask
        ? clampInt(previousStreak + 1, 0, MAX_DISTRACTION_STREAK)
        : Math.max(0, previousStreak - 1);
      const reactionThreshold = this.resolveBehaviorReactionThreshold(
        student,
        distractionScore,
      );
      const needsTeacherIntervention = isOffTask && preResetStreak >= reactionThreshold;
      const storedStreak = needsTeacherIntervention ? 0 : preResetStreak;
      nextCounts[student.id] = storedStreak;

      const floors = getStudentStateFloors(student.kind);
      const attentivenessDelta = isOffTask
        ? -(0.2 + distractionScore * 0.05)
        : 0.12 + (interactiveBoardActive ? 0.08 : 0);
      const behaviorDelta = isOffTask ? -(0.16 + distractionScore * 0.04) : 0.1;
      const nextAttentiveness = clamp(
        round1(student.state.attentiveness + attentivenessDelta),
        floors.attentiveness,
        10,
      );
      const nextBehavior = clamp(
        round1(student.state.behavior + behaviorDelta),
        floors.behavior,
        10,
      );
      const liveAction: StudentLiveAction = {
        code: actionTemplate.code,
        kind: isOffTask ? 'off_task' : 'on_task',
        label: actionTemplate.label,
        severity: actionTemplate.severity,
        at: nowIso(),
      };

      this.memory.updateAgentState(sessionId, student.id, {
        attentiveness: nextAttentiveness,
        behavior: nextBehavior,
        liveAction,
        distractionStreak: storedStreak,
      });

      signals.push({
        studentId: student.id,
        studentName: student.name,
        liveAction,
        distractionScore: Number(distractionScore.toFixed(3)),
        distractionProbability: Number(distractionProbability.toFixed(3)),
        distractionStreak: preResetStreak,
        needsTeacherIntervention,
      });
    }

    const updatedRuntime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
      pendingDistractionCounts: nextCounts,
    });

    return {
      runtime: updatedRuntime,
      signals,
    };
  }

  private pickStudentLiveActionTemplate(
    library: ReadonlyArray<{
      code: StudentLiveAction['code'];
      label: string;
      severity: StudentLiveAction['severity'];
    }>,
    seed: string,
  ): {
    code: StudentLiveAction['code'];
    label: string;
    severity: StudentLiveAction['severity'];
  } {
    if (library.length === 0) {
      return {
        code: 'listening',
        label: 'Paying attention',
        severity: 'info',
      };
    }

    const roll = stableRoll(seed);
    const index = clampInt(Math.floor(roll * library.length), 0, library.length - 1);
    const selected = library[index];

    if (!selected) {
      return library[0]!;
    }

    return selected;
  }

  private resolveBehaviorReactionThreshold(
    student: AgentProfile,
    distractionScore: number,
  ): number {
    const profileAdjustment =
      student.kind === 'ADHD' ? -1 : student.kind === 'Autistic' ? 0 : 0;
    const scoreAdjustment = distractionScore >= 7 ? -1 : 0;
    return clampInt(
      TEACHER_BEHAVIOR_RESPONSE_THRESHOLD + profileAdjustment + scoreAdjustment,
      2,
      4,
    );
  }

  private buildStudentClassroomInput(
    student: AgentProfile,
    assignmentContext: string,
    memoryLines: string[],
  ): string {
    return [
      `Live classroom loop (parallel mode): students respond in the same cycle without waiting.`,
      `You are ${student.name} (${student.kind}).`,
      `Mode: graph-driven student reasoning.`,
      `Task assignment context: ${this.truncatePayloadText(assignmentContext, 180)}`,
      `Knowledge rule: answer using only direct graph messages addressed to you in Student Memory Context.`,
      `Ignore global lesson-plan instructions unless explicitly present in your direct graph messages.`,
      memoryLines.length > 0
        ? `Memory items available for this turn: ${memoryLines.length}.`
        : `Memory items available for this turn: 0. If needed, say you do not remember enough yet.`,
      `Respond to the sender (typically teacher broadcast or teacher_to_student) with one concise student action now.`,
    ].join('\n');
  }

  private buildStudentStimulusFromGraph(session: Session, studentId: string): string {
    const texts = session.communicationGraph.currentTurnActivations
      .filter((activation) => activation.to === studentId)
      .map((activation) => {
        return typeof activation.payload?.text === 'string'
          ? activation.payload.text.trim()
          : '';
      })
      .filter((value) => value.length > 0);

    if (texts.length === 0) {
      return 'No direct graph input received for this student in this cycle.';
    }

    return texts.join('\n');
  }

  private buildAllowedKnowledgeFromGraphMemory(
    student: AgentProfile,
    memoryLines: string[],
    stimulusText: string,
    fallbackTeacherInput: string,
  ): string[] {
    const directedLines = memoryLines.filter((line) => line.startsWith('Direct graph message:'));
    const overheardLines = memoryLines.filter((line) =>
      line.startsWith('Overheard graph message (low weight):'),
    );
    if (directedLines.length > 0) {
      return [...directedLines.slice(-6), ...overheardLines.slice(-2)];
    }

    if (overheardLines.length > 0) {
      return overheardLines.slice(-4);
    }

    const fallbackText = this.truncatePayloadText(
      stimulusText.trim().length > 0 ? stimulusText : fallbackTeacherInput,
      180,
    );

    return [
      `Direct graph message: Teacher -> ${student.name} (teacher_broadcast): ${fallbackText}`,
    ];
  }

  private isLowConfidenceActivation(activation: CommunicationActivation): boolean {
    if (activation.payload?.confidence === 'low') {
      return true;
    }

    if (activation.payload?.phase === 'clarification_overhear') {
      return true;
    }

    return false;
  }

  private summarizeTeacherResponseForOverhear(message: string): string {
    const compact = message.replace(/\s+/g, ' ').trim();
    if (!compact) {
      return 'Teacher is clarifying a student question.';
    }

    const firstSentence = compact.split(/(?<=[.!?])\s+/)[0] ?? compact;
    return this.truncatePayloadText(firstSentence, 200);
  }

  private buildStudentInteractionPlans(
    session: Session,
    requestTurnId: string,
    selectedStudents: AgentProfile[],
    allStudents: AgentProfile[],
  ): StudentInteractionPlan[] {
    return selectedStudents.map((student) => {
      const boredness = estimateBoredness(student.state);
      const fatigue = estimateFatigue(student.state);
      const hasTeacherBroadcast = session.communicationGraph.currentTurnActivations.some(
        (activation) =>
          activation.to === student.id && activation.interactionType === 'teacher_broadcast',
      );
      const isCurrentlyOffTask = student.state.liveAction?.kind === 'off_task';

      let teacherWeight =
        0.45 +
        student.state.attentiveness * 0.035 +
        student.state.comprehension * 0.02 -
        boredness * 0.03 -
        fatigue * 0.01;
      let peerWeight =
        0.2 +
        student.state.behavior * 0.03 +
        student.state.attentiveness * 0.01 +
        (10 - fatigue) * 0.01;
      if (isCurrentlyOffTask) {
        teacherWeight *= 0.7;
        peerWeight += 0.16;
      }
      if (hasTeacherBroadcast) {
        peerWeight *= 0.35;
      }
      if (boredness <= STUDENT_TO_STUDENT_BOREDOM_THRESHOLD) {
        peerWeight += 0.12;
      }

      let silentWeight = 0.12 + fatigue * 0.04 + Math.max(0, boredness - 6) * 0.05;
      if (student.state.attentiveness < 4 || student.state.behavior < 4) {
        silentWeight += 0.12;
      }

      teacherWeight = Math.max(0.05, teacherWeight);
      peerWeight = Math.max(0, peerWeight);
      silentWeight = Math.max(0.05, silentWeight);

      const total = teacherWeight + peerWeight + silentWeight;
      const roll = stableRoll(`${session.id}:${requestTurnId}:${student.id}:action`) * total;
      let action: StudentInteractionAction = 'student_to_teacher';

      if (roll >= teacherWeight + peerWeight) {
        action = 'silent';
      } else if (roll >= teacherWeight) {
        action = 'student_to_student';
      }

      let peerTargetId: string | undefined;
      if (action === 'student_to_student') {
        peerTargetId = this.pickPeerTargetId(
          session,
          student.id,
          allStudents.filter((candidate) => isStudentKind(candidate.kind)),
          `${session.id}:${requestTurnId}:${student.id}:peer_target`,
        );

        if (!peerTargetId) {
          action = 'student_to_teacher';
        }
      }

      const jitter = stableRoll(`${session.id}:${requestTurnId}:${student.id}:delay`);
      const delayMs = clampInt(
        MIN_STUDENT_ACTION_DELAY_MS + fatigue * 35 + boredness * 18 + jitter * 180,
        MIN_STUDENT_ACTION_DELAY_MS,
        MAX_STUDENT_ACTION_DELAY_MS,
      );

      return {
        studentId: student.id,
        action,
        peerTargetId,
        delayMs,
        boredness,
        fatigue,
      };
    });
  }

  private buildStudentInteractionDirective(
    plan: StudentInteractionPlan,
    allStudents: AgentProfile[],
  ): string {
    if (plan.action === 'student_to_student' && plan.peerTargetId) {
      const peerName =
        allStudents.find((student) => student.id === plan.peerTargetId)?.name ??
        plan.peerTargetId;
      return `Interaction target for this cycle: speak to peer ${peerName} (student_to_student). Do not address the teacher in this message.`;
    }

    return 'Interaction target for this cycle: respond directly to the teacher (student_to_teacher).';
  }

  private pickPeerTargetId(
    session: Session,
    fromStudentId: string,
    candidates: AgentProfile[],
    seed: string,
  ): string | undefined {
    const peerCandidates = candidates.filter((candidate) => candidate.id !== fromStudentId);
    if (peerCandidates.length === 0) {
      return undefined;
    }

    const scored = peerCandidates.map((candidate) => {
      const forwardEdge = session.communicationGraph.edges.find(
        (edge) => edge.from === fromStudentId && edge.to === candidate.id,
      );
      const backwardEdge = session.communicationGraph.edges.find(
        (edge) => edge.from === candidate.id && edge.to === fromStudentId,
      );
      const relation = forwardEdge?.relationship ?? backwardEdge?.relationship ?? 'neutral';
      const relationWeight =
        relation === 'good' ? 1.25 : relation === 'neutral' ? 1 : 0.65;
      const edgeWeight = clamp(
        ((forwardEdge?.weight ?? 0.6) + (backwardEdge?.weight ?? 0.6)) / 2,
        0.2,
        2,
      );
      const engagementWeight = clamp(
        (candidate.state.behavior * 0.6 + candidate.state.attentiveness * 0.4) / 10,
        0.2,
        1.2,
      );

      return {
        candidateId: candidate.id,
        weight: Math.max(0.05, edgeWeight * relationWeight * engagementWeight),
      };
    });

    const total = scored.reduce((sum, item) => sum + item.weight, 0);
    if (total <= 0) {
      return peerCandidates[0]?.id;
    }

    let threshold = stableRoll(seed) * total;
    for (const item of scored) {
      threshold -= item.weight;
      if (threshold <= 0) {
        return item.candidateId;
      }
    }

    return scored[scored.length - 1]?.candidateId;
  }

  private waitFor(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildPeerMessageForGraph(studentName: string, message?: string): string {
    const cleanedName = studentName.trim() || 'Student';
    const cleanedMessage = typeof message === 'string' ? message.trim() : '';

    if (!cleanedMessage) {
      return `${cleanedName}: Sharing a peer reaction to the current task.`;
    }

    return this.truncatePayloadText(`${cleanedName}: ${cleanedMessage}`, 280);
  }

  private buildTeacherGraphContext(
    session: Session,
    selectedStudents: AgentProfile[],
  ): {
    relationshipSignals: string[];
    activeChannelSignals: string[];
  } {
    const selectedNodeIds = new Set<string>([
      TEACHER_AGENT_ID,
      ...selectedStudents.map((student) => student.id),
    ]);
    const nodeLabelById = new Map(
      session.communicationGraph.nodes.map((node) => [node.id, node.label]),
    );

    const relationshipSignals = session.communicationGraph.edges
      .filter((edge) => selectedNodeIds.has(edge.from) && selectedNodeIds.has(edge.to))
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 5)
      .map((edge) => {
        const from = nodeLabelById.get(edge.from) ?? edge.from;
        const to = nodeLabelById.get(edge.to) ?? edge.to;
        return `${from} -> ${to}: relationship=${edge.relationship}, weight=${edge.weight.toFixed(2)}, activations=${edge.activationCount}`;
      });

    if (relationshipSignals.length === 0) {
      relationshipSignals.push('No relationship signals available for selected classroom nodes.');
    }

    const activeChannelSignals = session.communicationGraph.currentTurnActivations
      .filter((activation) => selectedNodeIds.has(activation.from) && selectedNodeIds.has(activation.to))
      .slice(-6)
      .map((activation) => {
        const from = nodeLabelById.get(activation.from) ?? activation.from;
        const to = nodeLabelById.get(activation.to) ?? activation.to;
        return `${from} -> ${to}: ${activation.interactionType}${this.describeActivationPayload(activation.payload)}`;
      });

    if (activeChannelSignals.length === 0) {
      activeChannelSignals.push('No active channels recorded in this turn yet.');
    }

    return {
      relationshipSignals,
      activeChannelSignals,
    };
  }

  private describeActivationPayload(payload?: Record<string, unknown>): string {
    if (!payload) {
      return '';
    }

    const actionType =
      typeof payload.actionType === 'string' ? payload.actionType.trim() : '';
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    const descriptors: string[] = [];

    if (actionType) {
      descriptors.push(`action=${actionType}`);
    }

    if (text) {
      descriptors.push(`text="${this.truncatePayloadText(text, 120)}"`);
    }

    if (descriptors.length === 0) {
      return '';
    }

    return ` (${descriptors.join(', ')})`;
  }

  private truncatePayloadText(value: string, maxLength: number): string {
    const singleLine = value.replace(/\s+/g, ' ').trim();

    if (singleLine.length <= maxLength) {
      return singleLine;
    }

    return `${singleLine.slice(0, maxLength - 1)}…`;
  }

  private updateClassroomMetrics(sessionId: string): void {
    const session = this.mustGetSession(sessionId);
    const students = session.agents.filter((agent) => isStudentKind(agent.kind));

    if (students.length === 0) {
      return;
    }

    const totals = students.reduce(
      (acc, student) => {
        acc.attentiveness += student.state.attentiveness;
        acc.behavior += student.state.behavior;
        acc.comprehension += student.state.comprehension;
        return acc;
      },
      {
        attentiveness: 0,
        behavior: 0,
        comprehension: 0,
      },
    );

    const averages = {
      attentiveness: Number((totals.attentiveness / students.length).toFixed(4)),
      behavior: Number((totals.behavior / students.length).toFixed(4)),
      comprehension: Number((totals.comprehension / students.length).toFixed(4)),
    };

    const engagement = Math.round(
      clamp((averages.attentiveness * 0.6 + averages.behavior * 0.4) / 10, 0, 1) * 100,
    );
    const clarity = Math.round(clamp(averages.comprehension / 10, 0, 1) * 100);

    this.memory.updateMetrics(sessionId, {
      engagement,
      clarity,
      misconceptionsDetected: 0,
      studentStateAverages: averages,
    });
  }

  private mustGetSession(sessionId: string): Session {
    const session = this.memory.getSession(sessionId);

    if (!session) {
      throw new AppError(404, `Session ${sessionId} not found.`);
    }

    return session;
  }

  private createTurn(
    sessionId: string,
    role: TurnRole,
    content: string,
    agentId?: string,
    metadata?: Record<string, unknown>,
  ): Turn {
    return {
      id: `turn_${randomUUID()}`,
      sessionId,
      role,
      agentId,
      content,
      createdAt: nowIso(),
      metadata,
    };
  }

  private createEvent(
    sessionId: string,
    type: SessionEventType,
    payload: Record<string, unknown>,
    turnId?: string,
    agentId?: string,
  ): SessionEvent {
    const event: SessionEvent = {
      id: `evt_${randomUUID()}`,
      sessionId,
      type,
      turnId,
      agentId,
      payload,
      createdAt: nowIso(),
    };

    this.logStudentStateSnapshot(sessionId, event);
    return event;
  }

  private logStudentStateSnapshot(sessionId: string, event: SessionEvent): void {
    const session = this.memory.getSession(sessionId);

    if (!session) {
      return;
    }

    const students = session.agents
      .filter((agent) => isStudentKind(agent.kind))
      .map((student) => ({
        id: student.id,
        name: student.name,
        kind: student.kind,
        state: { ...student.state },
      }));

    logger.info('student_state_activity_snapshot', {
      sessionId,
      eventId: event.id,
      eventType: event.type,
      turnId: event.turnId ?? null,
      agentId: event.agentId ?? null,
      students,
    });
  }

  private activateGraphEdgeWithEvent(
    sessionId: string,
    turnId: string,
    eventCollector: SessionEvent[],
    input: {
      from: string;
      to: string;
      interactionType: InteractionType;
      payload?: Record<string, unknown>;
    },
  ): CommunicationActivation {
    const session = this.mustGetSession(sessionId);
    const activation = activateCommunicationEdge(session.communicationGraph, {
      turnId,
      ...input,
    });

    const edge = session.communicationGraph.edges.find((item) => item.id === activation.edgeId);
    const eventAgentId = session.agents.some((agent) => agent.id === input.from)
      ? input.from
      : undefined;

    eventCollector.push(
      this.createEvent(
        sessionId,
        'graph_edge_activated',
        {
          activationId: activation.id,
          edgeId: activation.edgeId,
          from: activation.from,
          to: activation.to,
          interactionType: activation.interactionType,
          weight: edge?.weight ?? null,
          relationship: edge?.relationship ?? null,
          payload: activation.payload ?? null,
        },
        turnId,
        eventAgentId,
      ),
    );

    return activation;
  }

  private async buildDefaultAgents(
    mode: SessionMode,
    classroomId: number,
  ): Promise<AgentProfile[]> {
    const classroomRep = AppDataSource.getRepository(ClassRoom);

    const classroom = await classroomRep.findOne({
      where: { id: classroomId },
      relations: {
        students: true,
      },
    });

    if (!classroom) {
      throw new AppError(404, `Classroom ${classroomId} not found.`);
    }

    const teacher: AgentProfile = {
      id: TEACHER_AGENT_ID,
      kind: 'Teacher',
      name: 'Teacher Agent',
      state: {
        attentiveness: 10,
        behavior: 10,
        comprehension: 10,
        profile: 'Teacher',
      },
    };

    if (mode !== 'classroom') {
      return [teacher];
    }

    const studentAgents: AgentProfile[] = classroom.students.map((student) => ({
      id: `student_agent_${student.id}`,
      kind: student.profile,
      name: student.name,
      state: {
        attentiveness: student.attentiveness,
        behavior: student.behavior,
        comprehension: student.comprehension,
        profile: student.profile,
        liveAction: {
          code: 'listening',
          kind: 'on_task',
          label: 'Ready for class',
          severity: 'info',
          at: nowIso(),
        },
        distractionStreak: 0,
      },
    }));

    if (studentAgents.length === 0) {
      throw new AppError(400, `Classroom ${classroomId} has no students.`);
    }

    return [teacher, ...studentAgents];
  }
}
