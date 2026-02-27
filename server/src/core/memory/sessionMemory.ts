import { randomUUID } from 'node:crypto';

import type {
  AgentProfile,
  ClassroomRuntime,
  CommunicationGraph,
  SimulationChannel,
  Session,
  SessionConfig,
  SessionEvent,
  SessionMetrics,
  SessionMode,
  Turn,
} from '../@types';
import { AppError } from '../shared/errors/app-error';

export interface CreateSessionInput {
  mode: SessionMode;
  channel: SimulationChannel;
  topic: string;
  config?: SessionConfig;
  agents: AgentProfile[];
  communicationGraph: CommunicationGraph;
}

export interface SessionMemoryStore {
  createSession(input: CreateSessionInput): Session;
  getSession(sessionId: string): Session | undefined;
  appendTurn(sessionId: string, turn: Turn): Session;
  appendEvents(sessionId: string, events: SessionEvent[]): Session;
  updateAgentState(
    sessionId: string,
    agentId: string,
    patch: Partial<AgentProfile['state']>,
  ): Session;
  updateMetrics(sessionId: string, patch: Partial<SessionMetrics>): Session;
  updateClassroomRuntime(
    sessionId: string,
    updater: (current: ClassroomRuntime | undefined) => ClassroomRuntime | undefined,
  ): Session;
  pushSupervisorHint(sessionId: string, hintText: string): Session;
  consumeSupervisorHint(sessionId: string): string | undefined;
}

const nowIso = (): string => new Date().toISOString();

const defaultMetrics = (): SessionMetrics => ({
  engagement: 0,
  clarity: 0,
  misconceptionsDetected: 0,
  turnCount: 0,
  studentStateAverages: {
    attention: 0,
    boredom: 0,
    fatigue: 0,
    knowledgeRetention: 0,
  },
});

export class SessionMemory implements SessionMemoryStore {
  private readonly sessions = new Map<string, Session>();
  private readonly supervisorHints = new Map<string, string[]>();

  public createSession(input: CreateSessionInput): Session {
    const createdAt = nowIso();
    const session: Session = {
      id: randomUUID(),
      mode: input.mode,
      channel: input.channel,
      topic: input.topic,
      config: input.config ?? {},
      agents: input.agents,
      communicationGraph: input.communicationGraph,
      turns: [],
      events: [],
      metrics: defaultMetrics(),
      classroomRuntime:
        input.mode === 'classroom'
          ? {
              lessonTurn: 1,
              phase: 'lecture',
              paused: false,
              pendingTaskAssignment: false,
            }
          : undefined,
      createdAt,
      updatedAt: createdAt,
    };

    this.sessions.set(session.id, session);
    this.supervisorHints.set(session.id, []);
    return session;
  }

  public getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  public appendTurn(sessionId: string, turn: Turn): Session {
    const session = this.mustGetSession(sessionId);
    session.turns.push(turn);
    session.metrics.turnCount = session.turns.length;
    session.updatedAt = turn.createdAt;

    return session;
  }

  public appendEvents(sessionId: string, events: SessionEvent[]): Session {
    const session = this.mustGetSession(sessionId);

    if (events.length > 0) {
      session.events.push(...events);
      session.updatedAt = events[events.length - 1]?.createdAt ?? session.updatedAt;
    }

    return session;
  }

  public updateAgentState(
    sessionId: string,
    agentId: string,
    patch: Partial<AgentProfile['state']>,
  ): Session {
    const session = this.mustGetSession(sessionId);
    const agent = session.agents.find((item) => item.id === agentId);

    if (!agent) {
      throw new AppError(404, `Agent ${agentId} not found in session ${sessionId}.`);
    }

    agent.state = {
      ...agent.state,
      ...patch,
    };

    session.updatedAt = nowIso();
    return session;
  }

  public updateMetrics(sessionId: string, patch: Partial<SessionMetrics>): Session {
    const session = this.mustGetSession(sessionId);
    session.metrics = {
      ...session.metrics,
      ...patch,
    };
    session.updatedAt = nowIso();

    return session;
  }

  public updateClassroomRuntime(
    sessionId: string,
    updater: (current: ClassroomRuntime | undefined) => ClassroomRuntime | undefined,
  ): Session {
    const session = this.mustGetSession(sessionId);
    session.classroomRuntime = updater(session.classroomRuntime);
    session.updatedAt = nowIso();
    return session;
  }

  public pushSupervisorHint(sessionId: string, hintText: string): Session {
    const session = this.mustGetSession(sessionId);
    const queue = this.supervisorHints.get(sessionId) ?? [];

    queue.push(hintText);
    if (queue.length > 32) {
      queue.splice(0, queue.length - 32);
    }

    this.supervisorHints.set(sessionId, queue);
    session.updatedAt = nowIso();

    return session;
  }

  public consumeSupervisorHint(sessionId: string): string | undefined {
    const session = this.mustGetSession(sessionId);
    const queue = this.supervisorHints.get(sessionId);

    if (!queue || queue.length === 0) {
      return undefined;
    }

    const next = queue.shift();
    this.supervisorHints.set(sessionId, queue);
    session.updatedAt = nowIso();

    return next;
  }

  private mustGetSession(sessionId: string): Session {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new AppError(404, `Session ${sessionId} not found.`);
    }

    return session;
  }
}
