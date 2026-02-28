import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { Dropdown, type DropdownChangeEvent } from "primereact/dropdown";
import { InputNumber, type InputNumberValueChangeEvent } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { Slider } from "primereact/slider";
import { Tag } from "primereact/tag";

type StudentProfile = "ADHD" | "Autistic" | "Typical";

type StudentCard = {
  id: number;
  name: string;
  attentiveness: number;
  comprehension: number;
  behavior: number;
  profile: StudentProfile;
};

type StoredStudentCard = {
  id?: number;
  name?: string;
  attentiveness?: number;
  comprehension?: number;
  behavior?: number;
  profile?: string;
};

type StudentsSetupStorage = {
  studentCount?: number;
  students?: StoredStudentCard[];
};

const STUDENT_MIN = 1;
const STUDENT_MAX = 12;
const PROFILE_OPTIONS: StudentProfile[] = ["ADHD", "Autistic", "Typical"];
const STORAGE_KEY = "studentsSetup";

const createStudent = (id: number): StudentCard => ({
  id,
  name: `Student ${id}`,
  attentiveness: 5,
  comprehension: 5,
  behavior: 5,
  profile: "Typical",
});

const normalizeCount = (value: number) => {
  if (Number.isNaN(value)) {
    return STUDENT_MIN;
  }

  return Math.min(STUDENT_MAX, Math.max(STUDENT_MIN, Math.floor(value)));
};

const normalizeScore = (value: unknown) => {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (Number.isNaN(numericValue)) {
    return 5;
  }

  return Math.min(10, Math.max(0, Math.floor(numericValue)));
};

const isStudentProfile = (value: unknown): value is StudentProfile =>
  value === "ADHD" || value === "Autistic" || value === "Typical";

const getInitialStudentsState = (): { studentCount: number; students: StudentCard[] } => {
  const defaultStudents = Array.from({ length: 4 }, (_, i) => createStudent(i + 1));

  if (typeof window === "undefined") {
    return { studentCount: 4, students: defaultStudents };
  }

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return { studentCount: 4, students: defaultStudents };
  }

  try {
    const parsed = JSON.parse(raw) as StudentsSetupStorage;
    const rawStudents = Array.isArray(parsed.students) ? parsed.students : [];
    const sanitizedStudents = rawStudents.map((storedStudent, index) => ({
      id: index + 1,
      name:
        typeof storedStudent.name === "string" && storedStudent.name.trim().length > 0
          ? storedStudent.name
          : `Student ${index + 1}`,
      attentiveness: normalizeScore(storedStudent.attentiveness),
      comprehension: normalizeScore(storedStudent.comprehension),
      behavior: normalizeScore(storedStudent.behavior),
      profile: isStudentProfile(storedStudent.profile) ? storedStudent.profile : "Typical",
    }));

    const hasStoredCount = typeof parsed.studentCount === "number" && !Number.isNaN(parsed.studentCount);
    const storedCount = hasStoredCount ? normalizeCount(parsed.studentCount as number) : undefined;
    const targetCount = storedCount ?? (sanitizedStudents.length > 0 ? sanitizedStudents.length : 4);

    if (sanitizedStudents.length > targetCount) {
      return {
        studentCount: targetCount,
        students: sanitizedStudents.slice(0, targetCount),
      };
    }

    if (sanitizedStudents.length < targetCount) {
      const appendedStudents = Array.from(
        { length: targetCount - sanitizedStudents.length },
        (_, i) => createStudent(sanitizedStudents.length + i + 1),
      );

      return {
        studentCount: targetCount,
        students: [...sanitizedStudents, ...appendedStudents],
      };
    }

    return {
      studentCount: targetCount,
      students: sanitizedStudents,
    };
  } catch {
    return { studentCount: 4, students: defaultStudents };
  }
};

