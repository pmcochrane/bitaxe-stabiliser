import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { MonitorService } from './bitaxe';
import { DataStore } from './store';
import { createApiRouter } from './routes';
import { logIndex } from './utils/logger';
import { log } from 'console';
import e from 'express';
import { DefaultLegendContent } from 'recharts';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

if (!process.env.BITAXE_IP) {
	console.error('Error: BITAXE_IP environment variable is required');
	console.error('Please set the environment variable BITAXE_IP (e.g., BITAXE_IP=192.168.1.100) and restart the application.');
	process.exit(1);
}

const BITAXE_IP = process.env.BITAXE_IP;
let BITAXE_HOSTNAME = process.env.BITAXE_HOSTNAME || '';
const HISTORY_LIMIT = process.env.HISTORY_LIMIT ? parseInt(process.env.HISTORY_LIMIT) : 172800;

const TARGET_ASIC = process.env.TARGET_ASIC ? parseFloat(process.env.TARGET_ASIC) : undefined;
const MAX_VR = process.env.MAX_VR ? parseFloat(process.env.MAX_VR) : undefined;
const CORE_VOLTAGE = process.env.CORE_VOLTAGE ? parseInt(process.env.CORE_VOLTAGE) : undefined;
const MAX_FREQ = process.env.MAX_FREQ ? parseFloat(process.env.MAX_FREQ) : undefined;
const STEP_DOWN_DEFAULT = process.env.STEP_DOWN_DEFAULT ? parseInt(process.env.STEP_DOWN_DEFAULT) : undefined;
const LOW_STEP_ANALYSE_RANGE = process.env.LOW_STEP_ANALYSE_RANGE ? parseInt(process.env.LOW_STEP_ANALYSE_RANGE) : undefined;
const LOW_STEP_WARNING_THRESHOLD = process.env.LOW_STEP_WARNING_THRESHOLD ? parseInt(process.env.LOW_STEP_WARNING_THRESHOLD) : undefined;

async function getDataDir(): Promise<string> {
	let retval=`./data/${BITAXE_IP}`;
	
	if (BITAXE_HOSTNAME==="") {
		logIndex("Attempt to retrieve the bitaxe hostname from the API");
		try {
			const response = await axios.get(`http://${BITAXE_IP}/api/system/info`, { timeout: 5000 });
			retval=`./data/${response.data.hostname || BITAXE_IP}`;
			BITAXE_HOSTNAME=response.data.hostname || BITAXE_IP;
			logIndex("Successfully retrieved the bitaxe hostname from the API: " + response.data.hostname);
		} catch (error) {
			logIndex('Failed to lookup the hostname from the API');
		}
	}
	logIndex(`Using data directory: ${retval}`);
	return retval;
}

