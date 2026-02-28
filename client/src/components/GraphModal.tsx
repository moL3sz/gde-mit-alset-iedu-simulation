import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "primereact/button";

import type { SimulationGraph } from "../hooks/useSimulationChannel";

type GraphModalProps = {
  visible: boolean;
  onHide: () => void;
  title: string;
  className?: string;
  graph: SimulationGraph | null;
};

type Point = {
  x: number;
  y: number;
};

const NODE_RADIUS = 24;
const ARROW_HEAD_LENGTH = 10;
const ARROW_HEAD_WIDTH = 6;
const DUPLEX_OFFSET = 10;
const DUPLEX_LINE_WIDTH = 2.5;
const DUPLEX_HEAD_LENGTH = 12;
const DUPLEX_HEAD_WIDTH = 7;
const ACTIVATION_QUEUE_MAX = 6;
const ACTIVATION_PUSH_INTERVAL_MS = 240;
const ACTIVATION_EXIT_MS = 260;
const HANDLED_ACTIVATION_KEYS_MAX = 600;
const ACTIVATION_CARD_ESTIMATED_HEIGHT_PX = 74;
const ACTIVATION_VISIBLE_BASE_MS = 1600;
const ACTIVATION_VISIBLE_PER_SLOT_MS = 520;
const ACTIVATION_VISIBLE_MIN_MS = 1800;
const ACTIVATION_VISIBLE_MAX_MS = 5200;
const EDGE_PULSE_CYCLE_MS = 1200;
const EDGE_PULSE_LINE_FACTOR = 0.28;
const MODAL_CONTENT_Z_INDEX = 2147483001;

const getCssVar = (name: string, fallback: string): string => {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
};

const TEACHER_TO_STUDENT_COLOR = getCssVar("--green-500", "#22c55e");
const DUPLEX_TEACHER_STUDENT_COLOR = getCssVar("--blue-300", "#93c5fd");
const STUDENT_TO_STUDENT_COLOR = getCssVar("--red-500", "#ef4444");
const DEFAULT_EDGE_COLOR = getCssVar("--surface-400", "#94a3b8");
const STUDENT_NODE_FILL = getCssVar("--primary-color", "#3b82f6");
const TEACHER_NODE_FILL = getCssVar("--orange-500", "#f59e0b");
const NODE_HIGHLIGHT_RED = getCssVar("--red-500", "#ef4444");
const NODE_HIGHLIGHT_BLUE = getCssVar("--blue-400", "#60a5fa");
const NODE_TEXT_COLOR = getCssVar("--primary-color-text", "#ffffff");
const TOOLTIP_BG = getCssVar("--surface-900", "rgba(15, 23, 42, 0.95)");
const TOOLTIP_TEXT = getCssVar("--surface-0", "#ffffff");

type GraphActivation = NonNullable<SimulationGraph["currentTurnActivations"]>[number];

type DrawableEdge = {
  from: string;
  to: string;
  interactionType?: string;
};

type ActivationQueuePhase = "enter" | "active" | "exit";

type ActivationQueueItem = {
  key: string;
  fromLabel: string;
  toLabel: string;
  interactionType: string;
  color: string;
  phase: ActivationQueuePhase;
};

const toActivationKey = (activation: GraphActivation, index: number): string => {
  return (
    activation.id ??
    activation.createdAt ??
    `${activation.from}:${activation.to}:${activation.interactionType}:${index}`
  );
};