export const Students = () => {
  const navigate = useNavigate();
  const [initialState] = useState(() => getInitialStudentsState());
  const [studentCount, setStudentCount] = useState<number>(initialState.studentCount);
  const [students, setStudents] = useState<StudentCard[]>(initialState.students);
  const laraPrimary = "var(--primary-color, #6366f1)";
  const laraPrimaryDark = "var(--primary-600, #4f46e5)";
  const laraPrimarySoft = "var(--primary-300, #a5b4fc)";
  const laraSurface = "var(--surface-card, #ffffff)";
  const laraText = "var(--text-color, #1f2937)";
  const laraTextMuted = "var(--text-color-secondary, #64748b)";

  useEffect(() => {
    setStudents((prevStudents) => {
      if (prevStudents.length === studentCount) {
        return prevStudents;
      }

      if (studentCount < prevStudents.length) {
        return prevStudents.slice(0, studentCount);
      }

      const newStudents = Array.from(
        { length: studentCount - prevStudents.length },
        (_, i) => createStudent(prevStudents.length + i + 1),
      );

      return [...prevStudents, ...newStudents];
    });
  }, [studentCount]);

  const updateStudent = <K extends keyof StudentCard>(
    id: number,
    key: K,
    value: StudentCard[K],
  ) => {
    setStudents((prevStudents) =>
      prevStudents.map((student) =>
        student.id === id ? { ...student, [key]: value } : student,
      ),
    );
  };

  const handleStudentCountChange = (event: InputNumberValueChangeEvent) => {
    setStudentCount(normalizeCount(Number(event.value)));
  };

  const handleContinue = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        studentCount,
        students,
      }),
    );

    navigate("/classrom");
  };

  const compactCardPt = {
    root: {
      className:
        "overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
    },
    body: { className: "p-3" },
    content: { className: "p-0" },
  };

  const renderSliderField = (
    student: StudentCard,
    label: string,
    value: number,
    key: "attentiveness" | "comprehension" | "behavior",
  ) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm">{label}</label>
        <span className="text-sm">{value}</span>
      </div>
      <Slider
        value={value}
        min={0}
        max={10}
        onChange={(event) => updateStudent(student.id, key, Number(event.value))}
      />
    </div>
  );

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden px-6 py-10 sm:py-14">
      <style>
        {`
          @keyframes studentsSkyShift {
            0% { background-position: 0% 40%; }
            50% { background-position: 100% 60%; }
            100% { background-position: 0% 40%; }
          }
          @keyframes studentsBlobFloatA {
            0% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
            50% { transform: translate3d(7%, -4%, 0) rotate(4deg) scale(1.1); }
            100% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
          }
          @keyframes studentsBlobFloatB {
            0% { transform: translate3d(8%, 0%, 0) rotate(4deg) scale(1.03); }
            50% { transform: translate3d(-8%, 4%, 0) rotate(-4deg) scale(1.12); }
            100% { transform: translate3d(8%, 0%, 0) rotate(4deg) scale(1.03); }
          }
          @keyframes studentsWaveDrift {
            0% { transform: translate3d(-4%, 2%, 0); }
            50% { transform: translate3d(4%, -2%, 0); }
            100% { transform: translate3d(-4%, 2%, 0); }
          }
        `}
      </style>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(122deg, #4f46e5 0%, #6366f1 18%, #818cf8 36%, #60a5fa 54%, #38bdf8 72%, #6366f1 100%)",
          backgroundSize: "230% 230%",
          animation: "studentsSkyShift 14s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -left-[20%] -top-[26%] h-[60%] w-[120%] rounded-[100%] blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 70%)",
          animation: "studentsBlobFloatA 16s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-[32%] -right-[18%] h-[72%] w-[130%] rounded-[100%] blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(79,70,229,0.28) 0%, rgba(79,70,229,0) 75%)",
          animation: "studentsBlobFloatB 18s ease-in-out infinite",
        }}
      />

      <main className="relative z-10 flex flex-1 items-center justify-center">
        <section
          className="w-full max-w-7xl overflow-hidden rounded-2xl p-6 shadow-[0_24px_64px_rgba(30,41,59,0.35)] sm:p-8"
          style={{
            background: laraSurface,
            fontFamily: "'Avenir Next', 'Segoe UI', 'Trebuchet MS', sans-serif",
          }}
        >
          <div className="relative z-10 flex flex-col gap-6">
            <div className="grid gap-5 xl:grid-cols-[1fr_320px] xl:items-start">
              <div>
                <div
                  className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-lg text-white"
                  style={{
                    background: `linear-gradient(135deg, ${laraPrimaryDark}, ${laraPrimary})`,
                    boxShadow: "0 12px 28px rgba(79,70,229,0.32)",
                  }}
                >
                  <span className="text-xl font-black tracking-wider">IE</span>
                </div>

                <h1
                  className="text-2xl font-black leading-[1.08] tracking-tight sm:text-3xl"
                  style={{ color: laraText }}
                >
                  Students Setup
                </h1>
                <p
                  className="mt-3 max-w-2xl text-sm leading-7 sm:text-base"
                  style={{ color: laraTextMuted }}
                >
                  Configure names, behavioral traits and profiles for each student before entering
                  the classroom setup step.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button
                    label="Continue"
                    icon="pi pi-arrow-right"
                    iconPos="right"
                    onClick={handleContinue}
                  />
                  <span
                    className="rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                    style={{ background: "rgba(99,102,241,0.14)", color: laraPrimaryDark }}
                  >
                    {studentCount} active
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                <label
                  htmlFor="studentCount"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Number of students
                </label>
                <InputNumber
                  inputId="studentCount"
                  value={studentCount}
                  min={STUDENT_MIN}
                  max={STUDENT_MAX}
                  onValueChange={handleStudentCountChange}
                  showButtons
                  size={3}
                  className="w-full"
                />
              </div>
            </div>

            <div className="relative">
              <div
                className="pointer-events-none absolute -bottom-[42%] left-[4%] h-[84%] w-[130%] rounded-[58%] opacity-90"
                style={{
                  background: `linear-gradient(118deg, ${laraPrimarySoft} 0%, ${laraPrimary} 56%, ${laraPrimaryDark} 100%)`,
                  animation: "studentsWaveDrift 11s ease-in-out infinite",
                }}
              />
              <div
                className="pointer-events-none absolute -bottom-[52%] left-[-7%] h-[82%] w-[122%] rounded-[56%] opacity-85"
                style={{
                  background:
                    "linear-gradient(120deg, rgba(96,165,250,0.86) 0%, rgba(99,102,241,0.78) 46%, rgba(79,70,229,0.84) 100%)",
                  animation: "studentsWaveDrift 14s ease-in-out infinite reverse",
                }}
              />

              <div className="relative rounded-2xl bg-white/88 p-4 shadow-[0_16px_42px_rgba(15,23,42,0.18)] backdrop-blur-sm sm:p-5">
                <h2 className="text-2xl font-black tracking-tight" style={{ color: laraText }}>
                  Student Profiles
                </h2>

                <div className="mt-4 max-h-[58vh] overflow-y-auto">
                  <div className="grid grid-cols-1 gap-3 pr-1 md:grid-cols-2 xl:grid-cols-3">
                    {students.map((student) => (
                      <Card key={student.id} pt={compactCardPt}>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-700">{`Student #${student.id}`}</span>
                            <Tag value={student.profile} rounded />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label htmlFor={`student-name-${student.id}`} className="text-sm text-slate-700">
                              Name
                            </label>
                            <InputText
                              id={`student-name-${student.id}`}
                              value={student.name}
                              onChange={(event) => updateStudent(student.id, "name", event.target.value)}
                              placeholder="Student name"
                              className="p-inputtext-sm"
                            />
                          </div>

                          {renderSliderField(
                            student,
                            "Attentiveness",
                            student.attentiveness,
                            "attentiveness",
                          )}
                          {renderSliderField(
                            student,
                            "Comprehension",
                            student.comprehension,
                            "comprehension",
                          )}
                          {renderSliderField(student, "Behavior", student.behavior, "behavior")}

                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`student-profile-${student.id}`}
                              className="text-sm text-slate-700"
                            >
                              Profile
                            </label>
                            <Dropdown
                              inputId={`student-profile-${student.id}`}
                              value={student.profile}
                              options={PROFILE_OPTIONS}
                              onChange={(event: DropdownChangeEvent) =>
                                updateStudent(student.id, "profile", event.value as StudentProfile)
                              }
                              placeholder="Select profile"
                              className="p-inputtext-sm"
                            />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
