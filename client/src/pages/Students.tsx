import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { Dropdown, type DropdownChangeEvent } from "primereact/dropdown";
import { InputNumber, type InputNumberValueChangeEvent } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { Slider } from "primereact/slider";
import { Tag } from "primereact/tag";

type StudentProfile = "ADHD" | "Autistic" | "Typical";

type StudentCard = {
  id: number;
  name: string;
  attentiveness: number;
  comprehension: number;
  behavior: number;
  profile: StudentProfile;
};

const STUDENT_MIN = 1;
const STUDENT_MAX = 30;
const PROFILE_OPTIONS: StudentProfile[] = ["ADHD", "Autistic", "Typical"];

const createStudent = (id: number): StudentCard => ({
  id,
  name: `Student ${id}`,
  attentiveness: 50,
  comprehension: 50,
  behavior: 50,
  profile: "Typical",
});

const normalizeCount = (value: number) => {
  if (Number.isNaN(value)) {
    return STUDENT_MIN;
  }

  return Math.min(STUDENT_MAX, Math.max(STUDENT_MIN, Math.floor(value)));
};

export const Students = () => {
  const navigate = useNavigate();
  const [studentCount, setStudentCount] = useState<number>(4);
  const [students, setStudents] = useState<StudentCard[]>(() =>
    Array.from({ length: 4 }, (_, i) => createStudent(i + 1)),
  );

  useEffect(() => {
    setStudents((prevStudents) => {
      if (prevStudents.length === studentCount) {
        return prevStudents;
      }

      if (studentCount < prevStudents.length) {
        return prevStudents.slice(0, studentCount);
      }

      const newStudents = Array.from(
        { length: studentCount - prevStudents.length },
        (_, i) => createStudent(prevStudents.length + i + 1),
      );

      return [...prevStudents, ...newStudents];
    });
  }, [studentCount]);

  const updateStudent = <K extends keyof StudentCard>(
    id: number,
    key: K,
    value: StudentCard[K],
  ) => {
    setStudents((prevStudents) =>
      prevStudents.map((student) =>
        student.id === id ? { ...student, [key]: value } : student,
      ),
    );
  };

  const handleStudentCountChange = (event: InputNumberValueChangeEvent) => {
    setStudentCount(normalizeCount(Number(event.value)));
  };

  const handleContinue = () => {
    localStorage.setItem(
      "studentsSetup",
      JSON.stringify({
        studentCount,
        students,
      }),
    );

    navigate("/classrom");
  };

  const compactCardPt = {
    body: { className: "p-2" },
    content: { className: "p-0" },
  };

  const renderSliderField = (
    student: StudentCard,
    label: string,
    value: number,
    key: "attentiveness" | "comprehension" | "behavior",
  ) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm">{label}</label>
        <span className="text-sm">{value}</span>
      </div>
      <Slider
        value={value}
        min={0}
        max={100}
        onChange={(event) => updateStudent(student.id, key, Number(event.value))}
      />
    </div>
  );

  return (
    <div className="p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button label="Continue" icon="pi pi-arrow-right" iconPos="right" onClick={handleContinue} />
        <div className="flex items-center gap-2">
          <label htmlFor="studentCount" className="text-sm">Students</label>
          <InputNumber
            inputId="studentCount"
            value={studentCount}
            min={STUDENT_MIN}
            max={STUDENT_MAX}
            onValueChange={handleStudentCountChange}
            showButtons
            size={3}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {students.map((student) => (
          <Card key={student.id} pt={compactCardPt}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{`Student #${student.id}`}</span>
                <Tag value={student.profile} rounded />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`student-name-${student.id}`} className="text-sm">Name</label>
                <InputText
                  id={`student-name-${student.id}`}
                  value={student.name}
                  onChange={(event) => updateStudent(student.id, "name", event.target.value)}
                  placeholder="Student name"
                  className="p-inputtext-sm"
                />
              </div>

              {renderSliderField(
                student,
                "Attentiveness",
                student.attentiveness,
                "attentiveness",
              )}
              {renderSliderField(
                student,
                "Comprehension",
                student.comprehension,
                "comprehension",
              )}
              {renderSliderField(student, "Behavior", student.behavior, "behavior")}

              <div className="flex flex-col gap-1">
                <label htmlFor={`student-profile-${student.id}`} className="text-sm">Profile</label>
                <Dropdown
                  inputId={`student-profile-${student.id}`}
                  value={student.profile}
                  options={PROFILE_OPTIONS}
                  onChange={(event: DropdownChangeEvent) =>
                    updateStudent(student.id, "profile", event.value as StudentProfile)
                  }
                  placeholder="Select profile"
                  className="p-inputtext-sm"
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
