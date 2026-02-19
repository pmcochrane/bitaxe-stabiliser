import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { MonitorService } from './bitaxe';
import { DataStore } from './store';
import { createApiRouter } from './routes';
import { logIndex } from './utils/logger';

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

const settings = store.getSettings();
if (BITAXE_IP) {
	settings.ip = BITAXE_IP;
	settings.hostname = BITAXE_HOSTNAME;
	if (TARGET_ASIC !== undefined) settings.targetAsic = TARGET_ASIC;
	if (MAX_VR !== undefined) settings.maxVr = MAX_VR;
	if (CORE_VOLTAGE !== undefined) settings.coreVoltage = CORE_VOLTAGE;
	if (MAX_FREQ !== undefined) settings.maxFreq = MAX_FREQ;
	store.saveSettings(settings);
}

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
		logIndex('[SIGINT] Shutting down...');
		monitor.stop();
		store.forceSave();
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		logIndex('[SIGTERM] Shutting down...');
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
