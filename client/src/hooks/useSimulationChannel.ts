import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import type { ClassroomStudent, CommunicationBubble } from "../components/ClassroomMockup";

type SimulationChannel = "supervised" | "unsupervised";

type GraphNode = {
  id: string;
  label: string;
  kind: string;
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
  communicationGraph: {
    nodes: GraphNode[];
  };
  currentTurnActivations: CommunicationActivation[];
};

type EmittedTurnPayload = {
  id: string;
  role: string;
  agentId?: string;
  content: string;
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
  isSocketConnected: boolean;
  lastError: string | null;
  isPausedForTaskAssignment: boolean;
  taskAssignmentRequired: TaskAssignmentRequiredPayload | null;
  submitTaskAssignment: (input: SubmitTaskAssignmentInput) => Promise<boolean>;
  sendSupervisorHint: (hintText: string) => boolean;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

const toActionLabel = (value: string): string =>
  value
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");

const toShortText = (value: string, maxLength = 260): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;

const buildAutomaticTurnMessage = (channel: SimulationChannel, topic: string, step: number): string => {
  if (channel === "supervised") {
    return `Lesson step ${step} on ${topic}: teach clearly, ask one check-for-understanding question, and keep pacing moderate.`;
  }

  return `Autonomous lesson step ${step} on ${topic}: adapt explanation based on student boredom, emotion, and retention, then choose one concrete adjustment.`;
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
      priority,
    });
  }

  return Array.from(byNode.values()).map((value) => ({
    nodeId: value.nodeId,
    fromNodeId: value.fromNodeId,
    actionType: value.actionType,
    text: value.text,
    messageId: value.messageId,
  }));
};

const buildBubbleFromEmittedTurn = (
  emittedTurn: EmittedTurnPayload,
): CommunicationBubble | null => {
  if (emittedTurn.role === "teacher") {
    return {
      nodeId: "teacher",
      fromNodeId: "teacher",
      actionType: "teacher_to_student",
      text: toShortText(emittedTurn.content),
      messageId: emittedTurn.id,
    };
  }

  if (emittedTurn.role === "agent" && emittedTurn.agentId) {
    return {
      nodeId: emittedTurn.agentId,
      fromNodeId: emittedTurn.agentId,
      actionType: "student_to_teacher",
      text: toShortText(emittedTurn.content),
      messageId: emittedTurn.id,
    };
  }

  return null;
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
  const [lastError, setLastError] = useState<string | null>(null);
  const [isPausedForTaskAssignment, setIsPausedForTaskAssignment] = useState(false);
  const [taskAssignmentRequired, setTaskAssignmentRequired] =
    useState<TaskAssignmentRequiredPayload | null>(null);
  const isEffectivelyPaused = isPausedForTaskAssignment || forcedPause;

  const creatingSessionRef = useRef(false);
  const turnInFlightRef = useRef(false);
  const turnStepRef = useRef(0);

  useEffect(() => {
    if (!socket || creatingSessionRef.current || sessionId) {
      return;
    }

    creatingSessionRef.current = true;
    let cancelled = false;

    const createSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "classroom",
            channel,
            topic,
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

      setStudents(
        studentNodes.map((node) => ({
          name: node.label,
          profile: "Agent",
        })),
      );
      setStudentNodeIds(studentNodes.map((node) => node.id));
      setNodeBubbles((previous) => {
        const graphBubbles = buildBubblesFromActivations(
          envelope.payload.currentTurnActivations,
          envelope.payload.turnId,
        );
        const byNode = new Map(graphBubbles.map((bubble) => [bubble.nodeId, bubble]));

        const previousTeacherBubble = previous.find((bubble) => bubble.nodeId === "teacher");
        if (!byNode.has("teacher") && previousTeacherBubble) {
          byNode.set("teacher", previousTeacherBubble);
        }

        return Array.from(byNode.values());
      });
    };

    const handleSupervisorHint = (envelope: WsEnvelope<SupervisorHintPayload>) => {
      if (envelope.sessionId !== sessionId) {
        return;
      }

      setNodeBubbles((previous) => {
        const withoutTeacher = previous.filter((bubble) => bubble.nodeId !== "teacher");

        return [
          {
            nodeId: "teacher",
            fromNodeId: "supervisor",
            actionType: "supervisor_hint",
            text: toShortText(envelope.payload.hintText),
            messageId: envelope.payload.createdAt || `hint:${Date.now()}`,
          },
          ...withoutTeacher,
        ];
      });
    };

    const handleAgentTurnEmitted = (envelope: WsEnvelope<AgentTurnEmittedPayload>) => {
      if (envelope.sessionId !== sessionId) {
        return;
      }

      const bubble = buildBubbleFromEmittedTurn(envelope.payload.emittedTurn);
      if (!bubble) {
        return;
      }

      setNodeBubbles((previous) => {
        const byNode = new Map(previous.map((item) => [item.nodeId, item]));
        byNode.set(bubble.nodeId, bubble);
        return Array.from(byNode.values());
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
    socket.on("simulation.agent_turn_emitted", handleAgentTurnEmitted);
    socket.on("simulation.task_assignment_required", handleTaskAssignmentRequired);
    socket.on("simulation.supervisor_hint", handleSupervisorHint);
    socket.on("system.error", handleSystemError);

    return () => {
      socket.off("simulation.graph_updated", handleGraphUpdated);
      socket.off("simulation.agent_turn_emitted", handleAgentTurnEmitted);
      socket.off("simulation.task_assignment_required", handleTaskAssignmentRequired);
      socket.off("simulation.supervisor_hint", handleSupervisorHint);
      socket.off("system.error", handleSystemError);
    };
  }, [sessionId, socket]);

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

      turnInFlightRef.current = true;
      turnStepRef.current += 1;

      try {
        const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/turn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            teacherOrUserMessage: buildAutomaticTurnMessage(channel, topic, turnStepRef.current),
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
  }, [channel, isEffectivelyPaused, sessionId, topic]);

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
        const withoutTeacher = previous.filter((bubble) => bubble.nodeId !== "teacher");

        return [
          {
            nodeId: "teacher",
            fromNodeId: "supervisor",
            actionType: "supervisor_hint",
            text: toShortText(cleanedHint),
            messageId: `hint-local:${Date.now()}`,
          },
          ...withoutTeacher,
        ];
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
      isSocketConnected: Boolean(socket?.connected),
      lastError,
      isPausedForTaskAssignment: isEffectivelyPaused,
      taskAssignmentRequired,
      submitTaskAssignment,
      sendSupervisorHint,
    }),
    [
      isEffectivelyPaused,
      lastError,
      nodeBubbles,
      sendSupervisorHint,
      sessionId,
      socket?.connected,
      studentNodeIds,
      students,
      submitTaskAssignment,
      taskAssignmentRequired,
    ],
  );
};
