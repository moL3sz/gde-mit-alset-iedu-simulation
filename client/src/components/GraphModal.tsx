import { useEffect, useRef } from "react";
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

const TEACHER_TO_STUDENT_COLOR = "#14532d";
const STUDENT_TO_STUDENT_COLOR = "#b91c1c";
const DEFAULT_EDGE_COLOR = "#94a3b8";

type GraphActivation = NonNullable<SimulationGraph["currentTurnActivations"]>[number];

type DrawableEdge = {
  from: string;
  to: string;
  interactionType?: string;
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
): string => {
  const fromKind = nodeKindById.get(edge.from);
  const toKind = nodeKindById.get(edge.to);

  if (fromKind === "teacher" && toKind === "student") {
    return TEACHER_TO_STUDENT_COLOR;
  }

  if (fromKind === "student" && toKind === "student") {
    return STUDENT_TO_STUDENT_COLOR;
  }

  return DEFAULT_EDGE_COLOR;
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

const drawDirectedEdge = (
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  offset: number,
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

  const bodyEndX = tipX - unitX * (ARROW_HEAD_LENGTH * 0.9);
  const bodyEndY = tipY - unitY * (ARROW_HEAD_LENGTH * 0.9);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(bodyEndX, bodyEndY);
  ctx.stroke();

  const baseX = tipX - unitX * ARROW_HEAD_LENGTH;
  const baseY = tipY - unitY * ARROW_HEAD_LENGTH;
  const leftX = baseX + normalX * ARROW_HEAD_WIDTH;
  const leftY = baseY + normalY * ARROW_HEAD_WIDTH;
  const rightX = baseX - normalX * ARROW_HEAD_WIDTH;
  const rightY = baseY - normalY * ARROW_HEAD_WIDTH;

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

  useEffect(() => {
    if (!visible) {
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

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const nodes = graph?.nodes ?? [];
    const edges = toDrawableEdges(graph);

    if (nodes.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "500 14px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText("Még nincs gráf adat.", rect.width / 2, rect.height / 2);
      return;
    }

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const radius = Math.max(70, Math.min(rect.width, rect.height) * 0.32);

    const positions = new Map<string, Point>();
    const nodeKindById = new Map(nodes.map((node) => [node.id, node.kind]));
    const edgeKeySet = new Set(edges.map((edge) => `${edge.from}=>${edge.to}`));
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

    edges.forEach((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) {
        return;
      }

      const hasReverseEdge = edgeKeySet.has(`${edge.to}=>${edge.from}`);
      const offset = hasReverseEdge ? (edge.from < edge.to ? 5 : -5) : 0;

      drawDirectedEdge(
        ctx,
        from,
        to,
        getEdgeColor(edge, nodeKindById),
        offset,
      );
    });

    nodes.forEach((node) => {
      const point = positions.get(node.id);
      if (!point) {
        return;
      }

      const isTeacher = node.kind === "teacher";
      ctx.beginPath();
      ctx.arc(point.x, point.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isTeacher ? "#f97316" : "#3b82f6";
      ctx.fill();
      ctx.strokeStyle = isTeacher ? "#9a3412" : "#1e3a8a";
      ctx.lineWidth = 2;
      ctx.stroke();

      const label = node.label.length > 14 ? `${node.label.slice(0, 13)}…` : node.label;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, point.x, point.y);
    });
  }, [graph, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={`absolute h-fit z-[100000] flex flex-col overflow-hidden rounded-lg border border-slate-300/70 bg-white p-3 shadow-lg ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        <Button icon="pi pi-times" rounded text size="small" onClick={onHide} />
      </div>
      <div className="mt-2 min-h-0 flex-1 rounded-lg border border-slate-200 bg-slate-50">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
    </div>
  );
};

export default GraphModal;
