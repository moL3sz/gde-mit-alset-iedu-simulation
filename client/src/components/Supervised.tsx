import { useMemo } from "react";
import { Button } from "primereact/button";

import ClassroomMockup, { type ClassroomStudent } from "./ClassroomMockup";

type StudentSetupPayload = {
  students?: ClassroomStudent[];
};

const readStoredStudents = (): ClassroomStudent[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem("studentsSetup");

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as StudentSetupPayload;
    if (!Array.isArray(parsed.students)) {
      return [];
    }

    return parsed.students;
  } catch {
    return [];
  }
};

export const Supervised = () => {
  const students = useMemo(() => readStoredStudents(), []);

  return (
    <section className="h-full w-full p-2 md:w-1/2 md:p-3">
      <div
        className="flex h-full flex-col rounded-3xl border border-slate-300/60 bg-[#eef2f7] shadow-[0_20px_45px_rgba(28,49,83,0.14)]"
        style={{ fontFamily: "'Trebuchet MS', Verdana, sans-serif" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300/70 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black uppercase tracking-[0.14em] text-slate-800 sm:text-2xl">
              Supervised Mode
            </h1>
            <p className="mt-1 text-xs font-semibold tracking-wide text-slate-600 sm:text-sm">
              Élő osztályterem-térkép és csoportdinamika
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              icon="pi pi-chart-bar"
              label="Charts"
              severity="secondary"
              outlined
              size="small"
            />
            <Button
              icon="pi pi-sitemap"
              label="Graph"
              severity="secondary"
              outlined
              size="small"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-2 sm:px-5">
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold tracking-wide text-slate-700 shadow-sm sm:text-xs">
            Aktív diákhelyek: {students.length > 0 ? students.length : 12}
          </span>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-bold tracking-wide text-slate-700 shadow-sm sm:text-xs">
            Realtime vizualizáció
          </span>
        </div>

        <div className="min-h-0 flex-1 p-3 pt-1 sm:p-4 sm:pt-2">
          <ClassroomMockup students={students} />
        </div>
      </div>
    </section>
  );
};
