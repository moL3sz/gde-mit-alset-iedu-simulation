import { Button } from "primereact/button"


export const Supervised = () => {
  return (
    <div className="h-full bg-red-100 w-[50%] p-2">
      <h1 className="text-3xl text-center">Supervised</h1>
      <div className="flex flex-col gap-2">
        <Button icon={"pi pi-chart-bar"} rounded tooltip="Charts" />
        <Button icon={"pi pi-link"} rounded tooltip="Graph" />
      </div>

      <div className="classrom"></div>
    </div>
  );
};
