import { useEffect, useMemo } from "react";
import { ProgressBar } from "primereact/progressbar";
import { Supervised } from "../components/Supervised";
import { Unsupervised } from "../components/Unsupervised";
import { useSockets } from "../context/SocketContext";
import {
  useSimulationChannel,
  type SubmitTaskAssignmentInput,
} from "../hooks/useSimulationChannel";

const SIMULATION_DURATION_SECONDS = 45 * 60;
const START_STORAGE_KEY = "startSetup";

const formatTime = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

const getSimulationTopic = (): string => {
  if (typeof window === "undefined") {
    return "Classroom communication";
  }

  const raw = window.localStorage.getItem(START_STORAGE_KEY);
  if (!raw) {
    return "Classroom communication";
  }

  try {
    const parsed = JSON.parse(raw) as { subject?: string };
    const topic = parsed.subject?.trim();
    if (!topic) {
      return "Classroom communication";
    }

    return topic;
  } catch {
    return "Classroom communication";
  }
};

export const Simulation = () => {
  const { supervisedSocket, unsupervisedSocket, initializeSockets } = useSockets();
  const laraPrimary = "var(--primary-color, #6366f1)";
  const laraPrimaryDark = "var(--primary-600, #4f46e5)";
  const laraSurface = "var(--surface-card, #ffffff)";
  const laraText = "var(--text-color, #1f2937)";
  const laraTextMuted = "var(--text-color-secondary, #64748b)";

  useEffect(() => {
    initializeSockets();
  }, [initializeSockets]);

  const topic = useMemo(() => getSimulationTopic(), []);

  const supervisedRuntime = useSimulationChannel({
    channel: "supervised",
    socket: supervisedSocket,
    topic,
  });

  const unsupervisedRuntime = useSimulationChannel({
    channel: "unsupervised",
    socket: unsupervisedSocket,
    topic,
    forcedPause: supervisedRuntime.isPausedForTaskAssignment,
  });

  const elapsedSeconds = useMemo(() => {
    return Math.max(
      supervisedRuntime.simulationElapsedSeconds,
      unsupervisedRuntime.simulationElapsedSeconds,
      0,
    );
  }, [
    supervisedRuntime.simulationElapsedSeconds,
    unsupervisedRuntime.simulationElapsedSeconds,
  ]);

  const totalSeconds = useMemo(() => {
    const serverTotal = Math.max(
      supervisedRuntime.simulationTotalSeconds,
      unsupervisedRuntime.simulationTotalSeconds,
      0,
    );

    return serverTotal > 0 ? serverTotal : SIMULATION_DURATION_SECONDS;
  }, [
    supervisedRuntime.simulationTotalSeconds,
    unsupervisedRuntime.simulationTotalSeconds,
  ]);

  const progressValue = useMemo(() => {
    return totalSeconds > 0 ? Math.min(100, (elapsedSeconds / totalSeconds) * 100) : 0;
  }, [elapsedSeconds, totalSeconds]);

  const submitSupervisedTaskAssignment = async (
    input: SubmitTaskAssignmentInput,
    applyToUnsupervised: boolean,
  ): Promise<boolean> => {
    const supervisedOk = await supervisedRuntime.submitTaskAssignment(input);
    if (!supervisedOk) {
      return false;
    }

    if (!applyToUnsupervised) {
      return true;
    }

    const unsupervisedOk = await unsupervisedRuntime.submitTaskAssignment({
      mode: input.mode,
      autonomousGrouping: true,
    });

    return unsupervisedOk;
  };
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-6">
      <style>
        {`
          @keyframes simulationSkyShift {
            0% { background-position: 0% 40%; }
            50% { background-position: 100% 60%; }
            100% { background-position: 0% 40%; }
          }
          @keyframes simulationBlobFloatA {
            0% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
            50% { transform: translate3d(7%, -4%, 0) rotate(4deg) scale(1.1); }
            100% { transform: translate3d(-8%, 0%, 0) rotate(-4deg) scale(1.02); }
          }
          @keyframes simulationBlobFloatB {
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
          animation: "simulationSkyShift 14s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -left-[20%] -top-[26%] h-[60%] w-[120%] rounded-[100%] blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 70%)",
          animation: "simulationBlobFloatA 16s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-[32%] -right-[18%] h-[72%] w-[130%] rounded-[100%] blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(79,70,229,0.28) 0%, rgba(79,70,229,0) 75%)",
          animation: "simulationBlobFloatB 18s ease-in-out infinite",
        }}
      />

      <div
        className="relative z-10 mb-4 rounded-2xl border border-white/35 p-4 shadow-[0_18px_40px_rgba(30,41,59,0.3)]"
        style={{
          background: laraSurface,
          fontFamily: "'Avenir Next', 'Segoe UI', 'Trebuchet MS', sans-serif",
        }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black uppercase tracking-[0.12em]" style={{ color: laraText }}>
              Simulation Progress
            </h1>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: laraTextMuted }}>
              Topic: {topic}
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{
              background: `linear-gradient(135deg, ${laraPrimaryDark}, ${laraPrimary})`,
            }}
          >
            {formatTime(elapsedSeconds)} / {formatTime(totalSeconds)}
          </span>
        </div>
        <ProgressBar
          value={progressValue}
          showValue={false}
          style={{ height: "0.72rem", backgroundColor: "#e2e8f0" }}
          color="#4f46e5"
        />
      </div>

      <div
        className="relative z-10 min-h-0 flex-1 overflow-hidden"
      >
        <div className="min-h-full overflow-auto md:overflow-hidden">
          <div className="flex min-h-full w-full flex-col md:h-full md:flex-row">
            <Supervised
              graph={supervisedRuntime.graph}
              sessionId={supervisedRuntime.sessionId}
              students={supervisedRuntime.students}
              studentNodeIds={supervisedRuntime.studentNodeIds}
              nodeBubbles={supervisedRuntime.nodeBubbles}
              interactiveBoardActive={supervisedRuntime.interactiveBoardActive}
              isSocketConnected={supervisedRuntime.isSocketConnected}
              lastError={supervisedRuntime.lastError}
              isPausedForTaskAssignment={supervisedRuntime.isPausedForTaskAssignment}
              taskAssignmentRequired={supervisedRuntime.taskAssignmentRequired}
              onSubmitTaskAssignment={submitSupervisedTaskAssignment}
              onSendHint={supervisedRuntime.sendSupervisorHint}
            />
            <Unsupervised
              graph={unsupervisedRuntime.graph}
              sessionId={unsupervisedRuntime.sessionId}
              students={unsupervisedRuntime.students}
              studentNodeIds={unsupervisedRuntime.studentNodeIds}
              nodeBubbles={unsupervisedRuntime.nodeBubbles}
              interactiveBoardActive={unsupervisedRuntime.interactiveBoardActive}
              isSocketConnected={unsupervisedRuntime.isSocketConnected}
              lastError={unsupervisedRuntime.lastError}
              isPausedForTaskAssignment={unsupervisedRuntime.isPausedForTaskAssignment}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
