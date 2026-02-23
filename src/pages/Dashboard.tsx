import { useState, useEffect, useCallback } from 'react';
import { getStatus, updateSettings, sendControl, getHistoryGraph } from '../services/api';
import type { StatusResponse, Settings, HistoryEntry } from '../types';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, Bar } from 'recharts';
import { Modal, useModal } from '../components/Modal';

interface GraphDataEntry {
	timestamp: string;
	hashRate: number;
	temp: number;
	vrTemp: number;
	stepDown: number;
	stepDownFilled: number;
}

export default function Dashboard() {
	const [status, setStatus] = useState<StatusResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [graphData, setGraphData] = useState<GraphDataEntry[]>([]);
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
	});
	const [initialLoad, setInitialLoad] = useState(true);
	const [graphHours, setGraphHours] = useState(2);
	const [isPageVisible, setIsPageVisible] = useState(true);
	const { modalState, showConfirm, showAlert, closeModal } = useModal();

	const fetchGraphData = useCallback(async () => {
		try {
			const data = await getHistoryGraph(graphHours);
			const transformed: GraphDataEntry[] = data.map(d => ({
				timestamp: d.timestamp,
				hashRate: d.hashRate / 1000,
				temp: d.temp,
				vrTemp: d.vrTemp,
				stepDown: d.stepDown,
				stepDownFilled: d.stepDown,
			}));
			setGraphData(transformed);
		} catch (error) {
			console.error('Failed to fetch graph data:', error);
		}
	}, [graphHours]);

	const fetchStatus = useCallback(async () => {
		try {
			const data = await getStatus();
			setStatus(data);
			if (initialLoad) {
				setSettingsForm(data.settings);
				setInitialLoad(false);
			}
		} catch (error) {
			console.error('Failed to fetch status:', error);
		} finally {
			setLoading(false);
		}
	}, [initialLoad]);

	useEffect(() => {
		const handleVisibilityChange = () => {
			setIsPageVisible(!document.hidden);
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
	}, []);

	useEffect(() => {
		fetchGraphData();
		if (isPageVisible) {
			const interval = setInterval(fetchGraphData, 5000);
			return () => clearInterval(interval);
		}
	}, [fetchGraphData, isPageVisible]);

	useEffect(() => {
		fetchStatus();
		const interval = setInterval(fetchStatus, 3000);
		return () => clearInterval(interval);
	}, [fetchStatus]);

	const getHashrateDomain = (): [number, number] => {
		if (graphData.length === 0) return [0, 2];
		const values = graphData.map((d) => d.hashRate);
		const min = Math.min(...values);
		const max = Math.max(...values);
		const padding = (max - min) * 0.1;
		return [Math.max(0, min - padding), max + padding];
	};

	const getTempDomain = (): [number, number] => {
		if (graphData.length === 0) return [0, 100];
		const tempValues = graphData.map((d) => d.temp);
		const vrTempValues = graphData.map((d) => d.vrTemp);
		const min = Math.min(...tempValues, ...vrTempValues);
		const max = Math.max(...tempValues, ...vrTempValues);
		const padding = (max - min) * 0.1;
		return [Math.max(0, min - padding), max + padding];
	};

	useEffect(() => {
		fetchGraphData();
		const interval = setInterval(fetchGraphData, 30000);
		return () => clearInterval(interval);
	}, [fetchGraphData]);

	const handleToggleStabilise = async () => {
		if (!status) return;
		await sendControl({ action: status.stabilise ? 'stabiliseOff' : 'stabiliseOn' });
		setTimeout(fetchStatus, 100);
	};

	const handleAdjustFreq = async (delta: number) => {
		await sendControl({ action: 'adjustFreq', value: delta });
		setTimeout(fetchStatus, 100);
	};

	const handleAdjustVoltage = async (delta: number) => {
		await sendControl({ action: 'adjustVoltage', value: delta });
		setTimeout(fetchStatus, 100);
	};

	const handleToggleSweep = async () => {
		if (!status) return;
		await sendControl({ action: status.sweepMode ? 'stopSweep' : 'startSweep' });
		setTimeout(fetchStatus, 100);
	};

	const handleResetData = async () => {
		const confirmed = await showConfirm(
			'Clear Historical Data',
			'Clear all stored data? This will clear the graph data and the history page.'
		);
		if (confirmed) {
			await sendControl({ action: 'resetData' });
			setTimeout(fetchStatus, 100);
			setTimeout(fetchGraphData, 200);
		}
	};

	const handleSettingsSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		await updateSettings(settingsForm);
		await showAlert('Settings Saved', 'Your settings have been saved successfully.');
		fetchStatus();
	};

	const getTempColor = (temp: number, target: number) => {
		if (temp > target + 1) return 'text-red-600 dark:text-red-400';
		if (temp < target - 1) return 'text-blue-900 dark:text-blue-400';
		return 'text-green-600 dark:text-green-400';
	};

	if (loading) {
		return (
			<div className="container mx-auto p-4">
				<div className="animate-pulse">Loading...</div>
			</div>
		);
	}

	const current = status?.current;

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
			<div className="container mx-auto p-4">
				<div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:col-span-2">
						<h2 className="text-lg font-semibold mb-4 dark:text-white">Current Bitaxe Status</h2>
						{current?.overheatMode && (
							<div className="mb-4 p-3 bg-red-100 dark:bg-red-900 border border-red-500 text-red-700 dark:text-red-300 rounded font-bold">
								⚠️ Currently In Overheat Mode. Will need reset.
							</div>
						)}
						{current ? (
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400">Hashrate</div>
									<div className="text-xl font-bold dark:text-white">{(current.hashRate / 1000).toFixed(3)} TH/s</div>
									<div className="text-xs text-gray-400">Expected: {(current.expectedHashrate / 1000).toFixed(3)} TH/s</div>
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
									<div className="text-xl font-bold dark:text-white">{current.stepDown}</div>
								</div>
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400">Frequency</div>
									<div className="text-xl font-bold dark:text-white">{current.frequency} MHz</div>
									<div className={`text-sm ${current.frequency > settingsForm.maxFreq ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
										{current.frequency > settingsForm.maxFreq ? '↑ +' : '↓ -'}{Math.abs(current.frequency - settingsForm.maxFreq).toFixed(2)} MHz
									</div>
								</div>
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400">Core Voltage</div>
									<div className="text-xl font-bold dark:text-white">{current.coreVoltage.toFixed(1)} mV</div>
								</div>
								<div>
									<div className="text-sm text-gray-500 dark:text-gray-400">Efficiency</div>
									<div className="text-xl font-bold dark:text-white">{current.efficiency.toFixed(2)} J/TH</div>
								</div>
							</div>
						) : (
							<div className="text-gray-500">No data available</div>
						)}
						{status?.showLowStepWarning && (
							<div className="mt-3 p-3 bg-amber-100 dark:bg-amber-900 border border-amber-500 text-amber-700 dark:text-amber-300 rounded">
								⚠️ Cannot attain the desired maximum frequency. 
								Consider lowering this value so that it is holding closer to 0 at the ambient room temp. 
								This may also allow you to reduce the core voltage increasing the efficiency of the device.
								<br /><br />If it lowers over time, this may indicate a cooling issue with the device or a significant change to ambient temperature.
							</div>
						)}
					</div>

					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:col-span-1">
						<h2 className="text-lg font-semibold mb-4 dark:text-white">Stabiliser {status?.stabilise ? 'ON' : 'OFF'}</h2>
						<div className="flex flex-col gap-2">
							<label className={`flex items-center justify-center gap-2 cursor-pointer px-4 py-3 rounded-lg border ${
								status?.stabilise === true 
									? 'border-green-500 bg-green-500 text-white' 
									: 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
							}`}>
								<input
									type="radio"
									name="stabilise"
									checked={status?.stabilise === true}
									onChange={() => status?.stabilise !== true && handleToggleStabilise()}
									className="hidden"
								/>
								<span className={status?.stabilise === true ? 'text-white' : 'dark:text-white'}>Actively Adjust Temperature</span>
							</label>
							<label className={`flex items-center justify-center gap-2 cursor-pointer px-4 py-3 rounded-lg border ${
								status?.stabilise === false 
									? 'border-gray-400 bg-gray-400 text-white' 
									: 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
							}`}>
								<input
									type="radio"
									name="stabilise"
									checked={status?.stabilise === false}
									onChange={() => status?.stabilise !== false && handleToggleStabilise()}
									className="hidden"
								/>
								<span className={status?.stabilise === false ? 'text-white' : 'dark:text-white'}>No Stabilisation</span>
							</label>
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:col-span-2">
						<h2 className="text-lg font-semibold mb-4 dark:text-white">Manual Control</h2>
						<div className="flex flex-wrap gap-4 mb-4">
							<div className="flex flex-col gap-2">
								<button
									onClick={() => handleAdjustFreq(1)}
									className="px-3 py-2 bg-blue-500 text-white rounded hover:opacity-90"
								>
									Step +
								</button>
								<button
									onClick={() => handleAdjustFreq(-1)}
									className="px-3 py-2 bg-blue-500 text-white rounded hover:opacity-90"
								>
									Step -
								</button>
							</div>
							<div className="flex flex-col gap-2">
								<button
									onClick={() => handleAdjustVoltage(5)}
									className="px-3 py-2 bg-purple-500 text-white rounded hover:opacity-90"
								>
									Voltage +
								</button>
								<button
									onClick={() => handleAdjustVoltage(-5)}
									className="px-3 py-2 bg-purple-500 text-white rounded hover:opacity-90"
								>
									Voltage -
								</button>
							</div>
							<button
								onClick={handleToggleSweep}
								className="px-4 py-2 bg-orange-500 text-white rounded hover:opacity-90 self-start"
							>
								{status?.sweepMode ? 'Stop Sweep' : 'Start Sweep'}
							</button>
							<button
								onClick={handleResetData}
								className="px-4 py-2 bg-red-500 text-white rounded hover:opacity-90 self-start"
							>
								Clear Historical Data
							</button>
						</div>

						<form onSubmit={handleSettingsSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-4">
							<div>
								<label className="block text-sm font-medium dark:text-white">Target ASIC Temp</label>
								<input
									type="number"
									value={settingsForm.targetAsic}
									onChange={(e) => setSettingsForm({ ...settingsForm, targetAsic: parseInt(e.target.value) })}
									className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
									step={1}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium dark:text-white">Max VR Temp</label>
								<input
									type="number"
									value={settingsForm.maxVr}
									onChange={(e) => setSettingsForm({ ...settingsForm, maxVr: parseInt(e.target.value) })}
									className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
									step={1}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium dark:text-white">Core Voltage (mV)</label>
								<input
									type="number"
									value={settingsForm.coreVoltage}
									onChange={(e) => setSettingsForm({ ...settingsForm, coreVoltage: parseInt(e.target.value) })}
									className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
									step={5}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium dark:text-white">Max Freq (MHz)</label>
								<input
									type="number"
									value={settingsForm.maxFreq}
									onChange={(e) => setSettingsForm({ ...settingsForm, maxFreq: parseFloat(e.target.value) })}
									className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
									step={0.5}
								/>
							</div>
							<div className="md:col-span-4 flex justify-end">
								<button type="submit" className="px-4 py-2 bg-indigo-500 text-white rounded hover:opacity-90">
									Save Settings
								</button>
							</div>
						</form>
					</div>
				</div>

				{graphData.length > 0 && (
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
						<div className="flex justify-between items-center mb-4">
							<h2 className="text-lg font-semibold dark:text-white">
								{graphHours === 1 ? 'Last 1 Hour' : 
								 graphHours === 2 ? 'Last 2 Hours' : 
								 graphHours === 4 ? 'Last 4 Hours' : 
								 graphHours === 8 ? 'Last 8 Hours' : 
								 graphHours === 24 ? 'Last 1 Day' : 'Last 2 Days'}
							</h2>
							<div className="flex items-center gap-4">
								<div className="flex gap-2 text-sm dark:text-white">
									<label className="flex items-center gap-1">
										<input type="radio" name="graphHours" checked={graphHours === 1} onChange={() => setGraphHours(1)} /> 1h
									</label>
									<label className="flex items-center gap-1">
										<input type="radio" name="graphHours" checked={graphHours === 2} onChange={() => setGraphHours(2)} /> 2h
									</label>
									<label className="flex items-center gap-1">
										<input type="radio" name="graphHours" checked={graphHours === 4} onChange={() => setGraphHours(4)} /> 4h
									</label>
									<label className="flex items-center gap-1">
										<input type="radio" name="graphHours" checked={graphHours === 8} onChange={() => setGraphHours(8)} /> 8h
									</label>
									<label className="flex items-center gap-1">
										<input type="radio" name="graphHours" checked={graphHours === 24} onChange={() => setGraphHours(24)} /> 1d
									</label>
									<label className="flex items-center gap-1">
										<input type="radio" name="graphHours" checked={graphHours === 48} onChange={() => setGraphHours(48)} /> 2d
									</label>
								</div>
								<button
									onClick={fetchGraphData}
									className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
								>
									Refresh
								</button>
							</div>
						</div>
						<div className="h-80">
							<ResponsiveContainer width="100%" height="100%">
								<ComposedChart data={graphData} margin={{ top: 5, right: 80, left: 20, bottom: 5 }}>
									<CartesianGrid strokeDasharray="3 3" stroke={document.documentElement.classList.contains('dark') ? '#4b5563' : '#e5e7eb'} />
									<XAxis
										dataKey="timestamp"
										tickFormatter={(value: any) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
										stroke={document.documentElement.classList.contains('dark') ? '#9ca3af' : '#6b7280'}
										tick={{ fontSize: 12 }}
									/>
									<YAxis
										yAxisId="hashrate"
										domain={getHashrateDomain()}
										stroke="#8884d8"
										tick={{ fontSize: 12 }}
										label={{ value: 'TH/s', angle: -90, position: 'insideLeft', fill: '#8884d8' }}
									/>
									<YAxis
										yAxisId="temp"
										orientation="right"
										domain={getTempDomain()}
										stroke={document.documentElement.classList.contains('dark') ? '#9ca3af' : '#6b7280'}
										tick={{ fontSize: 12 }}
										label={{ value: '°C', angle: 90, position: 'insideRight', fill: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#6b7280' }}
									/>
									<YAxis
										yAxisId="step"
										orientation="right"
										domain={[0, 'auto']}
										stroke="#22c55e"
										tick={{ fontSize: 12 }}
									/>
									<Tooltip
										contentStyle={{
											backgroundColor: document.documentElement.classList.contains('dark') ? '#1f2937' : '#fff',
											border: document.documentElement.classList.contains('dark') ? '#4b5563' : '#e5e7eb',
											color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
										}}
										labelFormatter={(value: any) => new Date(value).toLocaleString()}
									/>
									<Legend />
									<Area yAxisId="hashrate" type="monotone" dataKey="hashRate" name="Hashrate (TH/s)" stroke="#8884d880" fill="#8884d8" strokeWidth={1.5} dot={false} />
									<Bar yAxisId="step" dataKey="stepDown" name="Step" fill="#22c55e80" strokeWidth={0} />
									<Line yAxisId="temp" type="monotone" dataKey="temp" name="ASIC Temp (°C)" stroke="#ef4444" strokeWidth={1.5} dot={false} />
									<Line yAxisId="temp" type="monotone" dataKey="vrTemp" name="VR Temp (°C)" stroke="#f97316" strokeWidth={1.5} dot={false} />
								</ComposedChart>
							</ResponsiveContainer>
						</div>
					</div>
				)}

				<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
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
									[...status.history].reverse().slice(0, 10).map((h, i) => {
										const prev = i < 9 && status.history.length > i + 1 ? [...status.history].reverse()[i + 1] : null;
										return (
											<tr key={h.timestamp} className={`border-b dark:border-gray-700 ${i === 0 ? 'bg-yellow-50 dark:bg-yellow-900 font-bold' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
												<td className="p-2 dark:text-white">{new Date(h.timestamp).toLocaleString()}</td>
												<td className="p-2 text-right dark:text-white">{(h.hashRate / 1000).toFixed(3)}</td>
												<td className={`p-2 text-right ${getTempColor(h.toExpected, 0)}`}>{h.toExpected.toFixed(1)}%</td>
												<td className={`p-2 text-right ${getTempColor(h.temp, settingsForm.targetAsic)}`}>{h.temp.toFixed(3)}</td>
												<td className={`p-2 text-right ${getTempColor(h.vrTemp, settingsForm.maxVr)}`}>{h.vrTemp}</td>
												<td className={`p-2 text-right ${prev && prev.coreVoltage !== h.coreVoltage ? 'bg-blue-100 dark:bg-blue-800 font-bold' : 'dark:text-white'}`}>{h.coreVoltage.toFixed(1)}</td>
												<td className={`p-2 text-right ${prev && prev.frequency !== h.frequency ? 'bg-purple-100 dark:bg-purple-800 font-bold' : 'dark:text-white'}`}>{h.frequency}</td>
												<td className={`p-2 text-right ${prev && prev.stepDown !== h.stepDown ? 'bg-yellow-100 dark:bg-yellow-800 font-bold' : 'dark:text-white'}`}>{h.stepDown}</td>
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
