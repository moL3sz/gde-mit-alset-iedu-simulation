import { useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { InputText } from "primereact/inputtext";
import { Tag } from "primereact/tag";

import {
  type SimulationGraph,
  type SubmitTaskAssignmentInput,
  type TaskAssignmentRequiredPayload,
  type TaskGroup,
  type TaskWorkMode,
} from "../hooks/useSimulationChannel";
import { useSockets } from "../context/SocketContext";
import ClassroomMockup, {
  type ClassroomStudent,
  type CommunicationBubble,
} from "./ClassroomMockup";
import ChartsModal from "./ChartsModal";
import GraphModal from "./GraphModal";

export type SupervisedProps = {
  graph: SimulationGraph | null;
  sessionId: string | null;
  students: ClassroomStudent[];
  studentNodeIds: string[];
  nodeBubbles: CommunicationBubble[];
  interactiveBoardActive: boolean;
  isSocketConnected: boolean;
  lastError: string | null;
  isPausedForTaskAssignment: boolean;
  taskAssignmentRequired: TaskAssignmentRequiredPayload | null;
  onSubmitTaskAssignment: (
    input: SubmitTaskAssignmentInput,
    applyToUnsupervised: boolean,
  ) => Promise<boolean>;
  onSendHint: (hintText: string) => boolean;
};

export const Supervised = ({
  sessionId,
  students,
  studentNodeIds,
  nodeBubbles,
  interactiveBoardActive,
  isSocketConnected,
  lastError,
  isPausedForTaskAssignment,
  taskAssignmentRequired,
  onSubmitTaskAssignment,
  onSendHint,
  graph,
}: SupervisedProps) => {
  const { supervisedSocket } = useSockets();
  const laraPrimary = "var(--primary-color, #6366f1)";
  const laraPrimaryDark = "var(--primary-600, #4f46e5)";
  const [hintDraft, setHintDraft] = useState("");
  const [workMode, setWorkMode] = useState<TaskWorkMode>("individual");
  const [applyToUnsupervised, setApplyToUnsupervised] = useState(false);
  const [isChartsVisible, setIsChartsVisible] = useState(false);
  const [isGraphVisible, setIsGraphVisible] = useState(false);
  const [groupDraftByStudent, setGroupDraftByStudent] = useState<Record<string, string>>({});


  const submitHint = () => {
    const sent = onSendHint(hintDraft);
    if (sent) {
      setHintDraft("");
    }
  };

  const assignStudentGroup = (studentId: string, groupId: string) => {
    setGroupDraftByStudent((previous) => ({
      ...previous,
      [studentId]: groupId,
    }));
  };

  const buildGroupsFromDraft = (): TaskGroup[] => {
    const groupsById = new Map<string, string[]>();

    for (const studentId of studentNodeIds) {
      const groupId = groupDraftByStudent[studentId]?.trim();
      if (!groupId) {
        continue;
      }

      const bucket = groupsById.get(groupId) ?? [];
      bucket.push(studentId);
      groupsById.set(groupId, bucket);
    }

    return Array.from(groupsById.entries()).map(([id, studentIds]) => ({
      id,
      studentIds,
    }));
  };

  const submitTaskAssignment = async () => {
    const input: SubmitTaskAssignmentInput = {
      mode: workMode,
    };

    if (workMode !== "individual") {
      input.groups = buildGroupsFromDraft();
    }

    const ok = await onSubmitTaskAssignment(input, applyToUnsupervised);
    if (ok) {
      setGroupDraftByStudent({});
    }
  };

  return (
    <section className="h-full w-full p-2 md:w-1/2 md:p-3">
      <div
        className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/55 bg-white/90 shadow-[0_18px_42px_rgba(28,49,83,0.16)] backdrop-blur-sm"
        style={{ fontFamily: "'Avenir Next', 'Segoe UI', 'Trebuchet MS', sans-serif" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-white via-indigo-50/50 to-cyan-50/45 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black uppercase tracking-[0.14em] text-slate-900 sm:text-2xl">
              Supervised Mode
            </h1>
            <p className="mt-1 text-xs font-semibold tracking-wide text-slate-600 sm:text-sm">
              Live run with supervisor whisper support
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              icon="pi pi-chart-bar"
              label="Charts"
              severity="secondary"
              outlined
              size="small"
              className="h-9 !border-indigo-200 !text-indigo-700 hover:!bg-indigo-50"
              onClick={() => setIsChartsVisible((currentState) => !currentState)}
            />
            <Button
              icon="pi pi-sitemap"
              label="Graph"
              severity="secondary"
              outlined
              size="small"
              className="h-9 !border-indigo-200 !text-indigo-700 hover:!bg-indigo-50"
              onClick={() => setIsGraphVisible((currentState) => !currentState)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5 sm:px-5">
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
          {lastError ? (
            <Tag value={lastError} className="!bg-rose-100 !text-rose-700" />
          ) : null}
        </div>

        <div className="flex items-center gap-2 px-4 pb-2 pt-2 sm:px-5">
          <InputText
            value={hintDraft}
            onChange={(event) => setHintDraft(event.target.value)}
            placeholder="Whisper to teacher (e.g. ask for slower pace)"
            className="h-10 flex-1 rounded-lg text-sm"
          />
          <Button
            icon="pi pi-send"
            label="Whisper"
            size="small"
            className="h-10 !border-0"
            style={{
              background: `linear-gradient(135deg, ${laraPrimaryDark}, ${laraPrimary})`,
              color: "#ffffff",
            }}
            onClick={submitHint}
            disabled={!hintDraft.trim()}
          />
        </div>

        {isPausedForTaskAssignment && taskAssignmentRequired ? (
          <div className="mx-4 mb-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3 shadow-sm sm:mx-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-amber-800">
                Task Assignment Required (Turn {taskAssignmentRequired.lessonTurn})
              </h3>
              <Tag value="Simulation Paused" className="!bg-amber-200 !text-amber-900" />
            </div>

            <div className="flex flex-wrap gap-2">
              {(["individual", "pair", "group"] as const).map((mode) => (
                <Button
                  key={mode}
                  size="small"
                  label={mode}
                  className="h-8"
                  outlined={workMode !== mode}
                  onClick={() => setWorkMode(mode)}
                />
              ))}
            </div>

            {workMode !== "individual" ? (
              <div className="mt-3 grid max-h-28 grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                {studentNodeIds.map((studentId, index) => (
                  <div key={studentId} className="flex items-center gap-2">
                    <span className="min-w-[88px] text-xs font-medium text-slate-700">
                      {students[index]?.name ?? studentId}
                    </span>
                    <InputText
                      value={groupDraftByStudent[studentId] ?? ""}
                      onChange={(event) => assignStudentGroup(studentId, event.target.value)}
                      placeholder={workMode === "pair" ? "pair_a" : "group_1"}
                      className="h-8 flex-1 rounded-md text-xs"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  inputId="apply-unsupervised"
                  checked={applyToUnsupervised}
                  onChange={(event) => setApplyToUnsupervised(Boolean(event.checked))}
                />
                <label htmlFor="apply-unsupervised" className="text-xs text-slate-700">
                  Apply same methodology to unsupervised run
                </label>
              </div>

              <Button
                size="small"
                label="Resume Simulation"
                className="!border-0"
                style={{
                  background: `linear-gradient(135deg, ${laraPrimaryDark}, ${laraPrimary})`,
                  color: "#ffffff",
                }}
                onClick={() => void submitTaskAssignment()}
              />
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 px-2 pb-2 sm:px-3 sm:pb-3">
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
          socket={supervisedSocket}
          sessionId={sessionId}
          title="Supervised Charts"
          className="left-4 right-4 top-[80px] bottom-4"
        />
        <GraphModal
          visible={isGraphVisible}
          graph={graph}
          onHide={() => setIsGraphVisible(false)}
          title="Supervised Graph"
          className="left-4 right-4 top-[80px] bottom-4"
        />
      </div>
    </section>
  );
};
