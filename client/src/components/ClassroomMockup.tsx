import { memo, useEffect, useMemo, useRef } from "react";
import { Avatar } from "primereact/avatar";
import { Card } from "primereact/card";
import { OverlayPanel } from "primereact/overlaypanel";
import { Tag } from "primereact/tag";

export type ClassroomStudent = {
  name?: string;
  profile?: string;
  attentiveness?: number;
  comprehension?: number;
  behavior?: number;
  liveActionLabel?: string;
  liveActionKind?: "on_task" | "off_task";
  liveActionSeverity?: "success" | "info" | "warning";
};

export type CommunicationBubble = {
  nodeId: string;
  fromNodeId: string;
  actionType: string;
  text: string;
  messageId: string;
  speechSeconds?: number;
  createdAt?: number;
  expiresAt?: number;
};

export type ClassroomMockupProps = {
  students?: ClassroomStudent[];
  studentNodeIds?: string[];
  nodeBubbles?: CommunicationBubble[];
  interactiveBoardActive?: boolean;
};

type StudentState = "engaged" | "steady" | "distracted";

const STUDENTS_PER_DESK = 2;

const CONTAINER_PT = {
  body: { style: { padding: 0 } },
  content: { style: { padding: 0 } },
};

const DESK_CARD_PT = {
  body: { style: { padding: "0.5rem" } },
  content: { style: { padding: 0 } },
};

const STATE_STYLES: Record<
  StudentState,
  {
    label: string;
    panelClass: string;
    tagClass: string;
  }
> = {
  engaged: {
    label: "Focused",
    panelClass: "border-slate-300 bg-slate-50 text-slate-700",
    tagClass: "!bg-green-200 !text-slate-700 !border !border-slate-300",
  },
  steady: {
    label: "Steady",
    panelClass: "border-slate-300 bg-slate-100 text-slate-700",
    tagClass: "!bg-blue-200 !text-slate-700 !border !border-slate-300",
  },
  distracted: {
    label: "Distracted",
    panelClass: "border-slate-400 bg-slate-100 text-slate-600",
    tagClass: "!bg-yellow-400 !text-slate-700 !border !border-slate-400",
  },
};

const ACTION_TAG_CLASS: Record<"on_task" | "off_task", string> = {
  on_task: "!bg-emerald-100 !text-emerald-800 !border !border-emerald-200",
  off_task: "!bg-amber-100 !text-amber-900 !border !border-amber-200",
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const normalizeScore = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return clamp(Math.round(value), 0, 10);
};

const getStudentState = (student: ClassroomStudent, index: number): StudentState => {
  const attentiveness = normalizeScore(student.attentiveness, 5 + ((index * 2) % 3));
  const behavior = normalizeScore(student.behavior, 5 + ((index * 2) % 3));
  const comprehension = normalizeScore(student.comprehension, 5 + ((index * 2) % 3));
  const weightedFocus = attentiveness * 0.45 + behavior * 0.3 + comprehension * 0.25;

  if (weightedFocus >= 7) {
    return "engaged";
  }

  if (weightedFocus <= 4) {
    return "distracted";
  }

  return "steady";
};

const toFallbackName = (index: number): string => `Student ${index + 1}`;
const toFallbackNodeId = (index: number): string => `student-${index + 1}`;

const toInitials = (name: string): string => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "S";
  }

  if (parts.length === 1) {
    return parts[0]!.slice(0, 1).toUpperCase();
  }

  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
};

const toActionLabel = (value: string): string => {
  return value
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
};

