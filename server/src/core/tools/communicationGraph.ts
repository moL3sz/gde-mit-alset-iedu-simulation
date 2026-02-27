import { randomUUID } from 'node:crypto';

import type {
  AgentKind,
  AgentProfile,
  CommunicationActivation,
  CommunicationEdge,
  CommunicationGraph,
  CommunicationNode,
  InteractionType,
  RelationshipQuality,
  SessionConfig,
  SessionMode,
  StudentRelationshipOverride,
} from '../@types';

const RELATIONSHIP_WEIGHTS: Record<RelationshipQuality, number> = {
  good: 0.85,
  neutral: 0.55,
  bad: 0.25,
};

const nowIso = (): string => new Date().toISOString();

const TEACHER_NODE_ID = 'teacher';
const USER_NODE_ID = 'user';

const toEdgeId = (from: string, to: string): string => `edge_${from}__${to}`;

const isStudentKind = (kind: AgentKind): boolean => kind.startsWith('student_');

const createNode = (
  id: string,
  label: string,
  kind: CommunicationNode['kind'],
): CommunicationNode => ({
  id,
  label,
  kind,
});

const createEdge = (
  from: string,
  to: string,
  relationship: RelationshipQuality,
  metadata?: Record<string, unknown>,
): CommunicationEdge => ({
  id: toEdgeId(from, to),
  from,
  to,
  relationship,
  weight: RELATIONSHIP_WEIGHTS[relationship],
  interactionTypes: [],
  currentTurnActive: false,
  activationCount: 0,
  metadata,
});

const applyEdgeRelationship = (
  edge: CommunicationEdge,
  relationship: RelationshipQuality,
  metadata?: Record<string, unknown>,
): void => {
  edge.relationship = relationship;
  edge.weight = RELATIONSHIP_WEIGHTS[relationship];

  if (metadata) {
    edge.metadata = {
      ...(edge.metadata ?? {}),
      ...metadata,
    };
  }
};

const buildStudentRelationship = (
  kindA: AgentKind,
  kindB: AgentKind,
): { quality: RelationshipQuality; reason: string } => {
  const sortedPair = [kindA, kindB].sort().join('|');

  if (sortedPair === 'student_esl|student_fast') {
    return {
      quality: 'good',
      reason: 'Mentoring-compatible dynamic between fast learner and ESL student.',
    };
  }

  if (sortedPair === 'student_emotional|student_esl') {
    return {
      quality: 'good',
      reason: 'Both benefit from supportive and structured communication.',
    };
  }

  if (sortedPair === 'student_distracted|student_fast') {
    return {
      quality: 'bad',
      reason: 'Fast pacing can conflict with distracted participation style.',
    };
  }

  if (sortedPair === 'student_distracted|student_emotional') {
    return {
      quality: 'bad',
      reason: 'Anxiety and attention drift can negatively reinforce each other.',
    };
  }

  return {
    quality: 'neutral',
    reason: 'No dominant positive or negative interaction pattern.',
  };
};

const upsertEdge = (
  graph: CommunicationGraph,
  from: string,
  to: string,
  relationship: RelationshipQuality,
  metadata?: Record<string, unknown>,
): CommunicationEdge => {
  const existing = graph.edges.find((edge) => edge.from === from && edge.to === to);

  if (existing) {
    return existing;
  }

  const edge = createEdge(from, to, relationship, metadata);
  graph.edges.push(edge);
  return edge;
};

const applyRelationshipOverrides = (
  graph: CommunicationGraph,
  studentIds: Set<string>,
  overrides?: StudentRelationshipOverride[],
): void => {
  if (!overrides || overrides.length === 0) {
    return;
  }

  for (const override of overrides) {
    if (!studentIds.has(override.fromStudentId) || !studentIds.has(override.toStudentId)) {
      continue;
    }

    if (override.fromStudentId === override.toStudentId) {
      continue;
    }

    const leftEdge = upsertEdge(
      graph,
      override.fromStudentId,
      override.toStudentId,
      override.relationship,
    );
    const rightEdge = upsertEdge(
      graph,
      override.toStudentId,
      override.fromStudentId,
      override.relationship,
    );

    applyEdgeRelationship(leftEdge, override.relationship, {
      channel: 'student_to_student',
      overridden: true,
      reason: 'Configured session relationship override.',
    });
    applyEdgeRelationship(rightEdge, override.relationship, {
      channel: 'student_to_student',
      overridden: true,
      reason: 'Configured session relationship override.',
    });
  }
};

