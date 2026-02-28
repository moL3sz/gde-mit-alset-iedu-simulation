import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import type { ClassroomStudent, CommunicationBubble } from "../components/ClassroomMockup";

type SimulationChannel = "supervised" | "unsupervised";

type GraphNode = {
  id: string;
  label: string;
  kind: string;
};

type GraphEdge = {
  id: string;
  from: string;
  to: string;
  relationship?: string;
  weight?: number;
  interactionTypes?: string[];
  currentTurnActive?: boolean;
  lastInteractionType?: string;
};

export type SimulationGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  currentTurnActivations?: CommunicationActivation[];
};

type CommunicationActivation = {
  id?: string;
  createdAt?: string;
  from: string;
  to: string;
  interactionType: string;
  payload?: Record<string, unknown>;
};

type GraphPayload = {
  turnId?: string;
  communicationGraph: SimulationGraph;
  currentTurnActivations: CommunicationActivation[];
};

type StudentStateSnapshot = {
  attentiveness?: number;
  behavior?: number;
  comprehension?: number;
  profile?: string;
  liveAction?: {
    code?: string;
    kind?: "on_task" | "off_task";
    label?: string;
    severity?: "success" | "info" | "warning";
    at?: string;
  };
  distractionStreak?: number;
};

type StudentSnapshot = {
  id: string;
  name: string;
  kind: string;
  state: StudentStateSnapshot;
};

type StudentStatesPayload = {
  turnId?: string;
  studentStates?: StudentSnapshot[];
  classroomRuntime?: {
    interactiveBoardActive?: boolean;
    completed?: boolean;
    simulatedElapsedSeconds?: number;
    simulatedTotalSeconds?: number;
  };
};

type EmittedTurnPayload = {
  id: string;
  role: string;
  agentId?: string;
  content: string;
  metadata?: Record<string, unknown>;
};

type AgentTurnEmittedPayload = {
  requestTurnId: string;
  emittedTurn: EmittedTurnPayload;
};

type SupervisorHintPayload = {
  sessionId: string;
  hintText: string;
  createdAt: string;
};

export type TaskWorkMode = "individual" | "pair" | "group";

export type TaskGroup = {
  id: string;
  studentIds: string[];
};

export type TaskAssignmentRequiredPayload = {
  lessonTurn: number;
  phase: "practice";
};

export type SubmitTaskAssignmentInput = {
  mode: TaskWorkMode;
  groups?: TaskGroup[];
  autonomousGrouping?: boolean;
};

type WsEnvelope<TPayload> = {
  sessionId?: string;
  payload: TPayload;
};

type UseSimulationChannelInput = {
  channel: SimulationChannel;
  socket: Socket | null;
  topic: string;
  forcedPause?: boolean;
};

type UseSimulationChannelResult = {
  sessionId: string | null;
  students: ClassroomStudent[];
  studentNodeIds: string[];
  nodeBubbles: CommunicationBubble[];
  interactiveBoardActive: boolean;
  simulationElapsedSeconds: number;
  simulationTotalSeconds: number;
  isSessionCompleted: boolean;
  isSocketConnected: boolean;
  lastError: string | null;
  isPausedForTaskAssignment: boolean;
  taskAssignmentRequired: TaskAssignmentRequiredPayload | null;
  submitTaskAssignment: (input: SubmitTaskAssignmentInput) => Promise<boolean>;
  sendSupervisorHint: (hintText: string) => boolean;
  graph: SimulationGraph | null;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
const CLASSROOM_ID_STORAGE_KEY = "classroomId";
const START_STORAGE_KEY = "startSetup";
const BUBBLE_SWEEP_MS = 600;
const MAX_BUBBLES_PER_NODE = 4;
const DEFAULT_BUBBLE_TTL_MS = 3000;
const STUDENT_BUBBLE_TTL_MS = 4000;
const TEACHER_BUBBLE_TTL_MS = 6000;
const SUPERVISOR_BUBBLE_TTL_MS = 14000;
const DEFAULT_SIMULATION_TOTAL_SECONDS = 45 * 60;

const getClassroomIdFromStorage = (): number | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  const raw = window.localStorage.getItem(CLASSROOM_ID_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }

  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return undefined;
  }

  return numeric;
};