const toInteractionLabel = (value: string): string => {
  return value
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const toActivationVisibleMs = (listHeight: number): number => {
  const estimatedHeight =
    listHeight > 0 ? listHeight : ACTIVATION_CARD_ESTIMATED_HEIGHT_PX * ACTIVATION_QUEUE_MAX;
  const slotCount = Math.max(1, Math.floor(estimatedHeight / ACTIVATION_CARD_ESTIMATED_HEIGHT_PX));

  return clamp(
    ACTIVATION_VISIBLE_BASE_MS + (slotCount - 1) * ACTIVATION_VISIBLE_PER_SLOT_MS,
    ACTIVATION_VISIBLE_MIN_MS,
    ACTIVATION_VISIBLE_MAX_MS,
  );
};

const getInteractionPriority = (interactionType?: string): number => {
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

const getEdgeColor = (
  edge: DrawableEdge,
  nodeKindById: Map<string, string>,
  hasReverseEdge: boolean,
): string => {
  const fromKind = nodeKindById.get(edge.from);
  const toKind = nodeKindById.get(edge.to);
  const isTeacherStudentPair =
    (fromKind === "teacher" && toKind === "student") ||
    (fromKind === "student" && toKind === "teacher");

  if (hasReverseEdge && isTeacherStudentPair) {
    return DUPLEX_TEACHER_STUDENT_COLOR;
  }

  if (fromKind === "teacher" && toKind === "student") {
    return TEACHER_TO_STUDENT_COLOR;
  }

  if (fromKind === "student" && toKind === "student") {
    return STUDENT_TO_STUDENT_COLOR;
  }

  return DEFAULT_EDGE_COLOR;
};

const getActivationColor = (
  activation: GraphActivation,
  nodeKindById: Map<string, string>,
  activationDirectionSet: Set<string>,
): string => {
  const hasReverseEdge = activationDirectionSet.has(`${activation.to}=>${activation.from}`);
  return getEdgeColor(
    {
      from: activation.from,
      to: activation.to,
      interactionType: activation.interactionType,
    },
    nodeKindById,
    hasReverseEdge,
  );
};

const isTeacherToStudentActivation = (
  activation: GraphActivation,
  nodeKindById: Map<string, string>,
): boolean => {
  const fromKind = nodeKindById.get(activation.from);
  const toKind = nodeKindById.get(activation.to);
  return fromKind === "teacher" && toKind === "student";
};

const toDrawableEdges = (graph: SimulationGraph | null): DrawableEdge[] => {
  if (!graph) {
    return [];
  }

  const activations: GraphActivation[] = graph.currentTurnActivations ?? [];
  if (activations.length > 0) {
    const maxPriorityBySource = new Map<string, number>();
    for (const activation of activations) {
      const priority = getInteractionPriority(activation.interactionType);
      const currentMax = maxPriorityBySource.get(activation.from) ?? 0;
      if (priority > currentMax) {
        maxPriorityBySource.set(activation.from, priority);
      }
    }

    const drawnPairKeys = new Set<string>();
    const filtered = activations.filter((activation) => {
      const priority = getInteractionPriority(activation.interactionType);
      const sourceMax = maxPriorityBySource.get(activation.from) ?? 0;
      if (priority < sourceMax) {
        return false;
      }

      const dedupeKey = `${activation.from}=>${activation.to}::${activation.interactionType}`;
      if (drawnPairKeys.has(dedupeKey)) {
        return false;
      }

      drawnPairKeys.add(dedupeKey);
      return true;
    });

    return filtered.map((activation) => ({
      from: activation.from,
      to: activation.to,
      interactionType: activation.interactionType,
    }));
  }

  return (graph.edges ?? [])
    .filter((edge) => edge.currentTurnActive === true)
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      interactionType: edge.lastInteractionType,
    }));
};

const toInitials = (label: string): string => {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "N";
  }

  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }

  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
};

const drawDirectedEdge = (
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  offset: number,
  options?: {
    lineWidth?: number;
    arrowHeadLength?: number;
    arrowHeadWidth?: number;
  },
) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    return;
  }

  const unitX = dx / length;
  const unitY = dy / length;
  const normalX = -unitY;
  const normalY = unitX;

  const startX = from.x + unitX * NODE_RADIUS + normalX * offset;
  const startY = from.y + unitY * NODE_RADIUS + normalY * offset;
  const tipX = to.x - unitX * NODE_RADIUS + normalX * offset;
  const tipY = to.y - unitY * NODE_RADIUS + normalY * offset;
  const arrowHeadLength = options?.arrowHeadLength ?? ARROW_HEAD_LENGTH;
  const arrowHeadWidth = options?.arrowHeadWidth ?? ARROW_HEAD_WIDTH;
  const lineWidth = options?.lineWidth ?? 1.5;
  const bodyEndX = tipX - unitX * (arrowHeadLength * 0.9);
  const bodyEndY = tipY - unitY * (arrowHeadLength * 0.9);

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(bodyEndX, bodyEndY);
  ctx.stroke();

  const baseX = tipX - unitX * arrowHeadLength;
  const baseY = tipY - unitY * arrowHeadLength;
  const leftX = baseX + normalX * arrowHeadWidth;
  const leftY = baseY + normalY * arrowHeadWidth;
  const rightX = baseX - normalX * arrowHeadWidth;
  const rightY = baseY - normalY * arrowHeadWidth;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();
};

