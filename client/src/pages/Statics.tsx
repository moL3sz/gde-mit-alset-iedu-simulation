import { useMemo, useState } from "react";
import { MetricsLineChart } from "../components/charts/MetricsLineChart";
import rawStudentData from "../data/dummy_student.json";
import rawTeacherData from "../data/dummy_teacher.json";

type MetricKey = "attention" | "boredom";

type StudentDataRow = {
  name: string;
  attention: number;
  boredom: number;
  action: string;
  timestamp: string;
};

type TeacherDataRow = {
  action: string;
  timestamp: string;
};

type PreparedChartData = {
  labels: string[];
  redValues: Array<number | null>;
  notListeningValues: Array<number | null>;
  teacherActions: string[];
  redActions: Array<string | null>;
  startTimestamp: string | null;
  endTimestamp: string | null;
};

const studentData = rawStudentData as StudentDataRow[];
const teacherData = rawTeacherData as TeacherDataRow[];

const METRIC_LABEL: Record<MetricKey, string> = {
  attention: "Figyelem",
  boredom: "Unalom",
};

const EMPTY_CHART_DATA: PreparedChartData = {
  labels: [],
  redValues: [],
  notListeningValues: [],
  teacherActions: [],
  redActions: [],
  startTimestamp: null,
  endTimestamp: null,
};

const timestampToMs = (timestamp: string) => {
  const [datePart, timePart] = timestamp.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
};

const isHighlightedAction = (action: string) => {
  const normalizedAction = action.toLowerCase();
  return (
    normalizedAction.includes("doesn't listen") ||
    normalizedAction.includes("doesnt listen") ||
    normalizedAction.includes("nem listen") ||
    normalizedAction === "talking"
  );
};

