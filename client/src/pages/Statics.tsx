import { useMemo, useState } from "react";
import { MetricsLineChart } from "../components/charts/MetricsLineChart";
import rawStudentData from "../data/dummy_student.json";
import rawTeacherData from "../data/dummy_teacher.json";
import rawStudentDataRl from "../data/dummy_student_lr.json";
import rawTeacherDataRl from "../data/dummy_teacher_lr.json";

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

const supervisorStudentData = rawStudentData as StudentDataRow[];
const supervisorTeacherData = rawTeacherData as TeacherDataRow[];
const reinforcementStudentData = rawStudentDataRl as StudentDataRow[];
const reinforcementTeacherData = rawTeacherDataRl as TeacherDataRow[];

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

  const timeline = Array.from(timelineSet).sort();

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

const StatisticsColumn = ({ title, selectedStudent, preparedData }: StatisticsColumnProps) => {
  const seriesBaseLabel = selectedStudent ? selectedStudent : "Class average";
  const firstLineQuestion = selectedStudent
    ? "How did he/she feel about the class?"
    : "How did they feel about the class?";
  const averageEmotionText =
    preparedData.averageEmotion === null ? "n/a" : preparedData.averageEmotion.toFixed(2);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>

      <main className="mt-2 flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm text-slate-600">
          {firstLineQuestion} <span className="font-semibold text-slate-900">{averageEmotionText}</span>
        </p>
        <p className="mb-2 text-sm text-slate-600">How well did they grasp the material?</p>

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

export const Statics = () => {
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const supervisorSource = useMemo(
    () => buildDataSource(supervisorStudentData, supervisorTeacherData),
    [],
  );
  const reinforcementSource = useMemo(
    () => buildDataSource(reinforcementStudentData, reinforcementTeacherData),
    [],
  );

  const supervisorPreparedData = useMemo(
    () => buildPreparedChartData(supervisorSource, selectedStudent),
    [selectedStudent, supervisorSource],
  );
  const reinforcementPreparedData = useMemo(
    () => buildPreparedChartData(reinforcementSource, selectedStudent),
    [reinforcementSource, selectedStudent],
  );

  const globalTimeRange = useMemo(() => {
    const starts = [supervisorPreparedData.startTimestamp, reinforcementPreparedData.startTimestamp]
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => timestampToMs(a) - timestampToMs(b));
    const ends = [supervisorPreparedData.endTimestamp, reinforcementPreparedData.endTimestamp]
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => timestampToMs(a) - timestampToMs(b));

    if (starts.length === 0 || ends.length === 0) {
      return null;
    }

    return {
      start: starts[0],
      end: ends[ends.length - 1],
    };
  }, [reinforcementPreparedData.endTimestamp, reinforcementPreparedData.startTimestamp, supervisorPreparedData.endTimestamp, supervisorPreparedData.startTimestamp]);

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
    addNames(reinforcementSource.studentNames);

    return names;
  }, [reinforcementSource.studentNames, supervisorSource.studentNames]);

  return (
    <div className="h-screen overflow-hidden bg-slate-100">
      <div className="mx-auto flex h-full max-w-[1900px] flex-col gap-3 p-3">
        <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Statistics</h1>
              <p className="text-sm text-slate-600">
                Attention, boredom and emotion are displayed together in each chart.
              </p>
            </div>
            {globalTimeRange && (
              <p className="self-center text-sm text-slate-600">
                Time range: {globalTimeRange.start} - {globalTimeRange.end}
              </p>
            )}
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
                title="Reinforcement Learning"
                selectedStudent={selectedStudent}
                preparedData={reinforcementPreparedData}
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
