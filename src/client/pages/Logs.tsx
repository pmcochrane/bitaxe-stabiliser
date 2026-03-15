import { useState, useEffect, useRef, useCallback } from 'react';
import { socketService, LogMessage } from '../services/socket';

const typeColors: Record<LogMessage['type'], string> = {
	log: 'text-gray-300',
	monitor: 'text-green-300',
	api: 'text-blue-300',
	client: 'text-yellow-300',
	index: 'text-purple-300',
};

export default function Logs() {
	const [logs, setLogs] = useState<LogMessage[]>([]);
	const [autoScroll, setAutoScroll] = useState(true);
	const [containerHeight, setContainerHeight] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);

	const calculateHeight = useCallback(() => {
		if (!wrapperRef.current) return;
		const nav = document.querySelector('nav');
		const navHeight = nav?.offsetHeight || 0;
		const headerHeight = 56; // title + buttons row approx
		const padding = 32; // p-4 top + bottom = 32px
		const availableHeight = window.innerHeight - navHeight - headerHeight - padding;
		setContainerHeight(Math.max(availableHeight, 200));
	}, []);

	useEffect(() => {
		setLogs(socketService.getLogs());

		const unsubscribe = socketService.onLog((log) => {
			setLogs(socketService.getLogs());
		});

		return unsubscribe;
	}, []);

	useEffect(() => {
		calculateHeight();
		window.addEventListener('resize', calculateHeight);
		const resizeObserver = new ResizeObserver(calculateHeight);
		if (wrapperRef.current) {
			resizeObserver.observe(wrapperRef.current);
		}
		return () => {
			window.removeEventListener('resize', calculateHeight);
			resizeObserver.disconnect();
		};
	}, [calculateHeight]);

	useEffect(() => {
		if (autoScroll && containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [logs, autoScroll]);

	const formatTimestamp = (ts: string) => {
		const date = new Date(ts);
		return date.toLocaleTimeString();
	};

	const clearLogs = () => {
		setLogs([]);
	};

	return (
		<div ref={wrapperRef} className="p-4 flex flex-col overflow-hidden h-full">
			<div className="flex justify-between items-center mb-2 shrink-0">
				<h2 className="text-2xl font-bold dark:text-white">Server Logs</h2>
				<div className="flex gap-2">
					<label className="flex items-center gap-2 text-sm dark:text-gray-300">
						<input
							type="checkbox"
							checked={autoScroll}
							onChange={(e) => setAutoScroll(e.target.checked)}
							className="rounded"
						/>
						Auto-scroll
					</label>
					<button
						onClick={clearLogs}
						className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm"
					>
						Clear
					</button>
				</div>
			</div>

			<div
				ref={containerRef}
				style={{ height: containerHeight > 0 ? containerHeight : 'auto' }}
				className="bg-gray-900 rounded-lg p-2 overflow-y-auto font-mono text-xs"
			>
				{logs.length === 0 ? (
					<p className="text-gray-500">No logs yet...</p>
				) : (
					logs.map((log, index) => (
						<div key={index} className="mb-0.5">
							<span className="text-gray-500">[{formatTimestamp(log.timestamp)}]</span>
							<span className="mx-1">-</span>
							<span className={`uppercase text-[10px] mr-2 ${typeColors[log.type]}`}>
								[{log.type}]
							</span>
							<span className="text-gray-300">{log.message}</span>
						</div>
					))
				)}
			</div>
		</div>
	);
}
