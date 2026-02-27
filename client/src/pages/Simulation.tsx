import { useEffect } from "react";
import { Supervised } from "../components/Supervised";
import { Unsupervised } from "../components/Unsupervised";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export const Simulation = () => {

  useEffect(()=>{
      //Create session 
      const classroomId = localStorage.getItem("classroomId");
      const startSetup = localStorage.getItem("startSetup");
      console.log(classroomId, startSetup)
      if (!classroomId || !startSetup) return;

      const data = {
        mode:"classroom",
        topic: JSON.parse(startSetup).subject,
        classroomId: Number(classroomId)
      }
      const start = async() =>{
        try{
          await fetch(`${API_BASE_URL}/sessions`, {
          method:"POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        })
        }
        catch(e){
          console.error(e);
        }
        
      }

      start();
  },[]);

  return (
    <div className="h-screen w-full overflow-auto bg-slate-200 md:overflow-hidden">
      <div className="flex min-h-full w-full flex-col md:h-full md:flex-row">
        <Supervised />
        <Unsupervised />
      </div>
    </div>
  );
};
