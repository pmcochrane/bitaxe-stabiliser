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
		const sweepInfo = monitor.getSweepInfo();

		res.json({
			running: state.running,
			stabilise: state.stabilise,
			sweepMode: state.sweepMode,
			stepDown: state.stepDown,
			sweepIterations: sweepInfo.iterations,
			sweepIterationsCounter: sweepInfo.counter,
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

	router.get('/hashrange/analyse', (req: Request, res: Response) => {
		const hashrange = store.getHashrange();
		
		if (hashrange.length === 0) {
			res.json({ error: 'No hashrange data available. Run sweep mode first.' });
			return;
		}

		const sweepStartTime = hashrange[0]?.sweepStartTime || '';
		
		const freqMap = new Map<number, { avgHashRate: number; avgAsicTemp: number; avgVrTemp: number; avgPower: number; efficiency: number; coreVoltage: number; count: number }>();
		
		for (const e of hashrange) {
			const freq = Math.round(e.frequency * 1000) / 1000;
			const existing = freqMap.get(freq);
			if (existing) {
				existing.avgHashRate += e.avgHashRate;
				existing.avgAsicTemp += e.avgAsicTemp;
				existing.avgVrTemp += e.avgVrTemp;
				existing.avgPower += e.avgPower;
				existing.efficiency += e.efficiency;
				existing.coreVoltage += e.coreVoltage;
				existing.count++;
			} else {
				freqMap.set(freq, {
					avgHashRate: e.avgHashRate,
					avgAsicTemp: e.avgAsicTemp,
					avgVrTemp: e.avgVrTemp,
					avgPower: e.avgPower,
					efficiency: e.efficiency,
					coreVoltage: e.coreVoltage,
					count: 1,
				});
			}
		}
		
		const averagedData = Array.from(freqMap.entries()).map(([frequency, data]) => ({
			frequency,
			coreVoltage: data.coreVoltage / data.count,
			avgHashRate: data.avgHashRate / data.count,
			avgAsicTemp: data.avgAsicTemp / data.count,
			avgVrTemp: data.avgVrTemp / data.count,
			avgPower: data.avgPower / data.count,
			efficiency: data.efficiency / data.count,
		}));

		const sortedByHashrate = [...averagedData].sort((a, b) => b.avgHashRate - a.avgHashRate);
		const sortedByPower = [...averagedData].sort((a, b) => a.avgPower - b.avgPower);
		const sortedByAsicTemp = [...averagedData].sort((a, b) => a.avgAsicTemp - b.avgAsicTemp);
		const sortedByVrTemp = [...averagedData].sort((a, b) => a.avgVrTemp - b.avgVrTemp);
		const sortedByEfficiency = [...averagedData].sort((a, b) => a.efficiency - b.efficiency);

		const topHashrate = new Set(sortedByHashrate.slice(0, 5).map(e => e.frequency));
		const topPower = new Set(sortedByPower.slice(0, 5).map(e => e.frequency));
		const topAsicTemp = new Set(sortedByAsicTemp.slice(0, 5).map(e => e.frequency));
		const topVrTemp = new Set(sortedByVrTemp.slice(0, 5).map(e => e.frequency));
		const topEfficiency = new Set(sortedByEfficiency.slice(0, 5).map(e => e.frequency));

		const getRank = (freq: number, set: Set<number>) => {
			const arr = Array.from(set);
			const idx = arr.indexOf(freq);
			return idx >= 0 ? idx + 1 : 0;
		};

		const allData = averagedData.map(e => ({
			frequency: e.frequency,
			coreVoltage: e.coreVoltage,
			avgHashRate: e.avgHashRate,
			avgAsicTemp: e.avgAsicTemp,
			avgVrTemp: e.avgVrTemp,
			avgPower: e.avgPower,
			efficiency: e.efficiency,
			rankHashrate: getRank(e.frequency, topHashrate),
			rankPower: getRank(e.frequency, topPower),
			rankAsicTemp: getRank(e.frequency, topAsicTemp),
			rankVrTemp: getRank(e.frequency, topVrTemp),
			rankEfficiency: getRank(e.frequency, topEfficiency),
		}));

		const result = {
			sweepStartTime,
			allData,
		};

		res.json(result);
	});

	router.get('/ping', (req: Request, res: Response) => {
		monitor.getClient().isReachable().then((reachable) => {
			res.json({ reachable });
		});
	});

	return router;
}
