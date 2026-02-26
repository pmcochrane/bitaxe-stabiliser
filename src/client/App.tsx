import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import About from './pages/About';
import { getSettings, getInfo } from './services/api';

function App() {
	const location = useLocation();
	const [ip, setIp] = useState('');
	const [hostname, setHostname] = useState('');
	const [isDev, setIsDev] = useState(false);
	const [darkMode, setDarkMode] = useState(() => {
		const stored = localStorage.getItem('darkMode');
		return stored === null ? true : stored === 'true';
	});
	const [storageUsage, setStorageUsage] = useState<{ used: number; total: number; breakdown: Record<string, number> } | null>(null);

	useEffect(() => {
		const calculateStorage = () => {
			let used = 0;
			const breakdown: Record<string, number> = {};
			for (let key in localStorage) {
				if (localStorage.hasOwnProperty(key)) {
					const size = localStorage[key].length + key.length;
					used += size;
					breakdown[key] = size;
				}
			}
			setStorageUsage({ used, total: 5 * 1024 * 1024, breakdown });
		};
		calculateStorage();
		const interval = setInterval(calculateStorage, 30000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		const fetchSettings = () => {
			getSettings()
				.then((settings) => {
					setIp(settings.ip);
					setHostname(settings.hostname);
				})
				.catch(console.error);
			getInfo()
				.then((info) => {
					setIsDev(info.isDev);
				})
				.catch(console.error);
		};

		fetchSettings();
		const interval = setInterval(fetchSettings, 30000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		if (darkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
		localStorage.setItem('darkMode', String(darkMode));
	}, [darkMode]);

	useEffect(() => {
		if (hostname) {
			document.title = `${hostname}: Bitaxe Stabiliser`;
		}
	}, [hostname]);

	return (
		<div className="min-h-screen bg-gray-100 dark:bg-gray-900">
			<nav className="bg-slate-800 dark:bg-slate-950 text-white p-2">
				<div className="container mx-auto flex justify-between items-center">
					<div className="flex items-center gap-2">
						<img
							src="/Bitaxe.png"
							alt="Bitaxe"
							className="h-8 brightness-0 invert"
						/>
						<h1 className="text-3xl font-bold self-center leading-none">Stabiliser</h1>
						<h1 className="text-xl font-bold self-center leading-none">
							{isDev && <span className="px-2 py-1 text-xs font-bold bg-yellow-500 text-black rounded">DEV Server</span>} &nbsp;
							{hostname && <span className="text-sm text-gray-400">{hostname}</span>} &nbsp;
							{ip && (
								<a
									href={`http://${ip}`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm text-gray-500 hover:text-blue-300 underline"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="inline-block w-3 h-3 ml-1">
										<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
									</svg>
									{ip}
								</a>
							)}
						</h1>
					</div>
					<div className="flex-1 text-center">
						BTC Donation Address:
						<br />
						<button
							onClick={() => {
								navigator.clipboard.writeText('bc1qna9cfhz6vuafp9vjkr5uvch7l82xgucdeejxtw');
								alert('Address has been copied to the clipboard');
							}}
							title="All donations greatfully accepted. Thank you, Paul"
							className="text-sm text-gray-400 hover:text-blue-300 underline"
						>
							<span className="font-mono">bc1qna9cfhz6vuafp9vjkr5uvch7l82xgucdeejxtw</span>
						</button>
					</div>
					<div className="flex items-center gap-4">
						<div className="space-x-4">
							<Link
								to="/"
								className={`hover:text-blue-300 ${location.pathname === '/' ? 'text-blue-300' : ''}`}
							>
								Dashboard
							</Link>
							<Link
								to="/history"
								className={`hover:text-blue-300 ${location.pathname === '/history' ? 'text-blue-300' : ''}`}
							>
								History
							</Link>
							<Link
								to="/about"
								className={`hover:text-blue-300 ${location.pathname === '/about' ? 'text-blue-300' : ''}`}
							>
								About
							</Link>
						</div>
						<a
							href="https://github.com/pmcochrane/bitaxe-stabiliser"
							target="_blank"
							rel="noopener noreferrer"
							className="p-2 hover:bg-slate-700 rounded"
							title="GitHub Repository"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
								<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
							</svg>
						</a>
						{storageUsage && (
							<span
								className="text-xs text-gray-400 cursor-help"
								title={`localStorage: ${(storageUsage.used / 1024).toFixed(1)} KB / ${(storageUsage.total / 1024 / 1024).toFixed(0)} MB\n${Object.entries(storageUsage.breakdown).map(([k, v]) => `${k}: ${(v / 1024).toFixed(1)} KB`).join('\n')}`}
							>
								{((storageUsage.used / storageUsage.total) * 100).toFixed(1)}%
							</span>
						)}
						<button
							onClick={() => setDarkMode(!darkMode)}
							className="p-2 rounded bg-slate-700 hover:bg-slate-600"
						>
							{darkMode ? '☀️' : '🌙'}
						</button>
					</div>
				</div>
			</nav>

			<Routes>
				<Route path="/" element={<Dashboard />} />
				<Route path="/history" element={<History />} />
				<Route path="/about" element={<About />} />
			</Routes>
		</div>
	);
}

export default App;
