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
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="flex flex-col items-center gap-4 h-auto shadow-sm w-[50vh] rounded-lg">
        <div className="relative w-full">
          <img className="rounded-t-lg w-full" src={EduCover}></img>
          <div className="absolute inset-0 rounded-lg bg-black/30"></div>
          <h1 className="absolute inset-0 text-shadow-lg flex items-center justify-center text-5xl font-bold text-white">
            IEdu
          </h1>
        </div>
        <p className="text-gray-600 px-4">
          This project is an AI-driven classroom simulation that utilizes a
          multi-agent system to model social interactions. By implementing a
          communication graph (topology), agents can realistically decide
          whether to address the teacher, whisper to a classmate, or speak to
          the entire group, ensuring a structured and authentic educational
          flow.
        </p>
        <div className="w-full gap-4 p-4 flex flex-col justify-around items-center w-full">
          <InputNumber
            className="w-full"
            value={period}
            onValueChange={handlePeriodChange}
            placeholder="Period number"
            max={MAX_PERIOD}
            min={MIN_PERIOD}
          />
          <Dropdown
            className="w-full"
            options={subjects}
            value={subject}
            onChange={handleSubjectChange}
            placeholder="Select subject..."
          />
          <Button
            className="w-full"
            icon="pi pi-play-circle"
            label="Start simulation"
            onClick={startSimulation}
          />
        </div>
      </div>
    </div>
  );
};
