import { useState, useEffect, useCallback, useRef } from 'react';
import { getHistory, getHistoryPages, getSettings } from '../services/api';
import type { HistoryEntry, HistoryResponse, Settings } from '../../both/types';
import { Modal, useModal } from '../components/Modal';
import { getTempColor, getToExpectedColor } from '../utils/colors';

export default function History() {
	const [data, setData] = useState<HistoryEntry[]>([]);
	const [cachedData, setCachedData] = useState<HistoryEntry[]>([]);
	const [cachedAt, setCachedAt] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [rowsPerPage, setRowsPerPage] = useState(50);
	const [sort, setSort] = useState<'asc' | 'desc'>('desc');
	const [totalPages, setTotalPages] = useState(1);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [tableHeight, setTableHeight] = useState(0);
	const [panelHeight, setPanelHeight] = useState(0);
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
	});
	const { modalState, showAlert, closeModal } = useModal();

	const [sliderPage, setSliderPage] = useState(page);
	const [sliderTooltip, setSliderTooltip] = useState<{ page: number; firstTime: string; lastTime: string } | null>(null);
	const [pageTimestamps, setPageTimestamps] = useState<{ page: number; firstTime: string; lastTime: string }[]>([]);
	const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const headerRef = useRef<HTMLDivElement>(null);
	const tableContainerRef = useRef<HTMLDivElement>(null);

	const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newPage = parseInt(e.target.value);
		setSliderPage(newPage);
		const pageData = pageTimestamps.find(p => p.page === newPage);
		if (pageData) {
			setSliderTooltip({ page: newPage, firstTime: new Date(pageData.firstTime).toLocaleString(), lastTime: new Date(pageData.lastTime).toLocaleString() });
		} else {
			setSliderTooltip({ page: newPage, firstTime: '...', lastTime: '...' });
		}
		if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
		debounceTimeoutRef.current = setTimeout(() => {
			setPage(newPage);
			setSliderTooltip(null);
		}, 500);
	};

	const fetchHistory = async () => {
		setLoading(true);
		try {
			const result: HistoryResponse = await getHistory(page, rowsPerPage, sort);
			setData(result.data);
			setCachedData(result.data);
			setCachedAt(new Date().toISOString());
			setTotalPages(result.totalPages);
			setTotal(result.total);
		} catch (error) {
			console.error('Failed to fetch history:', error);
		} finally {
			setLoading(false);
		}
	};

	const refreshData = async () => {
		await fetchHistory();
	};

	useEffect(() => {
		getSettings().then(setSettings).catch(console.error);
	}, []);

	useEffect(() => {
		getHistoryPages(rowsPerPage, sort).then(setPageTimestamps).catch(console.error);
	}, [rowsPerPage, sort]);

	useEffect(() => {
		setSliderPage(page);
	}, [page]);

	const calculateRowsPerPage = useCallback(() => {
		const tableContainer = tableContainerRef.current;
		const header = headerRef.current;
		if (!tableContainer || !header) return { rowsPerPage: 20, tableHeight: 0 };

		const navbar = document.querySelector('nav');
		const navbarHeight = navbar?.clientHeight || 0;
		
		const containerTop = tableContainer.getBoundingClientRect().top;
		const tableHeight = window.innerHeight - containerTop - navbarHeight;
		
		const firstRow = tableContainer.querySelector('tbody tr');
		const rowHeight = firstRow?.clientHeight || 40;
		
		const rowsPerPage = Math.max(10, Math.floor(tableHeight / rowHeight));
		
		return { rowsPerPage, tableHeight };
	}, []);

	useEffect(() => {
		const result = calculateRowsPerPage();
		setRowsPerPage(result.rowsPerPage);
		setTableHeight(result.tableHeight);
		const handleResize = () => {
			const r = calculateRowsPerPage();
			setRowsPerPage(r.rowsPerPage);
			setTableHeight(r.tableHeight);
		};
		window.addEventListener('resize', handleResize);
		
		setTimeout(handleResize, 100);
		setTimeout(handleResize, 300);
		
		return () => window.removeEventListener('resize', handleResize);
	}, [calculateRowsPerPage]);

	useEffect(() => {
		fetchHistory();
	}, [page, sort]);

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
		<>
			<Modal
				isOpen={modalState.isOpen}
				title={modalState.title}
				message={modalState.message}
				type={modalState.type}
				onConfirm={modalState.onConfirm}
				onCancel={closeModal}
			/>
			<div className="container mx-auto px-2 py-2 flex flex-col overflow-hidden">
			<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4 flex-shrink-0" ref={headerRef}>
				<div className="flex flex-wrap gap-4 items-center">
					<select
						value={sort}
						onChange={(e) => setSort(e.target.value as 'asc' | 'desc')}
						className="px-2 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
					>
						<option value="desc">Newest First</option>
						<option value="asc">Oldest First</option>
					</select>
					<button
						onClick={() => setPage(Math.max(1, page - 1))}
						disabled={page === 1}
						className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-600 dark:text-white disabled:opacity-50"
					>
						Prev
					</button>
					<button
						onClick={() => setPage(Math.min(totalPages, page + 1))}
						disabled={page === totalPages}
						className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-600 dark:text-white disabled:opacity-50"
					>
						Next
					</button>
					<div className="flex items-center gap-2 flex-1">
						<span className="text-sm text-gray-500 dark:text-gray-400">1</span>
						<div className="relative flex-1">
							<input
								type="range"
								min={1}
								max={totalPages}
								value={sliderPage}
								onChange={handleSliderChange}
								className="w-full h-4 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-600"
							/>
							{sliderTooltip && (
								<div 
									className="absolute -top-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10"
									style={{ left: `${((sliderTooltip.page - 1) / (totalPages - 1 || 1)) * 100}%` }}
								>
									{sliderTooltip.firstTime} - {sliderTooltip.lastTime}
								</div>
							)}
						</div>
						<span className="text-sm text-gray-500 dark:text-gray-400">{totalPages}</span>
					</div>
					<div className="text-sm text-gray-500 dark:text-gray-400 self-center text-center">
						Page {page} of {totalPages} ({total} entries)
						<br />
						Rows per page: {rowsPerPage}
						{cachedAt && (
							<>
								<br />
								<span className="text-xs">Cached: {new Date(cachedAt).toLocaleTimeString()}</span>
							</>
						)}
					</div>
					<button
						onClick={handleExportCsv}
						className="px-4 py-2 bg-green-500 text-white rounded hover:opacity-90"
					>
						Export CSV
					</button>
					<button
						onClick={refreshData}
						disabled={loading}
						className="px-4 py-2 bg-blue-500 text-white rounded hover:opacity-90 disabled:opacity-50"
					>
						Refresh
					</button>
				</div>
			</div>

			<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex flex-col flex-1 overflow-hidden" style={{ height: tableHeight || undefined }}>
				<div className="overflow-x-auto flex-1" ref={tableContainerRef}>
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-gray-50 dark:bg-gray-700">
								<th className="text-left p-2 dark:text-white">Timestamp</th>
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
							{loading ? (
								<tr>
									<td colSpan={10} className="p-4 text-center dark:text-white">Loading...</td>
								</tr>
							) : data.length === 0 ? (
								<tr>
									<td colSpan={12} className="p-4 text-center dark:text-white">No data</td>
								</tr>
							) : (
								data.map((h, i) => {
									const prev = i < data.length - 1 ? data[i + 1] : null;
									return (
									<tr key={i} className="border-b hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-600">
										<td className="p-2 dark:text-white">{new Date(h.timestamp).toLocaleString()}</td>
										<td className="p-2 text-right dark:text-white">{(h.hashRate / 1000).toFixed(3)}</td>
										<td className={`p-2 text-right ${getToExpectedColor(h.toExpected)}`}>{h.toExpected.toFixed(1)}%</td>
										<td className={`p-2 text-right ${getTempColor(h.temp, settings.targetAsic)}`}>{h.temp.toFixed(3)}</td>
										<td className={`p-2 text-right ${getTempColor(h.vrTemp, settings.maxVr)}`}>{h.vrTemp}</td>
										<td className={`p-2 text-right ${prev && prev.coreVoltage !== h.coreVoltage ? 'bg-blue-100 dark:bg-blue-800 font-bold' : 'dark:text-white'}`}>{h.coreVoltage.toFixed(1)}</td>
										<td className={`p-2 text-right ${prev && prev.frequency !== h.frequency ? 'bg-purple-100 dark:bg-purple-800 font-bold' : 'dark:text-white'}`}>{h.frequency}</td>
										<td className={`p-2 text-right ${prev && prev.oldStepDown !== h.oldStepDown ? 'bg-yellow-100 dark:bg-yellow-800 font-bold' : 'dark:text-white'}`}>{h.oldStepDown}</td>
										<td className="p-2 text-right dark:text-white">{h.power.toFixed(1)}</td>
										<td className="p-2 text-right dark:text-white">{h.efficiency.toFixed(2)}</td>
									</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
		</>
	);
}
