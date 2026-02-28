import { useEffect, useMemo, useState } from "react";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MetricsLineChart } from "../components/charts/MetricsLineChart";

type StudentDataRow = {
  name: string;
  attention: number;
  boredom: number;
  emotion?: number;
  action: string;
  timestamp: string;
};

type TeacherDataRow = {
  action: string;
  timestamp: string;
};

type PreparedChartData = {
  labels: string[];
  attentionValues: Array<number | null>;
  boredomValues: Array<number | null>;
  emotionValues: Array<number | null>;
  averageEmotion: number | null;
  highlightedValues: Array<number | null>;
  teacherActions: string[];
  studentActions: Array<string | null>;
  startTimestamp: string | null;
  endTimestamp: string | null;
};

type DataSource = {
  studentNames: string[];
  studentRowsByName: Map<string, Map<string, StudentDataRow>>;
  rowsByTimestamp: Map<string, StudentDataRow[]>;
  teacherActionByTimestamp: Map<string, string>;
  teacherRows: TeacherDataRow[];
};

type StatisticsColumnProps = {
  title: string;
  selectedStudent: string | null;
  preparedData: PreparedChartData;
};

type SessionTurn = {
  id: string;
  role: "teacher" | "user" | "agent" | "system";
  agentId?: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

type SessionAgent = {
  id: string;
  kind: string;
  name: string;
  state: {
    attentiveness: number;
    behavior: number;
    comprehension: number;
  };
};

type SessionActivation = {
  id: string;
  from: string;
  to: string;
  interactionType: string;
  createdAt: string;
  payload?: Record<string, unknown>;
};

type SessionSummary = {
  sessionId: string;
  topic: string;
  agents: SessionAgent[];
  turns: SessionTurn[];
  communicationGraph: {
    activations?: SessionActivation[];
  };
  updatedAt: string;
};

type SessionChartRows = {
  students: StudentDataRow[];
  teachers: TeacherDataRow[];
  topic: string | null;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

const EMPTY_ROWS: SessionChartRows = {
  students: [],
  teachers: [],
  topic: null,
};

const EMPTY_CHART_DATA: PreparedChartData = {
  labels: [],
  attentionValues: [],
  boredomValues: [],
  emotionValues: [],
  averageEmotion: null,
  highlightedValues: [],
  teacherActions: [],
  studentActions: [],
  startTimestamp: null,
  endTimestamp: null,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const timestampToMs = (timestamp: string): number => {
  const parsed = Date.parse(timestamp);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return 0;
};

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString();
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

const resolveTeacherAction = (turn: SessionTurn): string => {
  const mode = typeof turn.metadata?.teacherMode === "string" ? turn.metadata.teacherMode : "";

  if (mode === "engagement_joke") {
    return "kidding";
  }

  if (mode === "behavior_intervention") {
    return "moderation";
  }

  if (
    mode === "clarification_dialogue" ||
    mode === "knowledge_check_praise"
  ) {
    return "interactive education";
  }

  if (turn.content.includes("?")) {
    return "interactive education";
  }

  return "education";
};

const resolveStudentAction = (
  activation: SessionActivation,
  attention: number,
): string => {
  const actionType = typeof activation.payload?.actionType === "string"
    ? activation.payload.actionType
    : activation.interactionType;

  if (actionType === "student_to_student") {
    return "talking";
  }

  if (attention <= 4.2) {
    return "doesn't listen";
  }

  return "listen";
};

const toRowsFromSession = (summary: SessionSummary): SessionChartRows => {
  const studentNameById = new Map(
    summary.agents
      .filter((agent) => agent.kind !== "Teacher")
      .map((agent) => [agent.id, agent.name]),
  );

  const studentRows: StudentDataRow[] = [];
  const activations = summary.communicationGraph.activations ?? [];

  for (const activation of activations) {
    if (!studentNameById.has(activation.from)) {
      continue;
    }

    const borednessRaw = activation.payload?.boredness;
    const fatigueRaw = activation.payload?.fatigue;
    const boredness =
      typeof borednessRaw === "number" && Number.isFinite(borednessRaw)
        ? clamp(borednessRaw, 0, 10)
        : 5.2;
    const fatigue =
      typeof fatigueRaw === "number" && Number.isFinite(fatigueRaw)
        ? clamp(fatigueRaw, 0, 10)
        : 4.8;
    const attention = clamp(10 - boredness, 0, 10);
    const emotion = clamp(10 - fatigue, 0, 10);
    const name = studentNameById.get(activation.from);
    if (!name) {
      continue;
    }

    studentRows.push({
      name,
      attention: Number(attention.toFixed(2)),
      boredom: Number(boredness.toFixed(2)),
      emotion: Number(emotion.toFixed(2)),
      action: resolveStudentAction(activation, attention),
      timestamp: activation.createdAt,
    });
  }

  if (studentRows.length === 0) {
    const fallbackTimestamp = summary.updatedAt;
    for (const agent of summary.agents.filter((item) => item.kind !== "Teacher")) {
      const attention = clamp(agent.state.attentiveness, 0, 10);
      studentRows.push({
        name: agent.name,
        attention: Number(attention.toFixed(2)),
        boredom: Number((10 - attention).toFixed(2)),
        emotion: Number(clamp(agent.state.comprehension, 0, 10).toFixed(2)),
        action: attention <= 4.2 ? "doesn't listen" : "listen",
        timestamp: fallbackTimestamp,
      });
    }
  }

  const teacherRows: TeacherDataRow[] = summary.turns
    .filter((turn) => turn.role === "teacher")
    .map((turn) => ({
      action: resolveTeacherAction(turn),
      timestamp: turn.createdAt,
    }));

  return {
    students: studentRows,
    teachers: teacherRows,
    topic: summary.topic,
  };
};

const buildDataSource = (
  studentRows: StudentDataRow[],
  teacherRows: TeacherDataRow[],
): DataSource => {
  const studentNames: string[] = [];
  const seenNames = new Set<string>();
  const studentRowsByName = new Map<string, Map<string, StudentDataRow>>();
  const rowsByTimestamp = new Map<string, StudentDataRow[]>();
  const teacherActionByTimestamp = new Map<string, string>();

  for (const row of studentRows) {
    if (!seenNames.has(row.name)) {
      seenNames.add(row.name);
      studentNames.push(row.name);
    }

    if (!studentRowsByName.has(row.name)) {
      studentRowsByName.set(row.name, new Map<string, StudentDataRow>());
    }

    studentRowsByName.get(row.name)?.set(row.timestamp, row);

    if (!rowsByTimestamp.has(row.timestamp)) {
      rowsByTimestamp.set(row.timestamp, []);
    }

    rowsByTimestamp.get(row.timestamp)?.push(row);
  }

  for (const row of teacherRows) {
    teacherActionByTimestamp.set(row.timestamp, row.action);
  }

  return {
    studentNames,
    studentRowsByName,
    rowsByTimestamp,
    teacherActionByTimestamp,
    teacherRows,
  };
};

const buildPreparedChartData = (
  source: DataSource,
  selectedStudent: string | null,
): PreparedChartData => {
  const collectedEmotionValues: number[] = [];
  const timelineSet = new Set<string>();

  for (const teacherRow of source.teacherRows) {
    timelineSet.add(teacherRow.timestamp);
  }

  if (selectedStudent) {
    const selectedRows = source.studentRowsByName.get(selectedStudent);
    if (selectedRows) {
      for (const timestamp of selectedRows.keys()) {
        timelineSet.add(timestamp);
      }
    }
  } else {
    for (const timestamp of source.rowsByTimestamp.keys()) {
      timelineSet.add(timestamp);
    }
  }

  const timeline = Array.from(timelineSet).sort((left, right) => {
    return timestampToMs(left) - timestampToMs(right);
  });

  if (timeline.length === 0) {
    return EMPTY_CHART_DATA;
  }

  const labels: string[] = [];
  const attentionValues: Array<number | null> = [];
  const boredomValues: Array<number | null> = [];
  const emotionValues: Array<number | null> = [];
  const highlightedValues: Array<number | null> = [];
  const teacherActions: string[] = [];
  const studentActions: Array<string | null> = [];
  const startTimestamp = timeline[0];
  const endTimestamp = timeline[timeline.length - 1];
  const startMs = timestampToMs(startTimestamp);

  for (const timestamp of timeline) {
    const elapsedMinutes = Math.round((timestampToMs(timestamp) - startMs) / 60000);
    labels.push(String(elapsedMinutes));

    const teacherAction = source.teacherActionByTimestamp.get(timestamp);
    teacherActions.push(teacherAction ?? "no data");

    if (selectedStudent) {
      const selectedRow = source.studentRowsByName.get(selectedStudent)?.get(timestamp);

      if (!selectedRow) {
        attentionValues.push(null);
        boredomValues.push(null);
        emotionValues.push(null);
        highlightedValues.push(null);
        studentActions.push(null);
        continue;
      }

      const isHighlighted = isHighlightedAction(selectedRow.action);
      const emotionValue = typeof selectedRow.emotion === "number" ? selectedRow.emotion : null;

      attentionValues.push(selectedRow.attention);
      boredomValues.push(selectedRow.boredom);
      emotionValues.push(emotionValue);
      if (emotionValue !== null) {
        collectedEmotionValues.push(emotionValue);
      }
      highlightedValues.push(isHighlighted ? selectedRow.attention : null);
      studentActions.push(selectedRow.action);
      continue;
    }

    const rowsAtTimestamp = source.rowsByTimestamp.get(timestamp) ?? [];

    if (rowsAtTimestamp.length === 0) {
      attentionValues.push(null);
      boredomValues.push(null);
      emotionValues.push(null);
      highlightedValues.push(null);
      studentActions.push(null);
      continue;
    }

    const attentionSum = rowsAtTimestamp.reduce((accumulator, row) => accumulator + row.attention, 0);
    const boredomSum = rowsAtTimestamp.reduce((accumulator, row) => accumulator + row.boredom, 0);
    const emotionValuesAtTimestamp = rowsAtTimestamp
      .map((row) => row.emotion)
      .filter((value): value is number => typeof value === "number");
    const emotionSum = emotionValuesAtTimestamp.reduce((accumulator, value) => accumulator + value, 0);
    const averageAttention = Number((attentionSum / rowsAtTimestamp.length).toFixed(2));
    const averageBoredom = Number((boredomSum / rowsAtTimestamp.length).toFixed(2));
    const averageEmotion =
      emotionValuesAtTimestamp.length > 0
        ? Number((emotionSum / emotionValuesAtTimestamp.length).toFixed(2))
        : null;
    const hasHighlightedAction = rowsAtTimestamp.some((row) => isHighlightedAction(row.action));

    attentionValues.push(averageAttention);
    boredomValues.push(averageBoredom);
    emotionValues.push(averageEmotion);
    for (const value of emotionValuesAtTimestamp) {
      collectedEmotionValues.push(value);
    }
    highlightedValues.push(hasHighlightedAction ? averageAttention : null);
    studentActions.push(
      hasHighlightedAction
        ? "at least one student: not listening/talking"
        : "no not listening/talking",
    );
  }

  return {
    labels,
    attentionValues,
    boredomValues,
    emotionValues,
    averageEmotion:
      collectedEmotionValues.length > 0
        ? Number(
            (
              collectedEmotionValues.reduce((accumulator, value) => accumulator + value, 0) /
              collectedEmotionValues.length
            ).toFixed(2),
          )
        : null,
    highlightedValues,
    teacherActions,
    studentActions,
    startTimestamp,
    endTimestamp,
  };
};

const computeMaterialGraspPercent = (preparedData: PreparedChartData): number | null => {
  const validSampleIndexes = preparedData.attentionValues
    .map((attentionValue, index) => ({ attentionValue, index }))
    .filter(
      (sample): sample is { attentionValue: number; index: number } =>
        typeof sample.attentionValue === "number" && Number.isFinite(sample.attentionValue),
    );

  if (validSampleIndexes.length === 0) {
    return null;
  }

  const sampleScores = validSampleIndexes.map(({ attentionValue, index }) => {
    const boredomValue = preparedData.boredomValues[index];
    const emotionValue = preparedData.emotionValues[index];

    const normalizedAttention = clamp(attentionValue / 10, 0, 1);
    const normalizedAntiBoredom =
      typeof boredomValue === "number" && Number.isFinite(boredomValue)
        ? clamp(1 - boredomValue / 10, 0, 1)
        : 0.5;
    const normalizedEmotion =
      typeof emotionValue === "number" && Number.isFinite(emotionValue)
        ? clamp(emotionValue / 10, 0, 1)
        : 0.5;

    return (
      normalizedAttention * 0.46 +
      normalizedAntiBoredom * 0.34 +
      normalizedEmotion * 0.2
    );
  });

  const highlightedCount = preparedData.highlightedValues.filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  ).length;
  const highlightedRatio = highlightedCount / validSampleIndexes.length;
  const focusPenaltyFactor = clamp(1 - highlightedRatio * 0.18, 0.8, 1);
  const averageSampleScore =
    sampleScores.reduce((accumulator, score) => accumulator + score, 0) / sampleScores.length;

  return Math.round(clamp(averageSampleScore * focusPenaltyFactor, 0, 1) * 100);
};

const toGraspTagConfig = (
  graspPercent: number | null,
): { value: string; severity: "success" | "warning" | "danger" | "secondary" } => {
  if (graspPercent === null) {
    return {
      value: "No data",
      severity: "secondary",
    };
  }

  if (graspPercent >= 70) {
    return {
      value: `${graspPercent}% · Good`,
      severity: "success",
    };
  }

  if (graspPercent >= 45) {
    return {
      value: `${graspPercent}% · Medium`,
      severity: "warning",
    };
  }

  return {
    value: `${graspPercent}% · Low`,
    severity: "danger",
  };
};

const StatisticsColumn = ({ title, selectedStudent, preparedData }: StatisticsColumnProps) => {
  const seriesBaseLabel = selectedStudent ? selectedStudent : "Class average";
  const firstLineQuestion = selectedStudent
    ? "How did he/she feel about the class?"
    : "How did they feel about the class?";
  const averageEmotionText =
    preparedData.averageEmotion === null ? "n/a" : preparedData.averageEmotion.toFixed(2);
  const materialGraspPercent = computeMaterialGraspPercent(preparedData);
  const graspTag = toGraspTagConfig(materialGraspPercent);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>

      <main className="mt-2 flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm text-slate-600">
          {firstLineQuestion} <span className="font-semibold text-slate-900">{averageEmotionText}</span>
        </p>
        <div className="mb-2 mt-1 flex items-center gap-2">
          <p className="text-sm text-slate-600">How well did they grasp the material?</p>
          <Tag value={graspTag.value} severity={graspTag.severity} />
        </div>

        <div className="mt-2 min-h-0 flex-1">
          <MetricsLineChart
            title="Attention, Boredom & Emotion by minute"
            labels={preparedData.labels}
            attentionValues={preparedData.attentionValues}
            boredomValues={preparedData.boredomValues}
            emotionValues={preparedData.emotionValues}
            highlightedValues={preparedData.highlightedValues}
            teacherActions={preparedData.teacherActions}
            studentActions={preparedData.studentActions}
            attentionSeriesLabel={`${seriesBaseLabel} attention`}
            boredomSeriesLabel={`${seriesBaseLabel} boredom`}
            emotionSeriesLabel={`${seriesBaseLabel} emotion`}
            yAxisTitle="Value"
            xAxisTitle="Elapsed time (minute)"
          />
        </div>
      </main>
    </section>
  );
};

const fetchSessionSummary = async (sessionId: string): Promise<SessionSummary> => {
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`);
  if (!response.ok) {
    throw new Error(`Failed to load session ${sessionId} (${response.status})`);
  }

  return (await response.json()) as SessionSummary;
};

export const Statics = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [supervisorRows, setSupervisorRows] = useState<SessionChartRows>(EMPTY_ROWS);
  const [unsupervisedRows, setUnsupervisedRows] = useState<SessionChartRows>(EMPTY_ROWS);
  const [supervisorError, setSupervisorError] = useState<string | null>(null);
  const [unsupervisedError, setUnsupervisedError] = useState<string | null>(null);

  const supervisedSessionId = searchParams.get("supervisedSessionId");
  const unsupervisedSessionId = searchParams.get("unsupervisedSessionId");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!supervisedSessionId) {
        setSupervisorRows(EMPTY_ROWS);
        setSupervisorError("Missing supervisedSessionId");
        return;
      }

      setSupervisorError(null);
      try {
        const summary = await fetchSessionSummary(supervisedSessionId);
        if (cancelled) {
          return;
        }
        setSupervisorRows(toRowsFromSession(summary));
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        setSupervisorError(
          error instanceof Error ? error.message : "Failed to load supervised statistics",
        );
        setSupervisorRows(EMPTY_ROWS);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [supervisedSessionId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!unsupervisedSessionId) {
        setUnsupervisedRows(EMPTY_ROWS);
        setUnsupervisedError("Missing unsupervisedSessionId");
        return;
      }

      setUnsupervisedError(null);
      try {
        const summary = await fetchSessionSummary(unsupervisedSessionId);
        if (cancelled) {
          return;
        }
        setUnsupervisedRows(toRowsFromSession(summary));
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        setUnsupervisedError(
          error instanceof Error ? error.message : "Failed to load unsupervised statistics",
        );
        setUnsupervisedRows(EMPTY_ROWS);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [unsupervisedSessionId]);

  const supervisorSource = useMemo(
    () => buildDataSource(supervisorRows.students, supervisorRows.teachers),
    [supervisorRows.students, supervisorRows.teachers],
  );
  const unsupervisedSource = useMemo(
    () => buildDataSource(unsupervisedRows.students, unsupervisedRows.teachers),
    [unsupervisedRows.students, unsupervisedRows.teachers],
  );

  const supervisorPreparedData = useMemo(
    () => buildPreparedChartData(supervisorSource, selectedStudent),
    [selectedStudent, supervisorSource],
  );
  const unsupervisedPreparedData = useMemo(
    () => buildPreparedChartData(unsupervisedSource, selectedStudent),
    [selectedStudent, unsupervisedSource],
  );

  const globalTimeRange = useMemo(() => {
    const starts = [supervisorPreparedData.startTimestamp, unsupervisedPreparedData.startTimestamp]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => timestampToMs(left) - timestampToMs(right));
    const ends = [supervisorPreparedData.endTimestamp, unsupervisedPreparedData.endTimestamp]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => timestampToMs(left) - timestampToMs(right));

    if (starts.length === 0 || ends.length === 0) {
      return null;
    }

    return {
      start: starts[0],
      end: ends[ends.length - 1],
    };
  }, [
    supervisorPreparedData.endTimestamp,
    supervisorPreparedData.startTimestamp,
    unsupervisedPreparedData.endTimestamp,
    unsupervisedPreparedData.startTimestamp,
  ]);

  const studentNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();

    const addNames = (items: string[]) => {
      for (const item of items) {
        if (seen.has(item)) {
          continue;
        }
        seen.add(item);
        names.push(item);
      }
    };

    addNames(supervisorSource.studentNames);
    addNames(unsupervisedSource.studentNames);

    return names;
  }, [supervisorSource.studentNames, unsupervisedSource.studentNames]);

  return (
    <div className="h-screen overflow-hidden bg-slate-100">
      <div className="mx-auto flex h-full max-w-[1900px] flex-col gap-3 p-3">
        <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Statistics</h1>
              <p className="text-sm text-slate-600">
                Attention, boredom and emotion are displayed together in each chart.
              </p>
              {(supervisorRows.topic || unsupervisedRows.topic) && (
                <p className="text-xs text-slate-500">
                  Topic: {supervisorRows.topic ?? unsupervisedRows.topic}
                </p>
              )}
              {(supervisorError || unsupervisedError) && (
                <p className="text-xs text-rose-600">
                  {[supervisorError, unsupervisedError].filter(Boolean).join(" | ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {globalTimeRange && (
                <p className="self-center text-sm text-slate-600">
                  Time range: {formatTimestamp(globalTimeRange.start)} - {formatTimestamp(globalTimeRange.end)}
                </p>
              )}
              <Button
                label="Back to simulation"
                size="small"
                outlined
                onClick={() => navigate("/simulation")}
              />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
          <aside className="flex min-h-0 w-full flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm xl:w-72">
            <h2 className="mb-3 text-lg font-semibold uppercase tracking-wide text-slate-900">View</h2>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  selectedStudent === null
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                }`}
              >
                Aggregated
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

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-2">
              <StatisticsColumn
                title="Supervisor"
                selectedStudent={selectedStudent}
                preparedData={supervisorPreparedData}
              />
              <StatisticsColumn
                title="Unsupervised"
                selectedStudent={selectedStudent}
                preparedData={unsupervisedPreparedData}
              />
            </div>

            <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-600 shadow-sm">
              <div className="mb-2">
                Red line: attention, yellow line: boredom, green line: emotion, red dot: not listening
                or talking.
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded border border-slate-300 bg-white" />
                  education: no background
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded border border-slate-300 bg-blue-400" />
                  kidding: light blue
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded border border-slate-300 bg-green-400" />
                  interactive education: light green
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded border border-slate-300 bg-red-400" />
                  moderation: light red
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