const ClassroomMockup = ({
  students = [],
  studentNodeIds = [],
  nodeBubbles = [],
  interactiveBoardActive = false,
}: ClassroomMockupProps) => {
  const anchorByNodeRef = useRef<Record<string, HTMLElement | null>>({});
  const overlayByNodeRef = useRef<Record<string, OverlayPanel | null>>({});
  const latestMessageByNodeRef = useRef<Record<string, string>>({});

  const seatStudents = students.map((source, index): ClassroomStudent => {
    const candidateName = source?.name?.trim();

    return {
      name: candidateName && candidateName.length > 0 ? candidateName : toFallbackName(index),
      profile: source?.profile,
      attentiveness: source?.attentiveness,
      comprehension: source?.comprehension,
      behavior: source?.behavior,
      liveActionLabel: source?.liveActionLabel,
      liveActionKind: source?.liveActionKind,
      liveActionSeverity: source?.liveActionSeverity,
    };
  });

  const seatNodeIds = Array.from({ length: seatStudents.length }, (_, index) => {
    return studentNodeIds[index] ?? toFallbackNodeId(index);
  });
  const deskGroupCount = Math.ceil(seatStudents.length / STUDENTS_PER_DESK);

  const bubbleStackByNodeId = useMemo(() => {
    const grouped = new Map<string, CommunicationBubble[]>();

    for (const bubble of nodeBubbles) {
      const bucket = grouped.get(bubble.nodeId) ?? [];
      bucket.push(bubble);
      grouped.set(bubble.nodeId, bucket);
    }

    for (const [nodeId, stack] of grouped.entries()) {
      grouped.set(
        nodeId,
        [...stack].sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0)),
      );
    }

    return grouped;
  }, [nodeBubbles]);

  useEffect(() => {
    const currentNodeIds = new Set(bubbleStackByNodeId.keys());

    for (const nodeId of Object.keys(latestMessageByNodeRef.current)) {
      if (currentNodeIds.has(nodeId)) {
        continue;
      }

      overlayByNodeRef.current[nodeId]?.hide();
      delete latestMessageByNodeRef.current[nodeId];
    }

    for (const [nodeId, stack] of bubbleStackByNodeId.entries()) {
      const latestBubble = stack[0];
      if (!latestBubble) {
        continue;
      }

      const anchor = anchorByNodeRef.current[nodeId];
      const overlay = overlayByNodeRef.current[nodeId];

      if (!anchor || !overlay) {
        continue;
      }

      if (
        latestMessageByNodeRef.current[nodeId] === latestBubble.messageId &&
        overlay.isVisible()
      ) {
        continue;
      }

      overlay.hide();
      overlay.show(undefined, anchor);
      latestMessageByNodeRef.current[nodeId] = latestBubble.messageId;
    }
  }, [bubbleStackByNodeId]);

  const attachAnchor = (nodeId: string) => (element: HTMLElement | null) => {
    anchorByNodeRef.current[nodeId] = element;
  };

  const attachOverlay = (nodeId: string) => (overlay: OverlayPanel | null) => {
    overlayByNodeRef.current[nodeId] = overlay;
  };

  const renderBubble = (nodeId: string, isTeacher: boolean) => {
    const bubbleStack = bubbleStackByNodeId.get(nodeId) ?? [];

    return (
      <OverlayPanel
        ref={attachOverlay(nodeId)}
        dismissable={false}
        closeOnEscape={false}
        showCloseIcon={false}
        pt={{
          root: {
            className:
              "!rounded-xl !border !border-slate-300 !bg-white/95 !shadow-[0_10px_24px_rgba(15,23,42,0.18)]",
            style: { maxWidth: isTeacher ? "24rem" : "18rem" },
          },
          content: { className: "!p-3" },
        }}
      >
        {bubbleStack.length > 0 ? (
          <div className="max-h-72 space-y-2 overflow-auto pr-1">
            {bubbleStack.map((bubble) => (
              <div
                key={bubble.messageId}
                className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5"
              >
                <Tag
                  value={toActionLabel(bubble.actionType)}
                  className="!border !border-slate-300 !bg-slate-100 !text-slate-700 !text-[10px]"
                />
                {typeof bubble.speechSeconds === "number" ? (
                  <Tag
                    value={`~${Math.max(1, Math.round(bubble.speechSeconds))}s`}
                    className="!ml-1 !border !border-slate-300 !bg-slate-100 !text-slate-700 !text-[10px]"
                  />
                ) : null}
                <p
                  className={`${
                    isTeacher ? "text-sm leading-5" : "text-xs leading-5"
                  } mt-1 whitespace-pre-wrap text-slate-700`}
                >
                  {bubble.text}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </OverlayPanel>
    );
  };

  return (
    <Card
      className="w-full overflow-hidden rounded-3xl border border-slate-300/70 bg-[#f2f4f7] shadow-[0_18px_32px_rgba(22,35,60,0.08)]"
      pt={CONTAINER_PT}
      style={{ fontFamily: "'Trebuchet MS', Verdana, sans-serif" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300/80 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-700 sm:text-base">
          Classroom Live View
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
          <Tag
            value="Focused"
            rounded
            className="!border !border-emerald-200 !bg-emerald-100 !text-emerald-800"
          />
          <Tag
            value="Steady"
            rounded
            className="!border !border-sky-200 !bg-sky-100 !text-sky-800"
          />
          <Tag
            value="Distracted"
            rounded
            className="!border !border-amber-200 !bg-amber-100 !text-amber-800"
          />
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="relative mx-auto aspect-[4/3] w-full max-w-[1060px] overflow-hidden rounded-3xl border border-slate-300 bg-[#f5f6f8] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
          <div className="absolute inset-x-0 top-[36%] h-[1px] bg-slate-300/80" />
          <div className="absolute inset-x-0 top-0 h-[36%] bg-[#eceff3]" />
          <div className="absolute inset-x-0 bottom-0 h-[64%] bg-[#d6cfc5]" />

          <div className="absolute right-[8%] top-[7%] h-[16%] w-[9%] rounded-md border border-slate-300/70 bg-[#e8ebf0]" />
          <div className="absolute right-[20%] top-[7%] h-[16%] w-[9%] rounded-md border border-slate-300/70 bg-[#e8ebf0]" />

          <Card
            className={`absolute left-5 top-4 h-8 w-[34%] min-w-[130px] border text-center text-[11px] font-semibold uppercase tracking-wide sm:h-10 sm:text-sm ${
              interactiveBoardActive
                ? "!border-emerald-500/80 !bg-emerald-600 text-emerald-50"
                : "border-slate-500/80 bg-[#69707b] text-slate-100"
            }`}
            pt={CONTAINER_PT}
          >
            <div className={`flex h-full w-full items-center justify-center px-2 py-1 ${interactiveBoardActive ? "bg-emerald-600 text-white" : ""}`}>
              {interactiveBoardActive ? "Interactive Board · Active" : "Interactive Board"}
            </div>
          </Card>

          <Card
            className="absolute left-6 top-[26%] h-12 w-[24%] min-w-[120px] border border-[#8f8376] bg-[#bbb1a5] text-center text-[10px] font-semibold tracking-wide text-slate-100 sm:h-14 sm:text-xs"
            pt={CONTAINER_PT}
          >
            <div className="flex h-full w-full items-center justify-center px-2 py-2">
              Teacher Desk
            </div>
          </Card>

          <div className="absolute left-1/2 top-[11%] flex -translate-x-1/2 flex-col items-center gap-1">
            <div ref={attachAnchor("teacher")}>
              <Avatar
                label="T"
                shape="circle"
                className="!h-16 !w-16 !border !border-[#9e97a0] !bg-[#d9d5da] !text-[#5f5860] sm:!h-20 sm:!w-20"
              />
            </div>
            <Tag value="Teacher" className="!bg-slate-100 !text-slate-700 !text-[10px]" />
            {interactiveBoardActive ? (
              <Tag
                value="Interactive Mode"
                className="!bg-emerald-100 !text-emerald-800 !text-[10px]"
              />
            ) : null}
            {renderBubble("teacher", true)}
          </div>

          <div className="absolute right-0 top-[20%] h-16 w-6 rounded-l-lg bg-[#c2baaf] sm:h-20 sm:w-7" />

          <div className="absolute inset-x-3 bottom-2 top-[42%] grid grid-cols-1 gap-2 sm:inset-x-5 sm:bottom-3 sm:top-[44%] sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {Array.from({ length: deskGroupCount }, (_, deskIndex) => {
              const firstSeatIndex = deskIndex * STUDENTS_PER_DESK;
              const secondSeatIndex = firstSeatIndex + 1;
              const first = seatStudents[firstSeatIndex];
              const second = seatStudents[secondSeatIndex];
              const firstNodeId = seatNodeIds[firstSeatIndex];
              const secondNodeId = seatNodeIds[secondSeatIndex];
              if (!first || !firstNodeId) {
                return null;
              }

              const firstName = first.name ?? toFallbackName(firstSeatIndex);
              const firstState = getStudentState(first, firstSeatIndex);
              const firstStyle = STATE_STYLES[firstState];
              const firstActionKind = first.liveActionKind ?? "on_task";
              const firstActionLabel = first.liveActionLabel;
              const secondName = second?.name ?? toFallbackName(secondSeatIndex);
              const secondState = second
                ? getStudentState(second, secondSeatIndex)
                : "steady";
              const secondStyle = STATE_STYLES[secondState];
              const secondActionKind = second?.liveActionKind ?? "on_task";
              const secondActionLabel = second?.liveActionLabel;

              return (
                <Card
                  key={`desk-${deskIndex + 1}`}
                  className="border border-slate-300/70 bg-slate-100/70"
                  pt={DESK_CARD_PT}
                >
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="h-6 w-full rounded-md border border-[#8c7f72] bg-[#cdc3b7] sm:h-8" />

                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                      <div
                        className={`flex min-h-[48px] flex-col items-center justify-center rounded-2xl border px-1 py-1 text-center sm:min-h-[56px] ${firstStyle.panelClass}`}
                      >
                        <div ref={attachAnchor(firstNodeId)}>
                          <Avatar
                            label={toInitials(firstName)}
                            shape="circle"
                            className="!h-6 !w-6 !bg-slate-300 !text-[9px] !font-semibold !text-slate-700 sm:!h-7 sm:!w-7"
                          />
                        </div>
                        <span className="mt-0.5 truncate text-[8px] font-semibold leading-tight sm:text-[9px]">
                          {firstName}
                        </span>
                        <Tag
                          value={firstStyle.label}
                          className={`!mt-0.5 !text-[9px] ${firstStyle.tagClass}`}
                        />
                        {firstActionLabel ? (
                          <Tag
                            value={firstActionLabel}
                            className={`!mt-0.5 !text-[9px] ${ACTION_TAG_CLASS[firstActionKind]}`}
                          />
                        ) : null}
                        {renderBubble(firstNodeId, false)}
                      </div>

                      {second && secondNodeId ? (
                        <div
                          className={`flex min-h-[48px] flex-col items-center justify-center rounded-2xl border px-1 py-1 text-center sm:min-h-[56px] ${secondStyle.panelClass}`}
                        >
                          <div ref={attachAnchor(secondNodeId)}>
                            <Avatar
                              label={toInitials(secondName)}
                              shape="circle"
                              className="!h-6 !w-6 !bg-slate-300 !text-[9px] !font-semibold !text-slate-700 sm:!h-7 sm:!w-7"
                            />
                          </div>
                          <span className="mt-0.5 truncate text-[8px] font-semibold leading-tight sm:text-[9px]">
                            {secondName}


                            
                          </span>
                          <Tag
                            value={secondStyle.label}
                            className={`!mt-0.5 !text-[9px]  ${secondStyle.tagClass}`}
                            
                          />
                          {secondActionLabel ? (
                            <Tag
                              value={secondActionLabel}
                              className={`!mt-0.5 !text-[9px] ${ACTION_TAG_CLASS[secondActionKind]}`}
                            />
                          ) : null}
                          {renderBubble(secondNodeId, false)}
                        </div>
                      ) : (
                        <div className="flex min-h-[48px] items-center justify-center rounded-2xl border border-dashed border-slate-300 px-1 py-1 text-center sm:min-h-[56px]">
                          <span className="text-[9px] font-semibold text-slate-400">
                            Empty seat
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-center gap-1">
                      <Tag
                        value={first.profile ?? "Typical"}
                        className="!bg-slate-100 !text-slate-700 !text-[8px]"
                      />
                      {second ? (
                        <Tag
                          value={second.profile ?? "Typical"}
                          className="!bg-slate-100 !text-slate-700 !text-[8px]"
                        />
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default memo(ClassroomMockup);
