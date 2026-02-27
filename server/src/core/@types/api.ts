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
  channel?: 'supervised' | 'unsupervised';
  classroomId?: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  mode: SessionMode;
  channel?: 'supervised' | 'unsupervised';
}

export interface GetSessionResponse {
  sessionId: string;
  mode: SessionMode;
  channel?: 'supervised' | 'unsupervised';
  topic: string;
  agents: AgentProfile[];
  lastTurns: Turn[];
  metrics: SessionMetrics;
  communicationGraph: CommunicationGraph;
  classroomRuntime?: unknown;
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
  channel?: 'supervised' | 'unsupervised';
  hintText: string;
  createdAt: string;
  eventId?: string;
}

export type TaskWorkMode = 'individual' | 'pair' | 'group';

export interface TaskGroup {
  id: string;
  studentIds: string[];
}

export interface SubmitTaskAssignmentRequest {
  mode: TaskWorkMode;
  groups?: TaskGroup[];
  autonomousGrouping?: boolean;
}

export interface SubmitTaskAssignmentResponse {
  sessionId: string;
  channel?: 'supervised' | 'unsupervised';
  mode: TaskWorkMode;
  groups: TaskGroup[];
  assignedBy: 'teacher_agent' | 'supervisor_user';
  createdAt: string;
  eventId?: string;
  classroomRuntime?: unknown;
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