const getPeriodFromStorage = (): number | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  const raw = window.localStorage.getItem(START_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as { period?: number };
    const period = parsed?.period;
    if (typeof period !== "number" || !Number.isInteger(period) || period <= 0) {
      return undefined;
    }

    return period;
  } catch {
    return undefined;
  }
};

const toActionLabel = (value: string): string =>
  value
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");

const toShortText = (value: string, maxLength = 260): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;

const parseIsoTimestamp = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildAutomaticTurnMessage = (channel: SimulationChannel, topic: string): string => {
  if (channel === "supervised") {
    return `Continue the ${topic} lesson in real-time pacing: teach clearly, ask one quick check-for-understanding question, and keep pacing moderate.`;
  }

  return `Continue the ${topic} lesson autonomously in real-time pacing: adapt explanation based on student state signals, then choose one concrete adjustment.`;
};

const getPayloadText = (payload: Record<string, unknown> | undefined, fallback: string): string => {
  if (!payload) {
    return fallback;
  }

  const text = payload["text"];
  if (typeof text === "string" && text.trim().length > 0) {
    return text.trim();
  }

  return fallback;
};

const getPayloadActionType = (
  payload: Record<string, unknown> | undefined,
  fallback: string,
): string => {
  if (!payload) {
    return fallback;
  }

  const actionType = payload["actionType"];
  if (typeof actionType === "string" && actionType.trim().length > 0) {
    return actionType.trim();
  }

  return fallback;
};

const toBubbleAnchorNodeId = (activation: CommunicationActivation): string => {
  switch (activation.interactionType) {
    case "teacher_broadcast":
    case "teacher_to_student":
    case "student_to_teacher":
    case "student_to_student":
    case "teacher_to_user":
    case "user_to_teacher":
      return activation.from;
    default:
      return activation.from;
  }
};

const getInteractionPriority = (interactionType: string): number => {
  switch (interactionType) {
    case "teacher_to_student":
      return 5;
    case "teacher_broadcast":
      return 4;
    case "student_to_teacher":
      return 4;
    case "teacher_to_user":
      return 4;
    case "student_to_student":
      return 3;
    case "user_to_teacher":
      return 2;
    default:
      return 1;
  }
};

const buildBubblesFromActivations = (
  activations: CommunicationActivation[],
  turnId: string | undefined,
): CommunicationBubble[] => {
  const byNode = new Map<string, CommunicationBubble & { priority: number }>();

  for (const [index, activation] of activations.entries()) {
    const anchorNodeId = toBubbleAnchorNodeId(activation);
    const actionType = getPayloadActionType(activation.payload, activation.interactionType);
    const text = getPayloadText(activation.payload, `Action: ${toActionLabel(actionType)}`);
    const priority = getInteractionPriority(activation.interactionType);
    const existing = byNode.get(anchorNodeId);
    const messageId =
      activation.id ??
      activation.createdAt ??
      `${turnId ?? "turn"}:${anchorNodeId}:${activation.interactionType}:${index}`;

    if (existing && existing.priority > priority) {
      continue;
    }

    byNode.set(anchorNodeId, {
      nodeId: anchorNodeId,
      fromNodeId: activation.from,
      actionType,
      text: toShortText(text),
      messageId,
      createdAt: parseIsoTimestamp(activation.createdAt) ?? Date.now(),
      priority,
    });
  }

  return Array.from(byNode.values()).map((value) => ({
    nodeId: value.nodeId,
    fromNodeId: value.fromNodeId,
    actionType: value.actionType,
    text: value.text,
    messageId: value.messageId,
    createdAt: value.createdAt,
  }));
};

