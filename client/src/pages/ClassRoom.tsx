import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "primereact/avatar";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { InputText } from "primereact/inputtext";
import { ListBox } from "primereact/listbox";
import { OverlayPanel } from "primereact/overlaypanel";

type StudentProfile = "ADHD" | "Autistic" | "Typical";

type StoredStudent = {
  id: number;
  name: string;
  attentiveness: number;
  comprehension: number;
  behavior: number;
  profile: StudentProfile;
};

type StudentSetupStorage = {
  studentCount?: number;
  students?: Array<{
    id?: number;
    name?: string;
    attentiveness?: number;
    comprehension?: number;
    behavior?: number;
    profile?: string;
  }>;
};

type ClassroomSetupStorage = {
  assignments?: Record<string, number | null>;
  classroomName?: string;
  classroomId?: number;
  classroom?: { name?: string } | null;
  localToDbStudentIdMap?: Record<string, number>;
};

const STORAGE_KEY = "studentsSetup";
const CLASSROOM_STORAGE_KEY = "classroomSetup";
const CLASSROOM_ID_STORAGE_KEY = "classroomId";
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
const AVATAR_COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#3b82f6",
  "#84cc16",
  "#f97316",
  "#ec4899",
];

const createSeatIds = (count: number) => Array.from({ length: count }, (_, i) => i + 1);
const getAvatarColor = (studentId: number) => AVATAR_COLORS[(studentId - 1) % AVATAR_COLORS.length];
const isStudentProfile = (value: unknown): value is StudentProfile =>
  value === "ADHD" || value === "Autistic" || value === "Typical";
const normalizeScore = (value: unknown) => {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (Number.isNaN(numericValue)) {
    return 5;
  }

  return Math.min(10, Math.max(0, Math.floor(numericValue)));
};

type ClassroomEntity = {
  id: number;
  name: string;
  students?: Array<{ id: number; name: string }>;
};

type StudentEntity = {
  id: number;
};

const requestJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
};

const getInitials = (name: string) => {
  const chunks = name
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);

  if (chunks.length === 0) {
    return "?";
  }

  return chunks.map((chunk) => chunk[0]?.toUpperCase() ?? "").join("");
};

