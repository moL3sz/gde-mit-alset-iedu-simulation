import { Button } from "primereact/button"




export const Unsupervised = () =>{
    
    return <div className="h-100 w-[50%] p-2">
        <h1 className="text-3xl text-center">Unsupervised</h1>
        <div className="flex flex-col gap-2">
            <Button icon={"pi pi-chart-bar"} rounded tooltip="Charts"/>
            <Button icon={"pi pi-link"} rounded tooltip="Graph"/>
        </div>

        <div className="classrom"></div>
    </div>
}