import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  ChartOptions,
  Filler,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { format } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);

interface DataPoint {
  timestamp: Date;
  holders: number;
}

type ChartType = 'line' | 'area';
type Theme = 'light' | 'dark';
type MovingAverageType = 'none' | 'sma' | 'ema';

interface ChartSettings {
  showTrendLine: boolean;
  showMovingAverage: boolean;
  maType: MovingAverageType;
  maPeriod: number;
  timeRange: string;
  aggregationType: string;
}

interface HolderChartProps {
  data: DataPoint[];
  chartType: ChartType;
  theme: Theme;
  settings: ChartSettings;
}

const calculateSMA = (data: number[], period: number): number[] => {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
      continue;
    }
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
};

const calculateEMA = (data: number[], period: number): number[] => {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema.push(data[0]);
      continue;
    }
    const currentEMA = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
    ema.push(currentEMA);
  }
  return ema;
};

const calculateTrendLine = (data: DataPoint[]): { start: number; end: number } => {
  const n = data.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const y = data.map(d => d.holders);
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, i) => a + i * y[i], 0);
  const sumXX = x.reduce((a, b) => a + b * b, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  return {
    start: intercept,
    end: slope * (n - 1) + intercept
  };
};

const getTimeUnit = (data: DataPoint[]): { unit: 'second' | 'minute' | 'hour', stepSize: number } => {
  if (data.length < 2) return { unit: 'second', stepSize: 1 };
  
  const timeSpan = data[data.length - 1].timestamp.getTime() - data[0].timestamp.getTime();
  const minutes = timeSpan / (1000 * 60);
  
  if (minutes <= 5) {
    return { unit: 'second', stepSize: 15 };
  } else if (minutes <= 15) {
    return { unit: 'second', stepSize: 30 };
  } else if (minutes <= 60) {
    return { unit: 'minute', stepSize: 1 };
  } else if (minutes <= 180) {
    return { unit: 'minute', stepSize: 5 };
  } else if (minutes <= 360) {
    return { unit: 'minute', stepSize: 15 };
  } else if (minutes <= 1440) { // 24 hours
    return { unit: 'hour', stepSize: 1 };
  } else {
    return { unit: 'hour', stepSize: 4 };
  }
};

const aggregateData = (data: DataPoint[], interval: string): DataPoint[] => {
  if (interval === 'all' || interval === 'raw' || data.length === 0) return data;
  
  const timeValue = parseInt(interval);
  const unit = interval.slice(-1);
  let intervalMs: number;
  
  switch (unit) {
    case 'm':
      intervalMs = timeValue * 60 * 1000;
      break;
    case 'h':
      intervalMs = timeValue * 60 * 60 * 1000;
      break;
    case 'd':
      intervalMs = timeValue * 24 * 60 * 60 * 1000;
      break;
    default:
      return data;
  }

  // Find the start and end times
  const startTime = Math.floor(data[0].timestamp.getTime() / intervalMs) * intervalMs;
  const endTime = Math.ceil(data[data.length - 1].timestamp.getTime() / intervalMs) * intervalMs;
  
  // Create a map of all possible intervals
  const groups = new Map<number, number[]>();
  for (let time = startTime; time <= endTime; time += intervalMs) {
    groups.set(time, []);
  }
  
  // Assign data points to their intervals
  data.forEach(point => {
    const timestamp = point.timestamp.getTime();
    const intervalStart = Math.floor(timestamp / intervalMs) * intervalMs;
    const existing = groups.get(intervalStart) || [];
    existing.push(point.holders);
    groups.set(intervalStart, existing);
  });

  // Convert groups to data points, using last known value for empty intervals
  let lastKnownValue = data[0].holders;
  const result = Array.from(groups.entries())
    .map(([timestamp, holders]) => {
      if (holders.length > 0) {
        lastKnownValue = Math.round(holders.reduce((a, b) => a + b, 0) / holders.length);
      }
      return {
        timestamp: new Date(timestamp),
        holders: lastKnownValue
      };
    })
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  return result;
};

