import "./App.css";
import "primereact/resources/themes/lara-light-cyan/theme.css";
import 'primeicons/primeicons.css'

import { BrowserRouter, Routes, Route} from "react-router-dom";
import { StartPage } from "./pages/StartPage.tsx";
import { Simulation } from "./pages/Simulation.tsx";
import { Students } from "./pages/Students.tsx";
import { ClassRoom } from "./pages/ClassRoom.tsx";
import { Statics } from "./pages/Statics.tsx";
import { Welcome } from "./pages/Welcome.tsx";

function App() {
  



  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Welcome/>}/>
        <Route path="/students" element={<Students/>}/>
        <Route path="/start" element={<StartPage/>}/>
        <Route path="/simulation" element={<Simulation/>}/>
        <Route path="/classrom" element={<ClassRoom/>}/>
        <Route path="/statics" element={<Statics/>}/>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
