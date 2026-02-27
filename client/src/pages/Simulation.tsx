import { Supervised } from "../components/Supervised";
import { Unsupervised } from "../components/Unsupervised";

export const Simulation = () => {
  return (
    <div className="h-screen w-full overflow-auto bg-slate-200 md:overflow-hidden">
      <div className="flex min-h-full w-full flex-col md:h-full md:flex-row">
        <Supervised />
        <Unsupervised />
      </div>
    </div>
  );
};
