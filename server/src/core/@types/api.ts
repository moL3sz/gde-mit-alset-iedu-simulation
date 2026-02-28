import type {
  AssignmentAuthority,
  AgentProfile,
  ClassroomRuntime,
  CommunicationGraph,
  SessionConfig,
  SessionEvent,
  SessionMetrics,
  SimulationChannel,
  SessionMode,
  TaskGroup,
  TaskWorkMode,
  Turn,
} from './session';

export interface CreateSessionRequest {
  mode: SessionMode;
  topic: string;
  config?: SessionConfig;
  channel?: SimulationChannel;
  period?: number;
  classroomId?: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  mode: SessionMode;
  channel: SimulationChannel;
}

export interface GetSessionResponse {
  sessionId: string;
  mode: SessionMode;
  channel: SimulationChannel;
  topic: string;
  agents: AgentProfile[];
  lastTurns: Turn[];
  metrics: SessionMetrics;
  communicationGraph: CommunicationGraph;
  classroomRuntime?: ClassroomRuntime;
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

export interface SubmitSupervisorHintResponse {
  sessionId: string;
  channel: SimulationChannel;
  hintText: string;
  createdAt: string;
  eventId?: string;
}

export interface SubmitTaskAssignmentRequest {
  mode: TaskWorkMode;
  groups?: TaskGroup[];
  autonomousGrouping?: boolean;
}

export interface SubmitTaskAssignmentResponse {
  sessionId: string;
  channel: SimulationChannel;
  mode: TaskWorkMode;
  groups: TaskGroup[];
  assignedBy: AssignmentAuthority;
  createdAt: string;
  eventId?: string;
  classroomRuntime?: ClassroomRuntime;
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
