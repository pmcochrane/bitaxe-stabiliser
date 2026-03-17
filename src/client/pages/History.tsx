import { useState, useEffect } from 'react';
import { getHistory, getHistoryPages, getSettings } from '../services/api';
import type { HistoryEntry, HistoryResponse, Settings } from '../../both/types';
import { Modal, useModal } from '../components/Modal';
import { getTempColor, getToExpectedColor } from '../utils/colors';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function History() {
	const [data, setData] = useState<HistoryEntry[]>([]);
	const [page, setPage] = useState(1);
	const [rowsPerPage, setRowsPerPage] = useState(25);
	const [sort, setSort] = useState<'asc' | 'desc'>('desc');
	const [totalPages, setTotalPages] = useState(1);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [settings, setSettings] = useState<Settings>({
		ip: '',
		hostname: '',
		targetAsic: 65,
		maxVr: 80,
		coreVoltage: 1300,
		maxFreq: 900,
		maxHistoryEntries: 172800,
		lowStepAnalyseRange: 50,
		lowStepWarningThreshold: -10,
		stepDownDefault: 0,
		maxCoreVoltage: 1450,
		minCoreVoltage: 900,
		stabilise: false,
		asicTempTolerance: 0.25,
	});
	const { modalState, showAlert, closeModal } = useModal();

	const [pageTimestamps, setPageTimestamps] = useState<{ page: number; firstTime: string; lastTime: string }[]>([]);

	const fetchHistory = async () => {
		setLoading(true);
		try {
			const result: HistoryResponse = await getHistory(page, rowsPerPage, sort);
			setData(result.data);
			setTotalPages(result.totalPages);
			setTotal(result.total);
		} catch (error) {
			console.error('Failed to fetch history:', error);
		} finally {
			setLoading(false);
		}
	};

	const fetchPageTimestamps = async () => {
		try {
			const timestamps = await getHistoryPages(rowsPerPage, sort);
			setPageTimestamps(timestamps);
		} catch (error) {
			console.error('Failed to fetch page timestamps:', error);
		}
	};

	useEffect(() => {
		getSettings().then(setSettings).catch(console.error);
	}, []);

	useEffect(() => {
		fetchPageTimestamps();
	}, [rowsPerPage, sort]);

	useEffect(() => {
		fetchHistory();
	}, [page, rowsPerPage, sort]);

	const goToPage = (newPage: number) => {
		if (newPage >= 1 && newPage <= totalPages) {
			setPage(newPage);
		}
	};

	const handleRowsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newRows = parseInt(e.target.value);
		setRowsPerPage(newRows);
		setPage(1);
	};

	const handleExportCsv = async () => {
		if (data.length === 0) {
			await showAlert('No Data', 'There is no data to export.');
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
			h.efficiency.toFixed(1),
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

	const getPageOptions = () => {
		const options: number[] = [];
		for (let i = 1; i <= Math.min(totalPages, 100); i++) {
			options.push(i);
		}
		if (totalPages > 100 && page > 50) {
			options.splice(1, 0, -1);
		}
		if (totalPages > 100 && page < totalPages - 50) {
			options.splice(options.length - 1, 0, -1);
		}
		return options;
	};

	return (
		<ErrorBoundary>
			<Modal
				isOpen={modalState.isOpen}
				title={modalState.title}
				message={modalState.message}
				type={modalState.type}
				onConfirm={modalState.onConfirm}
				onCancel={closeModal}
			/>
			<div className="container mx-auto max-xl:max-w-full px-2 py-2">
				<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 mb-3">
					<div className="flex flex-wrap gap-2 items-center justify-between">
						<div className="flex gap-2 items-center">
							<select
								value={sort}
								onChange={(e) => { setSort(e.target.value as 'asc' | 'desc'); setPage(1); }}
								className="px-2 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
							>
								<option value="desc">Newest</option>
								<option value="asc">Oldest</option>
							</select>
							<select
								value={rowsPerPage}
								onChange={handleRowsChange}
								className="px-2 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
							>
								<option value="10">10 rows</option>
								<option value="25">25 rows</option>
								<option value="50">50 rows</option>
								<option value="100">100 rows</option>
							</select>
						</div>
						<div className="flex gap-1">
							<button
								onClick={() => goToPage(page - 1)}
								disabled={page === 1}
								className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-600 dark:text-white text-sm disabled:opacity-50"
							>
								Prev
							</button>
							<select
								value={page}
								onChange={(e) => goToPage(parseInt(e.target.value))}
								className="px-2 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
							>
								{getPageOptions().map((p) => (
									p === -1 ? (
										<option key="ellipsis" disabled>...</option>
									) : (
										<option key={p} value={p}>Page {p}</option>
									)
								))}
							</select>
							<button
								onClick={() => goToPage(page + 1)}
								disabled={page === totalPages}
								className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-600 dark:text-white text-sm disabled:opacity-50"
							>
								Next
							</button>
						</div>
					</div>
					<div className="flex flex-wrap gap-2 items-center justify-between mt-2">
						<span className="text-xs text-gray-500 dark:text-gray-400">
							Showing {data.length} of {total} entries
						</span>
						<div className="flex gap-2">
							<button
								onClick={handleExportCsv}
								className="px-3 py-1 bg-green-500 text-white rounded text-sm"
							>
								Export
							</button>
							<button
								onClick={fetchHistory}
								disabled={loading}
								className="px-3 py-1 bg-blue-500 text-white rounded text-sm disabled:opacity-50"
							>
								{loading ? 'Loading...' : 'Refresh'}
							</button>
						</div>
					</div>
				</div>

				<div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
					<div className="overflow-x-auto">
						<table className="w-full text-xs sm:text-sm">
							<thead>
								<tr className="border-b bg-gray-50 dark:bg-gray-700">
									<th className="text-left p-2 dark:text-white whitespace-nowrap">Time</th>
									<th className="text-right p-2 dark:text-white">HR</th>
									<th className="text-right p-2 dark:text-white">Expected</th>
									<th className="text-right p-2 dark:text-white">ASIC</th>
									<th className="text-right p-2 dark:text-white">VR</th>
									<th className="text-right p-2 dark:text-white">Volt</th>
									<th className="text-right p-2 dark:text-white">Freq</th>
									<th className="text-right p-2 dark:text-white">Step</th>
									<th className="text-right p-2 dark:text-white">Power</th>
									<th className="text-right p-2 dark:text-white">Eff</th>
								</tr>
							</thead>
							<tbody>
								{loading ? (
									<tr>
										<td colSpan={10} className="p-8 text-center dark:text-white">Loading...</td>
									</tr>
								) : data.length === 0 ? (
									<tr>
										<td colSpan={10} className="p-8 text-center dark:text-white">No data</td>
									</tr>
								) : (
									data.map((h, i) => {
										const prev = i < data.length - 1 ? data[i + 1] : null;
										return (
											<tr key={i} className="border-b dark:border-gray-600">
												<td className="p-2 dark:text-white whitespace-nowrap">{new Date(h.timestamp).toLocaleString()}</td>
												<td className="p-2 text-right dark:text-white">{(h.hashRate / 1000).toFixed(2)}</td>
												<td className={`p-2 text-right ${getToExpectedColor(h.toExpected)}`}>{h.toExpected.toFixed(1)}%</td>
												<td className={`p-2 text-right ${getTempColor(h.temp, settings.targetAsic)}`}>{h.temp.toFixed(1)}</td>
												<td className={`p-2 text-right ${getTempColor(h.vrTemp, settings.maxVr)}`}>{h.vrTemp}</td>
												<td className={`p-2 text-right ${prev && prev.coreVoltage !== h.coreVoltage ? 'bg-blue-100 dark:bg-blue-800 font-bold' : 'dark:text-white'}`}>{h.coreVoltage}</td>
												<td className={`p-2 text-right ${prev && prev.frequency !== h.frequency ? 'bg-purple-100 dark:bg-purple-800 font-bold' : 'dark:text-white'}`}>{h.frequency}</td>
												<td className={`p-2 text-right ${prev && prev.oldStepDown !== h.oldStepDown ? 'bg-yellow-100 dark:bg-yellow-800 font-bold' : 'dark:text-white'}`}>{h.oldStepDown}</td>
												<td className="p-2 text-right dark:text-white">{h.power.toFixed(1)}</td>
												<td className="p-2 text-right dark:text-white">{h.efficiency.toFixed(1)}</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</ErrorBoundary>
	);
}