export function HolderChart({ data, chartType, theme, settings }: HolderChartProps) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#e4e4e7' : '#3f3f46';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  // First aggregate all historical data at the selected interval
  const aggregatedData = settings.timeRange === 'all' 
    ? data 
    : aggregateData(data, settings.timeRange); // Use timeRange directly for aggregation interval

  // Then filter by time range if needed
  const filteredData = settings.timeRange === 'all' 
    ? aggregatedData 
    : aggregatedData;  // No filtering needed as we want all historical data at the selected interval

  const timeConfig = getTimeUnit(filteredData);

  // Calculate moving averages if enabled
  const maData = settings.showMovingAverage ? (
    settings.maType === 'sma' 
      ? calculateSMA(filteredData.map(d => d.holders), settings.maPeriod)
      : calculateEMA(filteredData.map(d => d.holders), settings.maPeriod)
  ) : [];

  // Calculate trend line if enabled
  const trendLine = settings.showTrendLine ? calculateTrendLine(filteredData) : null;

  // Update Y-axis range
  const currentValue = filteredData.length > 0 ? filteredData[filteredData.length - 1].holders : 0;
  const yAxisRange = {
    min: Math.max(0, currentValue - 10),
    max: currentValue + 10
  };

  const datasets = [
    {
      label: 'Token Holders',
      data: filteredData.map(point => ({
        x: point.timestamp,
        y: point.holders,
      })),
      borderColor: '#10B981',
      backgroundColor: chartType === 'area'
        ? isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)'
        : isDark ? 'rgba(16, 185, 129, 0.9)' : 'rgba(16, 185, 129, 0.8)',
      borderWidth: 2,
      fill: chartType === 'area',
      tension: 0.4,
      pointRadius: 2,
      pointHitRadius: 8,
      order: 2,
    },
  ];

  // Add moving average dataset if enabled
  if (settings.showMovingAverage) {
    datasets.push({
      label: `${settings.maType.toUpperCase()}(${settings.maPeriod})`,
      data: maData.map((value, index) => ({
        x: filteredData[index].timestamp,
        y: value,
      })),
      borderColor: '#60A5FA',
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 0,
      fill: false,
      tension: 0.4,
      order: 1,
    });
  }

  // Add trend line if enabled
  if (settings.showTrendLine && trendLine) {
    datasets.push({
      label: 'Trend Line',
      data: [
        { x: filteredData[0].timestamp, y: trendLine.start },
        { x: filteredData[filteredData.length - 1].timestamp, y: trendLine.end },
      ],
      borderColor: '#F43F5E',
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 0,
      fill: false,
      tension: 0,
      order: 0,
    });
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: textColor,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        callbacks: {
          title: (context) => {
            if (context[0]?.raw && typeof context[0].raw === 'object' && 'x' in context[0].raw) {
              return format(new Date(context[0].raw.x as Date), 'HH:mm:ss');
            }
            return '';
          },
          label: (context) => {
            if (context.raw && typeof context.raw === 'object' && 'y' in context.raw) {
              const value = context.raw.y as number;
              return `${context.dataset.label}: ${value.toLocaleString()}`;
            }
            return '';
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: timeConfig.unit,
          displayFormats: {
            second: 'HH:mm:ss',
            minute: 'HH:mm',
            hour: 'HH:mm'
          }
        },
        grid: {
          color: gridColor,
          display: false
        },
        ticks: {
          color: textColor,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
          stepSize: timeConfig.stepSize
        },
      },
      y: {
        beginAtZero: false,
        grid: {
          color: gridColor,
        },
        ticks: {
          color: textColor,
          callback: function(value) {
            return typeof value === 'number' ? Math.floor(value).toLocaleString() : '';
          },
          stepSize: 3,
          includeBounds: true,
        },
        min: Math.floor(yAxisRange.min / 3) * 3,
        max: Math.ceil(yAxisRange.max / 3) * 3,
      }
    },
  };

  return <Line data={{ datasets }} options={options} />;
}