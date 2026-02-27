import { memo, useEffect, useRef } from "react";
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
  messageId?: string;
};

export type ClassroomMockupProps = {
  students?: ClassroomStudent[];
  studentNodeIds?: string[];
  nodeBubbles?: CommunicationBubble[];
};

type StudentState = "engaged" | "steady" | "distracted";

const DESK_GROUP_COUNT = 6;
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
    tagClass: "!bg-slate-200 !text-slate-700 !border !border-slate-300",
  },
  steady: {
    label: "Steady",
    panelClass: "border-slate-300 bg-slate-100 text-slate-700",
    tagClass: "!bg-slate-200 !text-slate-700 !border !border-slate-300",
  },
  distracted: {
    label: "Distracted",
    panelClass: "border-slate-400 bg-slate-100 text-slate-600",
    tagClass: "!bg-slate-300 !text-slate-700 !border !border-slate-400",
  },
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const normalizeScore = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return clamp(Math.round(value), 0, 100);
};

const getStudentState = (student: ClassroomStudent, index: number): StudentState => {
  const attentiveness = normalizeScore(student.attentiveness, 55 + ((index * 7) % 20));
  const behavior = normalizeScore(student.behavior, 50 + ((index * 11) % 25));
  const comprehension = normalizeScore(student.comprehension, 52 + ((index * 9) % 20));
  const weightedFocus = attentiveness * 0.45 + behavior * 0.3 + comprehension * 0.25;

  if (weightedFocus >= 70) {
    return "engaged";
  }

  if (weightedFocus <= 47) {
    return "distracted";
  }

  return "steady";
};

const toFallbackName = (index: number): string => `Student ${index + 1}`;

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

const toActionLabel = (actionType: string): string =>
  actionType
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");

type BubbleOverlayTriggerProps = {
  bubble: CommunicationBubble;
  anchorElement: HTMLElement | null;
  size?: "teacher" | "student";
};

const BubbleOverlayTrigger = ({
  bubble,
  anchorElement,
  size = "student",
}: BubbleOverlayTriggerProps) => {
  const overlayRef = useRef<OverlayPanel>(null);
  const bubbleSignatureRef = useRef<string>("");
  const isTeacher = size === "teacher";

  useEffect(() => {
    const overlay = overlayRef.current;
    const anchor = anchorElement;

    if (!overlay || !anchor) {
      return;
    }

    const nextSignature =
      bubble.messageId ?? `${bubble.fromNodeId}|${bubble.actionType}|${bubble.text}`;
    if (bubbleSignatureRef.current === nextSignature) {
      return;
    }

    bubbleSignatureRef.current = nextSignature;
    overlay.show(undefined, anchor);

   
  }, [anchorElement, bubble.actionType, bubble.fromNodeId, bubble.text, isTeacher]);

  return (
    <>
      <OverlayPanel
        ref={overlayRef}
        showCloseIcon={false}
        className={
          isTeacher ? "max-w-[320px] !rounded-xl !shadow-xl" : "max-w-[220px] !rounded-xl !shadow-lg"
        }
      >
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {toActionLabel(bubble.actionType)}
          </div>
          <div
            className={
              isTeacher
                ? "whitespace-normal break-words text-[12px] leading-snug text-slate-700"
                : "whitespace-normal break-words text-[11px] leading-snug text-slate-700"
            }
          >
            {bubble.text}
          </div>
        </div>
      </OverlayPanel>
    </>
  );
};