const buildBubbleFromEmittedTurn = (
  emittedTurn: EmittedTurnPayload,
): CommunicationBubble | null => {
  const speechSecondsRaw = emittedTurn.metadata?.["speechSeconds"];
  const speechSeconds =
    typeof speechSecondsRaw === "number" && Number.isFinite(speechSecondsRaw)
      ? speechSecondsRaw
      : undefined;

  if (emittedTurn.role === "teacher") {
    return {
      nodeId: "teacher",
      fromNodeId: "teacher",
      actionType: "teacher_to_student",
      text: toShortText(emittedTurn.content),
      messageId: emittedTurn.id,
      speechSeconds,
      createdAt: Date.now(),
    };
  }

  if (emittedTurn.role === "agent" && emittedTurn.agentId) {
    return {
      nodeId: emittedTurn.agentId,
      fromNodeId: emittedTurn.agentId,
      actionType: "student_to_teacher",
      text: toShortText(emittedTurn.content),
      messageId: emittedTurn.id,
      speechSeconds,
      createdAt: Date.now(),
    };
  }

  return null;
};

const resolveBubbleTtl = (bubble: CommunicationBubble): number => {
  if (bubble.actionType === "supervisor_hint") {
    return SUPERVISOR_BUBBLE_TTL_MS;
  }

  if (bubble.nodeId === "teacher") {
    return TEACHER_BUBBLE_TTL_MS;
  }

  if (bubble.actionType === "student_to_student" || bubble.actionType === "student_to_teacher") {
    return STUDENT_BUBBLE_TTL_MS;
  }

  return DEFAULT_BUBBLE_TTL_MS;
};

const withLifecycle = (bubble: CommunicationBubble, now: number): CommunicationBubble => {
  const createdAt = bubble.createdAt ?? now;
  const expiresAt = bubble.expiresAt ?? createdAt + resolveBubbleTtl(bubble);

  return {
    ...bubble,
    createdAt,
    expiresAt,
  };
};

const pruneExpiredBubbles = (bubbles: CommunicationBubble[], now: number): CommunicationBubble[] => {
  return bubbles.filter((bubble) => (bubble.expiresAt ?? now + DEFAULT_BUBBLE_TTL_MS) > now);
};

const enforceNodeStackLimit = (bubbles: CommunicationBubble[]): CommunicationBubble[] => {
  const byNode = new Map<string, CommunicationBubble[]>();

  for (const bubble of bubbles) {
    const bucket = byNode.get(bubble.nodeId) ?? [];
    bucket.push(bubble);
    byNode.set(bubble.nodeId, bucket);
  }

  const next: CommunicationBubble[] = [];
  for (const bucket of byNode.values()) {
    bucket
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
      .slice(0, MAX_BUBBLES_PER_NODE)
      .forEach((bubble) => next.push(bubble));
  }

  return next.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
};

