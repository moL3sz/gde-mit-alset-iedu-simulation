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
      <div className="p-4 flex justify-center">
        <Card title="No students found" className="max-w-md w-full">
          <p className="mb-3">You need to configure students first.</p>
          <Button label="Back to Students" onClick={() => navigate("/")} />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Classroom Seating</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Classroom name</span>
          <InputText
            value={classroomName}
            onChange={(event) => setClassroomName(event.target.value)}
            placeholder="Enter classroom name"
            className="p-inputtext-sm w-56"
          />
          <Button label="Back" severity="secondary" outlined onClick={() => navigate("/")} />
          <Button
            label="Continue"
            icon="pi pi-arrow-right"
            iconPos="right"
            onClick={handleContinue}
            loading={isSaving}
            disabled={isSaving || classroomName.trim().length === 0}
          />
        </div>
      </div>
      {saveError ? <small className="mb-3 block text-red-600">{saveError}</small> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {deskGroups.map((deskSeatIds, deskIndex) => (
          <Card
            key={deskIndex}
            title={`Desk ${deskIndex + 1}`}
            pt={{
              body: { className: "p-3" },
              title: { className: "text-sm mb-2" },
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
                      }}
                      onClick={(event) => handleSeatClick(event, seatId)}
                    />
                    <small className="text-xs">
                      {assignedStudent ? assignedStudent.name : `Seat ${seatId}`}
                    </small>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
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
    </div>
  );
};
