import type {
  AgentKind,
  AgentState,
  ClassroomPhase,
  ClassroomRuntime,
  CommunicationActivation,
  CommunicationGraph,
  SimulationChannel,
  SessionEvent,
  SessionMetrics,
  SessionMode,
  Turn,
} from './session';

export interface StudentPersonalitySnapshot {
  id: string;
  name: string;
  kind: AgentKind;
  state: AgentState;
}

export interface StudentPersonalityChange {
  id: string;
  name: string;
  kind: AgentKind;
  previousState: AgentState;
  currentState: AgentState;
  deltas: {
    attentiveness: number;
    behavior: number;
    comprehension: number;
  };
}

export interface SessionCreatedRealtimeEvent {
  type: 'session_created';
  sessionId: string;
  mode: SessionMode;
  channel: SimulationChannel;
  topic: string;
  metrics: SessionMetrics;
  communicationGraph: CommunicationGraph;
  studentStates: StudentPersonalitySnapshot[];
}

export interface TurnProcessedRealtimeEvent {
  type: 'turn_processed';
  sessionId: string;
  mode: SessionMode;
  channel: SimulationChannel;
  topic: string;
  turnId: string;
  transcript: Turn[];
  events: SessionEvent[];
  metrics: SessionMetrics;
  communicationGraph: CommunicationGraph;
  currentTurnActivations: CommunicationActivation[];
  studentStates: StudentPersonalitySnapshot[];
  studentStateChanges: StudentPersonalityChange[];
}

export interface AgentTurnEmittedRealtimeEvent {
  type: 'agent_turn_emitted';
  sessionId: string;
  mode: SessionMode;
  channel: SimulationChannel;
  topic: string;
  requestTurnId: string;
  emittedTurn: Turn;
}

export interface TaskAssignmentRequiredRealtimeEvent {
  type: 'task_assignment_required';
  sessionId: string;
  mode: SessionMode;
  channel: SimulationChannel;
  topic: string;
  lessonTurn: number;
  phase: ClassroomPhase;
  classroomRuntime?: ClassroomRuntime;
}

export type SimulationRealtimeEvent =
  | SessionCreatedRealtimeEvent
  | TurnProcessedRealtimeEvent
  | AgentTurnEmittedRealtimeEvent
  | TaskAssignmentRequiredRealtimeEvent;

export type RealtimeClientCommandType = 'subscribe' | 'unsubscribe' | 'ping';

export interface RealtimeClientCommand {
  type: RealtimeClientCommandType;
  sessionId?: string;
}

export interface WsEnvelope<TType extends string, TPayload> {
  type: TType;
  timestamp: string;
  sessionId?: string;
  payload: TPayload;
}

export interface WsConnectedPayload {
  connectionId: string;
  endpoint: '/socket.io';
}

export interface WsSubscriptionPayload {
  sessionId: string;
}

export interface WsTurnPayload {
  turnId: string;
  transcript: Turn[];
  events: SessionEvent[];
  metrics: SessionMetrics;
}

export interface WsGraphPayload {
  turnId: string;
  communicationGraph: CommunicationGraph;
  currentTurnActivations: CommunicationActivation[];
}

export interface WsStudentStatesPayload {
  turnId: string;
  studentStates: StudentPersonalitySnapshot[];
  studentStateChanges: StudentPersonalityChange[];
}

export interface WsErrorPayload {
  message: string;
}
