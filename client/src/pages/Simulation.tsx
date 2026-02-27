import { Supervised } from "../components/Supervised"
import { Unsupervised } from "../components/Unsupervised"



export const Simulation = () =>{

    return <div className="flex h-screen w-full">
        <Supervised/>
        <Unsupervised/>
    </div>
}