getDataDir().then((dataDir) => {
	const SETTINGS_FILE = `${dataDir}/settings.json`;

	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, { recursive: true });
	}

	const store = new DataStore(
		SETTINGS_FILE,
		`${dataDir}/history.json`,
		`${dataDir}/hashrange.json`,
		`${dataDir}/events.json`,
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
	const bitaxeSettings = await getBitaxeSettings();
	let settings = store.getSettings();
	if (settings) {
		logIndex('Loaded settings from settings file');
	} else {
		logIndex('No previous settings file found for this Bitaxe IP address');
	}
	
	settings.ip = BITAXE_IP;
	settings.hostname = BITAXE_HOSTNAME;
	
	// get targetAsic setting from env, then settings file, then default to 65
	if (TARGET_ASIC !== undefined) {
		settings.targetAsic = TARGET_ASIC;
		logIndex(`[env] targetAsic: ${settings.targetAsic}`);
	} else if (settings.targetAsic) {
		logIndex(`[settings.json] targetAsic: ${settings.targetAsic}`);
	} else {
		settings.targetAsic = 65;
		logIndex(`[default] targetAsic: 65`);
	}
	
	// get maxVr setting from env, then settings file, then default to 80
	if (MAX_VR !== undefined) {
		settings.maxVr = MAX_VR;
		logIndex(`[env] maxVr: ${settings.maxVr}`);
	} else if (settings.maxVr) {
		logIndex(`[settings.json] maxVr: ${settings.maxVr}`);
	} else {
		settings.maxVr = 80;
		logIndex(`[default] maxVr: 80`);
	}
	
	// get coreVoltage setting from env, then settings file, then current Bitaxe setting, then default to 1150
	if (CORE_VOLTAGE !== undefined) {
		settings.coreVoltage = CORE_VOLTAGE;
		logIndex(`[env] coreVoltage: ${settings.coreVoltage}`);
	} else if (settings.coreVoltage) {
		logIndex(`[settings.json] coreVoltage: ${settings.coreVoltage}`);
	} else if (bitaxeSettings?.coreVoltage) {
		settings.coreVoltage = bitaxeSettings.coreVoltage;
		logIndex(`[bitaxe] Using current Bitaxe setting for coreVoltage: ${settings.coreVoltage}`);
	} else {
		settings.coreVoltage = 1150;
		logIndex(`[default] coreVoltage: ${settings.coreVoltage}`);
	}

	if (MAX_FREQ !== undefined) {
		settings.maxFreq = MAX_FREQ;
		logIndex(`[env] maxFreq: ${settings.maxFreq}`);
	} else if (settings.maxFreq) {
		logIndex(`[settings.json] maxFreq: ${settings.maxFreq}`);
	} else if (bitaxeSettings?.frequency) {
		settings.maxFreq = bitaxeSettings.frequency;
		logIndex(`[bitaxe] Using current Bitaxe setting for maxFreq: ${settings.maxFreq}`);
	} else {
		settings.maxFreq = 525.0;
		logIndex(`[default] maxFreq: ${settings.maxFreq}`);
	}

	// get low step warning settings from env, then settings file, then default
	if (LOW_STEP_ANALYSE_RANGE !== undefined) {
		settings.lowStepAnalyseRange = LOW_STEP_ANALYSE_RANGE;
		logIndex(`[env] lowStepAnalyseRange: ${settings.lowStepAnalyseRange}`);
	} else if (settings.lowStepAnalyseRange) {
		logIndex(`[settings.json] lowStepAnalyseRange: ${settings.lowStepAnalyseRange}`);
	} else {
		settings.lowStepAnalyseRange = 50;
		logIndex(`[default] lowStepAnalyseRange: ${settings.lowStepAnalyseRange}`);
	}

	// get low step warning threshold settings from env, then settings file, then default
	if (LOW_STEP_WARNING_THRESHOLD !== undefined) {
		settings.lowStepWarningThreshold = LOW_STEP_WARNING_THRESHOLD;
		logIndex(`[env] lowStepWarningThreshold: ${settings.lowStepWarningThreshold}`);
	} else if (settings.lowStepWarningThreshold) {
		logIndex(`[settings.json] lowStepWarningThreshold: ${settings.lowStepWarningThreshold}`);
	} else {
		settings.lowStepWarningThreshold = -10;
		logIndex(`[default] lowStepWarningThreshold: ${settings.lowStepWarningThreshold}`);
	}

	// get stepDownDefault from env, then settings file, then default to -10
	if (STEP_DOWN_DEFAULT !== undefined) {
		settings.stepDownDefault = STEP_DOWN_DEFAULT;
		logIndex(`[env] stepDownDefault: ${settings.stepDownDefault}`);
	} else if (settings.stepDownDefault !== undefined) {
		logIndex(`[settings.json] stepDownDefault: ${settings.stepDownDefault}`);
	} else {
		settings.stepDownDefault = -10;
		logIndex(`[default] stepDownDefault: ${settings.stepDownDefault}`);
	}

	store.saveSettings(settings);
	
	return settings;
}

async function main() {
	const settings = await initializeSettings();
	const monitor = new MonitorService(settings, store);

	const app = express();
	app.use(compression());
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
});