const GraphModal = ({
  visible,
  onHide,
  title,
  className = "",
  graph,
}: GraphModalProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activationListRef = useRef<HTMLDivElement>(null);
  const activationListHeightRef = useRef(0);
  const positionedNodesRef = useRef<Array<{ id: string; label: string; x: number; y: number }>>([]);
  const [hoveredNode, setHoveredNode] = useState<{ label: string; x: number; y: number } | null>(null);
  const [activationQueue, setActivationQueue] = useState<ActivationQueueItem[]>([]);
  const handledActivationKeysRef = useRef<Set<string>>(new Set());
  const handledActivationOrderRef = useRef<string[]>([]);
  const pendingActivationQueueRef = useRef<ActivationQueueItem[]>([]);
  const pushPumpTimerRef = useRef<number | null>(null);
  const queueTimersByKeyRef = useRef<Record<string, number[]>>({});

  const clearQueueTimersForKey = (key: string) => {
    const timers = queueTimersByKeyRef.current[key];
    if (!timers) {
      return;
    }

    for (const timer of timers) {
      window.clearTimeout(timer);
    }

    delete queueTimersByKeyRef.current[key];
  };

  const clearAllQueueTimers = () => {
    for (const key of Object.keys(queueTimersByKeyRef.current)) {
      clearQueueTimersForKey(key);
    }
  };

  const clearPushPumpTimer = () => {
    if (pushPumpTimerRef.current !== null) {
      window.clearTimeout(pushPumpTimerRef.current);
      pushPumpTimerRef.current = null;
    }
  };

  const rememberHandledActivationKey = (key: string): boolean => {
    if (handledActivationKeysRef.current.has(key)) {
      return false;
    }

    handledActivationKeysRef.current.add(key);
    handledActivationOrderRef.current.push(key);

    if (handledActivationOrderRef.current.length > HANDLED_ACTIVATION_KEYS_MAX) {
      const oldestKey = handledActivationOrderRef.current.shift();
      if (oldestKey) {
        handledActivationKeysRef.current.delete(oldestKey);
      }
    }

    return true;
  };

  const scheduleQueueLifecycle = (key: string, visibleMs: number) => {
    clearQueueTimersForKey(key);

    const activateTimer = window.setTimeout(() => {
      setActivationQueue((previous) =>
        previous.map((candidate) =>
          candidate.key === key ? { ...candidate, phase: "active" } : candidate,
        ),
      );
    }, 20);

    const startExitTimer = window.setTimeout(() => {
      setActivationQueue((previous) =>
        previous.map((candidate) =>
          candidate.key === key ? { ...candidate, phase: "exit" } : candidate,
        ),
      );
    }, visibleMs);

    const removeTimer = window.setTimeout(() => {
      setActivationQueue((previous) => previous.filter((candidate) => candidate.key !== key));
      clearQueueTimersForKey(key);
    }, visibleMs + ACTIVATION_EXIT_MS);

    queueTimersByKeyRef.current[key] = [activateTimer, startExitTimer, removeTimer];
  };

  const runPushPump = () => {
    if (pushPumpTimerRef.current !== null) {
      return;
    }

    const pump = () => {
      const nextItem = pendingActivationQueueRef.current.shift();
      if (!nextItem) {
        pushPumpTimerRef.current = null;
        return;
      }

      setActivationQueue((previous) => {
        const merged = [nextItem, ...previous].slice(0, ACTIVATION_QUEUE_MAX);
        const mergedKeys = new Set(merged.map((item) => item.key));

        for (const item of previous) {
          if (!mergedKeys.has(item.key)) {
            clearQueueTimersForKey(item.key);
          }
        }

        return merged;
      });

      scheduleQueueLifecycle(
        nextItem.key,
        toActivationVisibleMs(activationListHeightRef.current),
      );
      pushPumpTimerRef.current = window.setTimeout(pump, ACTIVATION_PUSH_INTERVAL_MS);
    };

    pushPumpTimerRef.current = window.setTimeout(pump, 0);
  };

  const handleCanvasMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const pointX = event.clientX - rect.left;
    const pointY = event.clientY - rect.top;

    const hit = positionedNodesRef.current.find(
      (node) => Math.hypot(pointX - node.x, pointY - node.y) <= NODE_RADIUS,
    );

    if (!hit) {
      canvas.style.cursor = "default";
      setHoveredNode((previous) => (previous ? null : previous));
      return;
    }

    canvas.style.cursor = "pointer";
    setHoveredNode((previous) => {
      if (
        previous &&
        previous.label === hit.label &&
        Math.abs(previous.x - pointX) < 1 &&
        Math.abs(previous.y - pointY) < 1
      ) {
        return previous;
      }

      return {
        label: hit.label,
        x: pointX,
        y: pointY,
      };
    });
  };

  const handleCanvasMouseLeave = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    event.currentTarget.style.cursor = "default";
    setHoveredNode(null);
  };

  useEffect(() => {
    if (!visible) {
      activationListHeightRef.current = 0;
      return;
    }

    const element = activationListRef.current;
    if (!element) {
      return;
    }

    const updateHeight = () => {
      activationListHeightRef.current = element.clientHeight;
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      activationListHeightRef.current = entry.contentRect.height;
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      positionedNodesRef.current = [];
      setHoveredNode(null);
      activationListHeightRef.current = 0;
      handledActivationKeysRef.current.clear();
      handledActivationOrderRef.current = [];
      pendingActivationQueueRef.current = [];
      clearAllQueueTimers();
      clearPushPumpTimer();
      setActivationQueue([]);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let rafId: number | null = null;

    const renderFrame = (timestamp: number) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        rafId = window.requestAnimationFrame(renderFrame);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const nextWidth = Math.floor(rect.width * dpr);
      const nextHeight = Math.floor(rect.height * dpr);
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const nodes = graph?.nodes ?? [];
      const edges = toDrawableEdges(graph);

      if (nodes.length === 0) {
        positionedNodesRef.current = [];
        ctx.fillStyle = "#64748b";
        ctx.font = "500 14px Trebuchet MS";
        ctx.textAlign = "center";
        ctx.fillText("Még nincs gráf adat.", rect.width / 2, rect.height / 2);
        rafId = window.requestAnimationFrame(renderFrame);
        return;
      }

      const pulse = Math.sin((timestamp / EDGE_PULSE_CYCLE_MS) * 2 * Math.PI);
      const linePulseFactor = 1 + pulse * EDGE_PULSE_LINE_FACTOR;
      const baseEdgeLineWidth = 1.5 * linePulseFactor;
      const duplexLineWidth = DUPLEX_LINE_WIDTH * linePulseFactor;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const radius = Math.max(70, Math.min(rect.width, rect.height) * 0.32);

      const positions = new Map<string, Point>();
      const teacherNode = nodes.find((node) => node.kind === "teacher");
      const studentNodes = nodes.filter((node) => node.kind !== "teacher");
      const nodeKindById = new Map(nodes.map((node) => [node.id, node.kind]));
      const edgeKeySet = new Set(edges.map((edge) => `${edge.from}=>${edge.to}`));

      if (teacherNode) {
        positions.set(teacherNode.id, { x: centerX, y: centerY });
        studentNodes.forEach((node, index) => {
          if (studentNodes.length === 1) {
            positions.set(node.id, { x: centerX, y: centerY + radius });
            return;
          }

          const angle = -Math.PI / 2 + (2 * Math.PI * index) / studentNodes.length;
          positions.set(node.id, {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          });
        });
      } else {
        nodes.forEach((node, index) => {
          if (nodes.length === 1) {
            positions.set(node.id, { x: centerX, y: centerY });
            return;
          }

          const angle = -Math.PI / 2 + (2 * Math.PI * index) / nodes.length;
          positions.set(node.id, {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          });
        });
      }

      positionedNodesRef.current = nodes
        .map((node) => {
          const point = positions.get(node.id);
          if (!point) {
            return null;
          }

          return {
            id: node.id,
            label: node.label,
            x: point.x,
            y: point.y,
          };
        })
        .filter((value): value is { id: string; label: string; x: number; y: number } => value !== null);

      const nodeHighlightColorById = new Map<string, string>();
      const nodeHighlightPriorityById = new Map<string, number>();
      const applyNodeHighlight = (nodeId: string, color: string, priority: number) => {
        const currentPriority = nodeHighlightPriorityById.get(nodeId) ?? 0;
        if (priority < currentPriority) {
          return;
        }

        nodeHighlightPriorityById.set(nodeId, priority);
        nodeHighlightColorById.set(nodeId, color);
      };

      const renderedDuplexPairs = new Set<string>();
      edges.forEach((edge) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) {
          return;
        }

        const hasReverseEdge = edgeKeySet.has(`${edge.to}=>${edge.from}`);
        const fromKind = nodeKindById.get(edge.from);
        const toKind = nodeKindById.get(edge.to);
        const isTeacherStudentPair =
          (fromKind === "teacher" && toKind === "student") ||
          (fromKind === "student" && toKind === "teacher");

        if (hasReverseEdge) {
          applyNodeHighlight(edge.from, NODE_HIGHLIGHT_BLUE, 2);
          applyNodeHighlight(edge.to, NODE_HIGHLIGHT_BLUE, 2);
        } else if (fromKind === "student" && toKind === "student") {
          applyNodeHighlight(edge.from, NODE_HIGHLIGHT_RED, 1);
          applyNodeHighlight(edge.to, NODE_HIGHLIGHT_RED, 1);
        }

        if (hasReverseEdge && isTeacherStudentPair) {
          const teacherId = fromKind === "teacher" ? edge.from : edge.to;
          const studentId = fromKind === "student" ? edge.from : edge.to;
          const duplexKey = `${teacherId}<=>${studentId}`;

          if (renderedDuplexPairs.has(duplexKey)) {
            return;
          }
          renderedDuplexPairs.add(duplexKey);

          const teacherPoint = positions.get(teacherId);
          const studentPoint = positions.get(studentId);
          if (!teacherPoint || !studentPoint) {
            return;
          }

          drawDirectedEdge(
            ctx,
            teacherPoint,
            studentPoint,
            DUPLEX_TEACHER_STUDENT_COLOR,
            DUPLEX_OFFSET,
            {
              lineWidth: duplexLineWidth,
              arrowHeadLength: DUPLEX_HEAD_LENGTH,
              arrowHeadWidth: DUPLEX_HEAD_WIDTH,
            },
          );
          drawDirectedEdge(
            ctx,
            studentPoint,
            teacherPoint,
            DUPLEX_TEACHER_STUDENT_COLOR,
            DUPLEX_OFFSET,
            {
              lineWidth: duplexLineWidth,
              arrowHeadLength: DUPLEX_HEAD_LENGTH,
              arrowHeadWidth: DUPLEX_HEAD_WIDTH,
            },
          );
          return;
        }

        const offset = hasReverseEdge ? (edge.from < edge.to ? 5 : -5) : 0;

        drawDirectedEdge(
          ctx,
          from,
          to,
          getEdgeColor(edge, nodeKindById, hasReverseEdge),
          offset,
          {
            lineWidth: baseEdgeLineWidth,
          },
        );
      });

      nodes.forEach((node) => {
        const point = positions.get(node.id);
        if (!point) {
          return;
        }

        const isTeacher = node.kind === "teacher";
        const baseNodeColor = isTeacher ? TEACHER_NODE_FILL : STUDENT_NODE_FILL;
        const resolvedNodeColor = nodeHighlightColorById.get(node.id) ?? baseNodeColor;
        ctx.beginPath();
        ctx.arc(point.x, point.y, NODE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = resolvedNodeColor;
        ctx.fill();

        const label = toInitials(node.label);
        ctx.fillStyle = NODE_TEXT_COLOR;
        ctx.font = "bold 12px Trebuchet MS";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, point.x, point.y);
      });

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [graph, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const activations: GraphActivation[] = graph?.currentTurnActivations ?? [];
    if (activations.length === 0) {
      return;
    }

    const nodeLabelById = new Map((graph?.nodes ?? []).map((node) => [node.id, node.label]));
    const nodeKindById = new Map((graph?.nodes ?? []).map((node) => [node.id, node.kind]));
    const activationDirectionSet = new Set(
      activations.map((activation) => `${activation.from}=>${activation.to}`),
    );

    const nextItems: ActivationQueueItem[] = [];
    const activationEntries = activations.map((activation, index) => ({ activation, index }));
    const teacherBroadcastEntries = activationEntries.filter(
      ({ activation }) => activation.interactionType === "teacher_broadcast",
    );
    const hasClassroomBroadcast = teacherBroadcastEntries.length > 1;

    if (hasClassroomBroadcast) {
      const firstBroadcast = teacherBroadcastEntries[0];
      const broadcastKey = `broadcast:${teacherBroadcastEntries
        .map(({ activation, index }) => toActivationKey(activation, index))
        .join("|")}`;

      if (firstBroadcast && rememberHandledActivationKey(broadcastKey)) {
        nextItems.push({
          key: broadcastKey,
          fromLabel:
            nodeLabelById.get(firstBroadcast.activation.from) ??
            firstBroadcast.activation.from,
          toLabel: "Everyone",
          interactionType: "broadcast",
          color: TEACHER_TO_STUDENT_COLOR,
          phase: "enter",
        });
      }
    }

    activationEntries.forEach(({ activation, index }) => {
      if (
        hasClassroomBroadcast &&
        isTeacherToStudentActivation(activation, nodeKindById) &&
        (activation.interactionType === "teacher_broadcast" ||
          activation.interactionType === "teacher_to_student")
      ) {
        return;
      }

      const activationKey = toActivationKey(activation, index);
      if (!rememberHandledActivationKey(activationKey)) {
        return;
      }

      nextItems.push({
        key: activationKey,
        fromLabel: nodeLabelById.get(activation.from) ?? activation.from,
        toLabel: nodeLabelById.get(activation.to) ?? activation.to,
        interactionType: activation.interactionType,
        color: getActivationColor(activation, nodeKindById, activationDirectionSet),
        phase: "enter",
      });
    });

    if (nextItems.length === 0) {
      return;
    }

    pendingActivationQueueRef.current.push(...nextItems);
    runPushPump();
  }, [graph, visible]);

  useEffect(() => {
    return () => {
      clearPushPumpTimer();
      clearAllQueueTimers();
      pendingActivationQueueRef.current = [];
      handledActivationKeysRef.current.clear();
      handledActivationOrderRef.current = [];
    };
  }, []);

  if (!visible) {
    return null;
  }

  const modalContent = (
    <div
      className={`fixed flex flex-col overflow-hidden rounded-lg border border-slate-300/70 bg-white p-3 shadow-lg ${className}`}
      style={{ zIndex: MODAL_CONTENT_Z_INDEX }}
    >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button icon="pi pi-times" rounded text size="small" onClick={onHide} />
        </div>
        <div className="mt-2 min-h-0 flex-1">
          <div className="flex h-full min-h-0 gap-3">
            <div className="relative min-h-0 flex-1 rounded-lg border border-slate-200 bg-slate-50">
              <canvas
                ref={canvasRef}
                className="h-full w-full"
                onMouseMove={handleCanvasMouseMove}
                onMouseLeave={handleCanvasMouseLeave}
              />
              {hoveredNode ? (
                <div
                  className="pointer-events-none absolute rounded px-2 py-1 text-xs font-medium shadow"
                  style={{
                    left: hoveredNode.x + 10,
                    top: hoveredNode.y + 10,
                    background: TOOLTIP_BG,
                    color: TOOLTIP_TEXT,
                  }}
                >
                  {hoveredNode.label}
                </div>
              ) : null}
            </div>

            <aside className="flex w-72 shrink-0 flex-col rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Activations
                </h4>
                <span className="text-xs text-slate-500">
                  {activationQueue.length}/{ACTIVATION_QUEUE_MAX}
                </span>
              </div>
              <div ref={activationListRef} className="mt-2 min-h-0 flex-1 space-y-2 overflow-hidden pr-1">
                {activationQueue.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-300 bg-white/70 px-2 py-2 text-xs text-slate-500">
                    No live activation yet.
                  </p>
                ) : (
                  activationQueue.map((item) => {
                    const phaseClass =
                      item.phase === "enter"
                        ? "translate-x-6 opacity-0"
                        : item.phase === "exit"
                          ? "translate-x-2 opacity-0"
                          : "translate-x-0 opacity-100";

                    return (
                      <div
                        key={item.key}
                        className={`rounded-md border border-slate-200 bg-white px-2 py-2 shadow-sm transition-all duration-300 ease-out ${phaseClass}`}
                        style={{ borderLeft: `4px solid ${item.color}` }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-[11px] font-semibold" style={{ color: item.color }}>
                            {toInteractionLabel(item.interactionType)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-700">
                          {item.fromLabel} -&gt; {item.toLabel}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
  );

  if (typeof document === "undefined") {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};

export default GraphModal;
