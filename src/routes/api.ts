import { Router, Request, Response } from 'express';
import { MonitorService } from '../bitaxe';
import { DataStore } from '../store';
import { Settings, ControlCommand } from '../bitaxe/types';
import { logApi } from '../utils/logger';

export function createApiRouter(monitor: MonitorService, store: DataStore): Router {
	const router = Router();

	router.get('/status', async (req: Request, res: Response) => {
		const history = store.getLastNHistory(10);
		const state = monitor.getState();
		const settings = monitor.getSettings();
		const events = store.getEvents(10);

		const latest = history[history.length - 1] || null;
		
		const analyseRange = settings.lowStepAnalyseRange || 50;
		const threshold = settings.lowStepWarningThreshold || -10;
		const historyForAnalysis = store.getLastNHistory(analyseRange);
		const lowStepCount = historyForAnalysis.filter(h => h.stepDown < threshold).length;
		const showLowStepWarning = lowStepCount >= analyseRange;

		const historyForStable = store.getLastNHistory(100);
		const stepCounts = historyForStable.reduce((acc, h) => {
			acc[h.stepDown] = (acc[h.stepDown] || 0) + 1;
			return acc;
		}, {} as Record<number, number>);
		const mostCommonStep = Object.entries(stepCounts).sort((a, b) => b[1] - a[1])[0];
		const stableStepCount = mostCommonStep ? mostCommonStep[1] : 0;
		const isStepStable = historyForStable.length >= 100 && stableStepCount >= 95;

		const bitaxeReachable = await monitor.getClient().isReachable();
		const bitaxeError = bitaxeReachable ? '' : monitor.getClient().getLastError();

		res.json({
			running: state.running,
			stabilise: state.stabilise,
			sweepMode: state.sweepMode,
			stepDown: state.stepDown,
			settings,
			current: latest,
			history,
			events,
			lowStepCount,
			showLowStepWarning,
			stableStepValue: isStepStable ? parseInt(mostCommonStep[0]) : null,
			isStepStable,
			bitaxeReachable,
			bitaxeError,
		});
	});

	router.get('/settings', (req: Request, res: Response) => {
		res.json(store.getSettings());
	});

	router.put('/settings', (req: Request, res: Response) => {
		const newSettings: Partial<Settings> = req.body;
		const currentSettings = store.getSettings();
		const updatedSettings = { ...currentSettings, ...newSettings };
		store.saveSettings(updatedSettings);
		monitor.updateSettings(updatedSettings);
		logApi(`Settings updated: ${JSON.stringify(newSettings)}`);
		res.json(updatedSettings);
	});

	router.post('/control', (req: Request, res: Response) => {
		const command: ControlCommand = req.body;

		switch (command.action) {
			case 'start':
				monitor.start();
				logApi('Monitor started');
				break;
			case 'stop':
				monitor.stop();
				logApi('Monitor stopped');
				break;
			case 'stabiliseOn':
				monitor.stabiliseOn();
				logApi('Stabilise enabled');
				break;
			case 'stabiliseOff':
				monitor.stabiliseOff();
				logApi('Stabilise disabled');
				break;
			case 'adjustFreq':
				monitor.adjustFrequency(command.value || 1);
				logApi(`Frequency adjusted by ${command.value || 1}`);
				break;
			case 'adjustVoltage':
				monitor.adjustVoltage(command.value || 5);
				logApi(`Voltage adjusted by ${command.value || 5}mV`);
				break;
			case 'startSweep':
				monitor.startSweep();
				logApi('Sweep started');
				break;
			case 'stopSweep':
				monitor.stopSweep();
				logApi('Sweep stopped');
				break;
			case 'resetData':
				monitor.resetData();
				logApi('Data reset');
				break;
			case 'resetAll':
				monitor.resetAll();
				logApi('All data reset');
				break;
		}

		res.json({ success: true });
	});

	router.get('/history', (req: Request, res: Response) => {
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 50;
		const sort = req.query.sort === 'asc';

		const result = store.getHistoryPage(page, limit, !sort);
		res.json(result);
	});

	router.get('/history/pages', (req: Request, res: Response) => {
		const limit = parseInt(req.query.limit as string) || 50;
		const sort = req.query.sort === 'asc';

		const pageTimestamps = store.getHistoryPageTimestamps(limit, !sort);
		res.json(pageTimestamps);
	});

	router.get('/history/graph', (req: Request, res: Response) => {
		const hours = parseInt(req.query.hours as string) || 24;
		const since = req.query.since as string | undefined;
		const history = store.getHistorySince(hours, since);
		res.json(history);
	});

	router.get('/history/debug', (req: Request, res: Response) => {
		const allHistory = store.getHistory();
		const first = allHistory[0];
		const last = allHistory[allHistory.length - 1];
		res.json({
			totalEntries: allHistory.length,
			firstTimestamp: first?.timestamp || null,
			lastTimestamp: last?.timestamp || null,
		});
	});

	router.get('/hashrange', (req: Request, res: Response) => {
		res.json(store.getHashrange());
	});

	router.get('/ping', (req: Request, res: Response) => {
		monitor.getClient().isReachable().then((reachable) => {
			res.json({ reachable });
		});
	});

	return router;
}
