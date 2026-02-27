import { memo } from "react";

export type ClassroomStudent = {
  name?: string;
  profile?: string;
  attentiveness?: number;
  comprehension?: number;
  behavior?: number;
};

export type ClassroomMockupProps = {
  students?: ClassroomStudent[];
};

type StudentState = "engaged" | "steady" | "distracted";

const DESK_GROUP_COUNT = 6;
const STUDENTS_PER_DESK = 2;

const STATE_STYLES: Record<
  StudentState,
  {
    label: string;
    ringClass: string;
    dotClass: string;
    badgeClass: string;
  }
> = {
  engaged: {
    label: "Fókuszban",
    ringClass: "border-teal-300 bg-teal-50 text-teal-800",
    dotClass: "bg-teal-300",
    badgeClass: "bg-teal-100 text-teal-800",
  },
  steady: {
    label: "Stabil",
    ringClass: "border-sky-300 bg-sky-50 text-sky-800",
    dotClass: "bg-sky-300",
    badgeClass: "bg-sky-100 text-sky-800",
  },
  distracted: {
    label: "Szétszórt",
    ringClass: "border-purple-300 bg-purple-50 text-purple-800",
    dotClass: "bg-purple-300",
    badgeClass: "bg-purple-100 text-purple-800",
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

const toFallbackName = (index: number): string => `Diák ${index + 1}`;

const ClassroomMockup = ({ students = [] }: ClassroomMockupProps) => {
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

  return (
    <div
      className="w-full rounded-3xl border border-slate-300/60 bg-[#eceff3] p-3 shadow-[0_20px_45px_rgba(22,35,60,0.12)] sm:p-4"
      style={{ fontFamily: "'Trebuchet MS', Verdana, sans-serif" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-700 sm:text-base">
          Classroom Live View
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-1 font-semibold text-teal-800">
            <i className="pi pi-circle-fill text-[8px]" />
            Fókusz
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 font-semibold text-sky-800">
            <i className="pi pi-circle-fill text-[8px]" />
            Stabil
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-1 font-semibold text-purple-800">
            <i className="pi pi-circle-fill text-[8px]" />
            Szétszórt
          </span>
        </div>
      </div>

      <div className="relative mx-auto aspect-[4/3] w-full max-w-[1060px] overflow-hidden rounded-[26px] border-2 border-slate-800/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]">
        <div className="absolute inset-0 bg-[#f1f4f8]" />

        <div className="absolute inset-x-0 top-0 h-[36%] bg-[#e5ecf5]" />
        <div className="absolute inset-x-0 bottom-0 h-[64%] bg-[#d2c1ac]" />

        <div className="absolute right-[8%] top-[7%] h-[16%] w-[9%] rounded-md border border-slate-300/70 bg-[#d6e4f2] shadow-[inset_0_0_14px_rgba(255,255,255,0.75)]" />
        <div className="absolute right-[20%] top-[7%] h-[16%] w-[9%] rounded-md border border-slate-300/70 bg-[#d6e4f2] shadow-[inset_0_0_14px_rgba(255,255,255,0.75)]" />

        <div className="absolute left-5 top-4 h-4 w-[34%] min-w-[130px] rounded-lg border-2 border-slate-700/70 bg-[#5f766a] px-3 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-100 shadow-lg sm:h-8 sm:text-sm">
          Interaktív Tábla
        </div>

        <div className="absolute left-6 top-[26%] h-12 w-[24%] min-w-[120px] rounded-lg border-2 border-[#71604f] bg-[#b3a08c] px-3 py-2 text-center text-[10px] font-bold tracking-wide text-slate-100 shadow-md sm:h-14 sm:text-xs">
          Tanári szék
        </div>

        <div className="absolute left-1/2 top-[11%] flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[#8f7f86] bg-[#ddced3] text-[11px] font-bold text-[#5f4e55] shadow-[0_10px_20px_rgba(101,89,95,0.25)] sm:h-20 sm:w-20 sm:text-sm">
          Tanár
        </div>

        <div className="absolute right-0 top-[20%] h-16 w-6 rounded-l-lg bg-[#b2a48f] shadow-[inset_0_0_10px_rgba(0,0,0,0.16)] sm:h-20 sm:w-7" />

        <div className="absolute inset-x-3 bottom-3 top-[40%] grid grid-cols-3 grid-rows-2 gap-2 sm:inset-x-6 sm:bottom-5 sm:top-[42%] sm:gap-5">
          {Array.from({ length: DESK_GROUP_COUNT }, (_, deskIndex) => {
            const firstSeatIndex = deskIndex * STUDENTS_PER_DESK;
            const secondSeatIndex = firstSeatIndex + 1;
            const first = seatStudents[firstSeatIndex];
            const second = seatStudents[secondSeatIndex];
            const firstState = getStudentState(first, firstSeatIndex);
            const secondState = getStudentState(second, secondSeatIndex);
            const firstStyle = STATE_STYLES[firstState];
            const secondStyle = STATE_STYLES[secondState];

            return (
              <div
                key={`desk-${deskIndex + 1}`}
                className="flex flex-col items-center justify-start gap-2 rounded-xl bg-slate-700/8 p-1.5 backdrop-blur-[1px] sm:gap-3 sm:p-2"
              >
                <div className="h-8 w-full rounded-md border-2 border-[#7c6a57] bg-[#cfbfae] shadow-[0_6px_12px_rgba(89,58,34,0.16)] sm:h-11" />

                <div className="grid w-full grid-cols-2 gap-1.5 sm:gap-2">
                  <div
                    className={`flex min-h-[54px] flex-col items-center justify-center rounded-full border-2 px-1 text-center text-[9px] font-bold leading-tight shadow-sm sm:min-h-[68px] sm:text-[10px] ${firstStyle.ringClass}`}
                  >
                    <span className="truncate max-w-[78px] sm:max-w-[88px]">{first.name}</span>
                    <span
                      className={`mt-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${firstStyle.badgeClass}`}
                    >
                      {firstStyle.label}
                    </span>
                  </div>

                  <div
                    className={`flex min-h-[54px] flex-col items-center justify-center rounded-full border-2 px-1 text-center text-[9px] font-bold leading-tight shadow-sm sm:min-h-[68px] sm:text-[10px] ${secondStyle.ringClass}`}
                  >
                    <span className="truncate max-w-[78px] sm:max-w-[88px]">{second.name}</span>
                    <span
                      className={`mt-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${secondStyle.badgeClass}`}
                    >
                      {secondStyle.label}
                    </span>
                  </div>
                </div>

                <div className="mt-auto flex w-full items-center justify-center gap-2 text-[11px] font-semibold text-slate-700 sm:text-[10px]">
                  <span className={`h-2 w-2 rounded-full ${firstStyle.dotClass}`} />
                  <span className="truncate max-w-[42%]">{first.profile ?? "Typical"}</span>
                  <span className={`h-2 w-2 rounded-full ${secondStyle.dotClass}`} />
                  <span className="truncate max-w-[42%]">{second.profile ?? "Typical"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(ClassroomMockup);
