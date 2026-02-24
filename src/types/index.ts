export interface Settings {
	ip: string;
	hostname: string;
	targetAsic: number;
	maxVr: number;
	coreVoltage: number;
	maxFreq: number;
	maxHistoryEntries: number;
	lowStepAnalyseRange: number;
	lowStepWarningThreshold: number;
	stepDownDefault: number;
}

export interface HistoryEntry {
	timestamp: string;
	iteration: number;
	stepDown: number;
	hostname: string;
	hashRate: number;
	expectedHashrate: number;
	temp: number;
	avgAsicTemp: number;
	vrTemp: number;
	avgVrTemp: number;
	voltage: number;
	avgVoltage: number;
	power: number;
	avgPower: number;
	overheatMode: boolean;
	frequency: number;
	coreVoltage: number;
	avgHashRate: number;
	minAvgHashRate: number;
	maxAvgHashRate: number;
	toExpected: number;
	efficiency: number;
	desiredFreq: number;
	coreVoltage2: number;
}

export interface EventEntry {
	timestamp: string;
	type: string;
	message: string;
}

export interface StatusResponse {
	running: boolean;
	stabilise: boolean;
	sweepMode: boolean;
	stepDown: number;
	sweepIterations: number;
	sweepIterationsCounter: number;
	settings: Settings;
	current: HistoryEntry | null;
	history: HistoryEntry[];
	events: EventEntry[];
	lowStepCount: number;
	showLowStepWarning: boolean;
	stableStepValue: number | null;
	isStepStable: boolean;
	bitaxeReachable: boolean;
	bitaxeError: string;
}

export interface HistoryResponse {
	data: HistoryEntry[];
	page: number;
	totalPages: number;
	total: number;
}

export interface ControlCommand {
	action: 'start' | 'stop' | 'stabiliseOn' | 'stabiliseOff' | 'adjustFreq' | 'adjustVoltage' | 'startSweep' | 'stopSweep' | 'resetData' | 'resetAll';
	value?: number;
}
