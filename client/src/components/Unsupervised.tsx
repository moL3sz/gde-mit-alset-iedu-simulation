import { useState } from "react";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";

import { useSockets } from "../context/SocketContext";
import type { SimulationGraph } from "../hooks/useSimulationChannel";
import ClassroomMockup, {
  type ClassroomStudent,
  type CommunicationBubble,
} from "./ClassroomMockup";
import ChartsModal from "./ChartsModal";
import GraphModal from "./GraphModal";

export type UnsupervisedProps = {
  graph: SimulationGraph | null;
  sessionId: string | null;
  students: ClassroomStudent[];
  studentNodeIds: string[];
  nodeBubbles: CommunicationBubble[];
  interactiveBoardActive: boolean;
  isSocketConnected: boolean;
  lastError: string | null;
  isPausedForTaskAssignment?: boolean;
};

export const Unsupervised = ({
  graph,
  sessionId,
  students,
  studentNodeIds,
  nodeBubbles,
  interactiveBoardActive,
  isSocketConnected,
  lastError,
  isPausedForTaskAssignment = false,
}: UnsupervisedProps) => {
  const { unsupervisedSocket } = useSockets();
  const [isChartsVisible, setIsChartsVisible] = useState(false);
  const [isGraphVisible, setIsGraphVisible] = useState(false);

  return (
    <section className="h-full w-full p-2 md:w-1/2 md:p-3">
      <div
        className="relative flex h-full flex-col rounded-3xl border border-slate-300/70 bg-[#f2f4f7] shadow-[0_16px_34px_rgba(15,23,42,0.1)]"
        style={{ fontFamily: "'Trebuchet MS', Verdana, sans-serif" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300/70 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black uppercase tracking-[0.14em] text-slate-700 sm:text-2xl">
              Unsupervised
            </h1>
            <p className="mt-1 text-xs font-semibold tracking-wide text-slate-600 sm:text-sm">
              Teacher autonomously adapts lesson strategy
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              icon="pi pi-chart-bar"
              label="Charts"
              severity="secondary"
              outlined
              size="small"
              onClick={() => setIsChartsVisible((currentState) => !currentState)}
            />
            <Button
              icon="pi pi-sitemap"
              label="Graph"
              severity="secondary"
              outlined
              size="small"
              onClick={() => setIsGraphVisible((currentState) => !currentState)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:px-5">
          <Tag
            value={isSocketConnected ? "Socket Connected" : "Socket Connecting"}
            className={isSocketConnected ? "!bg-emerald-100 !text-emerald-800" : "!bg-amber-100 !text-amber-800"}
          />
          <Tag
            value={sessionId ? `Session ${sessionId.slice(0, 8)}` : "Session Initializing"}
            className="!bg-slate-100 !text-slate-700"
          />
          <Tag
            value={`Active seats: ${students.length > 0 ? students.length : 12}`}
            className="!bg-slate-100 !text-slate-700"
          />
          {isPausedForTaskAssignment ? (
            <Tag value="Paused for Assignment" className="!bg-amber-100 !text-amber-800" />
          ) : null}
        </div>

        {lastError ? <p className="px-4 text-xs font-medium text-rose-700 sm:px-5">{lastError}</p> : null}

        <div className="min-h-0 flex-1">
          <ClassroomMockup
            students={students}
            studentNodeIds={studentNodeIds}
            nodeBubbles={nodeBubbles}
            interactiveBoardActive={interactiveBoardActive}
          />
        </div>

        <ChartsModal
          visible={isChartsVisible}
          onHide={() => setIsChartsVisible(false)}
          socket={unsupervisedSocket}
          sessionId={sessionId}
          title="Unsupervised Charts"
          className="left-4 right-4 top-[112px] bottom-4"
        />
        <GraphModal
          graph={graph}
          visible={isGraphVisible}
          onHide={() => setIsGraphVisible(false)}
          title="Unsupervised Graph"
          className="left-4 right-4 top-[112px] bottom-4"
        />
      </div>
    </section>
  );
};
