import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getStatus, updateSettings, sendControl, getHistoryGraph, getHashrangeAnalysis, HashrangeAnalysis } from '../services/api';
import type { StatusResponse, Settings, HistoryEntry } from '../../both/types';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, Bar, ReferenceLine } from 'recharts';
import { Modal, useModal } from '../components/Modal';
import { AnimatedBanner } from '../components/AnimatedBanner';
import { getTempColor, getToExpectedColor } from '../utils/colors';
import { logUi } from '../utils/logger';
import { Trash2, Play, Square, BarChart3, RefreshCw } from 'lucide-react';

interface GraphDataEntry {
	t: number;
	h: number;
	a: number;
	v: number;
	s: number;
}

export default function Dashboard() {
	const [status, setStatus] = useState<StatusResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [showDisclaimer, setShowDisclaimer] = useState(false);
	const [graphData, setGraphData] = useState<GraphDataEntry[]>([]);
	const [graphRefreshing, setGraphRefreshing] = useState(false);
	const [legendVisibility, setLegendVisibility] = useState({
		hashRate: true,
		temp: true,
		vrTemp: true,
		stepDown: true,
	});
	const dataKeyToLegendKey: Record<string, keyof typeof legendVisibility> = {
		h: 'hashRate',
		s: 'stepDown',
		a: 'temp',
		v: 'vrTemp',
	};
	const handleLegendClick = (e: any) => {
		const dataKey = e.dataKey;
		if (!dataKey) return;
		const legendKey = dataKeyToLegendKey[dataKey];
		if (!legendKey) return;
		setLegendVisibility((prev) => ({
			...prev,
			[legendKey]: !prev[legendKey],
		}));
	};
	const [settingsForm, setSettingsForm] = useState<Settings>({
		ip: '',
		hostname: '',
		targetAsic: 65,
		maxVr: 80,
		coreVoltage: 1300,
		maxFreq: 900,
		maxHistoryEntries: 172800,
		lowStepAnalyseRange: 50,
		lowStepWarningThreshold: -10,
		stepDownDefault: -10,
	});
	const settingsFormRef = useRef(settingsForm);
	const [initialLoad, setInitialLoad] = useState(true);
	const GRAPH_HOURS_KEY = 'bitaxe_graph_hours';
	const getInitialGraphHours = (): number => {
		const saved = localStorage.getItem(GRAPH_HOURS_KEY);
		if (saved) {
			const parsed = parseFloat(saved);
			if (!isNaN(parsed) && parsed > 0) return parsed;
		}
		return 2;
	};
	const [graphHours, setGraphHours] = useState(getInitialGraphHours());
	const [isPageVisible, setIsPageVisible] = useState(true);
	const [isDarkMode, setIsDarkMode] = useState(false);
	const [hashrangeAnalysis, setHashrangeAnalysis] = useState<HashrangeAnalysis | null>(null);
	const [dismissHashrateAlert, setDismissHashrateAlert] = useState(false);
	const [dismissHashrateDropAlert, setDismissHashrateDropAlert] = useState(false);
	const [dismissLowStepAlert, setDismissLowStepAlert] = useState(false);
	const [apiError, setApiError] = useState<string | null>(null);
	const [lastStepDownValue, setLastStepDownValue] = useState<number | null>(null);
	const [stepDownStableCycles, setStepDownStableCycles] = useState(0);
	const { modalState, showConfirm, showAlert, showAnalysis, closeModal } = useModal();
	const prevGraphHours = useRef(graphHours);
	const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);
	const settingsChangedRef = useRef(false);

	const handleSettingChange = (key: keyof Settings, value: number) => {
		const newSettings = { ...settingsFormRef.current, [key]: value };
		setSettingsForm(newSettings);
		settingsFormRef.current = newSettings;
		settingsChangedRef.current = true;
		if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
		saveDebounceRef.current = setTimeout(async () => {
			if (settingsChangedRef.current) {
				settingsChangedRef.current = false;
				try {
					await updateSettings(settingsFormRef.current);
					setImmediate(fetchStatus);
				} catch (error) {
					console.error('Failed to save settings:', error);
				}
			}
		}, 300);
	};

	useEffect(() => {
		const observer = new MutationObserver(() => {
			const isDark = document.documentElement.classList.contains('dark');
			setIsDarkMode(isDark);
		});
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	}, []);

	const GRAPH_STORAGE_KEY = 'bitaxe_graph_data';
	const MAX_GRAPH_AGE_HOURS = 48;

	const cropOldEntries = useCallback((data: GraphDataEntry[]): GraphDataEntry[] => {
		if (data.length === 0) return [];
		const cutoffTime = new Date();
		cutoffTime.setHours(cutoffTime.getHours() - MAX_GRAPH_AGE_HOURS);
		return data.filter(entry => entry.t * 1000 > cutoffTime.getTime());
	}, []);

	const loadCachedGraphData = useCallback((): GraphDataEntry[] => {
		try {
			const cached = localStorage.getItem(GRAPH_STORAGE_KEY);
			if (cached) {
				const parsed = JSON.parse(cached);
				let allData: GraphDataEntry[] = parsed;
				if (parsed.length > 0) {
					const first = parsed[0];
					if ('timestamp' in first) {
						allData = parsed.map((entry: any) => ({
							t: Math.floor(new Date(entry.timestamp).getTime() / 1000),
							h: entry.hashRate,
							a: entry.temp,
							v: entry.vrTemp,
							s: entry.stepDown,
						}));
						localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(allData));
					} else if (typeof first.t === 'number' && first.t > 1e12) {
						allData = parsed.map((entry: any) => ({
							...entry,
							t: Math.floor(entry.t / 1000),
						}));
						localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(allData));
					}
				}
				allData.forEach(entry => delete (entry as any).stepDownFilled);
				return allData.sort((a, b) => a.t - b.t);
			}
		} catch (error) {
			console.error('Failed to load cached graph data:', error);
		}
		return [];
	}, []);

	const saveGraphDataToCache = useCallback((data: GraphDataEntry[]) => {
		try {
			const cropped = cropOldEntries(data);
			const sorted = [...cropped].sort((a, b) => a.t - b.t);
			const deduped: GraphDataEntry[] = [];
			let prevKey: string | null = null;
			let dropped = 0;
			for (const entry of sorted) {
				const key = `${entry.a}_${entry.v}_${entry.s}`;
				if (key !== prevKey) {
					deduped.push(entry);
					prevKey = key;
				} else {
					dropped++;
				}
			}
			if (dropped > 0) {
				console.log(`Graph data: orig: ${sorted.length} -> ${dropped} consecutive duplicates dropped -> ${deduped.length} stored`);
			}
			localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(deduped));
		} catch (error) {
			console.error('Failed to save graph data to cache:', error);
		}
	}, [cropOldEntries]);

	const downsampleData = (data: GraphDataEntry[], targetPoints: number = 300): GraphDataEntry[] => {
		if (data.length <= targetPoints) return data;
		
		const lttb = (points: GraphDataEntry[], threshold: number): GraphDataEntry[] => {
			if (!points || points.length <= threshold) return points || [];
			
			const sampled: GraphDataEntry[] = [points[0]];
			const len = points.length;
			const bucketSize = (len - 1) / (threshold - 1);
			
			let a = 0;
			
			for (let i = 0; i < threshold - 1; i++) {
				const bucketStart = Math.floor(i * bucketSize) + 1;
				const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;
				
				if (bucketStart >= len || bucketEnd > len) break;
				if (a >= len) break;
				
				const pointA = points[a];
				if (!pointA) break;
				
				let avgX = 0;
				let avgY = 0;
				let count = 0;
				for (let j = bucketStart; j < bucketEnd && j < len; j++) {
					if (points[j]) {
						avgX += j;
						avgY += points[j].a;
						count++;
					}
				}
				if (count === 0) continue;
				avgX /= count;
				avgY /= count;
				
				let maxArea = -1;
				let maxAreaPoint = bucketStart;
				
				for (let j = bucketStart; j < bucketEnd && j < len; j++) {
					if (!points[j]) continue;
					const area = Math.abs(
						(a * (points[j].a - avgY)) +
						(j * (avgY - pointA.a)) +
						(avgX * (pointA.a - points[j].a))
					);
					
					if (area > maxArea) {
						maxArea = area;
						maxAreaPoint = j;
					}
				}
				
				if (maxAreaPoint < len && points[maxAreaPoint]) {
					sampled.push(points[maxAreaPoint]);
					a = maxAreaPoint;
				}
			}
			
			if (sampled[sampled.length - 1] !== points[len - 1]) {
				sampled.push(points[len - 1]);
			}
			return sampled;
		};
		
		return lttb(data, targetPoints);
	};

	const clearGraphDataCache = useCallback(() => {
		try {
			localStorage.removeItem(GRAPH_STORAGE_KEY);
		} catch (error) {
			console.error('Failed to clear graph data cache:', error);
		}
	}, []);

	const graphDataRef = useRef<GraphDataEntry[]>([]);
	graphDataRef.current = graphData;

	const isApiInProgress = useRef(false);
	const fetchStatusCounter = useRef(0);
	const withApiLock = useCallback(async (fn: () => Promise<void>): Promise<void> => {
		while (isApiInProgress.current) {
			await new Promise(resolve => setTimeout(resolve, 10));
		}
		isApiInProgress.current = true;
		try {
			await fn();
		} finally {
			isApiInProgress.current = false;
		}
	}, []);

	const fetchGraphData = useCallback(async (forceRefresh = false) => {
		await withApiLock(async () => {
			const randomId = Math.floor(Math.random() * 9000) + 1000;
			const logPrefix = "[useCallback][fetchGraphData]["+randomId+"]";
			const startTime = performance.now();
			
			const isNewTimeRange = prevGraphHours.current !== graphHours;
			prevGraphHours.current = graphHours;
			
			if (isNewTimeRange || forceRefresh) {
				setGraphRefreshing(true);
			}
		let basePoints: number;
		if (graphHours <= 0.5) {
			basePoints = graphHours * 1200;
		} else if (graphHours < 1) {
			basePoints = 600 + (graphHours - 0.5) * 600;
		} else {
			basePoints = 900;
		}
		const targetPoints = Math.max(50, Math.min(900, Math.round(basePoints)));
			const cutoffTime = new Date(Date.now() - graphHours * 60 * 60 * 1000);
			
			try {
				const cachedData = loadCachedGraphData();
			const latestTimestamp = (forceRefresh || isNewTimeRange) || cachedData.length === 0
				? undefined
				: cachedData.reduce((latest: number, entry: GraphDataEntry) => 
					entry.t > latest ? entry.t : latest, cachedData[0].t);

			const data = await getHistoryGraph(graphHours, latestTimestamp ? new Date(latestTimestamp * 1000).toISOString() : undefined);
				
				if (data.length === 0) {
					logUi(logPrefix, 'No new data - using cache');
					if (cachedData.length > 0) {
						const filteredForDisplay = cachedData.filter(e => e.t * 1000 > cutoffTime.getTime());
						const displayData = downsampleData(filteredForDisplay, targetPoints);
						setGraphData(displayData);
					}
					setGraphRefreshing(false);
					return;
				}

				const transformed: GraphDataEntry[] = data.map(d => ({
					t: Math.floor(new Date(d.timestamp).getTime() / 1000),
					h: Math.round((d.hashRate / 1000) * 1000) / 1000,
					a: d.temp,
					v: d.vrTemp,
					s: d.stepDown,
				}));

				let mergedData: GraphDataEntry[];
				if (cachedData.length === 0) {
					mergedData = transformed;
				} else {
					const existingTimestamps = new Set(cachedData.map((d: GraphDataEntry) => d.t));
					const newEntries = transformed.filter((d: GraphDataEntry) => !existingTimestamps.has(d.t));
					mergedData = [...cachedData, ...newEntries].sort((a, b) => 
						a.t - b.t
					);
				}

				const downsampledData = downsampleData(mergedData, targetPoints);
				saveGraphDataToCache(mergedData);
				const filteredForDisplay = mergedData.filter(e => e.t * 1000 > cutoffTime.getTime());
				const displayData = downsampleData(filteredForDisplay, targetPoints);
				setGraphData(displayData);
				setGraphRefreshing(false);
				logUi(logPrefix, graphHours+"h chart:", 'New:', data.length, 'Cached:', cachedData.length, 'Total:', mergedData.length, 'Filtered:', filteredForDisplay.length, 'Downsampled:', displayData.length, 'TargetPoints:', targetPoints, `[took ${Math.round(performance.now() - startTime)}ms]`);
			} catch (error) {
				logUi(logPrefix, 'Failed to fetch graph data:', error);
				setGraphRefreshing(false);
			}
		});
	}, [graphHours, loadCachedGraphData, saveGraphDataToCache, withApiLock]);

	const fetchStatus = useCallback(async () => {
		await withApiLock(async () => {
			const randomId = Math.floor(Math.random() * 9000) + 1000;
			const logPrefix = "[useCallback][fetchStatus]["+randomId+"]";
			const startTime = performance.now();
			// logUi(logPrefix, 'Fetching status...'); 
			fetchStatusCounter.current++;
			const shouldFetchGraph = fetchStatusCounter.current % 4 === 0;
			try {
				const data = await getStatus();
				setStatus(data);
				if (data.current) {
					if (lastStepDownValue !== null && data.current.stepDown === lastStepDownValue) {
						setStepDownStableCycles(prev => prev + 1);
					} else {
						setStepDownStableCycles(0);
						setDismissHashrateAlert(false);
					}
					setLastStepDownValue(data.current.stepDown);
				}
				setApiError(null);
				if (initialLoad) {
					setSettingsForm(data.settings);
					settingsFormRef.current = data.settings;
					setInitialLoad(false);
				}
				logUi(logPrefix, `[took ${Math.round(performance.now() - startTime)}ms]`);
				if (shouldFetchGraph) {
					fetchGraphData();
				}
			} catch (error) {
				logUi(logPrefix, 'Failed to fetch status:', error);
				setApiError(error instanceof Error ? error.message : 'Unknown error');
			} finally {
				setLoading(false);
			}
		});
	}, [initialLoad, withApiLock, fetchGraphData]);

	useEffect(() => {
		const handleVisibilityChange = () => {
			setIsPageVisible(!document.hidden);
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
	}, []);

	useEffect(() => {
		const logPrefix="[loadCachedGraphData]";
		const startTime = performance.now();
		const cachedData = loadCachedGraphData();
		const cutoffTime = new Date(Date.now() - graphHours * 60 * 60 * 1000);
		let basePoints: number;
		if (graphHours <= 0.5) {
			basePoints = graphHours * 1200;
		} else if (graphHours < 1) {
			basePoints = 600 + (graphHours - 0.5) * 600;
		} else {
			basePoints = 900;
		}
		const targetPoints = Math.max(50, Math.min(900, Math.round(basePoints)));
		if (cachedData.length > 0) {
			const filteredForDisplay = cachedData.filter(e => e.t * 1000 > cutoffTime.getTime());
			const displayData = downsampleData(filteredForDisplay, targetPoints);
			setGraphData(displayData);
		}
		setGraphRefreshing(false);
		logUi(logPrefix, `[took ${Math.round(performance.now() - startTime)}ms]`);
	}, [graphHours, loadCachedGraphData]);

	useEffect(() => {
		fetchGraphData();
	}, [fetchGraphData]);

	useEffect(() => {
		localStorage.setItem(GRAPH_HOURS_KEY, graphHours.toString());
	}, [graphHours]);

	useEffect(() => {
		const lastDisclaimerDate = localStorage.getItem('disclaimerLastDismissed');
		const today = new Date().toDateString();
		if (lastDisclaimerDate !== today) {
			setShowDisclaimer(true);
		}
	}, []);

	useEffect(() => {
		fetchStatus();
		const interval = setInterval(fetchStatus, 3000);
		return () => clearInterval(interval);
	}, [fetchStatus, isPageVisible]);

	const getHashrateDomain = useMemo((): [number, number] => {
		if (graphData.length === 0) return [0, 2];
		const sorted = graphData.map(d => d.h).sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)];
		const minAllowed = Math.max(0, sorted[0] * 0.9);
		const maxAllowed = median * 1.05;
		const padding = (maxAllowed - minAllowed) * 0.1;
		return [minAllowed - padding, maxAllowed + padding];
	}, [graphData]);

	const getAverageHashrate = useMemo((): number => {
		if (graphData.length === 0) return 0;
		let sum = 0;
		for (const d of graphData) {
			sum += d.h;
		}
		return sum / graphData.length;
	}, [graphData]);

	const getMedianHashrate = useMemo((): number => {
		if (graphData.length === 0) return 0;
		const sorted = graphData.map(d => d.h).sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
	}, [graphData]);

	const getMedianAsicTemp = useMemo((): number => {
		if (graphData.length === 0) return 0;
		const sorted = graphData.map(d => d.a).sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
	}, [graphData]);

	const getMedianVrTemp = useMemo((): number => {
		if (graphData.length === 0) return 0;
		const sorted = graphData.map(d => d.v).sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
	}, [graphData]);

	const getTempDomain = useMemo((): [number, number] => {
		if (graphData.length === 0) return [0, 100];
		let min = Infinity;
		let max = -Infinity;
		for (const d of graphData) {
			if (d.a < min) min = d.a;
			if (d.a > max) max = d.a;
			if (d.v < min) min = d.v;
			if (d.v > max) max = d.v;
		}
		const padding = (max - min) * 0.1;
		const domainMax = Math.max(max + padding, 100);
		return [Math.max(0, min - padding), domainMax];
	}, [graphData]);

	const getStepTicks = useMemo((): number[] => {
		if (graphData.length === 0) return [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
		let min = Infinity;
		let max = -Infinity;
		for (const d of graphData) {
			if (d.s < min) min = d.s;
			if (d.s > max) max = d.s;
		}
		min = Math.min(min, -5);
		max = Math.max(max, 5);
		const ticks: number[] = [];
		for (let i = Math.ceil(min); i <= Math.floor(max); i++) {
			ticks.push(i);
		}
		return ticks;
	}, [graphData]);

	const handleToggleStabilise = async () => {
		if (!status) return;
		if (status.sweepMode) {
			sendControl({ action: 'stopSweep' });
		}
		await sendControl({ action: status.stabilise ? 'stabiliseOff' : 'stabiliseOn' });
		setTimeout(fetchStatus, 100);
	};

	const handleAdjustFreq = async (delta: number) => {
		sendControl({ action: 'adjustFreq', value: delta });
		setImmediate(fetchStatus);
	};

	const handleToggleSweep = async () => {
		if (!status) return;
		if (status.sweepMode) {
			sendControl({ action: 'stopSweep' });
			setTimeout(fetchStatus, 100);
		} else {
			const confirmed = await showConfirm(
				'Start Sweep Mode',
				`This mode will cycle through each throttle step level until it reaches your set maximum frequency and record the hash rate at each level. The process is as follows:
				<br /><br />• Start at stepDown = -24
				<br />• Hash for approx 3 minutes at this step level
				<br />• Record hash rate data at each frequency
				<br />• Increment step by 1
				<br />• Stop automatically when step reaches 0
				<br /><br />This helps find the optimal frequency/voltage combination but will take a significant time to run.
				<br /><br />Continue?`
			);
			if (confirmed) {
				sendControl({ action: 'startSweep' });
				setTimeout(fetchStatus, 100);
			}
		}
	};

	const handleResetData = async () => {
		const confirmed = await showConfirm(
			'Clear Historical Data',
			'Clear all stored data? This will clear the graph data and the history page.'
		);
		if (confirmed) {
			sendControl({ action: 'resetData' });
			clearGraphDataCache();
			setGraphData([]);
			setTimeout(fetchStatus, 100);
			setTimeout(fetchGraphData, 200);
		}
	};

	const isValueChanged = (formValue: number, storedValue: number | undefined) => {
		if (storedValue === undefined) return false;
		return formValue !== storedValue;
	};

	const getInputClass = (formValue: number, storedValue: number | undefined) => {
		const baseClass = 'w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white';
		if (isValueChanged(formValue, storedValue)) {
			return `${baseClass} border-amber-500 dark:border-amber-400`;
		}
		return baseClass;
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[50vh]">
				<div className="flex flex-col items-center gap-4">
					<svg className="animate-spin h-12 w-12 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
						<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					<div className="text-xl font-semibold dark:text-white animate-pulse">Loading Dashboard...</div>
				</div>
			</div>
		);
	}

	const current = status?.current;
	const bitaxeOffline = status?.bitaxeReachable === false;
	const dataUnavailable = !!apiError || bitaxeOffline;

	return (
		<>
			<Modal
				isOpen={modalState.isOpen}
				title={modalState.title}
				message={modalState.message}
				type={modalState.type}
				onConfirm={modalState.onConfirm}
				onCancel={closeModal}
			/>
			<AnimatedBanner show={showDisclaimer} className="mb-4">
				<div className="p-4 bg-yellow-100 dark:bg-yellow-900 border border-yellow-500 text-yellow-800 dark:text-yellow-200 rounded">
					<div className="flex items-start justify-between">
						<div>
							<strong className="text-lg">Disclaimer - Use at Own Risk</strong>
							<p className="mt-2 text-sm">
								Inappropriate settings may result in permanently damaging your Bitaxe or leaving your device unresponsive. 
								Power requirements could also outstrip the rating of your power supply and should at maximum only be 80% of the rated value on the power supply.
							</p>
							<p className="mt-2 text-sm font-semibold">Use this software at your own risk.</p>
						</div>
						<button
							onClick={() => {
								localStorage.setItem('disclaimerLastDismissed', new Date().toDateString());
								setShowDisclaimer(false);
							}}
							className="ml-4 px-3 py-1 text-sm bg-yellow-200 dark:bg-yellow-800 hover:bg-yellow-300 dark:hover:bg-yellow-700 rounded"
						>
							Dismiss
						</button>
					</div>
				</div>
			</AnimatedBanner>
			<div className="container mx-auto py-2 px-2">
				<div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2">
					{/* Current Bitaxe Status */}
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:col-span-2">
						<h2 className="text-lg font-semibold mb-4 dark:text-white">Current Bitaxe Status</h2>
						{/* API error alert */}
						<AnimatedBanner show={!!apiError} className="mb-4">
							<div className="p-3 bg-red-100 dark:bg-red-900 border border-red-500 text-red-700 dark:text-red-300 rounded">
								<strong>⚠️ Server API Error</strong>
								<br />
								The application is currently unable to communicate with the Bitaxe Stabiliser server. 
								<br /><br />This may be due to the server being offline, a network issue, or an internal error in the application.
								<br />Error: <span className="text-sm font-normal">{apiError}</span>
							</div>
						</AnimatedBanner>

						{/* Communication error alert */}
						<AnimatedBanner show={!!(status?.bitaxeReachable===false)} className="mb-4">
							<div className="p-3 bg-red-100 dark:bg-red-900 border border-red-500 text-red-700 dark:text-red-300 rounded">
								<strong>⚠️ Bitaxe is not Responding</strong>
								<br />
								The application is currently unable to communicate with your Bitaxe device on {status?.settings?.ip}. 
								You may need to visit the <a href={`http://${status?.settings?.ip}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">web interface</a> to investigate the issue. 
								Common causes include:
								<ul className="list-disc ml-5 mt-2 text-sm">
									<li>Bitaxe is powered off or has crashed / overheated.</li>
									<li>Network connectivity issues (check cables, Wi-Fi, etc.)</li>
								</ul>
								<br />The error reported is: <br />
								<span className="text-sm font-normal">{status?.bitaxeError}</span>
							</div>
						</AnimatedBanner>

						{/* Hashrate warning alert */}
						<AnimatedBanner show={!!(current && !dataUnavailable && current.avgHashRate < (current.expectedHashrate*95/100.0) && !dismissHashrateAlert && stepDownStableCycles >= 10)} className="mb-4 relative" onDismiss={() => setDismissHashrateAlert(true)}>
							<div className="p-3 bg-amber-100 dark:bg-amber-900 border border-amber-500 text-amber-700 dark:text-amber-300 rounded">
								<strong className="text-lg">⚠️ Not attaining expected hash rate</strong>
								<br />
								Your average hash rate ({current ? (current.avgHashRate/1000.0).toFixed(3) : '0'}TH/s) 
								is {current ? (100.0*current.avgHashRate/current.expectedHashrate).toFixed(1) : '0'}% 
								of expected hash rate ({current ? (current.expectedHashrate/1000.0).toFixed(3) : '0'}TH/s). 
								<br /><br />
								This may indicate that the device is not stable at the current settings. 
								Consider increasing the core voltage or lowering the max frequency to improve stability and achieve the expected hash rate.
								<br /><br />
								Aim is to keep the step value close to 0 at the ambient room temp to ensure the device is running as efficiently as possible while maintaining stability.
							</div>
						</AnimatedBanner>

						{/* Hashrate dropped 25% below median alert */}
						<AnimatedBanner show={!!(current && !dataUnavailable && getMedianHashrate > 0 && current.hashRate < getMedianHashrate * 0.75 && !dismissHashrateDropAlert)} className="mb-4 relative" onDismiss={() => setDismissHashrateDropAlert(true)}>
							<div className="p-3 bg-red-100 dark:bg-red-900 border border-red-500 text-red-700 dark:text-red-300 rounded">
								<strong className="text-lg">⚠️ Hash Rate Has Dropped Significantly</strong>
								<br />
								Current hash rate ({current ? (current.hashRate/1000.0).toFixed(3) : '0'} TH/s) is more than 25% below the median ({getMedianHashrate.toFixed(3)} TH/s).
								<br /><br />
								Check the bitaxe UI as your device may be malfunctioning. Common causes:
								<ul className="list-disc ml-5 mt-2 text-sm">
									<li>Core voltage is too low for the applied frequency setting.</li>
									<li>Cooling issue causing thermal throttling or instability.</li>
									<li>Power supply issue causing insufficient power delivery.</li>
									<li>Hardware issue with the device.</li>	
								</ul>
							</div>
						</AnimatedBanner>

						{/* Overheat alert */}
						<AnimatedBanner show={current?.overheatMode && !dataUnavailable} className="mb-4">
							<div className="p-3 bg-red-100 dark:bg-red-900 border border-red-500 text-red-700 dark:text-red-300 rounded font-bold">
								<strong className="text-lg">⚠️ Bitaxe has overheated</strong>
								<br />You will need to manually reset the device to clear this error.
							</div>
						</AnimatedBanner>
						{current && !dataUnavailable ? (
							<div className="grid grid-cols-2 md:grid-cols-4 gap-2">
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400">Hashrate</div>
									<div className={`text-xl font-bold dark:text-white`}>{(current.hashRate / 1000).toFixed(3)} TH/s</div>
								<div className={`text-xs text-right ${getToExpectedColor(current.toExpected)}`} 
										title={current.toExpected < 0 ? 'Negative value may indicate core voltage is too low to attain the expected frequency. Consider increasing core voltage.' : ''}>
									To Expected: {current.toExpected >=0 ? '↑ +' : '↓ -'}{Math.abs(current.toExpected).toFixed(1)}%
								</div>
									<div className="text-xs text-gray-400 text-right">Expected: {(current.expectedHashrate / 1000).toFixed(3)} TH/s</div>
									<div className="text-xs text-gray-400 text-right ${current.avgHashRate < current.expectedHashrate ? 'text-amber-500 dark:text-amber-400' : 'dark:text-white'}">Average: {(current.avgHashRate / 1000).toFixed(3)} TH/s</div>
								</div>
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400">ASIC Temp</div>
									<div className={`text-xl font-bold ${getTempColor(current.temp, settingsForm.targetAsic)}`}>
										{current.temp.toFixed(3)}°C
									</div>
									<div className="text-xs text-gray-400">Target: {settingsForm.targetAsic}°C</div>
								</div>
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400">VR Temp</div>
									<div className={`text-xl font-bold ${getTempColor(current.vrTemp, settingsForm.maxVr)}`}>
										{current.vrTemp}°C
									</div>
									<div className="text-xs text-gray-400">Max: {settingsForm.maxVr}°C</div>
								</div>
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400">Power</div>
									<div className="text-xl font-bold dark:text-white">{current.power.toFixed(1)} W</div>
								</div>
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400">Step</div>
									<div className="flex items-center gap-2">
										<span className="text-xl font-bold dark:text-white">{current.stepDown}</span>
										{status?.isStepStable && (
											<span className="px-2 py-0.5 text-xs font-bold bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 rounded">
												Stable
											</span>
										)}
									</div>
								</div>
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400" title={`Step: ${current.stepDown} • Reduced by ${Math.abs(current.stepDown * 6.25).toFixed(2)} MHz`}>Frequency</div>
									<div className="text-xl font-bold dark:text-white">{current.frequency} MHz</div>
									<div className={`text-sm ${current.frequency > settingsForm.maxFreq ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}
										title={`Step at ${current.stepDown} forces a reduction of ${Math.abs(current.stepDown * 6.25).toFixed(2)} MHz`}>
										{current.frequency > settingsForm.maxFreq ? '↑ +' : '↓ -'}{Math.abs(current.frequency - settingsForm.maxFreq).toFixed(2)} MHz
									</div>
								</div>
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400" title={`Step: ${current.stepDown} • Offset: ${Math.floor(Math.abs(current.stepDown) / 5) * -5} mV from base ${settingsForm.coreVoltage} mV`}>Core Voltage</div>
									<div className="text-xl font-bold dark:text-white">{current.coreVoltage.toFixed(1)} mV</div>
									<div className={`text-sm ${current.coreVoltage < settingsForm.coreVoltage ? 'text-amber-600 dark:text-amber-400' : current.coreVoltage > settingsForm.coreVoltage ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}
											title={`Step at ${current.stepDown} forces an offset of ${Math.abs(current.coreVoltage - settingsForm.coreVoltage).toFixed(1)}mV from base ${settingsForm.coreVoltage}mV`}>
										{current.coreVoltage > settingsForm.coreVoltage ? '↑ +' : current.coreVoltage < settingsForm.coreVoltage ? '↓ -' : ''}
											{Math.abs(current.coreVoltage - settingsForm.coreVoltage).toFixed(1)} mV
									</div>
								</div>
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400">Efficiency</div>
									<div className="text-xl font-bold dark:text-white">{current.efficiency.toFixed(2)} J/TH</div>
								</div>
							</div>
						) : apiError ? (
							<div className="text-gray-500 dark:text-white">Waiting for server API...</div>
						) : status?.bitaxeReachable === false ? (
							<div className="text-gray-500 dark:text-white">Waiting for bitaxe to respond on {status.settings.ip}...</div>
						) : (
							<div className="text-gray-500 dark:text-white">No data available</div>
						)}

						{/* Low step warning alert */}
						<AnimatedBanner show={status?.showLowStepWarning && !status?.sweepMode && !dataUnavailable && !dismissLowStepAlert} className="mt-3 relative" onDismiss={() => setDismissLowStepAlert(true)}>
							<div className="p-3 bg-amber-100 dark:bg-amber-900 border border-amber-500 text-amber-700 dark:text-amber-300 rounded">
								<strong className="text-lg">⚠️ Failing to attain the desired frequency (last {settingsForm.lowStepAnalyseRange} cycles)</strong>
								<ul className="list-disc ml-5 mt-2 text-sm">
									<li>Consider lowering the max frequency so that step can hold closer to 0 at the ambient room temperature.</li>
									<li>Room heating will affect the automated step value as the device will need to step up or down more to maintain the target ASIC temperature.</li>
									<li>Reductions to frequency may also allow you to reduce the core voltage increasing the efficiency of the device.</li>
									<li>Step permanently lowering over time may indicate a cooling issue with the device or a significant change to ambient room temperature.</li>
								</ul>
							</div>
						</AnimatedBanner>
					</div>

					{/* Stabiliser Control */}
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:col-span-1">
						<h2 className="text-lg font-semibold mb-4 dark:text-white">
							Stabiliser {status?.stabilise ? 'ON' : 'OFF'}
						</h2>
						{status?.sweepMode && (() => {
							const progress = Math.round(((status.stepDown + 24) / 24) * 100);
							const stepsRemaining = 24 - (status.stepDown + 24);
							const iterationsPerStep = status.sweepIterations || 150;
							const currentIteration = status.sweepIterationsCounter || 0;
							const secondsPerIteration = 1;
							const currentStepRemaining = (iterationsPerStep - currentIteration) * secondsPerIteration;
							const totalRemainingSeconds = (stepsRemaining * iterationsPerStep) + currentStepRemaining;
							const minutesRemaining = Math.round(totalRemainingSeconds / 60);
							return (
								<div className="mb-4 p-3 bg-orange-100 dark:bg-orange-900 border border-orange-500 text-orange-700 dark:text-orange-300 rounded text-sm">
									<strong className="text-lg">Sweep Mode Active</strong>
									<br />
									stepDown: {status.stepDown}
									<div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
										<div 
											className="bg-orange-500 h-2.5 rounded-full" 
											style={{ width: `${progress}%` }}
										/>
									</div>
									<div className="text-xs mt-1 text-right">
										{progress}% complete (~{minutesRemaining} min remaining)
									</div>
								</div>
							);
						})()}
						<div className="flex flex-col gap-2">
							<label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border ${
								status?.stabilise === true 
									? 'border-green-500 bg-green-500 text-white' 
									: dataUnavailable
										? 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
										: 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
							}`}>
								<input
									type="radio"
									name="stabilise"
									checked={status?.stabilise === true}
									onChange={() => !dataUnavailable && status?.stabilise !== true && handleToggleStabilise()}
									className="hidden"
									disabled={dataUnavailable}
								/>
								<span className={status?.stabilise === true ? 'text-white' : 'dark:text-white'}>Actively Adjust Temperature</span>
							</label>
							<label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border ${
								status?.stabilise === false 
									? 'border-gray-400 bg-gray-400 text-white' 
									: dataUnavailable
										? 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
										: 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
							}`}>
								<input
									type="radio"
									name="stabilise"
									checked={status?.stabilise === false}
									onChange={() => !dataUnavailable && status?.stabilise !== false && handleToggleStabilise()}
									className="hidden"
									disabled={dataUnavailable}
								/>
								<span className={status?.stabilise === false ? 'text-white' : 'dark:text-white'}>No Stabilisation</span>
							</label>
						</div>
					</div>

					{/* Manual Control and Settings Form */}
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:col-span-2">
						<h2 className="text-lg font-semibold mb-4 dark:text-white">Manual Control</h2>
						<div className="flex flex-wrap gap-2 mb-2 items-center">
							<div className="flex gap-2">
								<button
									onClick={() => handleAdjustFreq(1)}
									disabled={dataUnavailable}
									className="px-3 py-2 bg-blue-500 text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Step +
								</button>
								<button
									onClick={() => handleAdjustFreq(-1)}
									disabled={dataUnavailable}
									className="px-3 py-2 bg-blue-500 text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Step -
								</button>
							</div>
							<div className="flex-1"></div>
							<div>
								<button
									onClick={handleResetData}
									disabled={dataUnavailable}
									className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<Trash2 className="w-4 h-4" />
									Clear Historical Data
								</button>
							</div>
						</div>

						<form className="grid grid-cols-2 md:grid-cols-4 gap-2">
							<div className="w-full">
								<label className="block text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Target ASIC (°C)</label>
								<input
									type="number"
									value={settingsForm.targetAsic}
									onChange={(e) => handleSettingChange('targetAsic', parseFloat(e.target.value))}
									className={getInputClass(settingsForm.targetAsic, status?.settings.targetAsic)}
									step={0.25}
									disabled={dataUnavailable}
									autoComplete="off"
								/>
							</div>
							<div className="w-full">
								<label className="block text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Max VR (°C)</label>
								<input
									type="number"
									value={settingsForm.maxVr}
									onChange={(e) => handleSettingChange('maxVr', parseInt(e.target.value))}
									className={getInputClass(settingsForm.maxVr, status?.settings.maxVr)}
									step={1}
									disabled={dataUnavailable}
									autoComplete="off"
								/>
							</div>
							<div className="w-full">
								<label className="block text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Core Voltage (mV)</label>
								<input
									type="number"
									value={settingsForm.coreVoltage}
									onChange={(e) => handleSettingChange('coreVoltage', parseInt(e.target.value))}
									className={getInputClass(settingsForm.coreVoltage, status?.settings.coreVoltage)}
									step={5}
									disabled={dataUnavailable}
									autoComplete="off"
								/>
							</div>
							<div className="w-full">
								<label className="block text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Max Freq (MHz)</label>
								<input
									type="number"
									value={settingsForm.maxFreq}
									onChange={(e) => handleSettingChange('maxFreq', parseFloat(e.target.value))}
									className={getInputClass(settingsForm.maxFreq, status?.settings.maxFreq)}
									step={6.25}
									disabled={dataUnavailable}
									autoComplete="off"
								/>
							</div>
						</form>
						<div className="mt-4 flex gap-2">
							<button
								onClick={handleToggleSweep}
								disabled={dataUnavailable}
								className="flex items-center justify-center gap-2 flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{status?.sweepMode ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
								{status?.sweepMode ? 'Stop Sweep' : 'Start Sweep'}
							</button>
							<button
								onClick={async () => {
									const analysis = await getHashrangeAnalysis();
									if (analysis.error) {
										await showAlert('Hashrange Analysis', analysis.error);
										return;
									}
									setHashrangeAnalysis(analysis);
									const getRankBadge = (rank: number, type: 'hashrate' | 'power' | 'asic' | 'vr' | 'efficiency') => {
										if (rank === 0) return null;
										const colors: Record<string, string> = {
											hashrate: 'bg-yellow-500',
											power: 'bg-green-500',
											asic: 'bg-blue-500',
											vr: 'bg-purple-500',
											efficiency: 'bg-red-500',
										};
										const opacity = Math.max(0.2, (6 - rank) * 0.2);
										return (
											<span className={`inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white rounded-full ${colors[type]} ml-1`} style={{ opacity }}>
												{rank}
											</span>
										);
									};
									const getHeaderBadge = (type: 'hashrate' | 'power' | 'asic' | 'vr' | 'efficiency') => {
										const colors: Record<string, string> = {
											hashrate: 'bg-yellow-500',
											power: 'bg-green-500',
											asic: 'bg-blue-500',
											vr: 'bg-purple-500',
											efficiency: 'bg-red-500',
										};
										return <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${colors[type]} ml-1`}></span>;
									};
									const renderHeader = () => (
										<tr className="border-b dark:border-gray-600">
											<th className="text-left p-1 dark:text-white">Freq</th>
											<th className="text-right p-1 dark:text-white">Voltage</th>
											<th className="text-right p-1 dark:text-white">Hashrate {getHeaderBadge('hashrate')}</th>
											<th className="text-right p-1 dark:text-white">ASIC {getHeaderBadge('asic')}</th>
											<th className="text-right p-1 dark:text-white">VR {getHeaderBadge('vr')}</th>
											<th className="text-right p-1 dark:text-white">Power {getHeaderBadge('power')}</th>
											<th className="text-right p-1 dark:text-white">Eff {getHeaderBadge('efficiency')}</th>
										</tr>
									);
									const content = (
										<div>
											{analysis.sweepStartTime && (
												<div className="mb-4 text-sm dark:text-gray-300">
													Sweep started: {new Date(analysis.sweepStartTime).toLocaleString()}
												</div>
											)}
											<div className="overflow-x-auto">
												<table className="w-full text-xs">
													<thead>
														{renderHeader()}
													</thead>
													<tbody>
														{analysis.allData.map((e, i) => (
															<tr key={i} className={`border-b dark:border-gray-600 ${e.rankHashrate <= 5 || e.rankPower <= 5 || e.rankAsicTemp <= 5 || e.rankVrTemp <= 5 || e.rankEfficiency <= 5 ? 'bg-yellow-50 dark:bg-yellow-900/30' : ''}`}>
																<td className="p-1 dark:text-white">
																	{e.frequency.toFixed(3)}
																	{e.rankHashrate === 1 && <span className="ml-1 text-yellow-600">★</span>}
																</td>
																<td className="p-1 text-right dark:text-white">{e.coreVoltage.toFixed(1)}</td>
																<td className="p-1 text-right dark:text-white relative">
																	{(e.avgHashRate/1000).toFixed(3)}
																	{e.rankHashrate > 0 && getRankBadge(e.rankHashrate, 'hashrate')}
																</td>
																<td className="p-1 text-right dark:text-white relative">
																	{e.avgAsicTemp.toFixed(1)}
																	{e.rankAsicTemp > 0 && getRankBadge(e.rankAsicTemp, 'asic')}
																</td>
																<td className="p-1 text-right dark:text-white relative">
																	{e.avgVrTemp.toFixed(1)}
																	{e.rankVrTemp > 0 && getRankBadge(e.rankVrTemp, 'vr')}
																</td>
																<td className="p-1 text-right dark:text-white relative">
																	{e.avgPower.toFixed(1)}
																	{e.rankPower > 0 && getRankBadge(e.rankPower, 'power')}
																</td>
																<td className="p-1 text-right dark:text-white relative">
																	{e.efficiency.toFixed(2)}
																	{e.rankEfficiency > 0 && getRankBadge(e.rankEfficiency, 'efficiency')}
																</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
											<div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
												Ranking badges: 🟡 Hashrate &nbsp; 🔵 ASIC Temp &nbsp; 🟣 VR Temp &nbsp; 🟢 Power &nbsp; 🔴 Efficiency (lower is better)
											</div>
										</div>
									);
									await showAnalysis('Hashrange Analysis Results', content);
								}}
								className="flex items-center justify-center gap-2 flex-1 px-4 py-2 bg-teal-500 text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
								disabled={dataUnavailable}
							>
								<BarChart3 className="w-4 h-4" />
								Analyse Hashrange
							</button>
						</div>
					</div>
				</div>

				{/* Graph panel */}
				<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-2">
					<div className="flex justify-between items-center mb-4">
						<h2 className="text-lg font-semibold dark:text-white">
							{	graphHours === 0.25 ? 'Last 15 Minutes' : 
								graphHours === 0.5 ? 'Last 30 Minutes' : 
								graphHours === 1 ? 'Last 1 Hour' : 
								graphHours === 2 ? 'Last 2 Hours' : 
								graphHours === 4 ? 'Last 4 Hours' : 
								graphHours === 8 ? 'Last 8 Hours' : 
								graphHours === 24 ? 'Last 1 Day' : 'Last 2 Days'}
						</h2>
						<div className="flex items-center gap-4">
							<div className="flex text-sm">
								{[
									{ value: 0.25, label: '15m' },
									{ value: 0.5, label: '30m' },
									{ value: 1, label: '1h' },
									{ value: 2, label: '2h' },
									{ value: 4, label: '4h' },
									{ value: 8, label: '8h' },
									{ value: 24, label: '1d' },
									{ value: 48, label: '2d' },
								].map((option, index, arr) => (
									<button
										key={option.value}
										onClick={() => setGraphHours(option.value)}
										className={`px-3 py-1 transition-colors ${
											index === 0 ? 'rounded-l' : index === arr.length - 1 ? 'rounded-r' : 'rounded-none'
										} ${
											graphHours === option.value
												? 'bg-green-500 text-black'
												: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
										}`}
									>
										{option.label}
									</button>
								))}
							</div>
							<button
								onClick={() => fetchGraphData(true)}
								className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
							>
								<RefreshCw className="w-4 h-4" />
								Refresh
							</button>
						</div>
					</div>
					<div className="h-[640px] relative">
						<div className={`absolute inset-0 transition-opacity duration-300 ${graphData.length > 0 && !graphRefreshing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
							<ResponsiveContainer width="100%" height="100%">
							<ComposedChart data={graphData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
								<CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#4b5563' : '#e5e7eb'} />
								<XAxis
									dataKey="t"
									tickFormatter={(value: any) => new Date(value * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
									stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
									tick={{ fontSize: 12 }}
								/>
								<YAxis
									yAxisId="hashrate"
									domain={[(dataMin: number) => getHashrateDomain[0], () => getHashrateDomain[1]]}
									stroke="#8884d8"
									tick={{ fontSize: 12 }}
									tickFormatter={(value) => value.toFixed(3)}
									label={{ value: 'TH/s', angle: -90, position: 'left', offset: 0, fill: '#8884d8' }}
								/>
								<YAxis
									yAxisId="temp"
									orientation="right"
									domain={getTempDomain}
									stroke="#ef4444"
									tick={{ fontSize: 12, fill: '#ef4444' }}
									tickFormatter={(value) => Math.round(value).toString()}
									label={{ value: '°C', angle: 0, position: 'right', offset: -35, fill: '#ef4444' }}
								/>
								<YAxis
									yAxisId="step"
									orientation="right"
									domain={[(dataMin: number) => Math.min(dataMin, -5), (dataMax: number) => Math.max(dataMax, 4)]}
									ticks={getStepTicks}
									stroke="#22c55e"
									tick={{ fontSize: 12 }}
									label={{ value: 'Step', angle: 90, position: 'right', offset: -25, fill: '#22c55e' }}
								/>
								<Tooltip
									contentStyle={{
										backgroundColor: isDarkMode ? '#1f2937' : '#fff',
										border: isDarkMode ? '#4b5563' : '#e5e7eb',
										color: isDarkMode ? '#fff' : '#000',
									}}
									labelFormatter={(value: any) => new Date(value * 1000).toLocaleString()}
								/>
								<Legend onClick={handleLegendClick} />
								<Area yAxisId="hashrate" type="monotone" dataKey="h" name="Hashrate (TH/s)" stroke="#8884d880" fill="#8884d8" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} animationDuration={0} hide={!legendVisibility.hashRate} />
								<Area yAxisId="step" type="monotone" dataKey="s" name="Step" stroke="#22c55e" fill="#22c55e80" strokeWidth={1.5} dot={false} isAnimationActive={false} animationDuration={0} hide={!legendVisibility.stepDown} />
								{legendVisibility.hashRate && <ReferenceLine yAxisId="hashrate" y={getMedianHashrate} stroke="#c3c2d6ff" strokeDasharray="5 5" label={{ value: 'Median Hash Rate:'+getMedianHashrate.toFixed(3)+"TH/s", fill: '#d2d1e0ff', fontSize: 20 }} />}
								<Line yAxisId="temp" type="monotone" dataKey="a" name="ASIC Temp (°C)" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={false} animationDuration={0} hide={!legendVisibility.temp} />
								{legendVisibility.temp && <ReferenceLine yAxisId="temp" y={getMedianAsicTemp} stroke="#c3c2d6ff" strokeDasharray="5 5" label={{ value: 'Median ASIC Temp:'+getMedianAsicTemp.toFixed(1)+"°C", fill: '#d2d1e0ff', fontSize: 20 }} />}
								<Line yAxisId="temp" type="monotone" dataKey="v" name="VR Temp (°C)" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={false} animationDuration={0} hide={!legendVisibility.vrTemp} />
								{legendVisibility.vrTemp && <ReferenceLine yAxisId="temp" y={settingsForm.maxVr} stroke="#f97316" strokeDasharray="5 5" label={{ value: 'Max VR:'+settingsForm.maxVr+"°C", fill: '#f97316', fontSize: 20 }} />}
								{legendVisibility.vrTemp && <ReferenceLine yAxisId="temp" y={getMedianVrTemp} stroke="#c3c2d6ff" strokeDasharray="5 5" label={{ value: 'Median Voltage Regulator Temp:'+getMedianVrTemp.toFixed(1)+"°C", fill: '#d2d1e0ff', fontSize: 20 }} />}
								
							</ComposedChart>
						</ResponsiveContainer>
						</div>
						<div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${graphData.length === 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
							<p className="text-gray-500 dark:text-gray-400">No data to graph</p>
						</div>
					</div>
				</div>

				{/* Historical Data Table */}
				<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mt-2">
					<h2 className="text-lg font-semibold mb-4 dark:text-white">{status?.history && status.history.length ? 'Last '+status.history.length+' Readings' : "No Historical data"}</h2>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b dark:border-gray-700">
									<th className="text-left p-2 dark:text-white">Time</th>
									<th className="text-right p-2 dark:text-white">Hashrate</th>
									<th className="text-right p-2 dark:text-white">To Expected</th>
									<th className="text-right p-2 dark:text-white">ASIC Temp</th>
									<th className="text-right p-2 dark:text-white">VR Temp</th>
									<th className="text-right p-2 dark:text-white">Core Voltage</th>
									<th className="text-right p-2 dark:text-white">Freq</th>
									<th className="text-right p-2 dark:text-white">Step</th>
									<th className="text-right p-2 dark:text-white">Power</th>
									<th className="text-right p-2 dark:text-white">Efficiency</th>
								</tr>
							</thead>
							<tbody>
								{status?.history && status.history.length > 0 ? (
									[...status.history].reverse().slice(0, 10).map((h, i, arr) => {
										const prev = i < arr.length - 1 ? arr[i + 1] : null;
										return (
											<tr key={h.timestamp} className={`border-b dark:border-gray-700 ${i === 0 ? 'bg-yellow-50 dark:bg-gray-700 font-bold' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
												<td className="p-2 dark:text-white">{new Date(h.timestamp).toLocaleString()}</td>
												<td className="p-2 text-right dark:text-white">{(h.hashRate / 1000).toFixed(3)}</td>
												<td className={`p-2 text-right ${getToExpectedColor(h.toExpected)}`}>{h.toExpected.toFixed(1)}%</td>
												<td className={`p-2 text-right ${getTempColor(h.temp, settingsForm.targetAsic)}`}>{h.temp.toFixed(3)}</td>
												<td className={`p-2 text-right ${getTempColor(h.vrTemp, settingsForm.maxVr)}`}>{h.vrTemp}</td>
												<td className={`p-2 text-right ${prev && prev.coreVoltage !== h.coreVoltage ? 'bg-blue-100 dark:bg-blue-800 font-bold' : 'dark:text-white'}`}>{h.coreVoltage.toFixed(1)}</td>
												<td className={`p-2 text-right ${prev && prev.frequency !== h.frequency ? 'bg-purple-100 dark:bg-purple-800 font-bold' : 'dark:text-white'}`}>{h.frequency}</td>
												<td className={`p-2 text-right ${prev && prev.oldStepDown !== h.oldStepDown ? 'bg-yellow-100 dark:bg-yellow-800 font-bold' : 'dark:text-white'}`}>{h.oldStepDown}</td>
												<td className="p-2 text-right dark:text-white">{h.power.toFixed(1)}</td>
												<td className="p-2 text-right dark:text-white">{h.efficiency.toFixed(2)}</td>
											</tr>
										);
									})
								) : (
									<tr>
										<td colSpan={10} className="p-4 text-center dark:text-white">No data</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</>
	);
}
