import { useMemo } from "react";
import { Button } from "primereact/button";
import { Chart } from "primereact/chart";
import type { Socket } from "socket.io-client";

type ChartsModalProps = {
  visible: boolean;
  onHide: () => void;
  socket: Socket | null;
  title: string;
  className?: string;
};

const ChartsModal = ({
  visible,
  onHide,
  socket,
  title,
  className = "",
}: ChartsModalProps) => {
  const socketStatus = socket?.connected ? "Live socket" : "Socket idle";

  const chartData = useMemo(
    () => ({
      labels: ["08:00", "08:10", "08:20", "08:30", "08:40", "08:50", "09:00"],
      datasets: [
        {
          label: "Class focus",
          data: [4, 6, 5, 7, 8, 7, 9],
          borderColor: "#0ea5e9",
          backgroundColor: "rgba(14, 165, 233, 0.15)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
        },
        {
          label: "Teacher interventions",
          data: [1, 2, 1, 3, 2, 2, 4],
          borderColor: "#f97316",
          backgroundColor: "rgba(249, 115, 22, 0.15)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
        },
      ],
    }),
    [],
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom" as const,
        },
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          ticks: {
            stepSize: 1,
          },
        },
      },
    }),
    [],
  );

  if (!visible) {
    return null;
  }

  return (
    <div
      className={`absolute z-20 overflow-hidden rounded-lg border border-slate-300/70 bg-white p-3 shadow-lg ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-[11px] text-slate-500">{socketStatus}</p>
        </div>
        <Button icon="pi pi-times" rounded text size="small" onClick={onHide} />
      </div>
      <div className="mt-2 flex h-[95%] flex-col gap-2 overflow-x-hidden text-sm">
        <div className="w-full">
          <div>Albert Eintstein</div>
          <Chart
            type="line"
            data={chartData}
            options={chartOptions}
            height="300"
          />
        </div>

        <div className="w-full">
          <div>John Doe</div>
          <Chart
            type="line"
            data={chartData}
            options={chartOptions}
            height="300"
          />
        </div>

          <div className="w-full">
          <div>John Doe</div>
          <Chart
            type="line"
            data={chartData}
            options={chartOptions}
            height="300"
          />
        </div>

          <div className="w-full">
          <div>John Doe</div>
          <Chart
            type="line"
            data={chartData}
            options={chartOptions}
            height="300"
          />
        </div>
      </div>
    </div>
  );
};

export default ChartsModal;
