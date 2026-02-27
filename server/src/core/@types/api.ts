import type {
  AgentProfile,
  CommunicationGraph,
  SessionConfig,
  SessionEvent,
  SessionMetrics,
  SessionMode,
  Turn,
} from './session';

export interface CreateSessionRequest {
  mode: SessionMode;
  topic: string;
  config?: SessionConfig;
}

export interface CreateSessionResponse {
  sessionId: string;
  mode: SessionMode;
}

export interface GetSessionResponse {
  sessionId: string;
  mode: SessionMode;
  topic: string;
  agents: AgentProfile[];
  lastTurns: Turn[];
  metrics: SessionMetrics;
  communicationGraph: CommunicationGraph;
  createdAt: string;
  updatedAt: string;
}

export interface PostTurnRequest {
  teacherOrUserMessage: string;
}

export interface PostTurnResponse {
  turnId: string;
  transcript: Turn[];
  events: SessionEvent[];
  metrics: SessionMetrics;
  communicationGraph: CommunicationGraph;
}

export interface HealthResponse {
  ok: true;
  uptime: number;
}

export interface ApiErrorResponse {
  requestId: string;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}
