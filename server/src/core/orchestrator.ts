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
import { DebateCoachAgent } from './agents/debateCoachAgent';
import { ObserverAgent } from './agents/observerAgent';
import { StudentAgent } from './agents/studentAgent';
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

const nowIso = (): string => new Date().toISOString();

const clampInt = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, Math.floor(value)));
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

  public createSession(input: CreateSessionRequest): CreateSessionResponse {
    const mode = input.mode;
    const agents = this.buildDefaultAgents(mode);

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
    const studentProfiles = session.agents.filter((agent) => isStudentKind(agent.kind));

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
        from: 'teacher',
        to: student.id,
        interactionType: 'teacher_broadcast',
        payload: {
          scope: 'classroom',
        },
      });
    }

    for (const student of selectedStudents) {
      this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
        from: 'teacher',
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
        to: 'teacher',
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

    const observerEnabled = classroomConfig.observerEnabled ?? true;
    const observerProfile = session.agents.find((agent) => agent.kind === 'observer');

    if (observerEnabled && observerProfile) {
      const observer = new ObserverAgent(observerProfile);
      eventCollector.push(
        this.createEvent(
          sessionId,
          'agent_started',
          {
            requestTurnId: requestTurn.id,
          },
          requestTurn.id,
          observerProfile.id,
        ),
      );

      const observerResult = await observer.run(
        {
          teacherOrUserMessage: requestTurn.content,
          session: this.mustGetSession(sessionId),
          recentTurns: this.mustGetSession(sessionId).turns.slice(-12),
        },
        {
          llm: this.llmTool,
          topic: session.topic,
          emitToken: () => {
            return;
          },
        },
      );

      this.memory.appendTurn(
        sessionId,
        this.createTurn(sessionId, 'observer', observerResult.message, observerProfile.id, {
          kind: observerProfile.kind,
          ...(observerResult.metadata ?? {}),
        }),
      );

      this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
        from: observerProfile.id,
        to: 'teacher',
        interactionType: 'observer_to_teacher',
      });

      if (observerResult.metricsPatch) {
        this.memory.updateMetrics(sessionId, observerResult.metricsPatch);
      }

      eventCollector.push(
        this.createEvent(
          sessionId,
          'agent_done',
          {
            preview: observerResult.message.slice(0, 90),
          },
          requestTurn.id,
          observerProfile.id,
        ),
      );
    }
  }

  private async processDebateTurn(
    sessionId: string,
    requestTurn: Turn,
    eventCollector: SessionEvent[],
  ): Promise<void> {
    const session = this.mustGetSession(sessionId);
    const coachProfile = session.agents.find((agent) => agent.kind === 'debate_coach');
    const judgeProfile = session.agents.find((agent) => agent.kind === 'judge');

    if (!coachProfile || !judgeProfile) {
      throw new AppError(500, 'Debate mode requires both coach and judge agents.');
    }

    this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
      from: 'user',
      to: coachProfile.id,
      interactionType: 'user_to_coach',
    });

    const coachAgent = new DebateCoachAgent(coachProfile);

    eventCollector.push(
      this.createEvent(
        sessionId,
        'agent_started',
        { requestTurnId: requestTurn.id },
        requestTurn.id,
        coachProfile.id,
      ),
    );

    const coachResult = await coachAgent.run(
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
            this.createEvent(sessionId, 'agent_token', { token }, requestTurn.id, coachProfile.id),
          );
        },
      },
    );

    const coachTurn = this.createTurn(sessionId, 'coach', coachResult.message, coachProfile.id, {
      kind: coachProfile.kind,
      ...(coachResult.metadata ?? {}),
    });
    this.memory.appendTurn(sessionId, coachTurn);

    this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
      from: coachProfile.id,
      to: 'user',
      interactionType: 'coach_to_user',
    });

    eventCollector.push(
      this.createEvent(
        sessionId,
        'agent_done',
        {
          preview: coachResult.message.slice(0, 90),
        },
        requestTurn.id,
        coachProfile.id,
      ),
    );

    eventCollector.push(
      this.createEvent(
        sessionId,
        'agent_started',
        { requestTurnId: requestTurn.id },
        requestTurn.id,
        judgeProfile.id,
      ),
    );

    const rubric = scoreDebateRubric({
      topic: session.topic,
      userMessage: requestTurn.content,
      coachMessage: coachTurn.content,
    });

    const judgeMessage = [
      `Rubric feedback:`,
      `argumentStrength=${rubric.argumentStrength}/10`,
      `evidenceUse=${rubric.evidenceUse}/10`,
      `clarity=${rubric.clarity}/10`,
      `rebuttal=${rubric.rebuttal}/10`,
      `overall=${rubric.overall}/10`,
      rubric.feedback,
    ].join(' ');

    this.memory.appendTurn(
      sessionId,
      this.createTurn(sessionId, 'judge', judgeMessage, judgeProfile.id, {
        kind: judgeProfile.kind,
      }),
    );

    this.activateGraphEdgeWithEvent(sessionId, requestTurn.id, eventCollector, {
      from: judgeProfile.id,
      to: 'user',
      interactionType: 'judge_to_user',
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
        judgeProfile.id,
      ),
    );

    eventCollector.push(
      this.createEvent(
        sessionId,
        'agent_done',
        {
          preview: judgeMessage.slice(0, 90),
        },
        requestTurn.id,
        judgeProfile.id,
      ),
    );
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

  private buildDefaultAgents(mode: SessionMode): AgentProfile[] {
    if (mode === 'classroom') {
      return [
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
        {
          id: 'observer_1',
          kind: 'observer',
          name: 'Classroom Observer',
          state: {
            attention: 1,
            boredom: 0,
            fatigue: 0.1,
            knowledgeRetention: 1,
            eslSupportNeeded: false,
            emotion: 'calm',
            misconceptions: [],
          },
        },
      ];
    }

    return [
      {
        id: 'debate_coach_1',
        kind: 'debate_coach',
        name: 'Debate Coach',
        state: {
          attention: 1,
          boredom: 0.05,
          fatigue: 0.1,
          knowledgeRetention: 1,
          eslSupportNeeded: false,
          emotion: 'engaged',
          misconceptions: [],
        },
      },
      {
        id: 'judge_1',
        kind: 'judge',
        name: 'Rubric Judge',
        state: {
          attention: 1,
          boredom: 0.05,
          fatigue: 0.1,
          knowledgeRetention: 1,
          eslSupportNeeded: false,
          emotion: 'calm',
          misconceptions: [],
        },
      },
    ];
  }
}
