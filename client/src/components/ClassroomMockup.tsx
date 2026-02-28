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
};

export type CommunicationBubble = {
  nodeId: string;
  fromNodeId: string;
  actionType: string;
  text: string;
  messageId: string;
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
    panelClass: "border-emerald-200 bg-emerald-50/90 text-emerald-800",
    tagClass: "!bg-emerald-100 !text-emerald-800 !border !border-emerald-200",
  },
  steady: {
    label: "Steady",
    panelClass: "border-indigo-200 bg-indigo-50/85 text-indigo-800",
    tagClass: "!bg-indigo-100 !text-indigo-800 !border !border-indigo-200",
  },
  distracted: {
    label: "Distracted",
    panelClass: "border-amber-200 bg-amber-50/90 text-amber-800",
    tagClass: "!bg-amber-100 !text-amber-800 !border !border-amber-200",
  },
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
              "!rounded-xl !border !border-indigo-100 !bg-white/95 !shadow-[0_14px_34px_rgba(15,23,42,0.16)]",
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
                className="rounded-lg border border-slate-200 bg-slate-50/85 px-2 py-1.5"
              >
                <Tag
                  value={toActionLabel(bubble.actionType)}
                  className="!border !border-indigo-200 !bg-indigo-50 !text-indigo-700 !text-[10px]"
                />
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
      className="w-full overflow-hidden rounded-3xl border border-white/60 bg-white/92 shadow-[0_22px_46px_rgba(22,35,60,0.14)] backdrop-blur-sm"
      pt={CONTAINER_PT}
      style={{ fontFamily: "'Avenir Next', 'Segoe UI', 'Trebuchet MS', sans-serif" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-white via-indigo-50/45 to-cyan-50/45 px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-800 sm:text-base">
          Classroom Live View
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
          <Tag
            value="Focused"
            rounded
            className="!border !border-emerald-200 !bg-emerald-50 !text-emerald-700"
          />
          <Tag
            value="Steady"
            rounded
            className="!border !border-indigo-200 !bg-indigo-50 !text-indigo-700"
          />
          <Tag
            value="Distracted"
            rounded
            className="!border !border-amber-200 !bg-amber-50 !text-amber-700"
          />
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="relative mx-auto aspect-[4/3] w-full max-w-[1060px] overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#f4f7fc_38%,#f0ece6_38%,#ece4d9_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]">
          <div className="absolute inset-x-0 top-[36%] h-[1px] bg-slate-300/70" />
          <div className="absolute inset-x-0 top-0 h-[36%] bg-gradient-to-b from-indigo-50/45 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[64%] bg-gradient-to-b from-[#efe7dd] via-[#ecdfd1] to-[#e6d8c8]" />

          <div className="absolute right-[8%] top-[7%] h-[16%] w-[9%] rounded-md border border-slate-200/90 bg-white/80" />
          <div className="absolute right-[20%] top-[7%] h-[16%] w-[9%] rounded-md border border-slate-200/90 bg-white/80" />

          <Card
            className={`absolute left-5 top-4 h-8 w-[34%] min-w-[130px] border text-center text-[11px] font-semibold uppercase tracking-wide sm:h-10 sm:text-sm ${
              interactiveBoardActive
                ? "border-emerald-400/80 bg-emerald-500 text-emerald-50"
                : "border-indigo-500/80 bg-indigo-500 text-indigo-50"
            }`}
            pt={CONTAINER_PT}
          >
            <div className="flex h-full w-full items-center justify-center px-2 py-1">
              {interactiveBoardActive ? "Interactive Board · Active" : "Interactive Board"}
            </div>
          </Card>

          <Card
            className="absolute left-6 top-[26%] h-12 w-[24%] min-w-[120px] border border-[#8f8376] bg-[#c4b6a7] text-center text-[10px] font-semibold tracking-wide text-slate-100 sm:h-14 sm:text-xs"
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
                className="!h-16 !w-16 !border !border-indigo-300 !bg-indigo-100 !text-indigo-700 sm:!h-20 sm:!w-20"
              />
            </div>
            <Tag value="Teacher" className="!bg-indigo-50 !text-indigo-700 !text-[10px] !border !border-indigo-200" />
            {renderBubble("teacher", true)}
          </div>

          <div className="absolute right-0 top-[20%] h-16 w-6 rounded-l-lg bg-[#cbbfb1] sm:h-20 sm:w-7" />

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
              const secondName = second?.name ?? toFallbackName(secondSeatIndex);
              const secondState = second
                ? getStudentState(second, secondSeatIndex)
                : "steady";
              const secondStyle = STATE_STYLES[secondState];

              return (
                <Card
                  key={`desk-${deskIndex + 1}`}
                  className="border border-slate-200/80 bg-white/88 shadow-sm backdrop-blur-sm"
                  pt={DESK_CARD_PT}
                >
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="h-6 w-full rounded-md border border-[#8c7f72] bg-[#c8baac] sm:h-8" />

                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                      <div
                        className={`flex min-h-[48px] flex-col items-center justify-center rounded-2xl border px-1 py-1 text-center sm:min-h-[56px] ${firstStyle.panelClass}`}
                      >
                        <div ref={attachAnchor(firstNodeId)}>
                          <Avatar
                            label={toInitials(firstName)}
                            shape="circle"
                            className="!h-6 !w-6 !bg-cyan-500 !text-[9px] !font-semibold !text-white sm:!h-7 sm:!w-7"
                          />
                        </div>
                        <span className="mt-0.5 truncate text-[8px] font-semibold leading-tight sm:text-[9px]">
                          {firstName}
                        </span>
                        <Tag
                          value={firstStyle.label}
                          className={`!mt-0.5 !text-[9px] ${firstStyle.tagClass}`}
                        />
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
                              className="!h-6 !w-6 !bg-cyan-500 !text-[9px] !font-semibold !text-white sm:!h-7 sm:!w-7"
                            />
                          </div>
                          <span className="mt-0.5 truncate text-[8px] font-semibold leading-tight sm:text-[9px]">
                            {secondName}


                            
                          </span>
                          <Tag
                            value={secondStyle.label}
                            className={`!mt-0.5 !text-[9px]  ${secondStyle.tagClass}`}
                            
                          />
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
                        className="!bg-slate-100 !text-slate-700 !text-[8px] !border !border-slate-200"
                      />
                      {second ? (
                        <Tag
                          value={second.profile ?? "Typical"}
                          className="!bg-slate-100 !text-slate-700 !text-[8px] !border !border-slate-200"
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
