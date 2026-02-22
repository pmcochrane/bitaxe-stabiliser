import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { MonitorService } from './bitaxe';
import { DataStore } from './store';
import { createApiRouter } from './routes';
import { logIndex } from './utils/logger';
import { log } from 'console';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

if (!process.env.BITAXE_IP) {
	console.error('Error: BITAXE_IP environment variable is required');
	console.error('Please set BITAXE_IP (e.g., BITAXE_IP=192.168.1.100 npm start)');
	process.exit(1);
}

const BITAXE_IP = process.env.BITAXE_IP;
const BITAXE_HOSTNAME = process.env.BITAXE_HOSTNAME || BITAXE_IP;
const DATA_DIR = process.env.DATA_DIR || `./data/${BITAXE_IP}`;
const SETTINGS_FILE = process.env.SETTINGS_FILE || `${DATA_DIR}/settings.json`;
const HISTORY_LIMIT = process.env.HISTORY_LIMIT ? parseInt(process.env.HISTORY_LIMIT) : 172800;

const TARGET_ASIC = process.env.TARGET_ASIC ? parseFloat(process.env.TARGET_ASIC) : undefined;
const MAX_VR = process.env.MAX_VR ? parseFloat(process.env.MAX_VR) : undefined;
const CORE_VOLTAGE = process.env.CORE_VOLTAGE ? parseInt(process.env.CORE_VOLTAGE) : undefined;
const MAX_FREQ = process.env.MAX_FREQ ? parseFloat(process.env.MAX_FREQ) : undefined;

if (!fs.existsSync(DATA_DIR)) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
}

const store = new DataStore(
	SETTINGS_FILE,
	`${DATA_DIR}/history.json`,
	`${DATA_DIR}/hashrange.json`,
	`${DATA_DIR}/events.json`,
	HISTORY_LIMIT
);

async function getBitaxeSettings(): Promise<{ coreVoltage: number; frequency: number } | null> {
	try {
		const response = await axios.get(`http://${BITAXE_IP}/api/system/info`, { timeout: 5000 });
		const data = response.data;
		return {
			coreVoltage: data.coreVoltage || undefined,
			frequency: data.frequency || undefined,
		};
	} catch (error) {
		logIndex(`Failed to fetch initial settings from Bitaxe: ${error}`);
		return null;
	}
}

async function initializeSettings() {
	let settings = store.getSettings();
	if (settings) {
		logIndex('Loaded settings from file');
		if (settings.ip) {
			logIndex(`[settings.json] Bitaxe IP: ${settings.ip}`);
		}
		if (settings.hostname) {
			logIndex(`[settings.json] hostname: ${settings.hostname}`);
		}	
		if (settings.coreVoltage) {
			logIndex(`[settings.json] coreVoltage: ${settings.coreVoltage}`);
		}
		if (settings.maxFreq) {
			logIndex(`[settings.json] maxFreq: ${settings.maxFreq}`);
		}
		if (settings.targetAsic) {
			logIndex(`[settings.json] targetAsic: ${settings.targetAsic}`);
		}
		if (settings.maxVr) {
			logIndex(`[settings.json] maxVr: ${settings.maxVr}`);
		}
	} else {
		logIndex('No settings file found');
	}
	
	if (BITAXE_IP) {
		settings.ip = BITAXE_IP;
		settings.hostname = BITAXE_HOSTNAME;
		
		if (TARGET_ASIC !== undefined) {
			settings.targetAsic = TARGET_ASIC;
			logIndex(`[env] TARGET_ASIC: ${TARGET_ASIC}`);
		}
		if (MAX_VR !== undefined) {
			settings.maxVr = MAX_VR;
			logIndex(`[env] MAX_VR: ${MAX_VR}`);
		}
		
		if (CORE_VOLTAGE !== undefined) {
			settings.coreVoltage = CORE_VOLTAGE;
			logIndex(`Using CORE_VOLTAGE from environment: ${CORE_VOLTAGE}`);
		}
		if (MAX_FREQ !== undefined) {
			settings.maxFreq = MAX_FREQ;
			logIndex(`Using MAX_FREQ from environment: ${MAX_FREQ}`);
		}

		if (!settings.coreVoltage || !settings.maxFreq) {
			const bitaxeSettings = await getBitaxeSettings();
			if (bitaxeSettings) {
				if (!settings.coreVoltage) {
					settings.coreVoltage = bitaxeSettings.coreVoltage;
					logIndex(`Using current Bitaxe setting for coreVoltage: ${bitaxeSettings.coreVoltage}`);
				}
				if (!settings.maxFreq) {
					settings.maxFreq = bitaxeSettings.frequency;
					logIndex(`Using current Bitaxe setting for maxFreq: ${bitaxeSettings.frequency}`);
				}
			}
		}
		
		store.saveSettings(settings);
	}
	
	return settings;
}

async function main() {
	const settings = await initializeSettings();
	const monitor = new MonitorService(settings, store);

	const app = express();
	app.use(express.json());

	app.use('/api', createApiRouter(monitor, store));

	const isDev = process.env.NODE_ENV !== 'production';

	if (!isDev) {
		app.use(express.static('public'));

		app.get('*', (req, res) => {
			if (!req.path.startsWith('/api')) {
				res.sendFile(path.join(__dirname, '../public/index.html'));
			}
		});
	}

	process.on('SIGINT', () => {
		logIndex('Shutting down...');
		monitor.stop();
		store.forceSave();
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		logIndex('Shutting down...');
		monitor.stop();
		store.forceSave();
		process.exit(0);
	});

	app.listen(PORT, () => {
		logIndex(`Bitaxe Stabiliser running at http://localhost:${PORT}`);
		logIndex(`Monitoring: ${BITAXE_IP}`);

		setTimeout(() => {
			monitor.start();
			logIndex('Monitor started');
		}, 2000);
	});
}

main();