export const ClassRoom = () => {
  const navigate = useNavigate();
  const overlayRef = useRef<OverlayPanel>(null);
  const [students, setStudents] = useState<StoredStudent[]>([]);
  const [seatIds, setSeatIds] = useState<number[]>([]);
  const [assignments, setAssignments] = useState<Record<number, number | null>>({});
  const [activeSeatId, setActiveSeatId] = useState<number | null>(null);
  const [classroomName, setClassroomName] = useState("Classroom");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const laraPrimary = "var(--primary-color, #6366f1)";
  const laraPrimaryDark = "var(--primary-600, #4f46e5)";
  const laraSurface = "var(--surface-card, #ffffff)";
  const laraText = "var(--text-color, #1f2937)";
  const laraTextMuted = "var(--text-color-secondary, #64748b)";

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      setStudents([]);
      setSeatIds([]);
      setAssignments({});
      return;
    }

    try {
      const parsed = JSON.parse(raw) as StudentSetupStorage;
      const parsedStudents = Array.isArray(parsed.students) ? parsed.students : [];
      const sanitizedStudents: StoredStudent[] = parsedStudents.map((student, index) => ({
        id: typeof student.id === "number" ? student.id : index + 1,
        name:
          typeof student.name === "string" && student.name.trim().length > 0
            ? student.name
            : `Student ${index + 1}`,
        attentiveness: normalizeScore(student.attentiveness),
        comprehension: normalizeScore(student.comprehension),
        behavior: normalizeScore(student.behavior),
        profile: isStudentProfile(student.profile) ? student.profile : "Typical",
      }));

      const fallbackCount =
        typeof parsed.studentCount === "number" && parsed.studentCount > 0
          ? Math.floor(parsed.studentCount)
          : 0;
      const totalSeats = sanitizedStudents.length > 0 ? sanitizedStudents.length : fallbackCount;
      const seats = createSeatIds(totalSeats);
      const initialAssignments = seats.reduce<Record<number, number | null>>((acc, seatId) => {
        acc[seatId] = null;
        return acc;
      }, {});
      let restoredClassroomName: string | null = null;
      const validStudentIds = new Set(sanitizedStudents.map((student) => student.id));
      const storedClassroomRaw = localStorage.getItem(CLASSROOM_STORAGE_KEY);

      if (storedClassroomRaw) {
        try {
          const parsedClassroom = JSON.parse(storedClassroomRaw) as ClassroomSetupStorage;
          const byKey =
            typeof parsedClassroom.classroomName === "string"
              ? parsedClassroom.classroomName.trim()
              : "";
          const byEntity =
            typeof parsedClassroom.classroom?.name === "string"
              ? parsedClassroom.classroom.name.trim()
              : "";
          restoredClassroomName = byKey || byEntity || null;
          const storedAssignments = parsedClassroom.assignments ?? {};
          const alreadyAssigned = new Set<number>();

          for (const seatId of seats) {
            const storedStudentId = storedAssignments[String(seatId)];

            if (
              typeof storedStudentId === "number" &&
              validStudentIds.has(storedStudentId) &&
              !alreadyAssigned.has(storedStudentId)
            ) {
              initialAssignments[seatId] = storedStudentId;
              alreadyAssigned.add(storedStudentId);
            }
          }
        } catch {
          // Ignore invalid classroom storage and keep empty seat assignments.
        }
      }

      setStudents(sanitizedStudents);
      setSeatIds(seats);
      setAssignments(initialAssignments);
      setClassroomName(restoredClassroomName ?? "Classroom");
    } catch {
      setStudents([]);
      setSeatIds([]);
      setAssignments({});
      setClassroomName("Classroom");
    }
  }, []);

  useEffect(() => {
    if (seatIds.length === 0) {
      return;
    }

    localStorage.setItem(
      CLASSROOM_STORAGE_KEY,
      JSON.stringify({
        assignments,
        classroomName,
      }),
    );
  }, [assignments, classroomName, seatIds]);

  const deskGroups = useMemo(() => {
    const groups: number[][] = [];

    for (let index = 0; index < seatIds.length; index += 2) {
      groups.push(seatIds.slice(index, index + 2));
    }

    return groups;
  }, [seatIds]);

  const selectableStudentOptions = useMemo(() => {
    const takenStudentIds = new Set<number>();

    for (const [seatId, studentId] of Object.entries(assignments)) {
      if (Number(seatId) !== activeSeatId && typeof studentId === "number") {
        takenStudentIds.add(studentId);
      }
    }

    return [
      { label: "Empty seat", value: null },
      ...students
        .filter((student) => !takenStudentIds.has(student.id))
        .map((student) => ({
          label: student.name,
          value: student.id,
        })),
    ];
  }, [assignments, activeSeatId, students]);

  const activeSeatValue = activeSeatId === null ? null : assignments[activeSeatId] ?? null;

  const handleSeatClick = (event: React.MouseEvent<HTMLElement>, seatId: number) => {
    setActiveSeatId(seatId);
    overlayRef.current?.toggle(event);
  };

  const handleSelectStudent = (event: { value: number | null }) => {
    if (activeSeatId === null) {
      return;
    }

    setAssignments((prevAssignments) => ({
      ...prevAssignments,
      [activeSeatId]: event.value,
    }));

    overlayRef.current?.hide();
    setActiveSeatId(null);
  };

  const handleContinue = async () => {
    const trimmedClassroomName = classroomName.trim();

    if (!trimmedClassroomName) {
      setSaveError("Classroom name is required.");
      return;
    }

    try {
      setSaveError(null);
      setIsSaving(true);

      const createdClassroom = await requestJson<ClassroomEntity>("/classrooms", {
        method: "POST",
        body: JSON.stringify({ name: trimmedClassroomName }),
      });

      const createdStudents = await Promise.all(
        students.map(async (student) => {
          const createdStudent = await requestJson<StudentEntity>("/students", {
            method: "POST",
            body: JSON.stringify({
              name: student.name,
              attentiveness: student.attentiveness,
              comprehension: student.comprehension,
              behavior: student.behavior,
              profile: student.profile,
              classroomId: createdClassroom.id,
            }),
          });

          return {
            localId: student.id,
            dbId: createdStudent.id,
          };
        }),
      );

      const localToDbStudentIdMap = createdStudents.reduce<Record<string, number>>(
        (accumulator, item) => {
          accumulator[String(item.localId)] = item.dbId;
          return accumulator;
        },
        {},
      );

      const classroomWithStudents = await requestJson<ClassroomEntity>(
        `/classrooms/${createdClassroom.id}`,
      );

      localStorage.setItem(CLASSROOM_ID_STORAGE_KEY, String(createdClassroom.id));
      localStorage.setItem(
        CLASSROOM_STORAGE_KEY,
        JSON.stringify({
          assignments,
          classroomName: trimmedClassroomName,
          classroomId: createdClassroom.id,
          classroom: classroomWithStudents,
          localToDbStudentIdMap,
        } satisfies ClassroomSetupStorage),
      );

      navigate("/start");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save classroom.");
    } finally {
      setIsSaving(false);
    }
  };

  if (seatIds.length === 0) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
        <style>
          {`
            @keyframes classroomSkyShift {
              0% { background-position: 0% 40%; }
              50% { background-position: 100% 60%; }
              100% { background-position: 0% 40%; }
            }
            @keyframes classroomBlobFloatA {
              0% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
              50% { transform: translate3d(7%, -4%, 0) rotate(4deg) scale(1.1); }
              100% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
            }
            @keyframes classroomBlobFloatB {
              0% { transform: translate3d(8%, 0%, 0) rotate(4deg) scale(1.03); }
              50% { transform: translate3d(-8%, 4%, 0) rotate(-4deg) scale(1.12); }
              100% { transform: translate3d(8%, 0%, 0) rotate(4deg) scale(1.03); }
            }
          `}
        </style>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(122deg, #4f46e5 0%, #6366f1 18%, #818cf8 36%, #60a5fa 54%, #38bdf8 72%, #6366f1 100%)",
            backgroundSize: "230% 230%",
            animation: "classroomSkyShift 14s ease-in-out infinite",
          }}
        />
        <div
          className="pointer-events-none absolute -left-[20%] -top-[26%] h-[60%] w-[120%] rounded-[100%] blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 70%)",
            animation: "classroomBlobFloatA 16s ease-in-out infinite",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-[32%] -right-[18%] h-[72%] w-[130%] rounded-[100%] blur-3xl"
          style={{
            background: "radial-gradient(circle, rgba(79,70,229,0.28) 0%, rgba(79,70,229,0) 75%)",
            animation: "classroomBlobFloatB 18s ease-in-out infinite",
          }}
        />

        <section
          className="relative z-10 w-full max-w-lg rounded-2xl p-7 shadow-[0_24px_64px_rgba(30,41,59,0.35)]"
          style={{
            background: laraSurface,
            fontFamily: "'Avenir Next', 'Segoe UI', 'Trebuchet MS', sans-serif",
          }}
        >
          <h1 className="text-2xl font-black tracking-tight" style={{ color: laraText }}>
            No Students Found
          </h1>
          <p className="mt-3 text-sm leading-6" style={{ color: laraTextMuted }}>
            You need to configure students first before setting up classroom seats.
          </p>
          <Button
            label="Back to Students"
            className="mt-6 h-11 rounded-xl !border-0 px-6 font-semibold"
            style={{
              background: `linear-gradient(135deg, ${laraPrimaryDark}, ${laraPrimary})`,
              color: "#ffffff",
              boxShadow: "0 12px 30px rgba(99,102,241,0.34)",
            }}
            onClick={() => navigate("/students")}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10 sm:py-14">
      <style>
        {`
          @keyframes classroomSkyShift {
            0% { background-position: 0% 40%; }
            50% { background-position: 100% 60%; }
            100% { background-position: 0% 40%; }
          }
          @keyframes classroomBlobFloatA {
            0% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
            50% { transform: translate3d(7%, -4%, 0) rotate(4deg) scale(1.1); }
            100% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
          }
          @keyframes classroomBlobFloatB {
            0% { transform: translate3d(8%, 0%, 0) rotate(4deg) scale(1.03); }
            50% { transform: translate3d(-8%, 4%, 0) rotate(-4deg) scale(1.12); }
            100% { transform: translate3d(8%, 0%, 0) rotate(4deg) scale(1.03); }
          }
        `}
      </style>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(122deg, #4f46e5 0%, #6366f1 18%, #818cf8 36%, #60a5fa 54%, #38bdf8 72%, #6366f1 100%)",
          backgroundSize: "230% 230%",
          animation: "classroomSkyShift 14s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -left-[20%] -top-[26%] h-[60%] w-[120%] rounded-[100%] blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 70%)",
          animation: "classroomBlobFloatA 16s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-[32%] -right-[18%] h-[72%] w-[130%] rounded-[100%] blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(79,70,229,0.28) 0%, rgba(79,70,229,0) 75%)",
          animation: "classroomBlobFloatB 18s ease-in-out infinite",
        }}
      />

      <section
        className="relative z-10 w-full max-w-6xl overflow-hidden rounded-2xl p-6 shadow-[0_24px_64px_rgba(30,41,59,0.35)] sm:p-10"
        style={{
          background: laraSurface,
          fontFamily: "'Avenir Next', 'Segoe UI', 'Trebuchet MS', sans-serif",
        }}
      >
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: laraText }}>
              Classroom Seating
            </h1>
            <p className="mt-2 text-sm" style={{ color: laraTextMuted }}>
              Assign students to desks and save your classroom before starting the lesson.
            </p>
          </div>

          <div className="rounded-xl bg-slate-50/90 p-3 sm:p-4">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Classroom name
            </span>
            <InputText
              value={classroomName}
              onChange={(event) => setClassroomName(event.target.value)}
              placeholder="Enter classroom name"
              className="p-inputtext-sm w-full sm:w-64"
            />
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <Button
            label="Back"
            severity="secondary"
            outlined
            onClick={() => navigate("/students")}
          />
          <Button
            label="Continue"
            icon="pi pi-arrow-right"
            iconPos="right"
            onClick={handleContinue}
            loading={isSaving}
            disabled={isSaving || classroomName.trim().length === 0}
          />
        </div>

        {saveError ? (
          <small className="mb-4 block rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {saveError}
          </small>
        ) : null}

        <div className="relative rounded-2xl bg-white p-4 sm:p-5">
          <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-3">
            {deskGroups.map((deskSeatIds, deskIndex) => (
              <Card
                key={deskIndex}
                title={`Desk ${deskIndex + 1}`}
                className="border border-slate-200/70 shadow-sm"
                pt={{
                  root: { className: "rounded-xl bg-white" },
                  body: { className: "p-3" },
                  title: { className: "text-sm mb-2 text-slate-700" },
                  content: { className: "p-0" },
                }}
              >
                <div className="flex justify-center gap-4">
                  {deskSeatIds.map((seatId) => {
                    const assignedStudentId = assignments[seatId];
                    const assignedStudent =
                      typeof assignedStudentId === "number"
                        ? students.find((student) => student.id === assignedStudentId)
                        : undefined;

                    return (
                      <div key={seatId} className="flex flex-col items-center gap-1">
                        <Avatar
                          shape="circle"
                          size="xlarge"
                          label={assignedStudent ? getInitials(assignedStudent.name) : undefined}
                          icon={assignedStudent ? undefined : "pi pi-plus"}
                          style={{
                            cursor: "pointer",
                            backgroundColor: assignedStudent
                              ? getAvatarColor(assignedStudent.id)
                              : "#e5e7eb",
                            color: assignedStudent ? "#ffffff" : "#334155",
                            boxShadow: assignedStudent
                              ? "0 10px 22px rgba(15,23,42,0.2)"
                              : "inset 0 0 0 1px rgba(100,116,139,0.35)",
                          }}
                          onClick={(event) => handleSeatClick(event, seatId)}
                        />
                        <small className="max-w-24 truncate text-xs text-slate-600">
                          {assignedStudent ? assignedStudent.name : `Seat ${seatId}`}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </div>

        <OverlayPanel ref={overlayRef} onHide={() => setActiveSeatId(null)}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              {activeSeatId ? `Select student for seat ${activeSeatId}` : "Select student"}
            </span>
            <ListBox
              options={selectableStudentOptions}
              value={activeSeatValue}
              onChange={handleSelectStudent}
              className="w-64"
              listStyle={{ maxHeight: "220px" }}
            />
          </div>
        </OverlayPanel>
      </section>
    </div>
  );
};
