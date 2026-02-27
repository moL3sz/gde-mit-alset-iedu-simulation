import { randomUUID } from 'node:crypto';

import type {
  AgentKind,
  AgentProfile,
  CommunicationActivation,
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionResponse,
  InteractionType,
  PostTurnResponse,
  Session,
  SessionEvent,
  SessionEventType,
  SessionMode,
  Turn,
  TurnRole,
} from './@types';
import { StudentAgent } from './agents/studentAgent';
import { TeacherAgent } from './agents/teacherAgent';
import type { SessionMemory } from './memory/sessionMemory';
import { AppError } from './shared/errors/app-error';
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

const nowIso = (): string => new Date().toISOString();

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const clampInt = (value: number, min: number, max: number): number => {
  return clamp(Math.floor(value), min, max);
};

const isStudentKind = (kind: AgentKind): boolean => {
  return (
    kind === 'student_fast' ||
    kind === 'student_esl' ||
    kind === 'student_distracted' ||
    kind === 'student_emotional'
  );
};

export class Orchestrator {
  public constructor(
    private readonly memory: SessionMemory,
    private readonly llmTool: LlmTool,
  ) {}

  public async createSession(input: CreateSessionRequest): Promise<CreateSessionResponse> {
    console.log("Input", input)
    const mode = input.mode;
    const classroomId = input.classroomId;

     if (!classroomId){
      throw new AppError(400, 'Classrom Identifier is requried');
    }

    const agents = await this.buildDefaultAgents(mode, classroomId);
    

    if (!input.topic.trim()) {
      throw new AppError(400, 'Topic is required.');
    }

   

    const communicationGraph = createSessionCommunicationGraph(mode, agents, input.config);

    const session = this.memory.createSession({
      mode,
      topic: input.topic.trim(),
      config: input.config,
      agents,
      communicationGraph,
    });

    const event = this.createEvent(session.id, 'session_created', {
      mode: session.mode,
      topic: session.topic,
      agents: session.agents.map((agent) => ({ id: agent.id, kind: agent.kind })),
    });

    this.memory.appendEvents(session.id, [event]);

    return {
      sessionId: session.id,
      mode: session.mode,
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
      topic: session.topic,
      agents: session.agents,
      lastTurns: session.turns.slice(-8),
      metrics: session.metrics,
      communicationGraph: session.communicationGraph,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  public async processTurn(
    sessionId: string,
    teacherOrUserMessage: string,
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
      await this.processClassroomTurn(session.id, requestTurn, turnEvents);
    } else {
      await this.processDebateTurn(session.id, requestTurn, turnEvents);
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

  private async processClassroomTurn(
    sessionId: string,
    requestTurn: Turn,
    eventCollector: SessionEvent[],
  ): Promise<void> {
    const session = this.mustGetSession(sessionId);
    const teacherProfile = session.agents.find((agent) => agent.kind === 'teacher');
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

    for (const student of studentProfiles) {
      this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
        from: TEACHER_AGENT_ID,
        to: student.id,
        interactionType: 'teacher_broadcast',
        payload: {
          scope: 'classroom',
        },
      });
    }

    for (const student of selectedStudents) {
      this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
        from: TEACHER_AGENT_ID,
        to: student.id,
        interactionType: 'teacher_to_student',
      });
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
        });
        this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
          from: right.id,
          to: left.id,
          interactionType: 'student_to_student',
        });
      }
    }

    for (const profile of selectedStudents) {
      const agent = new StudentAgent(profile);

      eventCollector.push(
        this.createEvent(
          sessionId,
          'agent_started',
          {
            requestTurnId: requestTurn.id,
          },
          requestTurn.id,
          profile.id,
        ),
      );

      const result = await agent.run(
        {
          teacherOrUserMessage: requestTurn.content,
          session: this.mustGetSession(sessionId),
          recentTurns: this.mustGetSession(sessionId).turns.slice(-8),
        },
        {
          llm: this.llmTool,
          topic: session.topic,
          emitToken: (token) => {
            eventCollector.push(
              this.createEvent(sessionId, 'agent_token', { token }, requestTurn.id, profile.id),
            );
          },
        },
      );

      this.memory.appendTurn(
        sessionId,
        this.createTurn(sessionId, 'agent', result.message, profile.id, {
          kind: profile.kind,
          ...(result.metadata ?? {}),
        }),
      );

      this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
        from: profile.id,
        to: TEACHER_AGENT_ID,
        interactionType: 'student_to_teacher',
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
          },
          requestTurn.id,
          profile.id,
        ),
      );
    }

    const teacherAgent = new TeacherAgent(teacherProfile);
    eventCollector.push(
      this.createEvent(
        sessionId,
        'agent_started',
        {
          requestTurnId: requestTurn.id,
        },
        requestTurn.id,
        teacherProfile.id,
      ),
    );

    const studentResponses = this.mustGetSession(sessionId).turns
      .filter((turn) => turn.role === 'agent' && turn.agentId && selectedStudents.some((student) => student.id === turn.agentId))
      .slice(-selectedStudents.length)
      .map((turn) => {
        const student = selectedStudents.find((value) => value.id === turn.agentId);
        return `${student?.name ?? turn.agentId}: ${turn.content}`;
      });

    const teacherInput = [
      `Teacher instruction: ${requestTurn.content}`,
      `Student responses:`,
      ...studentResponses,
      `Give a short teacher follow-up that keeps the class moving.`,
    ].join('\n');

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
              { token },
              requestTurn.id,
              teacherProfile.id,
            ),
          );
        },
      },
    );

    this.memory.appendTurn(
      sessionId,
      this.createTurn(sessionId, 'teacher', teacherResult.message, teacherProfile.id, {
        kind: teacherProfile.kind,
        ...(teacherResult.metadata ?? {}),
      }),
    );

    for (const student of selectedStudents) {
      this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
        from: TEACHER_AGENT_ID,
        to: student.id,
        interactionType: 'teacher_to_student',
        payload: {
          phase: 'follow_up',
        },
      });
    }

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

    this.updateClassroomMetrics(sessionId);
  }

  private async processDebateTurn(
    sessionId: string,
    requestTurn: Turn,
    eventCollector: SessionEvent[],
  ): Promise<void> {
    const session = this.mustGetSession(sessionId);
    const teacherProfile = session.agents.find((agent) => agent.kind === 'teacher');

    if (!teacherProfile) {
      throw new AppError(500, 'Debate mode requires a teacher agent.');
    }

    this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
      from: 'user',
      to: TEACHER_AGENT_ID,
      interactionType: 'user_to_teacher',
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

    this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
      from: TEACHER_AGENT_ID,
      to: 'user',
      interactionType: 'teacher_to_user',
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

  private updateClassroomMetrics(sessionId: string): void {
    const session = this.mustGetSession(sessionId);
    const students = session.agents.filter((agent) => isStudentKind(agent.kind));

    if (students.length === 0) {
      return;
    }

    const totals = students.reduce(
      (acc, student) => {
        acc.attention += student.state.attention;
        acc.boredom += student.state.boredom;
        acc.fatigue += student.state.fatigue;
        acc.knowledgeRetention += student.state.knowledgeRetention;
        acc.misconceptions += student.state.misconceptions.length;
        return acc;
      },
      {
        attention: 0,
        boredom: 0,
        fatigue: 0,
        knowledgeRetention: 0,
        misconceptions: 0,
      },
    );

    const averages = {
      attention: Number((totals.attention / students.length).toFixed(4)),
      boredom: Number((totals.boredom / students.length).toFixed(4)),
      fatigue: Number((totals.fatigue / students.length).toFixed(4)),
      knowledgeRetention: Number((totals.knowledgeRetention / students.length).toFixed(4)),
    };

    const engagement = Math.round(clamp(averages.attention * (1 - averages.boredom), 0, 1) * 100);
    const clarity = Math.round(
      clamp(averages.knowledgeRetention * (1 - averages.fatigue * 0.4), 0, 1) * 100,
    );

    this.memory.updateMetrics(sessionId, {
      engagement,
      clarity,
      misconceptionsDetected: totals.misconceptions,
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

  private async buildDefaultAgents(mode: SessionMode, classroomId:number): Promise<AgentProfile[]> {


    const classroomRep = AppDataSource.getRepository(ClassRoom);

    const classroom = await classroomRep.findOne({
      where: {
        id: classroomId
      },
      relations: {
        students:true
      }
    });

    console.log(classroom);

    const teacher: AgentProfile = {
      id: TEACHER_AGENT_ID,
      kind: 'teacher',
      name: 'Teacher Agent',
      state: {
        attention: 0.96,
        boredom: 0.05,
        fatigue: 0.15,
        knowledgeRetention: 0.95,
        eslSupportNeeded: false,
        emotion: 'engaged',
        misconceptions: [],
      },
    };

    if (mode === 'classroom') {
      return [
        teacher,
        {
          id: 'student_fast_1',
          kind: 'student_fast',
          name: 'Ava (fast learner)',
          state: {
            attention: 0.9,
            boredom: 0.15,
            fatigue: 0.2,
            knowledgeRetention: 0.82,
            eslSupportNeeded: false,
            emotion: 'engaged',
            misconceptions: [],
          },
        },
        {
          id: 'student_esl_1',
          kind: 'student_esl',
          name: 'Mateo (ESL)',
          state: {
            attention: 0.75,
            boredom: 0.25,
            fatigue: 0.28,
            knowledgeRetention: 0.58,
            eslSupportNeeded: true,
            emotion: 'calm',
            misconceptions: ['complex wording'],
          },
        },
        {
          id: 'student_distracted_1',
          kind: 'student_distracted',
          name: 'Jordan (distracted)',
          state: {
            attention: 0.58,
            boredom: 0.52,
            fatigue: 0.38,
            knowledgeRetention: 0.44,
            eslSupportNeeded: false,
            emotion: 'calm',
            misconceptions: ['skips setup steps'],
          },
        },
        {
          id: 'student_emotional_1',
          kind: 'student_emotional',
          name: 'Noa (anxious)',
          state: {
            attention: 0.7,
            boredom: 0.35,
            fatigue: 0.42,
            knowledgeRetention: 0.55,
            eslSupportNeeded: false,
            emotion: 'anxious',
            misconceptions: ['self-doubt under pressure'],
          },
        },
      ];
    }

    return [teacher];
  }
}
