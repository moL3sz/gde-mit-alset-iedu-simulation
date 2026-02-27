import { useEffect, useRef } from "react";
import {
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  type Plugin,
  PointElement,
  Title,
  Tooltip,
  type ChartDataset,
  type TooltipItem,
} from "chart.js";

Chart.register(
  LineController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

type MetricsLineChartProps = {
  title: string;
  labels: string[];
  redValues: Array<number | null>;
  notListeningValues: Array<number | null>;
  teacherActions: string[];
  redActions: Array<string | null>;
  redSeriesLabel: string;
  yAxisTitle: string;
  xAxisTitle: string;
};

const translateStudentAction = (action: string | null | undefined) => {
  if (!action) {
    return "n/a";
  }

  const normalizedAction = action.toLowerCase();

  if (normalizedAction === "listen") {
    return "figyel";
  }

  if (
    normalizedAction.includes("doesn't listen") ||
    normalizedAction.includes("doesnt listen") ||
    normalizedAction.includes("nem listen")
  ) {
    return "nem figyel";
  }

  if (normalizedAction === "talking") {
    return "beszélget";
  }

  return action;
};

const translateTeacherAction = (action: string | null | undefined) => {
  if (!action || action === "n/a" || action === "nincs adat") {
    return "n/a";
  }

  const normalizedAction = action.toLowerCase();

  if (normalizedAction === "education") {
    return "oktat";
  }

  if (normalizedAction === "interactive education") {
    return "interaktívan oktat";
  }

  if (normalizedAction === "kidding") {
    return "poénkodik";
  }

  if (normalizedAction === "moderation") {
    return "moderál";
  }

  return action;
};

export const MetricsLineChart = ({
  title,
  labels,
  redValues,
  notListeningValues,
  teacherActions,
  redActions,
  redSeriesLabel,
  yAxisTitle,
  xAxisTitle,
}: MetricsLineChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<"line", Array<number | null>, string> | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    chartRef.current?.destroy();

    const hasNotListeningPoints = notListeningValues.some((value) => value !== null);
    const datasets: ChartDataset<"line", Array<number | null>>[] = [
      {
        label: redSeriesLabel,
        data: redValues,
        borderColor: "#dc2626",
        backgroundColor: "rgba(220, 38, 38, 0.2)",
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        spanGaps: true,
      },
    ];

    if (hasNotListeningPoints) {
      datasets.push({
        label: "nem figyel / beszélget",
        data: notListeningValues,
        borderColor: "transparent",
        backgroundColor: "#dc2626",
        clip: false,
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 6,
        showLine: false,
        spanGaps: false,
      });
    }

    const ACTION_BACKGROUND_COLOR: Record<string, string> = {
      kidding: "rgba(59, 130, 246, 0.40)",
      "interactive education": "rgba(34, 197, 94, 0.40)",
      moderation: "rgba(239, 68, 68, 0.38)",
    };

    const teacherActionBackgroundPlugin: Plugin<"line"> = {
      id: "teacherActionBackground",
      beforeDatasetsDraw: (chart) => {
        const { ctx, chartArea, scales } = chart;

        if (!chartArea) {
          return;
        }

        const xScale = scales.x;
        const pointCount = labels.length;

        if (!xScale || pointCount === 0) {
          return;
        }

        ctx.save();

        for (let index = 0; index < pointCount; index += 1) {
          const action = (teacherActions[index] ?? "").toLowerCase();
          const backgroundColor = ACTION_BACKGROUND_COLOR[action];

          if (!backgroundColor) {
            continue;
          }

          const centerX = xScale.getPixelForValue(index);
          let leftX = chartArea.left;
          let rightX = chartArea.right;

          if (index === 0) {
            if (pointCount > 1) {
              const nextX = xScale.getPixelForValue(index + 1);
              rightX = (centerX + nextX) / 2;
            }
          } else if (index === pointCount - 1) {
            const previousX = xScale.getPixelForValue(index - 1);
            leftX = (previousX + centerX) / 2;
          } else {
            const previousX = xScale.getPixelForValue(index - 1);
            const nextX = xScale.getPixelForValue(index + 1);
            leftX = (previousX + centerX) / 2;
            rightX = (centerX + nextX) / 2;
          }

          ctx.fillStyle = backgroundColor;
          ctx.fillRect(leftX, chartArea.top, rightX - leftX, chartArea.bottom - chartArea.top);
        }

        ctx.restore();
      },
    };

    chartRef.current = new Chart<"line", Array<number | null>, string>(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets,
      },
      plugins: [teacherActionBackgroundPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            position: "top",
          },
          title: {
            display: true,
            text: title,
          },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: (items: TooltipItem<"line">[]) => {
                const rawLabel = items[0]?.label;

                if (!rawLabel) {
                  return "";
                }

                return `${rawLabel}. perc`;
              },
              label: () => {
                return [];
              },
              afterBody: (items: TooltipItem<"line">[]) => {
                const pointIndex = items[0]?.dataIndex;

                if (pointIndex === undefined) {
                  return [];
                }

                const studentAction = translateStudentAction(redActions[pointIndex]);
                const teacherAction = translateTeacherAction(teacherActions[pointIndex]);

                return [`diák: ${studentAction}`, `tanár: ${teacherAction}`];
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: xAxisTitle,
            },
          },
          y: {
            min: 0,
            max: 10,
            title: {
              display: true,
              text: yAxisTitle,
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [
    labels,
    notListeningValues,
    redActions,
    redSeriesLabel,
    redValues,
    teacherActions,
    title,
    xAxisTitle,
    yAxisTitle,
  ]);

  return (
    <div className="h-[440px] w-full rounded-xl bg-white p-4 shadow-sm">
      <canvas ref={canvasRef} />
    </div>
  );
};
