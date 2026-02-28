import { randomUUID } from 'node:crypto';

import type {
  AgentProfile,
  ClassroomRuntime,
  CommunicationGraph,
  Session,
  SessionConfig,
  SessionEvent,
  SessionMetrics,
  SimulationChannel,
  SessionMode,
  Turn,
} from '../@types';
import { AppError } from '../shared/errors/app-error';

export interface CreateSessionInput {
  mode: SessionMode;
  topic: string;
  config?: SessionConfig;
  channel?: SimulationChannel;
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
  pushSupervisorHint(sessionId: string, hintText: string): void;
  consumeSupervisorHint(sessionId: string): string | undefined;
  updateClassroomRuntime(
    sessionId: string,
    updater: (
      current: Session['classroomRuntime'] | undefined,
    ) => Session['classroomRuntime'] | undefined,
  ): Session;
}

const nowIso = (): string => new Date().toISOString();

const defaultMetrics = (): SessionMetrics => ({
  engagement: 0,
  clarity: 0,
  misconceptionsDetected: 0,
  turnCount: 0,
  studentStateAverages: {
    attentiveness: 0,
    behavior: 0,
    comprehension: 0,
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
      channel: input.channel ?? 'unsupervised',
      topic: input.topic,
      config: input.config ?? {},
      agents: input.agents,
      communicationGraph: input.communicationGraph,
      classroomRuntime:
        input.mode === 'classroom'
          ? {
              lessonTurn: 1,
              phase: 'lecture',
              paused: false,
              pendingTaskAssignment: false,
              interactiveBoardActive: false,
            }
          : undefined,
      turns: [],
      events: [],
      metrics: defaultMetrics(),
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

  public pushSupervisorHint(sessionId: string, hintText: string): void {
    this.mustGetSession(sessionId);
    const queue = this.supervisorHints.get(sessionId) ?? [];
    queue.push(hintText);
    this.supervisorHints.set(sessionId, queue);
  }

  public consumeSupervisorHint(sessionId: string): string | undefined {
    this.mustGetSession(sessionId);
    const queue = this.supervisorHints.get(sessionId);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    const value = queue.shift();
    this.supervisorHints.set(sessionId, queue);
    return value;
  }

  public updateClassroomRuntime(
    sessionId: string,
    updater: (
      current: Session['classroomRuntime'] | undefined,
    ) => Session['classroomRuntime'] | undefined,
  ): Session {
    const session = this.mustGetSession(sessionId);
    session.classroomRuntime = updater(session.classroomRuntime);
    session.updatedAt = nowIso();
    return session;
  }

  private mustGetSession(sessionId: string): Session {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new AppError(404, `Session ${sessionId} not found.`);
    }

    return session;
  }
}
