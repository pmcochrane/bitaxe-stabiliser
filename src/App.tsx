import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import { getSettings } from './services/api';

function App() {
	const location = useLocation();
	const [ip, setIp] = useState('');
	const [hostname, setHostname] = useState('');
	const [darkMode, setDarkMode] = useState(() => {
		const stored = localStorage.getItem('darkMode');
		return stored === null ? true : stored === 'true';
	});

	useEffect(() => {
		getSettings()
			.then((settings) => {
				setIp(settings.ip);
				setHostname(settings.hostname);
			})
			.catch(console.error);
	}, []);

	useEffect(() => {
		if (darkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
		localStorage.setItem('darkMode', String(darkMode));
	}, [darkMode]);

	return (
		<div className="min-h-screen bg-gray-100 dark:bg-gray-900">
			<nav className="bg-slate-800 dark:bg-slate-950 text-white p-4">
				<div className="container mx-auto flex justify-between items-center">
					<div className="flex items-center gap-4">
						<h1 className="text-xl font-bold">Bitaxe Stabiliser &nbsp;
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
						</div>
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
			</Routes>
		</div>
	);
}

export default App;
