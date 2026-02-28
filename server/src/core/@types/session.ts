export type SessionMode = 'classroom' | 'debate';
export type SimulationChannel = 'supervised' | 'unsupervised';

export type AgentKind =
  | 'Teacher'
  | 'ADHD'
  | 'Autistic'
  | 'Typical';

export type StudentProfile = Exclude<AgentKind, 'Teacher'>;

export type TurnRole = 'teacher' | 'user' | 'agent' | 'system';
export type ClassroomPhase = 'lecture' | 'practice' | 'review';
export type AssignmentAuthority = 'teacher_agent' | 'supervisor_user';
export type TaskWorkMode = 'individual' | 'pair' | 'group';

export type SessionEventType =
  | 'session_created'
  | 'turn_received'
  | 'agent_started'
  | 'agent_token'
  | 'agent_done'
  | 'score_update'
  | 'safety_notice'
  | 'graph_edge_activated'
  | 'supervisor_hint_received'
  | 'supervisor_hint_applied'
  | 'task_assignment_required'
  | 'task_assignment_submitted'
  | 'task_review_completed'
  | 'interactive_board_mode_changed';

export type CommunicationNodeKind =
  | 'teacher'
  | 'student'
  | 'user'
  | 'system';

export type RelationshipQuality = 'good' | 'neutral' | 'bad';

export type InteractionType =
  | 'teacher_broadcast'
  | 'teacher_to_student'
  | 'student_to_teacher'
  | 'student_to_student'
  | 'user_to_teacher'
  | 'teacher_to_user';

export interface StudentRelationshipOverride {
  fromStudentId: string;
  toStudentId: string;
  relationship: RelationshipQuality;
}

export interface CommunicationNode {
  id: string;
  label: string;
  kind: CommunicationNodeKind;
}

export interface CommunicationEdge {
  id: string;
  from: string;
  to: string;
  relationship: RelationshipQuality;
  weight: number;
  interactionTypes: InteractionType[];
  currentTurnActive: boolean;
  activationCount: number;
  lastActivatedAt?: string;
  lastInteractionType?: InteractionType;
  metadata?: Record<string, unknown>;
}

export interface CommunicationActivation {
  id: string;
  turnId: string;
  edgeId: string;
  from: string;
  to: string;
  interactionType: InteractionType;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface CommunicationGraph {
  nodes: CommunicationNode[];
  edges: CommunicationEdge[];
  activations: CommunicationActivation[];
  currentTurnActivations: CommunicationActivation[];
}

export interface ClassroomModeConfig {
  minResponders?: number;
  maxResponders?: number;
  relationshipOverrides?: StudentRelationshipOverride[];
}

export interface DebateModeConfig {
  rubricWeights?: Partial<
    Record<'argumentStrength' | 'evidenceUse' | 'clarity' | 'rebuttal', number>
  >;
}

export interface SessionConfig {
  classroom?: ClassroomModeConfig;
  debate?: DebateModeConfig;
}

export interface TaskGroup {
  id: string;
  studentIds: string[];
}

export interface TaskAssignment {
  mode: TaskWorkMode;
  groups: TaskGroup[];
  assignedBy: AssignmentAuthority;
  assignedAt: string;
  lessonTurn: number;
}

export interface ClassroomClarificationThread {
  studentId: string;
  studentName: string;
  question: string;
  askedTurnId: string;
  askedAt: string;
  teacherResponseCount: number;
  requiredResponseCount: number;
}

export interface ClassroomRuntime {
  lessonTurn: number;
  phase: ClassroomPhase;
  paused: boolean;
  pendingTaskAssignment: boolean;
  interactiveBoardActive: boolean;
  activeTaskAssignment?: TaskAssignment;
  activeClarification?: ClassroomClarificationThread;
  lastClarifiedQuestionTurnId?: string;
  lastReviewTurn?: number;
}

export interface AgentState {
  attentiveness: number;
  behavior: number;
  comprehension: number;
  profile: AgentKind;
}

export interface AgentProfile {
  id: string;
  kind: AgentKind;
  name: string;
  state: AgentState;
}

export interface Turn {
  id: string;
  sessionId: string;
  role: TurnRole;
  agentId?: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  turnId?: string;
  type: SessionEventType;
  agentId?: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface DebateRubric {
  argumentStrength: number;
  evidenceUse: number;
  clarity: number;
  rebuttal: number;
  overall: number;
  feedback: string;
}

export interface SessionMetrics {
  engagement: number;
  clarity: number;
  misconceptionsDetected: number;
  turnCount: number;
  studentStateAverages?: {
    attentiveness: number;
    behavior: number;
    comprehension: number;
  };
  rubric?: DebateRubric;
}

export interface Session {
  id: string;
  mode: SessionMode;
  channel: SimulationChannel;
  topic: string;
  config: SessionConfig;
  agents: AgentProfile[];
  communicationGraph: CommunicationGraph;
  classroomRuntime?: ClassroomRuntime;
  turns: Turn[];
  events: SessionEvent[];
  metrics: SessionMetrics;
  createdAt: string;
  updatedAt: string;
}
