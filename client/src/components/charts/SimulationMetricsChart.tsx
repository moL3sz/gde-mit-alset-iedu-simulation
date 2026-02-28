import { memo, useEffect, useMemo, useRef } from "react";
import { Chart as PrimeChart } from "primereact/chart";
import type { Chart as ChartJS, ChartData } from "chart.js";

export type SimulationMetricPoint = {
  label: string;
  attentiveness: number;
  behavior: number;
  comprehension: number;
};

type SimulationMetricsChartProps = {
  points: SimulationMetricPoint[];
  height: string;
};

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 0,
  },
  animations: {
    colors: false,
    x: false,
    y: false,
  },
  transitions: {
    active: {
      animation: {
        duration: 0,
      },
    },
    resize: {
      animation: {
        duration: 0,
      },
    },
  },
  plugins: {
    legend: {
      position: "bottom" as const,
    },
  },
  scales: {
    x: {
      ticks: {
        display: true,
      },
      grid: {
        display: true,
      },
    },
    y: {
      min: -2,
      max: 12,
      ticks: {
        display: true,
        stepSize: 1,
      },
      grid: {
        display: true,
      },
    },
  },
};

const createEmptyChartData = (): ChartData<"line"> => {
  return {
    labels: [],
    datasets: [
      {
        label: "Attentiveness",
        data: [],
        borderColor: "#3b82a6",
        backgroundColor: "rgba(59, 130, 166, 0.08)",
        tension: 0.35,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
      {
        label: "Behavior",
        data: [],
        borderColor: "#6b8f71",
        backgroundColor: "rgba(107, 143, 113, 0.08)",
        tension: 0.35,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
      {
        label: "Comprehension",
        data: [],
        borderColor: "#7d6b91",
        backgroundColor: "rgba(125, 107, 145, 0.08)",
        tension: 0.35,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
    ],
  };
};

const toDatasetArray = (chart: ChartJS<"line">, index: number): number[] => {
  const dataset = chart.data.datasets[index] as { data?: unknown } | undefined;
  if (!dataset) {
    return [];
  }

  if (!Array.isArray(dataset.data)) {
    dataset.data = [];
  }

  return dataset.data as number[];
};

const syncFullSeries = (chart: ChartJS<"line">, points: SimulationMetricPoint[]): void => {
  chart.data.labels = points.map((point) => point.label);
  const attentiveness = toDatasetArray(chart, 0);
  const behavior = toDatasetArray(chart, 1);
  const comprehension = toDatasetArray(chart, 2);

  attentiveness.length = 0;
  behavior.length = 0;
  comprehension.length = 0;

  for (const point of points) {
    attentiveness.push(point.attentiveness);
    behavior.push(point.behavior);
    comprehension.push(point.comprehension);
  }
};

const appendSeriesPoint = (chart: ChartJS<"line">, point: SimulationMetricPoint): void => {
  if (!Array.isArray(chart.data.labels)) {
    chart.data.labels = [];
  }

  chart.data.labels.push(point.label);
  toDatasetArray(chart, 0).push(point.attentiveness);
  toDatasetArray(chart, 1).push(point.behavior);
  toDatasetArray(chart, 2).push(point.comprehension);
};

const SimulationMetricsChartComponent = ({
  points,
  height,
}: SimulationMetricsChartProps) => {
  const primeChartRef = useRef<PrimeChart>(null);
  const previousPointsRef = useRef<SimulationMetricPoint[]>([]);
  const chartData = useMemo(() => createEmptyChartData(), []);

  useEffect(() => {
    const chart = primeChartRef.current?.getChart() as ChartJS<"line"> | undefined;
    if (!chart) {
      return;
    }

    const previous = previousPointsRef.current;
    if (points.length === 0) {
      syncFullSeries(chart, []);
      chart.update("none");
      previousPointsRef.current = points;
      return;
    }

    if (previous.length === 0 || points.length < previous.length) {
      syncFullSeries(chart, points);
      chart.update("none");
      previousPointsRef.current = points;
      return;
    }

    if (points.length > previous.length) {
      for (let index = previous.length; index < points.length; index += 1) {
        const point = points[index];
        if (point) {
          appendSeriesPoint(chart, point);
        }
      }
      chart.update("none");
      previousPointsRef.current = points;
      return;
    }

    const latestPoint = points[points.length - 1];
    const previousLatestPoint = previous[previous.length - 1];
    if (
      latestPoint &&
      previousLatestPoint &&
      (latestPoint.attentiveness !== previousLatestPoint.attentiveness ||
        latestPoint.behavior !== previousLatestPoint.behavior ||
        latestPoint.comprehension !== previousLatestPoint.comprehension)
    ) {
      syncFullSeries(chart, points);
      chart.update("none");
    }

    previousPointsRef.current = points;
  }, [points]);

  return (
    <PrimeChart
      ref={primeChartRef}
      type="line"
      data={chartData}
      options={CHART_OPTIONS}
      height={height}
    />
  );
};

export const SimulationMetricsChart = memo(
  SimulationMetricsChartComponent,
  (previous, next) => previous.points === next.points && previous.height === next.height,
);
