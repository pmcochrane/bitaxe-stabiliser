import { useState, useEffect } from 'react';
import { getHistory, getSettings } from '../services/api';
import type { HistoryEntry, HistoryResponse, Settings } from '../types';

export default function History() {
	const [data, setData] = useState<HistoryEntry[]>([]);
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState(50);
	const [sort, setSort] = useState<'asc' | 'desc'>('desc');
	const [totalPages, setTotalPages] = useState(1);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [settings, setSettings] = useState<Settings>({
		ip: '',
		hostname: '',
		targetAsic: 60,
		maxVr: 80,
		coreVoltage: 1300,
		maxFreq: 900,
		maxHistoryEntries: 172800,
	});

	const getTempColor = (temp: number, target: number) => {
		if (temp > target + 1) return 'text-red-600 dark:text-red-400';
		if (temp < target - 1) return 'text-blue-900 dark:text-blue-400';
		return 'text-green-600 dark:text-green-400';
	};

	const fetchHistory = async () => {
		setLoading(true);
		try {
			const result: HistoryResponse = await getHistory(page, limit, sort);
			setData(result.data);
			setTotalPages(result.totalPages);
			setTotal(result.total);
		} catch (error) {
			console.error('Failed to fetch history:', error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		getSettings().then(setSettings).catch(console.error);
	}, []);

	useEffect(() => {
		fetchHistory();
	}, [page, limit, sort]);

	const handleExportCsv = () => {
		if (data.length === 0) {
			alert('No data to export');
			return;
		}
		const headers = [
			'Timestamp',
			'Hashrate',
			'AvgHashrate',
			'ASIC Temp',
			'Avg ASIC',
			'VR Temp',
			'Voltage',
			'Power',
			'Frequency',
			'Efficiency',
			'To Expected',
		];
		const rows = data.map((h) => [
			h.timestamp,
			h.hashRate,
			h.avgHashRate.toFixed(1),
			h.temp,
			h.avgAsicTemp.toFixed(1),
			h.vrTemp,
			h.voltage,
			h.power,
			h.frequency,
			h.efficiency.toFixed(2),
			h.toExpected.toFixed(1),
		]);
		const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'bitaxe_history.csv';
		a.click();
	};

	return (
		<div className="container mx-auto p-4">
			<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
				<div className="flex flex-wrap gap-4 items-end">
					<div>
						<label className="block text-sm font-medium dark:text-white">Page</label>
						<input
							type="number"
							value={page}
							onChange={(e) => setPage(Math.max(1, parseInt(e.target.value) || 1))}
							min={1}
							className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white w-20"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium dark:text-white">Limit</label>
						<select
							value={limit}
							onChange={(e) => setLimit(parseInt(e.target.value))}
							className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
						>
							<option value={50}>50</option>
							<option value={100}>100</option>
							<option value={200}>200</option>
							<option value={500}>500</option>
						</select>
					</div>
					<div>
						<label className="block text-sm font-medium dark:text-white">Sort</label>
						<select
							value={sort}
							onChange={(e) => setSort(e.target.value as 'asc' | 'desc')}
							className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
						>
							<option value="desc">Newest First</option>
							<option value="asc">Oldest First</option>
						</select>
					</div>
					<button
						onClick={fetchHistory}
						className="px-4 py-2 bg-blue-500 text-white rounded hover:opacity-90"
					>
						Apply
					</button>
					<button
						onClick={handleExportCsv}
						className="px-4 py-2 bg-green-500 text-white rounded hover:opacity-90"
					>
						Export CSV
					</button>
				</div>
			</div>

			<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-gray-50 dark:bg-gray-700">
								<th className="text-left p-2 dark:text-white">Timestamp</th>
								<th className="text-right p-2 dark:text-white">Hashrate</th>
								<th className="text-right p-2 dark:text-white">To Expected</th>
								<th className="text-right p-2 dark:text-white">Avg Hashrate</th>
								<th className="text-right p-2 dark:text-white">ASIC Temp</th>
								<th className="text-right p-2 dark:text-white">Avg ASIC</th>
								<th className="text-right p-2 dark:text-white">VR Temp</th>
								<th className="text-right p-2 dark:text-white">Core Voltage</th>
								<th className="text-right p-2 dark:text-white">Power</th>
								<th className="text-right p-2 dark:text-white">Freq</th>
								<th className="text-right p-2 dark:text-white">Step</th>
								<th className="text-right p-2 dark:text-white">Efficiency</th>
							</tr>
						</thead>
						<tbody>
							{loading ? (
								<tr>
									<td colSpan={11} className="p-4 text-center dark:text-white">Loading...</td>
								</tr>
							) : data.length === 0 ? (
								<tr>
									<td colSpan={12} className="p-4 text-center dark:text-white">No data</td>
								</tr>
							) : (
								data.map((h, i) => (
									<tr key={i} className="border-b hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-600">
										<td className="p-2 dark:text-white">{new Date(h.timestamp).toLocaleString()}</td>
										<td className="p-2 text-right dark:text-white">{(h.hashRate / 1000).toFixed(3)}</td>
										<td className={`p-2 text-right ${getTempColor(h.toExpected, 0)}`}>{h.toExpected.toFixed(1)}%</td>
										<td className="p-2 text-right dark:text-white">{(h.avgHashRate / 1000).toFixed(3)}</td>
										<td className={`p-2 text-right ${getTempColor(h.temp, settings.targetAsic)}`}>{h.temp.toFixed(3)}</td>
										<td className="p-2 text-right dark:text-white">{h.avgAsicTemp.toFixed(1)}</td>
										<td className={`p-2 text-right ${getTempColor(h.vrTemp, settings.maxVr)}`}>{h.vrTemp}</td>
										<td className="p-2 text-right dark:text-white">{h.coreVoltage.toFixed(1)}</td>
										<td className="p-2 text-right dark:text-white">{h.power.toFixed(1)}</td>
										<td className="p-2 text-right dark:text-white">{h.frequency}</td>
										<td className="p-2 text-right dark:text-white">{h.stepDown}</td>
										<td className="p-2 text-right dark:text-white">{h.efficiency.toFixed(2)}</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
				<div className="mt-4 flex justify-center gap-2">
					{Array.from({ length: Math.min(totalPages, 10) }, (_, i) => (
						<button
							key={i + 1}
							onClick={() => setPage(i + 1)}
							className={`px-3 py-1 rounded ${
								page === i + 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-600 dark:text-white'
							}`}
						>
							{i + 1}
						</button>
					))}
					<span className="ml-2 text-sm text-gray-500 dark:text-gray-400 self-center">Total: {total} entries</span>
				</div>
			</div>
		</div>
	);
}
