import { memo } from "react";

import {
  SimulationMetricsChart,
  type SimulationMetricPoint,
} from "./SimulationMetricsChart";

type StudentMetricsCardProps = {
  name: string;
  profile: string;
  points: SimulationMetricPoint[];
};

const StudentMetricsCardComponent = ({
  name,
  profile,
  points,
}: StudentMetricsCardProps) => {
  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white p-2">
      <div className="mb-1 text-sm font-semibold text-slate-700">
        {name}
        <span className="ml-2 text-xs font-medium text-slate-500">
          {profile}
        </span>
      </div>
      <SimulationMetricsChart points={points} height="220" />
    </div>
  );
};

export const StudentMetricsCard = memo(
  StudentMetricsCardComponent,
  (previous, next) =>
    previous.name === next.name &&
    previous.profile === next.profile &&
    previous.points === next.points,
);
