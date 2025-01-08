'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HolderChart } from '@/components/HolderChart';
import { Card, Title, Text, Select, SelectItem, Grid, Metric, Flex, Badge } from '@tremor/react';
import { format } from 'date-fns';
import { ArrowUpIcon, ArrowDownIcon, MinusIcon, TrendingUpIcon, UsersIcon, HistoryIcon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

interface DataPoint {
  timestamp: Date;
  holders: number;
}

interface LastChange {
  value: number;
  timestamp: Date;
}

interface Analytics {
  peakHolders: number;
  positiveChanges: number;
  negativeChanges: number;
  totalChanges: number;
}

type ChartType = 'line' | 'area';
type Theme = 'light' | 'dark';
type TimeRange = '1m' | '5m' | '15m' | '30m' | '1h' | '6h' | '24h' | '7d';
type AggregationType = 'raw' | '1m' | '5m' | '15m' | '1h';
type MovingAverageType = 'none' | 'sma' | 'ema';

interface ChartSettings {
  showTrendLine: boolean;
  showMovingAverage: boolean;
  maType: MovingAverageType;
  maPeriod: number;
  timeRange: TimeRange;
  aggregationType: AggregationType;
}

const STORAGE_KEY = 'holderData';

function saveToLocalStorage(data: DataPoint[]) {
  if (typeof window !== 'undefined') {
    // Convert dates to ISO strings for storage
    const dataToStore = data.map(point => ({
      ...point,
      timestamp: point.timestamp.toISOString()
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
  }
}

function loadFromLocalStorage(): DataPoint[] {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      // Convert ISO strings back to Date objects
      const parsedData = JSON.parse(saved);
      return parsedData.map((point: any) => ({
        ...point,
        timestamp: new Date(point.timestamp)
      }));
    }
  }
  return [];
}

export default function Home() {
  const { theme } = useTheme();
  const [holderData, setHolderData] = useState<DataPoint[]>([]);
  const [currentHolders, setCurrentHolders] = useState<number>(0);
  const [lastChange, setLastChange] = useState<LastChange | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [chartType, setChartType] = useState<ChartType>('line');
  const [updateFrequency, setUpdateFrequency] = useState<number>(5);
  const [chartSettings, setChartSettings] = useState<ChartSettings>({
    showTrendLine: false,
    showMovingAverage: false,
    maType: 'none',
    maPeriod: 20,
    timeRange: '1h',
    aggregationType: 'raw'
  });
  const [analytics, setAnalytics] = useState<Analytics>({
    peakHolders: 0,
    positiveChanges: 0,
    negativeChanges: 0,
    totalChanges: 0
  });

  // Add refs for request tracking
  const lastFetchRef = useRef<number>(0);
  const fetchInProgressRef = useRef<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize peak holders from localStorage on client side
  useEffect(() => {
    const storedPeak = localStorage.getItem('peakHolders');
    if (storedPeak) {
      setAnalytics(prev => ({
        ...prev,
        peakHolders: parseInt(storedPeak)
      }));
    }
  }, []);

  function updateAnalytics(data: DataPoint[], newPoint: DataPoint) {
    if (data.length === 0) return;

    const currentHolders = newPoint.holders;
    const storedPeak = localStorage.getItem('peakHolders');
    const allTimePeak = storedPeak ? Math.max(parseInt(storedPeak), currentHolders) : currentHolders;
    
    if (allTimePeak > (storedPeak ? parseInt(storedPeak) : 0)) {
      localStorage.setItem('peakHolders', allTimePeak.toString());
    }

    // Calculate changes
    const changes = data.slice(1).reduce((acc, curr, index) => {
      const change = curr.holders - data[index].holders;
      return {
        positive: acc.positive + (change > 0 ? 1 : 0),
        negative: acc.negative + (change < 0 ? 1 : 0),
        total: acc.total + (change !== 0 ? 1 : 0)
      };
    }, { positive: 0, negative: 0, total: 0 });

    setAnalytics(prev => ({
      ...prev,
      peakHolders: allTimePeak,
      positiveChanges: changes.positive,
      negativeChanges: changes.negative,
      totalChanges: changes.total
    }));

    // Find the last actual change in holder count
    if (data.length >= 1) {
      let lastChangeFound = false;
      let i = data.length - 1;
      let lastKnownHolders = newPoint.holders;
      
      // Look backwards through the data until we find a change
      while (i >= 0 && !lastChangeFound) {
        if (data[i].holders !== lastKnownHolders) {
          const change = lastKnownHolders - data[i].holders;
          setLastChange({
            value: change,
            timestamp: newPoint.timestamp
          });
          lastChangeFound = true;
        }
        i--;
      }
    }

    // Update current holders
    setCurrentHolders(currentHolders);
    setLoading(false);
  }

  const getChangeIcon = (value: number) => {
    if (value > 0) {
      return <ArrowUpIcon className="h-5 w-5 text-green-600 dark:text-green-400" />;
    } else if (value < 0) {
      return <ArrowDownIcon className="h-5 w-5 text-red-600 dark:text-red-400" />;
    }
    return <MinusIcon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />;
  };

  const calculateChangeRate = () => {
    if (holderData.length < 2) return '0';
    try {
      // Calculate the total change over the last hour
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Get data points from the last hour
      const recentData = holderData.filter(point => point.timestamp >= oneHourAgo);
      
      if (recentData.length < 2) {
        // If not enough recent data, use all available data
        recentData.push(...holderData.slice(-2));
      }

      // Calculate total changes
      let totalChange = 0;
      for (let i = 1; i < recentData.length; i++) {
        const change = Math.abs(recentData[i].holders - recentData[i - 1].holders);
        totalChange += change;
      }

      // Calculate time span in minutes
      const timeSpanMinutes = (recentData[recentData.length - 1].timestamp.getTime() - recentData[0].timestamp.getTime()) / (1000 * 60);
      
      if (timeSpanMinutes === 0) return '0';
      
      // Calculate average change per minute
      const changeRate = totalChange / timeSpanMinutes;
      return changeRate.toFixed(1);
    } catch (error) {
      console.error('Error calculating change rate:', error);
      return '0';
    }
  };

  const handleChartTypeChange = (value: string) => {
    if (value === 'line' || value === 'area') {
      setChartType(value);
    }
  };

  const handleFrequencyChange = (value: string) => {
    setUpdateFrequency(parseInt(value));
  };

  const fetchData = useCallback(async () => {
    if (fetchInProgressRef.current) {
      return;
    }

    try {
      fetchInProgressRef.current = true;
      const startTime = Date.now();
      
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://83.105.124.102:6767';
      console.log('Attempting to fetch from backend:', backendUrl);
      
      let holders = 0;
      let timestamp = new Date();
      let usedFallback = false;

      try {
        // Try backend first
        const response = await fetch(`${backendUrl}/api/holders`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (!response.ok) {
          throw new Error(`Backend error: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success && data.holders > 0) {
          holders = data.holders;
          timestamp = new Date(data.timestamp);
          console.log('Successfully fetched from backend:', holders);
        } else {
          throw new Error('Invalid data from backend');
        }
      } catch (error) {
        // If backend fails, fallback to Helius API
        console.warn('Backend fetch failed, falling back to Helius:', error);
        usedFallback = true;
        
        const heliusUrl = 'https://api.helius.xyz/v0/token-metadata';
        const apiKey = 'e2d4b800-7644-4bb7-838b-aae1a3000b56';
        
        const response = await fetch(`${heliusUrl}?api-key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mintAccounts: ['9eF4iX4BzeKnvJ7gSw5L725jk48zJw2m66NFxHHvpump'],
            includeOffChain: true,
            disableCache: true
          })
        });

        if (!response.ok) {
          throw new Error(`Helius API error: ${response.status}`);
        }

        const data = await response.json();
        if (data && data[0] && data[0].onChainMetadata && data[0].onChainMetadata.currentSupply) {
          holders = parseInt(data[0].onChainMetadata.currentSupply);
          console.log('Successfully fetched from Helius:', holders);
        }
      }
      
      if (holders > 0) {
        setLastUpdated(timestamp);
        const newDataPoint = {
          timestamp,
          holders: Math.floor(holders)
        };
        
        setHolderData(prev => {
          const updatedData = [...prev, newDataPoint];
          const trimmedData = updatedData.slice(-1000);
          saveToLocalStorage(trimmedData);
          updateAnalytics(trimmedData, newDataPoint);
          return trimmedData;
        });

        // Update document title with current holder count
        document.title = `$LIVE Holders: ${holders.toLocaleString()}${usedFallback ? ' (Helius)' : ''}`;
      } else {
        console.warn('No valid holder data received');
      }

      // Calculate next fetch delay
      const fetchDuration = Date.now() - startTime;
      const nextFetchDelay = Math.max(0, (updateFrequency * 1000) - fetchDuration);
      
      // Schedule next fetch
      timeoutRef.current = setTimeout(startFetchCycle, nextFetchDelay);

    } catch (error) {
      console.error('Error fetching data:', error);
      // On error, retry after the normal interval
      timeoutRef.current = setTimeout(startFetchCycle, updateFrequency * 1000);
    } finally {
      fetchInProgressRef.current = false;
      lastFetchRef.current = Date.now();
    }
  }, [updateFrequency]);

  const startFetchCycle = useCallback(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Only start a new fetch if one isn't in progress
    if (!fetchInProgressRef.current) {
      fetchData();
    }
  }, [fetchData]);

  // Initial setup effect - only runs once
  useEffect(() => {
    // Load saved data immediately
    const savedData = loadFromLocalStorage();
    if (savedData.length > 0) {
      setHolderData(savedData);
      const lastPoint = savedData[savedData.length - 1];
      updateAnalytics(savedData, lastPoint);
      setLoading(false);
    }

    // Start the initial fetch cycle
    startFetchCycle();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [startFetchCycle]); // Only depend on startFetchCycle

  // Handle update frequency changes
  useEffect(() => {
    startFetchCycle();
  }, [updateFrequency, startFetchCycle]);

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
            $LIVE Token Analytics
          </h1>
          <p className="mt-3 text-lg text-zinc-500 dark:text-zinc-400">
            Real-time monitoring and analytics of token holder activity
          </p>
        </div>

        <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-6">
          <Card className="dark:bg-zinc-900 dark:ring-zinc-800 p-4">
            <Flex alignItems="center" className="justify-between h-full">
              <div className="space-y-1">
                <Text className="dark:text-zinc-400 text-xl">Current Holders</Text>
                <Metric className="dark:text-zinc-50 text-4xl font-bold">
                  {loading ? '...' : Math.floor(currentHolders).toLocaleString()}
                </Metric>
              </div>
              <Badge color="blue" size="lg" className="p-3"><UsersIcon className="w-8 h-8" /></Badge>
            </Flex>
          </Card>

          <Card className="dark:bg-zinc-900 dark:ring-zinc-800 p-4">
            <Flex alignItems="center" className="justify-between h-full">
              <div className="space-y-1">
                <Text className="dark:text-zinc-400 text-xl">Peak Holders</Text>
                <Metric className="dark:text-zinc-50 text-4xl font-bold">
                  {Math.floor(analytics?.peakHolders || 0).toLocaleString()}
                </Metric>
              </div>
              <Badge color="emerald" size="lg" className="p-3"><TrendingUpIcon className="w-8 h-8" /></Badge>
            </Flex>
          </Card>

          <Card className="dark:bg-zinc-900 dark:ring-zinc-800 p-4">
            <Flex alignItems="center" className="justify-between h-full">
              <div className="space-y-1">
                <Text className="dark:text-zinc-400 text-xl">Change Rate</Text>
                <Metric className="dark:text-zinc-50 text-4xl font-bold">{calculateChangeRate()} /min</Metric>
              </div>
              <Badge color="orange" size="lg" className="p-3"><HistoryIcon className="w-8 h-8" /></Badge>
            </Flex>
          </Card>

          <Card className="dark:bg-zinc-900 dark:ring-zinc-800">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Text className="dark:text-zinc-400 text-sm mb-1">Last Change</Text>
                {lastChange ? (
                  <>
                    <div className="mt-2 flex items-center space-x-2">
                      {getChangeIcon(lastChange.value)}
                      <Metric className={
                        lastChange.value > 0 ? 'text-green-600 dark:text-green-400' : 
                        lastChange.value < 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400'
                      }>
                        {lastChange.value > 0 ? '+' : ''}{lastChange.value.toLocaleString()}
                      </Metric>
                    </div>
                  </>
                ) : (
                  <Text className="mt-2 text-zinc-500 dark:text-zinc-400">No changes yet</Text>
                )}
              </div>

              <div>
                <Text className="dark:text-zinc-400 text-sm mb-1">Total Change</Text>
                {holderData.length > 0 && (
                  <div className="mt-2 flex items-center space-x-2">
                    {getChangeIcon(holderData[holderData.length - 1].holders - holderData[0].holders)}
                    <Metric className={
                      holderData[holderData.length - 1].holders - holderData[0].holders > 0 
                        ? 'text-green-600 dark:text-green-400' 
                        : holderData[holderData.length - 1].holders - holderData[0].holders < 0 
                          ? 'text-red-600 dark:text-red-400' 
                          : 'text-zinc-600 dark:text-zinc-400'
                    }>
                      {(holderData[holderData.length - 1].holders - holderData[0].holders > 0 ? '+' : '')}
                      {(holderData[holderData.length - 1].holders - holderData[0].holders).toLocaleString()}
                    </Metric>
                  </div>
                )}
              </div>
            </div>
            {lastUpdated && (
              <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-3 text-center">
                Last updated: {format(lastUpdated, 'HH:mm:ss')}
              </Text>
            )}
          </Card>
        </Grid>

        <div className="space-y-6">
          <Card className="dark:bg-zinc-900 dark:ring-zinc-800 !p-4">
            <div className="flex justify-between items-center mb-4">
              <Title className="dark:text-zinc-50">Holder Count History</Title>
              <Select
                value={chartType}
                onValueChange={handleChartTypeChange}
                enableClear={false}
                className="w-32"
              >
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="area">Area Chart</SelectItem>
              </Select>
            </div>
            <div className="h-[480px]">
              <HolderChart 
                data={holderData} 
                chartType={chartType} 
                theme={theme} 
                settings={chartSettings}
              />
            </div>
          </Card>

          <Grid numItems={1} numItemsSm={2} numItemsLg={3} className="gap-6">
            <Card className="dark:bg-zinc-900 dark:ring-zinc-800">
              <Title className="dark:text-zinc-50 text-base mb-3">Change Distribution</Title>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col items-center">
                  <Text className="dark:text-zinc-400 text-sm mb-1">Positive</Text>
                  <Badge color="emerald" size="sm">{analytics?.positiveChanges || 0}</Badge>
                  <Text className="dark:text-zinc-400 text-xs mt-1">
                    {((analytics?.positiveChanges || 0) / ((analytics?.totalChanges || 1)) * 100).toFixed(1)}%
                  </Text>
                </div>
                <div className="flex flex-col items-center">
                  <Text className="dark:text-zinc-400 text-sm mb-1">Negative</Text>
                  <Badge color="red" size="sm">{analytics?.negativeChanges || 0}</Badge>
                  <Text className="dark:text-zinc-400 text-xs mt-1">
                    {((analytics?.negativeChanges || 0) / ((analytics?.totalChanges || 1)) * 100).toFixed(1)}%
                  </Text>
                </div>
                <div className="flex flex-col items-center">
                  <Text className="dark:text-zinc-400 text-sm mb-1">Total</Text>
                  <Badge color="blue" size="sm">{analytics?.totalChanges || 0}</Badge>
                  <Text className="dark:text-zinc-400 text-xs mt-1">Changes</Text>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center">
                  <Text className="dark:text-zinc-400 text-sm">Volatility</Text>
                  <Text className="dark:text-zinc-400 text-sm font-medium">
                    {((analytics?.totalChanges || 0) / (holderData?.length || 1)).toFixed(2)} changes/min
                  </Text>
                </div>
              </div>
            </Card>

            <Card className="dark:bg-zinc-900 dark:ring-zinc-800">
              <Title className="dark:text-zinc-50 text-base mb-3">Session Statistics</Title>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col items-center">
                  <Text className="dark:text-zinc-400 text-sm mb-1">Duration</Text>
                  <Text className="dark:text-zinc-50 text-base font-medium">{Math.round(holderData.length * (updateFrequency / 60))}m</Text>
                  <Text className="dark:text-zinc-400 text-xs mt-1">Active</Text>
                </div>
                <div className="flex flex-col items-center">
                  <Text className="dark:text-zinc-400 text-sm mb-1">Points</Text>
                  <Text className="dark:text-zinc-50 text-base font-medium">{holderData.length}</Text>
                  <Text className="dark:text-zinc-400 text-xs mt-1">Samples</Text>
                </div>
                <div className="flex flex-col items-center">
                  <Text className="dark:text-zinc-400 text-sm mb-1">Net Change</Text>
                  <Text className={`text-base font-medium ${
                    holderData.length > 0
                      ? holderData[holderData.length - 1].holders - holderData[0].holders > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                      : 'dark:text-zinc-400'
                  }`}>
                    {holderData.length > 0
                      ? (holderData[holderData.length - 1].holders - holderData[0].holders).toLocaleString()
                      : '0'}
                  </Text>
                  <Text className="dark:text-zinc-400 text-xs mt-1">Holders</Text>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center">
                  <Text className="dark:text-zinc-400 text-sm">Avg. Change</Text>
                  <Text className={`text-sm font-medium ${
                    holderData.length > 0 && analytics.totalChanges > 0
                      ? Math.abs((holderData[holderData.length - 1].holders - holderData[0].holders) / analytics.totalChanges) > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                      : 'dark:text-zinc-400'
                  }`}>
                    {holderData.length > 0 && analytics.totalChanges > 0
                      ? Math.abs((holderData[holderData.length - 1].holders - holderData[0].holders) / analytics.totalChanges).toFixed(2)
                      : '0'} per change
                  </Text>
                </div>
              </div>
            </Card>

            <Card className="dark:bg-zinc-900 dark:ring-zinc-800">
              <Title className="dark:text-zinc-50 text-base mb-3">Chart Settings</Title>
              <div className="grid grid-cols-2 gap-2 relative">
                <div className="w-full">
                  <Text className="dark:text-zinc-400 text-sm mb-1">Time Range</Text>
                  <Select
                    value={chartSettings.timeRange}
                    onValueChange={(value: string) => 
                      setChartSettings(prev => ({ 
                        ...prev, 
                        timeRange: value as TimeRange,
                        // Sync aggregation with time range for better visualization
                        aggregationType: value as AggregationType
                      }))}
                    enableClear={false}
                    className="min-w-[110px]"
                  >
                    <SelectItem value="1m">1 min</SelectItem>
                    <SelectItem value="5m">5 min</SelectItem>
                    <SelectItem value="15m">15 min</SelectItem>
                    <SelectItem value="30m">30 min</SelectItem>
                    <SelectItem value="1h">1 hour</SelectItem>
                    <SelectItem value="6h">6 hours</SelectItem>
                    <SelectItem value="24h">24 hours</SelectItem>
                    <SelectItem value="7d">7 days</SelectItem>
                  </Select>
                </div>

                <div className="w-full">
                  <Text className="dark:text-zinc-400 text-sm mb-1">Moving Average</Text>
                  <Select
                    value={chartSettings.maType}
                    onValueChange={(value: string) => 
                      setChartSettings(prev => ({ 
                        ...prev, 
                        maType: value as MovingAverageType,
                        showMovingAverage: value !== 'none',
                        maPeriod: value !== 'none' ? 20 : prev.maPeriod
                      }))}
                    enableClear={false}
                    className="min-w-[110px]"
                  >
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="sma">SMA(20)</SelectItem>
                    <SelectItem value="ema">EMA(20)</SelectItem>
                  </Select>
                </div>

                <div className="w-full">
                  <Text className="dark:text-zinc-400 text-sm mb-1">Trend Line</Text>
                  <Select
                    value={chartSettings.showTrendLine.toString()}
                    onValueChange={(value: string) => 
                      setChartSettings(prev => ({ 
                        ...prev, 
                        showTrendLine: value === 'true'
                      }))}
                    enableClear={false}
                    className="min-w-[110px]"
                  >
                    <SelectItem value="true">Show</SelectItem>
                    <SelectItem value="false">Hide</SelectItem>
                  </Select>
                </div>

                <div className="w-full">
                  <Text className="dark:text-zinc-400 text-sm mb-1">Update</Text>
                  <Select
                    value={updateFrequency.toString()}
                    onValueChange={handleFrequencyChange}
                    enableClear={false}
                    className="min-w-[110px]"
                  >
                    <SelectItem value="5">5s</SelectItem>
                    <SelectItem value="10">10s</SelectItem>
                    <SelectItem value="15">15s</SelectItem>
                    <SelectItem value="30">30s</SelectItem>
                    <SelectItem value="60">1m</SelectItem>
                  </Select>
                </div>
              </div>
            </Card>
          </Grid>
        </div>
      </div>
    </div>
  );
}
