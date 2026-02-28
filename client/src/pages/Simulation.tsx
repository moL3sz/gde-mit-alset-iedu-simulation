import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
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
  const navigate = useNavigate();
  const { supervisedSocket, unsupervisedSocket, initializeSockets } = useSockets();
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);

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

  const hasBothSessions =
    Boolean(supervisedRuntime.sessionId) && Boolean(unsupervisedRuntime.sessionId);
  const bothCompleted =
    supervisedRuntime.isSessionCompleted && unsupervisedRuntime.isSessionCompleted;

  useEffect(() => {
    if (!hasBothSessions || !bothCompleted) {
      return;
    }

    setShowCompletionDialog(true);
  }, [bothCompleted, hasBothSessions]);

  const goToStatistics = () => {
    const query = new URLSearchParams();
    if (supervisedRuntime.sessionId) {
      query.set("supervisedSessionId", supervisedRuntime.sessionId);
    }
    if (unsupervisedRuntime.sessionId) {
      query.set("unsupervisedSessionId", unsupervisedRuntime.sessionId);
    }

    navigate(`/statics?${query.toString()}`);
  };

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
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-slate-200">
      <Dialog
        visible={showCompletionDialog}
        onHide={() => setShowCompletionDialog(false)}
        closable={false}
        draggable={false}
        modal
        style={{ width: "min(90vw, 460px)" }}
        header="Class Completed"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            The 45-minute simulation has finished. You can now review the full session results and action timeline.
          </p>
          <div className="flex justify-end">
            <Button label="View Results" onClick={goToStatistics} />
          </div>
        </div>
      </Dialog>

      <div className="border-b border-slate-300/80 bg-slate-100 px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-700 sm:text-base">
              Simulation Progress
            </h1>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              Topic: {topic}
            </p>
          </div>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
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

      <div className="relative min-h-0 flex-1 overflow-hidden">
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