const buildClassroomGraph = (
  agents: AgentProfile[],
  classroomConfig?: SessionConfig['classroom'],
): CommunicationGraph => {
  const teacher = agents.find((agent) => agent.kind === 'teacher');
  const students = agents.filter((agent) => isStudentKind(agent.kind));

  const graph: CommunicationGraph = {
    nodes: [createNode(TEACHER_NODE_ID, teacher?.name ?? 'Teacher', 'teacher')],
    edges: [],
    activations: [],
    currentTurnActivations: [],
  };

  for (const student of students) {
    graph.nodes.push(createNode(student.id, student.name, 'student'));
  }

  for (const student of students) {
    upsertEdge(graph, TEACHER_NODE_ID, student.id, 'neutral', {
      channel: 'teacher_to_student',
    });
    upsertEdge(graph, student.id, TEACHER_NODE_ID, 'neutral', {
      channel: 'student_to_teacher',
    });
  }

  for (let index = 0; index < students.length; index += 1) {
    for (let nested = index + 1; nested < students.length; nested += 1) {
      const left = students[index];
      const right = students[nested];

      if (!left || !right) {
        continue;
      }

      const relationship = buildStudentRelationship(left.kind, right.kind);

      upsertEdge(graph, left.id, right.id, relationship.quality, {
        channel: 'student_to_student',
        reason: relationship.reason,
      });
      upsertEdge(graph, right.id, left.id, relationship.quality, {
        channel: 'student_to_student',
        reason: relationship.reason,
      });
    }
  }

  applyRelationshipOverrides(
    graph,
    new Set(students.map((student) => student.id)),
    classroomConfig?.relationshipOverrides,
  );

  return graph;
};

const buildDebateGraph = (agents: AgentProfile[]): CommunicationGraph => {
  const teacher = agents.find((agent) => agent.kind === 'teacher');
  const graph: CommunicationGraph = {
    nodes: [
      createNode(USER_NODE_ID, 'User', 'user'),
      createNode(TEACHER_NODE_ID, teacher?.name ?? 'Teacher', 'teacher'),
    ],
    edges: [],
    activations: [],
    currentTurnActivations: [],
  };

  upsertEdge(graph, USER_NODE_ID, TEACHER_NODE_ID, 'neutral', {
    channel: 'user_to_teacher',
  });
  upsertEdge(graph, TEACHER_NODE_ID, USER_NODE_ID, 'neutral', {
    channel: 'teacher_to_user',
  });

  return graph;
};

export const createSessionCommunicationGraph = (
  mode: SessionMode,
  agents: AgentProfile[],
  config?: SessionConfig,
): CommunicationGraph => {
  if (mode === 'classroom') {
    return buildClassroomGraph(agents, config?.classroom);
  }

  return buildDebateGraph(agents);
};

export const resetCurrentTurnEdgeActivity = (graph: CommunicationGraph): void => {
  for (const edge of graph.edges) {
    edge.currentTurnActive = false;
  }

  graph.currentTurnActivations = [];
};

export interface ActivateEdgeInput {
  turnId: string;
  from: string;
  to: string;
  interactionType: InteractionType;
  payload?: Record<string, unknown>;
}

export const activateCommunicationEdge = (
  graph: CommunicationGraph,
  input: ActivateEdgeInput,
): CommunicationActivation => {
  const edge = upsertEdge(graph, input.from, input.to, 'neutral');
  const activatedAt = nowIso();

  edge.currentTurnActive = true;
  edge.activationCount += 1;
  edge.lastActivatedAt = activatedAt;
  edge.lastInteractionType = input.interactionType;

  if (!edge.interactionTypes.includes(input.interactionType)) {
    edge.interactionTypes.push(input.interactionType);
  }

  const activation: CommunicationActivation = {
    id: `act_${randomUUID()}`,
    turnId: input.turnId,
    edgeId: edge.id,
    from: input.from,
    to: input.to,
    interactionType: input.interactionType,
    createdAt: activatedAt,
    payload: input.payload,
  };

  graph.currentTurnActivations.push(activation);
  graph.activations.push(activation);

  if (graph.activations.length > 1000) {
    graph.activations.splice(0, graph.activations.length - 1000);
  }

  return activation;
};