const appendBubbleStack = (
  previous: CommunicationBubble[],
  incoming: CommunicationBubble[],
): CommunicationBubble[] => {
  if (incoming.length === 0) {
    return previous;
  }

  const now = Date.now();
  const active = pruneExpiredBubbles(previous, now);
  const normalizeBubbleText = (value: string): string =>
    value.replace(/\s+/g, " ").trim().toLowerCase();
  const dedupedActiveByText = [...active]
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
    .filter((bubble, index, all) => {
      const normalized = normalizeBubbleText(bubble.text);
      return (
        all.findIndex(
          (candidate) => normalizeBubbleText(candidate.text) === normalized,
        ) === index
      );
    });
  const knownIds = new Set(dedupedActiveByText.map((bubble) => bubble.messageId));
  const knownTexts = new Set(
    dedupedActiveByText.map((bubble) => normalizeBubbleText(bubble.text)),
  );
  const merged = [...dedupedActiveByText];
  let hasNewBubble = false;

  const isTeacherBroadcastLike = (actionType: string): boolean =>
    actionType === "teacher_broadcast" || actionType === "teacher_to_student";

  const isNearDuplicate = (
    existing: CommunicationBubble,
    candidate: CommunicationBubble,
  ): boolean => {
    if (existing.nodeId !== candidate.nodeId) {
      return false;
    }

    if (existing.text !== candidate.text) {
      return false;
    }

    const teacherBroadcastDuplicate =
      isTeacherBroadcastLike(existing.actionType) &&
      isTeacherBroadcastLike(candidate.actionType);
    const studentToTeacherDuplicate =
      existing.actionType === "student_to_teacher" &&
      candidate.actionType === "student_to_teacher";

    if (!teacherBroadcastDuplicate && !studentToTeacherDuplicate) {
      return false;
    }

    const existingCreatedAt = existing.createdAt ?? now;
    const candidateCreatedAt = candidate.createdAt ?? now;
    const duplicateWindowMs = teacherBroadcastDuplicate ? 6000 : 5000;
    return Math.abs(existingCreatedAt - candidateCreatedAt) <= duplicateWindowMs;
  };

  for (const bubble of incoming) {
    if (knownIds.has(bubble.messageId)) {
      continue;
    }

    const normalizedIncomingText = normalizeBubbleText(bubble.text);
    if (knownTexts.has(normalizedIncomingText)) {
      if (typeof bubble.speechSeconds === "number") {
        const existingIndex = merged.findIndex(
          (candidate) =>
            normalizeBubbleText(candidate.text) === normalizedIncomingText &&
            candidate.nodeId === bubble.nodeId,
        );
        if (existingIndex >= 0) {
          const existing = merged[existingIndex];
          if (existing && typeof existing.speechSeconds !== "number") {
            merged[existingIndex] = {
              ...existing,
              speechSeconds: bubble.speechSeconds,
            };
            hasNewBubble = true;
          }
        }
      }
      continue;
    }

    const duplicateBubble = merged.some((existing) => isNearDuplicate(existing, bubble));
    if (duplicateBubble) {
      continue;
    }

    merged.push(withLifecycle(bubble, now));
    knownIds.add(bubble.messageId);
    knownTexts.add(normalizedIncomingText);
    hasNewBubble = true;
  }

  if (!hasNewBubble && dedupedActiveByText.length === previous.length) {
    return previous;
  }

  return enforceNodeStackLimit(merged);
};

