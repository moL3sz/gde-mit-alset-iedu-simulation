import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "primereact/button";
import type { Socket } from "socket.io-client";

import {
  SimulationMetricsChart,
  type SimulationMetricPoint,
} from "./charts/SimulationMetricsChart";
import { StudentMetricsCard } from "./charts/StudentMetricsCard";

type ChartsModalProps = {
  visible: boolean;
  onHide: () => void;
  socket: Socket | null;
  sessionId: string | null;
  title: string;
  className?: string;
};

type StudentStateSnapshot = {
  attentiveness?: number;
  behavior?: number;
  comprehension?: number;
  profile?: string;
};

type StudentSnapshot = {
  id: string;
  name: string;
  state: StudentStateSnapshot;
};

type SessionCreatedPayload = {
  studentStates?: StudentSnapshot[];
};

type StudentStatesPayload = {
  turnId?: string;
  studentStates?: StudentSnapshot[];
};

type WsEnvelope<TPayload> = {
  sessionId?: string;
  payload: TPayload;
};

type StudentSeries = {
  id: string;
  name: string;
  profile: string;
  points: SimulationMetricPoint[];
};

const MAX_POINTS = 24;

const toMetric = (value: number | undefined): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(10, Number(value.toFixed(2))));
};

const toAverage = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
};

const pushBoundedPoint = (
  points: SimulationMetricPoint[],
  point: SimulationMetricPoint,
): SimulationMetricPoint[] => {
  if (points.length < MAX_POINTS) {
    return [...points, point];
  }

  return [...points.slice(points.length - (MAX_POINTS - 1)), point];
};

const ChartsModal = ({
  visible,
  onHide,
  socket,
  sessionId,
  title,
  className = "",
}: ChartsModalProps) => {
  const [classHistory, setClassHistory] = useState<SimulationMetricPoint[]>([]);
  const [seriesByStudentId, setSeriesByStudentId] = useState<Record<string, StudentSeries>>({});
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const sampleCounterRef = useRef(0);
  const seenSampleKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setClassHistory([]);
    setSeriesByStudentId({});
    setLastUpdateAt(null);
    sampleCounterRef.current = 0;
    seenSampleKeysRef.current.clear();
  }, [sessionId]);

  useEffect(() => {
    if (!socket || !sessionId) {
      return;
    }

    const appendSnapshotBatch = (
      studentStates: StudentSnapshot[] | undefined,
      sampleKey?: string,
    ): void => {
      if (!studentStates || studentStates.length === 0) {
        return;
      }

      if (sampleKey && seenSampleKeysRef.current.has(sampleKey)) {
        return;
      }

      if (sampleKey) {
        seenSampleKeysRef.current.add(sampleKey);
      }

      sampleCounterRef.current += 1;
      const tick = sampleCounterRef.current;
      const label = `${tick}`;

      const normalized = studentStates.map((student) => ({
        id: student.id,
        name: student.name,
        profile: student.state.profile ?? "Typical",
        attentiveness: toMetric(student.state.attentiveness),
        behavior: toMetric(student.state.behavior),
        comprehension: toMetric(student.state.comprehension),
      }));

      setSeriesByStudentId((previous) => {
        const next = { ...previous };

        for (const student of normalized) {
          const previousSeries = previous[student.id];
          const previousPoints = previousSeries?.points ?? [];
          next[student.id] = {
            id: student.id,
            name: student.name,
            profile: student.profile,
            points: pushBoundedPoint(previousPoints, {
              label,
              attentiveness: student.attentiveness,
              behavior: student.behavior,
              comprehension: student.comprehension,
            }),
          };
        }

        return next;
      });

      setClassHistory((previous) =>
        pushBoundedPoint(previous, {
          label,
          attentiveness: toAverage(normalized.map((student) => student.attentiveness)),
          behavior: toAverage(normalized.map((student) => student.behavior)),
          comprehension: toAverage(normalized.map((student) => student.comprehension)),
        }),
      );

      setLastUpdateAt(Date.now());
    };

    const handleSessionCreated = (envelope: WsEnvelope<SessionCreatedPayload>) => {
      if (envelope.sessionId !== sessionId) {
        return;
      }

      appendSnapshotBatch(envelope.payload.studentStates, "session_created_bootstrap");
    };

    const handleStudentStatesUpdated = (envelope: WsEnvelope<StudentStatesPayload>) => {
      if (envelope.sessionId !== sessionId) {
        return;
      }

      appendSnapshotBatch(
        envelope.payload.studentStates,
        envelope.payload.turnId
          ? `turn:${envelope.payload.turnId}`
          : undefined,
      );
    };

    socket.on("simulation.session_created", handleSessionCreated);
    socket.on("simulation.student_states_updated", handleStudentStatesUpdated);

    return () => {
      socket.off("simulation.session_created", handleSessionCreated);
      socket.off("simulation.student_states_updated", handleStudentStatesUpdated);
    };
  }, [sessionId, socket]);

  const socketStatus = socket?.connected ? "Live socket stream" : "Socket idle";
  const updatedLabel = lastUpdateAt
    ? `Last update: ${new Date(lastUpdateAt).toLocaleTimeString()}`
    : "Waiting for first state update";

  const orderedStudentSeries = useMemo(
    () =>
      Object.values(seriesByStudentId).sort((left, right) => {
        return left.name.localeCompare(right.name);
      }),
    [seriesByStudentId],
  );

  if (!visible) {
    return null;
  }

  return (
    <div
      className={`fixed overflow-hidden rounded-lg border border-slate-300/70 bg-white p-3 shadow-lg ${className}`}
      style={{ zIndex: 11000 }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-[11px] text-slate-500">{socketStatus}</p>
          <p className="text-[11px] text-slate-500">{updatedLabel}</p>
        </div>
        <Button icon="pi pi-times" rounded text size="small" onClick={onHide} />
      </div>
      <div className="mt-2 flex h-[95%] flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1 text-sm">
        <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="mb-1 text-sm font-semibold text-slate-700">
            Class Averages (live)
          </div>
          <SimulationMetricsChart points={classHistory} height="250" />
        </div>

        {orderedStudentSeries.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            No student state stream yet.
          </div>
        ) : (
          orderedStudentSeries.map((student) => (
            <StudentMetricsCard
              key={student.id}
              name={student.name}
              profile={student.profile}
              points={student.points}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ChartsModal;