export const Statics = () => {
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("attention");

  const studentNames = useMemo(() => {
    const seenNames = new Set<string>();
    const names: string[] = [];

    for (const row of studentData) {
      if (!seenNames.has(row.name)) {
        seenNames.add(row.name);
        names.push(row.name);
      }
    }

    return names;
  }, []);

  const studentRowsByName = useMemo(() => {
    const groupedRows = new Map<string, Map<string, StudentDataRow>>();

    for (const row of studentData) {
      if (!groupedRows.has(row.name)) {
        groupedRows.set(row.name, new Map<string, StudentDataRow>());
      }

      groupedRows.get(row.name)?.set(row.timestamp, row);
    }

    return groupedRows;
  }, []);

  const rowsByTimestamp = useMemo(() => {
    const groupedRows = new Map<string, StudentDataRow[]>();

    for (const row of studentData) {
      if (!groupedRows.has(row.timestamp)) {
        groupedRows.set(row.timestamp, []);
      }

      groupedRows.get(row.timestamp)?.push(row);
    }

    return groupedRows;
  }, []);

  const teacherActionByTimestamp = useMemo(() => {
    const mappedActions = new Map<string, string>();

    for (const row of teacherData) {
      mappedActions.set(row.timestamp, row.action);
    }

    return mappedActions;
  }, []);

  const preparedData = useMemo<PreparedChartData>(() => {
    const timelineSet = new Set<string>();

    for (const teacherRow of teacherData) {
      timelineSet.add(teacherRow.timestamp);
    }

    if (selectedStudent) {
      const selectedRows = studentRowsByName.get(selectedStudent);

      if (selectedRows) {
        for (const timestamp of selectedRows.keys()) {
          timelineSet.add(timestamp);
        }
      }
    } else {
      for (const timestamp of rowsByTimestamp.keys()) {
        timelineSet.add(timestamp);
      }
    }

    const timeline = Array.from(timelineSet).sort();

    if (timeline.length === 0) {
      return EMPTY_CHART_DATA;
    }

    const labels: string[] = [];
    const redValues: Array<number | null> = [];
    const notListeningValues: Array<number | null> = [];
    const teacherActions: string[] = [];
    const redActions: Array<string | null> = [];
    const startTimestamp = timeline[0];
    const endTimestamp = timeline[timeline.length - 1];
    const startMs = timestampToMs(startTimestamp);

    for (const timestamp of timeline) {
      const elapsedMinutes = Math.round((timestampToMs(timestamp) - startMs) / 60000);
      labels.push(String(elapsedMinutes));

      const teacherAction = teacherActionByTimestamp.get(timestamp);
      teacherActions.push(teacherAction ?? "nincs adat");

      if (selectedStudent) {
        const selectedRow = studentRowsByName.get(selectedStudent)?.get(timestamp);

        if (!selectedRow) {
          redValues.push(null);
          notListeningValues.push(null);
          redActions.push(null);
          continue;
        }

        const value =
          selectedMetric === "attention" ? selectedRow.attention : selectedRow.boredom;
        const isHighlighted = isHighlightedAction(selectedRow.action);

        redValues.push(value);
        notListeningValues.push(isHighlighted ? value : null);
        redActions.push(selectedRow.action);
        continue;
      }

      const rowsAtTimestamp = rowsByTimestamp.get(timestamp) ?? [];

      if (rowsAtTimestamp.length === 0) {
        redValues.push(null);
        notListeningValues.push(null);
        redActions.push(null);
        continue;
      }

      const sum = rowsAtTimestamp.reduce((accumulator, row) => {
        return accumulator + (selectedMetric === "attention" ? row.attention : row.boredom);
      }, 0);
      const average = Number((sum / rowsAtTimestamp.length).toFixed(2));
      const hasHighlightedAction = rowsAtTimestamp.some((row) => isHighlightedAction(row.action));

      redValues.push(average);
      notListeningValues.push(hasHighlightedAction ? average : null);
      redActions.push(
        hasHighlightedAction
          ? "legalább 1 diák: nem figyel/beszélget"
          : "nincs nem figyel/beszélget",
      );
    }

    return {
      labels,
      redValues,
      notListeningValues,
      teacherActions,
      redActions,
      startTimestamp,
      endTimestamp,
    };
  }, [
    rowsByTimestamp,
    selectedMetric,
    selectedStudent,
    studentRowsByName,
    teacherActionByTimestamp,
  ]);

  const selectedMetricLabel = METRIC_LABEL[selectedMetric];
  const redSeriesLabel = selectedStudent
    ? `${selectedStudent} (${selectedMetricLabel})`
    : `Összegzett átlag (${selectedMetricLabel})`;
  const chartTitle = `${selectedMetricLabel} alakulása percenként`;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-4 lg:flex-row">
        <aside className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:w-72">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Nézet</h2>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSelectedStudent(null)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                selectedStudent === null
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
              }`}
            >
              Összegzett
            </button>

            {studentNames.map((studentName) => (
              <button
                key={studentName}
                type="button"
                onClick={() => setSelectedStudent(studentName)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  selectedStudent === studentName
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                }`}
              >
                {studentName}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Statisztikák</h1>
              <p className="text-sm text-slate-600">
                {selectedStudent ? `Kiválasztott diák: ${selectedStudent}` : "Összesített osztálynézet"}
              </p>
              {preparedData.startTimestamp && preparedData.endTimestamp && (
                <p className="text-sm text-slate-500">
                  Időintervallum: {preparedData.startTimestamp} - {preparedData.endTimestamp}
                </p>
              )}
            </div>

            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setSelectedMetric("attention")}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  selectedMetric === "attention"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-200"
                }`}
              >
                Figyelem
              </button>
              <button
                type="button"
                onClick={() => setSelectedMetric("boredom")}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  selectedMetric === "boredom"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-200"
                }`}
              >
                Unalom
              </button>
            </div>
          </div>

          <MetricsLineChart
            title={chartTitle}
            labels={preparedData.labels}
            redValues={preparedData.redValues}
            notListeningValues={preparedData.notListeningValues}
            teacherActions={preparedData.teacherActions}
            redActions={preparedData.redActions}
            redSeriesLabel={redSeriesLabel}
            yAxisTitle={selectedMetricLabel}
            xAxisTitle="Eltelt idő (perc)"
          />

          <div className="mt-3 text-sm text-slate-600">
            Piros vonal: {selectedStudent ? "kiválasztott diák" : "osztályátlag"}, piros pötty: NEM figyel
            vagy beszélget.
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-slate-300 bg-white" />
              education: nincs háttér
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-slate-300 bg-blue-400" />
              kidding: világos kék
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-slate-300 bg-green-400" />
              interactive education: világos zöld
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-slate-300 bg-red-400" />
              moderation: világos piros
            </span>
          </div>
        </main>
      </div>
    </div>
  );
};