const ClassroomMockup = ({
  students = [],
  studentNodeIds = [],
  nodeBubbles = [],
}: ClassroomMockupProps) => {
  const teacherAvatarRef = useRef<HTMLSpanElement | null>(null);
  const studentAvatarRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const seatStudents = Array.from(
    { length: DESK_GROUP_COUNT * STUDENTS_PER_DESK },
    (_, index): ClassroomStudent => {
      const source = students[index];
      const candidateName = source?.name?.trim();

      return {
        name: candidateName && candidateName.length > 0 ? candidateName : toFallbackName(index),
        profile: source?.profile,
        attentiveness: source?.attentiveness,
        comprehension: source?.comprehension,
        behavior: source?.behavior,
      };
    },
  );
  const bubblesByNodeId = new Map(nodeBubbles.map((bubble) => [bubble.nodeId, bubble]));
  const teacherBubble = bubblesByNodeId.get("teacher");

  return (
    <div
      className="w-full overflow-hidden  bg-[#f2f4f7] shadow-[0_18px_32px_rgba(22,35,60,0.08)]"
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
            className="absolute left-5 top-4 h-8 w-[34%] min-w-[130px] border border-slate-500/80 bg-[#69707b] text-center text-[11px] font-semibold uppercase tracking-wide text-slate-100 sm:h-10 sm:text-sm"
            pt={CONTAINER_PT}
          >
            <div className="flex h-full w-full items-center justify-center px-2 py-1">
              Interactive Board
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
            <span ref={teacherAvatarRef} className="inline-flex">
              <Avatar
                label="T"
                shape="circle"
                className="!h-16 !w-16 !border !border-[#9e97a0] !bg-[#d9d5da] !text-[#5f5860] sm:!h-20 sm:!w-20"
              />
            </span>
            <Tag value="Teacher" className="!bg-slate-100 !text-slate-700 !text-[10px]" />
            {teacherBubble ? (
              <BubbleOverlayTrigger
                bubble={teacherBubble}
                size="teacher"
                anchorElement={teacherAvatarRef.current}
              />
            ) : null}
          </div>

          <div className="absolute right-0 top-[20%] h-16 w-6 rounded-l-lg bg-[#c2baaf] sm:h-20 sm:w-7" />

          <div className="absolute inset-x-3 bottom-2 top-[42%] grid grid-cols-3 grid-rows-2 gap-2 sm:inset-x-5 sm:bottom-3 sm:top-[44%] sm:gap-4">
            {Array.from({ length: DESK_GROUP_COUNT }, (_, deskIndex) => {
              const firstSeatIndex = deskIndex * STUDENTS_PER_DESK;
              const secondSeatIndex = firstSeatIndex + 1;
              const first = seatStudents[firstSeatIndex];
              const second = seatStudents[secondSeatIndex];
              const firstName = first.name ?? toFallbackName(firstSeatIndex);
              const secondName = second.name ?? toFallbackName(secondSeatIndex);
              const firstState = getStudentState(first, firstSeatIndex);
              const secondState = getStudentState(second, secondSeatIndex);
              const firstStyle = STATE_STYLES[firstState];
              const secondStyle = STATE_STYLES[secondState];
              const firstNodeId = studentNodeIds[firstSeatIndex];
              const secondNodeId = studentNodeIds[secondSeatIndex];
              const firstBubble = firstNodeId ? bubblesByNodeId.get(firstNodeId) : undefined;
              const secondBubble = secondNodeId ? bubblesByNodeId.get(secondNodeId) : undefined;

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
                        className={`relative flex min-h-12 flex-col items-center justify-center rounded-2xl border px-1 py-1 text-center sm:min-h-[56px] ${firstStyle.panelClass}`}
                      >
                        {firstBubble ? (
                          <BubbleOverlayTrigger
                            bubble={firstBubble}
                            anchorElement={studentAvatarRefs.current[firstSeatIndex] ?? null}
                          />
                        ) : null}
                        <span
                          ref={(element) => {
                            studentAvatarRefs.current[firstSeatIndex] = element;
                          }}
                          className="inline-flex"
                        >
                          <Avatar
                            label={toInitials(firstName)}
                            shape="circle"
                            className="!h-6 !w-6 !bg-slate-300 !text-[9px] !font-semibold !text-slate-700 sm:!h-7 sm:!w-7"
                          />
                        </span>

                        <Tag
                          value={firstStyle.label}
                          className={`!mt-0.5 !text-[7px] ${firstStyle.tagClass}`}
                        />
                      </div>

                      <div
                        className={`relative flex min-h-[48px] flex-col items-center justify-center rounded-2xl border px-1 py-1 text-center sm:min-h-[56px] ${secondStyle.panelClass}`}
                      >
                        {secondBubble ? (
                          <BubbleOverlayTrigger
                            bubble={secondBubble}
                            anchorElement={studentAvatarRefs.current[secondSeatIndex] ?? null}
                          />
                        ) : null}
                        <span
                          ref={(element) => {
                            studentAvatarRefs.current[secondSeatIndex] = element;
                          }}
                          className="inline-flex"
                        >
                          <Avatar
                            label={toInitials(secondName)}
                            shape="circle"
                            className="!h-6 !w-6 !bg-slate-300 !text-[9px] !font-semibold !text-slate-700 sm:!h-7 sm:!w-7"
                          />
                        </span>
                       
                        <Tag
                          value={secondStyle.label}
                          className={`!mt-0.5 !text-[7px] ${secondStyle.tagClass}`}
                        />
                      </div>
                    </div>

                    <div className="flex justify-center gap-1">
                      <Tag
                        value={first.profile ?? "Typical"}
                        className="!bg-slate-100 !text-slate-700 !text-[8px]"
                      />
                      <Tag
                        value={second.profile ?? "Typical"}
                        className="!bg-slate-100 !text-slate-700 !text-[8px]"
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(ClassroomMockup);
