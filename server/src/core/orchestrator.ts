import { randomUUID } from 'node:crypto';

import type {
  AgentKind,
  AgentProfile,
  AssignmentAuthority,
  ClassroomPhase,
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
import { AppDataSource } from '../database/data-source';
import { ClassRoom } from '../database/entities/ClassRoom';

const TEACHER_AGENT_ID = 'teacher';
const PRACTICE_PHASE_START_TURN = Math.ceil(FRACTIONS_LESSON_TOTAL_TURNS / 3) + 1;
const REVIEW_PHASE_START_TURN = Math.ceil((FRACTIONS_LESSON_TOTAL_TURNS * 2) / 3) + 1;

const nowIso = (): string => new Date().toISOString();

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const clampInt = (value: number, min: number, max: number): number => {
  return clamp(Math.floor(value), min, max);
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
        pendingTaskAssignment: false,
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
    const selectedStudents = orderedStudents.slice(0, responderCount);
    const lessonTurn = this.getClassroomLessonTurnIndex(session);
    const phase = this.resolveClassroomPhase(lessonTurn);
    let runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase);
    const supervisorHint =
      session.channel === 'supervised' ? this.memory.consumeSupervisorHint(sessionId) : undefined;

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

    const lessonStep = getFractionsLessonStep(lessonTurn);
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
      .slice(-Math.max(4, selectedStudents.length))
      .map((turn) => {
        const student = selectedStudents.find((candidate) => candidate.id === turn.agentId);
        return `${student?.name ?? turn.agentId}: ${turn.content}`;
      });
    const teacherInput = [
      `You are in parallel real-time classroom loop mode.`,
      `Lesson turn: ${lessonStep.turn}/${FRACTIONS_LESSON_TOTAL_TURNS}`,
      `Classroom phase: ${phase}`,
      `Current lesson focus: ${lessonStep.title}`,
      `Delivery goal for this turn: ${lessonStep.deliveryGoal}`,
      `Task assignment context: ${assignmentContext}`,
      `Incoming instruction to adapt: ${requestTurn.content}`,
      `Recent student signals from prior cycles:`,
      ...recentStudentSignals,
      session.channel === 'unsupervised'
        ? `Autonomous adaptation signals from student states:`
        : undefined,
      ...(session.channel === 'unsupervised' ? studentStateSnapshot : []),
      `Graph relationship signals:`,
      ...graphContext.relationshipSignals,
      `Current active channels this cycle:`,
      ...graphContext.activeChannelSignals,
      supervisorHint ? `Supervisor hint: ${supervisorHint}` : undefined,
      `Output exactly one teacher micro-step for the class now, aligned to this lesson turn.`,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');
    const studentInputById = new Map<
      string,
      { prompt: string; memoryLines: string[]; stimulusText: string }
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

      studentInputById.set(profile.id, { prompt, memoryLines, stimulusText });
    }

    const teacherAgent = new TeacherAgent(teacherProfile);
    const studentMessages = new Map<string, string>();

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

    for (const profile of selectedStudents) {
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
          profile.id,
        ),
      );
    }

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

      const teacherTurn = this.createTurn(
        sessionId,
        'teacher',
        teacherResult.message,
        teacherProfile.id,
        {
          kind: teacherProfile.kind,
          lessonTurn: lessonStep.turn,
          lessonFocus: lessonStep.title,
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

      for (const student of selectedStudents) {
        this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
          from: TEACHER_AGENT_ID,
          to: student.id,
          interactionType: 'teacher_to_student',
          payload: {
            actionType: 'teacher_to_student',
            text: teacherResult.message,
            phase: 'follow_up',
            lessonTurn: lessonStep.turn,
          },
        });
      }

      eventCollector.push(
        this.createEvent(
          sessionId,
          'agent_done',
          {
            preview: teacherResult.message.slice(0, 90),
            executionMode: 'parallel_realtime_loop',
            lessonTurn: lessonStep.turn,
          },
          requestTurn.id,
          teacherProfile.id,
        ),
      );
    };

    const studentRuns = selectedStudents.map((profile) => {
      return (async (): Promise<void> => {
        const agent = new StudentAgent(profile);
        const studentInput = studentInputById.get(profile.id);
        const result = await agent.run(
          {
            teacherOrUserMessage:
              studentInput?.prompt ??
              this.buildStudentClassroomInput(
                profile,
                assignmentContext,
                [],
              ),
            session: this.mustGetSession(sessionId),
            recentTurns: this.mustGetSession(sessionId).turns.slice(-8),
            allowedKnowledge: studentInput?.memoryLines ?? [],
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

        const studentTurn = this.createTurn(
          sessionId,
          'agent',
          result.message,
          profile.id,
          {
            kind: profile.kind,
            lessonTurn: lessonStep.turn,
            lessonFocus: lessonStep.title,
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
        studentMessages.set(profile.id, result.message);

        this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
          from: profile.id,
          to: TEACHER_AGENT_ID,
          interactionType: 'student_to_teacher',
          payload: {
            actionType: 'student_to_teacher',
            text: result.message,
            lessonTurn: lessonStep.turn,
          },
        });

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

    for (let index = 0; index < selectedStudents.length; index += 1) {
      for (let nested = index + 1; nested < selectedStudents.length; nested += 1) {
        const left = selectedStudents[index];
        const right = selectedStudents[nested];

        if (!left || !right) {
          continue;
        }

        this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
          from: left.id,
          to: right.id,
          interactionType: 'student_to_student',
          payload: {
            actionType: 'student_to_student',
            text: this.buildPeerMessageForGraph(left.name, studentMessages.get(left.id)),
          },
        });
        this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
          from: right.id,
          to: left.id,
          interactionType: 'student_to_student',
          payload: {
            actionType: 'student_to_student',
            text: this.buildPeerMessageForGraph(right.name, studentMessages.get(right.id)),
          },
        });
      }
    }

    if (phase === 'review' && runtime.activeTaskAssignment) {
      this.applyTaskReviewForTurn(
        sessionId,
        requestTurn.id,
        runtime.activeTaskAssignment,
        eventCollector,
      );
      runtime = this.ensureClassroomRuntime(sessionId, lessonTurn, phase, {
        lastReviewTurn: lessonTurn,
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

    const teacherTurn = this.createTurn(
      sessionId,
      'teacher',
      teacherResult.message,
      teacherProfile.id,
      {
        kind: teacherProfile.kind,
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
        pendingTaskAssignment: false,
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
      .slice(-10)
      .map((activation) => {
        const fromLabel = nodeLabelById.get(activation.from) ?? activation.from;
        const payloadText =
          typeof activation.payload?.text === 'string' && activation.payload.text.trim().length > 0
            ? this.truncatePayloadText(activation.payload.text, 180)
            : `Action=${activation.interactionType}`;

        return `Direct graph message: ${fromLabel} -> ${student.name} (${activation.interactionType}): ${payloadText}`;
      });
    const selfMemory = session.turns
      .filter((turn) => turn.role === 'agent' && turn.agentId === student.id)
      .slice(-4)
      .map((turn) => `I said earlier: ${this.truncatePayloadText(turn.content, 170)}`);

    const graphInputSummary =
      directGraphMessages.length > 0
        ? directGraphMessages
        : ['No direct graph message reached me this cycle.'];

    return [
      `Graph-driven mode: only use direct channel messages addressed to me.`,
      `Task assignment context: ${this.truncatePayloadText(assignmentContext, 170)}`,
      ...graphInputSummary,
      ...selfMemory,
    ];
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
      .slice(0, 10)
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
      .slice(-12)
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
    return {
      id: `evt_${randomUUID()}`,
      sessionId,
      type,
      turnId,
      agentId,
      payload,
      createdAt: nowIso(),
    };
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
      },
    }));

    if (studentAgents.length === 0) {
      throw new AppError(400, `Classroom ${classroomId} has no students.`);
    }

    return [teacher, ...studentAgents];
  }
}