export const useSimulationChannel = ({
  channel,
  socket,
  topic,
  forcedPause = false,
}: UseSimulationChannelInput): UseSimulationChannelResult => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [students, setStudents] = useState<ClassroomStudent[]>([]);
  const [studentNodeIds, setStudentNodeIds] = useState<string[]>([]);
  const [nodeBubbles, setNodeBubbles] = useState<CommunicationBubble[]>([]);
  const [interactiveBoardActive, setInteractiveBoardActive] = useState(false);
  const [simulationElapsedSeconds, setSimulationElapsedSeconds] = useState(0);
  const [simulationTotalSeconds, setSimulationTotalSeconds] = useState(
    DEFAULT_SIMULATION_TOTAL_SECONDS,
  );
  const [isSessionCompleted, setIsSessionCompleted] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isPausedForTaskAssignment, setIsPausedForTaskAssignment] = useState(false);
  const [taskAssignmentRequired, setTaskAssignmentRequired] =
    useState<TaskAssignmentRequiredPayload | null>(null);
  const isEffectivelyPaused = isPausedForTaskAssignment || forcedPause;

  const [graph, setGraph] = useState<SimulationGraph | null>(null);

  const creatingSessionRef = useRef(false);
  const turnInFlightRef = useRef(false);
  const studentNodeIdsRef = useRef<string[]>([]);
  const studentSnapshotByNodeIdRef = useRef<Record<string, ClassroomStudent>>({});
  const processedTimedTurnIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    processedTimedTurnIdsRef.current = new Set();
    setSimulationElapsedSeconds(0);
    setSimulationTotalSeconds(DEFAULT_SIMULATION_TOTAL_SECONDS);
    setIsSessionCompleted(false);
  }, [sessionId]);

  useEffect(() => {
    if (!socket || creatingSessionRef.current || sessionId) {
      return;
    }

    creatingSessionRef.current = true;
    let cancelled = false;

    const createSession = async () => {
      try {
        const classroomId = getClassroomIdFromStorage();
        const period = getPeriodFromStorage();

        const response = await fetch(`${API_BASE_URL}/sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "classroom",
            channel,
            topic,
            ...(typeof period === "number" ? { period } : {}),
            ...(typeof classroomId === "number" ? { classroomId } : {}),
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create ${channel} session (${response.status}).`);
        }

        const payload = (await response.json()) as { sessionId?: string };
        if (!payload.sessionId) {
          throw new Error("Session creation response did not include sessionId.");
        }

        if (!cancelled) {
          setSessionId(payload.sessionId);
          socket.emit("subscribe", { sessionId: payload.sessionId });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : "Failed to create simulation session.");
        }
      } finally {
        creatingSessionRef.current = false;
      }
    };

    void createSession();

    return () => {
      cancelled = true;
    };
  }, [channel, sessionId, socket, topic]);

  useEffect(() => {
    if (!socket || !sessionId) {
      return;
    }

    const handleConnect = () => {
      socket.emit("subscribe", { sessionId });
    };

    socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
    };
  }, [sessionId, socket]);

  useEffect(() => {
    if (!socket || !sessionId) {
      return;
    }

    const handleGraphUpdated = (envelope: WsEnvelope<GraphPayload>) => {
      if (envelope.sessionId !== sessionId) {
        return;
      }

      const nodes = envelope.payload.communicationGraph.nodes;
      const studentNodes = nodes.filter((node) => node.kind === "student");
      const nextStudentNodeIds = studentNodes.map((node) => node.id);
      studentNodeIdsRef.current = nextStudentNodeIds;

      setGraph({
        ...envelope.payload.communicationGraph,
        currentTurnActivations: envelope.payload.currentTurnActivations,
      });
      setStudents(
        studentNodes.map((node) => ({
          name: studentSnapshotByNodeIdRef.current[node.id]?.name ?? node.label,
          profile: studentSnapshotByNodeIdRef.current[node.id]?.profile,
          attentiveness: studentSnapshotByNodeIdRef.current[node.id]?.attentiveness,
          behavior: studentSnapshotByNodeIdRef.current[node.id]?.behavior,
          comprehension: studentSnapshotByNodeIdRef.current[node.id]?.comprehension,
          liveActionLabel: studentSnapshotByNodeIdRef.current[node.id]?.liveActionLabel,
          liveActionKind: studentSnapshotByNodeIdRef.current[node.id]?.liveActionKind,
          liveActionSeverity: studentSnapshotByNodeIdRef.current[node.id]?.liveActionSeverity,
        })),
      );
      setStudentNodeIds(nextStudentNodeIds);
      setNodeBubbles((previous) => {
        return appendBubbleStack(
          previous,
          buildBubblesFromActivations(
            envelope.payload.currentTurnActivations,
            envelope.payload.turnId,
          ),
        );
      });
    };

    const handleStudentStatesUpdated = (envelope: WsEnvelope<StudentStatesPayload>) => {
      if (envelope.sessionId !== sessionId) {
        return;
      }

      const boardActive = envelope.payload.classroomRuntime?.interactiveBoardActive;
      if (typeof boardActive === "boolean") {
        setInteractiveBoardActive(boardActive);
      }
      const runtimeElapsed = envelope.payload.classroomRuntime?.simulatedElapsedSeconds;
      if (typeof runtimeElapsed === "number" && Number.isFinite(runtimeElapsed)) {
        setSimulationElapsedSeconds((previous) => Math.max(previous, Math.max(0, runtimeElapsed)));
      }
      const runtimeTotal = envelope.payload.classroomRuntime?.simulatedTotalSeconds;
      if (typeof runtimeTotal === "number" && Number.isFinite(runtimeTotal) && runtimeTotal > 0) {
        setSimulationTotalSeconds(runtimeTotal);
      }
      const runtimeCompleted = envelope.payload.classroomRuntime?.completed;
      if (typeof runtimeCompleted === "boolean") {
        setIsSessionCompleted(runtimeCompleted);
      }

      const studentStates = envelope.payload.studentStates ?? [];

      for (const studentState of studentStates) {
        studentSnapshotByNodeIdRef.current[studentState.id] = {
          name: studentState.name,
          profile: studentState.state.profile,
          attentiveness: studentState.state.attentiveness,
          behavior: studentState.state.behavior,
          comprehension: studentState.state.comprehension,
          liveActionLabel: studentState.state.liveAction?.label,
          liveActionKind: studentState.state.liveAction?.kind,
          liveActionSeverity: studentState.state.liveAction?.severity,
        };
      }

      const orderedNodeIds = studentNodeIdsRef.current;
      if (orderedNodeIds.length === 0) {
        return;
      }

      setStudents((previous) =>
        orderedNodeIds.map((nodeId, index) => {
          const snapshot = studentSnapshotByNodeIdRef.current[nodeId];
          return {
            name: snapshot?.name ?? previous[index]?.name,
            profile: snapshot?.profile ?? previous[index]?.profile,
            attentiveness: snapshot?.attentiveness ?? previous[index]?.attentiveness,
            behavior: snapshot?.behavior ?? previous[index]?.behavior,
            comprehension: snapshot?.comprehension ?? previous[index]?.comprehension,
            liveActionLabel: snapshot?.liveActionLabel ?? previous[index]?.liveActionLabel,
            liveActionKind: snapshot?.liveActionKind ?? previous[index]?.liveActionKind,
            liveActionSeverity:
              snapshot?.liveActionSeverity ?? previous[index]?.liveActionSeverity,
          };
        }),
      );

    };

    const handleSupervisorHint = (envelope: WsEnvelope<SupervisorHintPayload>) => {
      if (envelope.sessionId !== sessionId) {
        return;
      }

      setNodeBubbles((previous) => {
        return appendBubbleStack(previous, [
          {
            nodeId: "teacher",
            fromNodeId: "supervisor",
            actionType: "supervisor_hint",
            text: toShortText(envelope.payload.hintText),
            messageId: envelope.payload.createdAt || `hint:${Date.now()}`,
            createdAt: parseIsoTimestamp(envelope.payload.createdAt) ?? Date.now(),
          },
        ]);
      });
    };

    const handleAgentTurnEmitted = (envelope: WsEnvelope<AgentTurnEmittedPayload>) => {
      if (envelope.sessionId !== sessionId) {
        return;
      }

      const emittedTurn = envelope.payload.emittedTurn;
      const shouldTrackElapsed =
        (emittedTurn.role === "teacher" || emittedTurn.role === "agent") &&
        typeof emittedTurn.id === "string" &&
        emittedTurn.id.length > 0 &&
        !processedTimedTurnIdsRef.current.has(emittedTurn.id);

      if (shouldTrackElapsed) {
        processedTimedTurnIdsRef.current.add(emittedTurn.id);
        const speechSecondsRaw = emittedTurn.metadata?.["speechSeconds"];
        const speechSecondsNumeric =
          typeof speechSecondsRaw === "number"
            ? speechSecondsRaw
            : Number(speechSecondsRaw);
        const speechSeconds = Number.isFinite(speechSecondsNumeric)
          ? Math.max(0, speechSecondsNumeric)
          : 0;

        if (speechSeconds > 0) {
          setSimulationElapsedSeconds((previous) =>
            Number((previous + speechSeconds).toFixed(2)),
          );
        }
      }

      const bubble = buildBubbleFromEmittedTurn(emittedTurn);
      if (!bubble) {
        return;
      }

      setNodeBubbles((previous) => {
        return appendBubbleStack(previous, [bubble]);
      });
    };

    const handleTaskAssignmentRequired = (
      envelope: WsEnvelope<TaskAssignmentRequiredPayload>,
    ) => {
      if (envelope.sessionId !== sessionId) {
        return;
      }

      setTaskAssignmentRequired(envelope.payload);
      setIsPausedForTaskAssignment(true);
    };

    const handleSystemError = (envelope: WsEnvelope<{ message?: string }>) => {
      const message = envelope.payload?.message;
      if (typeof message === "string" && message.trim().length > 0) {
        setLastError(message);
      }
    };

    socket.on("simulation.graph_updated", handleGraphUpdated);
    socket.on("simulation.student_states_updated", handleStudentStatesUpdated);
    socket.on("simulation.agent_turn_emitted", handleAgentTurnEmitted);
    socket.on("simulation.task_assignment_required", handleTaskAssignmentRequired);
    socket.on("simulation.supervisor_hint", handleSupervisorHint);
    socket.on("system.error", handleSystemError);

    return () => {
      socket.off("simulation.graph_updated", handleGraphUpdated);
      socket.off("simulation.student_states_updated", handleStudentStatesUpdated);
      socket.off("simulation.agent_turn_emitted", handleAgentTurnEmitted);
      socket.off("simulation.task_assignment_required", handleTaskAssignmentRequired);
      socket.off("simulation.supervisor_hint", handleSupervisorHint);
      socket.off("system.error", handleSystemError);
    };
  }, [sessionId, socket]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setNodeBubbles((previous) => {
        const next = pruneExpiredBubbles(previous, now);
        if (next.length === previous.length) {
          return previous;
        }

        return next;
      });
    }, BUBBLE_SWEEP_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let cancelled = false;

    const postTurn = async () => {
      if (turnInFlightRef.current) {
        return;
      }

      if (isEffectivelyPaused) {
        return;
      }

      if (isSessionCompleted) {
        return;
      }

      turnInFlightRef.current = true;
      try {
        const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/turn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            teacherOrUserMessage: buildAutomaticTurnMessage(channel, topic),
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to process turn (${response.status}).`);
        }

        if (!cancelled) {
          setLastError(null);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : "Failed to process simulation turn.");
        }
      } finally {
        turnInFlightRef.current = false;
      }
    };

    void postTurn();
    const intervalId = window.setInterval(
      () => {
        void postTurn();
      },
      channel === "supervised" ? 9000 : 8000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [channel, isEffectivelyPaused, isSessionCompleted, sessionId, topic]);

  const sendSupervisorHint = useCallback(
    (hintText: string): boolean => {
      const cleanedHint = hintText.trim();

      if (channel !== "supervised" || !socket || !sessionId || !cleanedHint) {
        return false;
      }

      socket.emit("supervisor.whisper", {
        sessionId,
        hintText: cleanedHint,
      });

      setNodeBubbles((previous) => {
        return appendBubbleStack(previous, [
          {
            nodeId: "teacher",
            fromNodeId: "supervisor",
            actionType: "supervisor_hint",
            text: toShortText(cleanedHint),
            messageId: `hint-local:${Date.now()}`,
            createdAt: Date.now(),
          },
        ]);
      });

      return true;
    },
    [channel, sessionId, socket],
  );

  const submitTaskAssignment = useCallback(
    async (input: SubmitTaskAssignmentInput): Promise<boolean> => {
      if (!sessionId) {
        return false;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/task-assignment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          throw new Error(`Failed to submit task assignment (${response.status}).`);
        }

        setIsPausedForTaskAssignment(false);
        setTaskAssignmentRequired(null);
        setLastError(null);
        return true;
      } catch (error: unknown) {
        setLastError(
          error instanceof Error ? error.message : "Failed to submit task assignment.",
        );
        return false;
      }
    },
    [sessionId],
  );

  return useMemo(
    () => ({
      sessionId,
      students,
      studentNodeIds,
      nodeBubbles,
      interactiveBoardActive,
      simulationElapsedSeconds,
      simulationTotalSeconds,
      isSessionCompleted,
      isSocketConnected: Boolean(socket?.connected),
      lastError,
      isPausedForTaskAssignment: isEffectivelyPaused,
      taskAssignmentRequired,
      submitTaskAssignment,
      sendSupervisorHint,
      graph
    }),
    [
      isEffectivelyPaused,
      interactiveBoardActive,
      lastError,
      nodeBubbles,
      sendSupervisorHint,
      sessionId,
      simulationElapsedSeconds,
      simulationTotalSeconds,
      isSessionCompleted,
      socket?.connected,
      studentNodeIds,
      students,
      submitTaskAssignment,
      taskAssignmentRequired,
      graph
    ],
  );
};
