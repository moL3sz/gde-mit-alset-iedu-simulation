import { Button } from "primereact/button";
import { Dropdown, type DropdownChangeEvent } from "primereact/dropdown";
import EduCover from "../assets/edu.jpg";
import { useSockets } from ".././context/SocketContext.tsx";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InputNumber, type InputNumberValueChangeEvent } from "primereact/inputnumber";

const START_STORAGE_KEY = "startSetup";
const STUDENTS_STORAGE_KEY = "studentsSetup";
const CLASSROOM_STORAGE_KEY = "classroomSetup";
const MIN_PERIOD = 1;
const MAX_PERIOD = 6;

const subjects = [
  "Mathematics",
  "English",
  "History",
  "Geography",
  "Biology",
  "Physics",
  "Chemistry",
  "Computer Science",
];

const safeParse = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const StartPage = () => {
  const { initializeSockets } = useSockets();
  const navigate = useNavigate();
  const [subject, setSubject] = useState<string | null>(null);
  const [period, setPeriod] = useState<number | null>(null);
  const laraPrimary = "var(--primary-color, #6366f1)";
  const laraPrimaryDark = "var(--primary-600, #4f46e5)";
  const laraPrimarySoft = "var(--primary-300, #a5b4fc)";
  const laraSurface = "var(--surface-card, #ffffff)";
  const laraText = "var(--text-color, #1f2937)";
  const laraTextMuted = "var(--text-color-secondary, #64748b)";

  const persistStartSetup = (nextSubject: string | null, nextPeriod: number | null) => {
    localStorage.setItem(
      START_STORAGE_KEY,
      JSON.stringify({
        subject: nextSubject,
        period: nextPeriod,
      }),
    );
  };

  useEffect(() => {
    const stored = safeParse(localStorage.getItem(START_STORAGE_KEY)) as {
      subject?: string;
      period?: number;
    } | null;
    if (stored?.subject && subjects.includes(stored.subject)) {
      setSubject(stored.subject);
    }

    if (
      typeof stored?.period === "number" &&
      Number.isInteger(stored.period) &&
      stored.period >= MIN_PERIOD &&
      stored.period <= MAX_PERIOD
    ) {
      setPeriod(stored.period);
    }
  }, []);

  const handleSubjectChange = (event: DropdownChangeEvent) => {
    const selectedSubject = event.value as string | null;
    setSubject(selectedSubject);
    persistStartSetup(selectedSubject, period);
  };

  const handlePeriodChange = (event: InputNumberValueChangeEvent) => {
    const rawValue = typeof event.value === "number" ? event.value : null;
    const normalizedPeriod =
      rawValue === null ? null : Math.max(MIN_PERIOD, Math.min(MAX_PERIOD, Math.trunc(rawValue)));
    setPeriod(normalizedPeriod);
    persistStartSetup(subject, normalizedPeriod);
  };

  const startSimulation = () => {
    persistStartSetup(subject, period);

    const simulationPayload = {
      studentsSetup: safeParse(localStorage.getItem(STUDENTS_STORAGE_KEY)),
      classroomSetup: safeParse(localStorage.getItem(CLASSROOM_STORAGE_KEY)),
      startSetup: safeParse(localStorage.getItem(START_STORAGE_KEY)),
    };

    console.log("Simulation setup:", simulationPayload);
    initializeSockets();
    navigate("/simulation");
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden px-6 py-10 sm:py-14">
      <style>
        {`
          @keyframes startSkyShift {
            0% { background-position: 0% 40%; }
            50% { background-position: 100% 60%; }
            100% { background-position: 0% 40%; }
          }
          @keyframes startBlobFloatA {
            0% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
            50% { transform: translate3d(7%, -4%, 0) rotate(4deg) scale(1.1); }
            100% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
          }
          @keyframes startBlobFloatB {
            0% { transform: translate3d(8%, 0%, 0) rotate(4deg) scale(1.03); }
            50% { transform: translate3d(-8%, 4%, 0) rotate(-4deg) scale(1.12); }
            100% { transform: translate3d(8%, 0%, 0) rotate(4deg) scale(1.03); }
          }
          @keyframes startWaveDrift {
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
          animation: "startSkyShift 14s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -left-[20%] -top-[26%] h-[60%] w-[120%] rounded-[100%] blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 70%)",
          animation: "startBlobFloatA 16s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-[32%] -right-[18%] h-[72%] w-[130%] rounded-[100%] blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(79,70,229,0.28) 0%, rgba(79,70,229,0) 75%)",
          animation: "startBlobFloatB 18s ease-in-out infinite",
        }}
      />

      <main className="relative z-10 flex flex-1 items-center justify-center">
        <section
          className="w-full max-w-6xl overflow-hidden rounded-2xl p-6 shadow-[0_24px_64px_rgba(30,41,59,0.35)] sm:p-10"
          style={{
            background: laraSurface,
            fontFamily: "'Avenir Next', 'Segoe UI', 'Trebuchet MS', sans-serif",
          }}
        >
          <div className="grid gap-8 lg:grid-cols-[1.02fr_1fr] lg:gap-10">
            <div className="relative z-10 flex flex-col justify-center pt-2 sm:pt-4">
              <div
                className="mb-7 inline-flex h-14 w-14 items-center justify-center rounded-lg text-white"
                style={{
                  background: `linear-gradient(135deg, ${laraPrimaryDark}, ${laraPrimary})`,
                  boxShadow: "0 12px 28px rgba(79,70,229,0.32)",
                }}
              >
                <span className="text-xl font-black tracking-wider">IE</span>
              </div>

              <h1
                className="max-w-xl text-4xl font-black uppercase leading-[1.02] tracking-[0.08em] sm:text-5xl"
                style={{ color: laraText }}
              >
                Lesson
                <br />
                Setup
              </h1>
              <p
                className="mt-5 max-w-lg text-sm leading-7 sm:text-base"
                style={{ color: laraTextMuted }}
              >
                Configure period and subject before starting the simulation. The selected setup is
                stored and used when creating the live classroom session.
              </p>

              <div className="relative mt-7 overflow-hidden rounded-2xl">
                <img className="h-56 w-full object-cover sm:h-64" src={EduCover} alt="Classroom" />
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-900/50 via-indigo-700/30 to-cyan-400/25" />
                <div className="absolute bottom-4 left-4 rounded-md bg-white/85 px-3 py-1 text-xs font-semibold text-slate-700">
                  Multi-agent lesson orchestration
                </div>
              </div>
            </div>

            <div className="relative min-h-[320px] sm:min-h-[380px]">
              <div
                className="absolute -bottom-[35%] left-[5%] h-[90%] w-[125%] rounded-[58%] opacity-90"
                style={{
                  background: `linear-gradient(118deg, ${laraPrimarySoft} 0%, ${laraPrimary} 56%, ${laraPrimaryDark} 100%)`,
                  animation: "startWaveDrift 11s ease-in-out infinite",
                }}
              />
              <div
                className="absolute -bottom-[48%] left-[-6%] h-[82%] w-[118%] rounded-[56%] opacity-85"
                style={{
                  background:
                    "linear-gradient(120deg, rgba(96,165,250,0.86) 0%, rgba(99,102,241,0.78) 46%, rgba(79,70,229,0.84) 100%)",
                  animation: "startWaveDrift 14s ease-in-out infinite reverse",
                }}
              />

              <div className="relative z-10 ml-auto w-full max-w-[460px] rounded-2xl bg-white/88 p-5 shadow-[0_16px_42px_rgba(15,23,42,0.18)] backdrop-blur-sm sm:p-6">
                <h2 className="text-xl font-black tracking-tight" style={{ color: laraText }}>
                  Start Simulation
                </h2>
                <p className="mt-2 text-sm" style={{ color: laraTextMuted }}>
                  Pick the period and subject to initialize the session.
                </p>

                <div className="mt-6 flex flex-col gap-4">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Period
                    </label>
                    <InputNumber
                      className="w-full"
                      value={period}
                      onValueChange={handlePeriodChange}
                      placeholder="Period number"
                      max={MAX_PERIOD}
                      min={MIN_PERIOD}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Subject
                    </label>
                    <Dropdown
                      className="w-full"
                      options={subjects}
                      value={subject}
                      onChange={handleSubjectChange}
                      placeholder="Select subject..."
                    />
                  </div>
                  <Button
                    icon="pi pi-play-circle"
                    label="Start simulation"
                    onClick={startSimulation}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
