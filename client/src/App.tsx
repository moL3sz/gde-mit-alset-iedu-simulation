import "./App.css";
import "primereact/resources/themes/lara-light-cyan/theme.css";
import 'primeicons/primeicons.css'
import { Button } from "primereact/button";
import EduCover from "./assets/edu.jpg";
import { useState } from "react";

function App() {
  const [startCardVisible, setStartCardVisible] = useState<boolean>(true);

  const startSimulation = () =>{
      setStartCardVisible(false)
  }

  return (
    <div className="flex flex-col items-center justify-center h-[100vh]">


      {startCardVisible &&
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
        <div className="p-4">
          <Button icon="pi pi-play-circle" label="Start simulation" onClick={startSimulation}/>
        </div>
      </div>}
    </div>
  );
}

export default App;
