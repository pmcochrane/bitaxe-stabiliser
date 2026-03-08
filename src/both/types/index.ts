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
	asicTempTolerance: number;
	maxCoreVoltage: number;
	minCoreVoltage: number;
	stabilise: boolean;
}

export interface HistoryEntry {
	timestamp: string;
	iteration: number;
	oldStepDown: number;
	stepDown: number;
	hostname: string;
	hashRate: number;
	expectedHashrate?: number;
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
	stepDown: number;
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
	action: 'start' | 'stop' | 'stabiliseOn' | 'stabiliseOff' | 'adjustFreq' | 'adjustVoltage' | 'resetData' | 'resetAll';
	value?: number;
}

export interface VoltageEntry {
	frequency: number;
	coreVoltage: number;
	toExpected: number;
	avgHashRate: number;
	avgAsicTemp: number;
	avgVrTemp: number;
	avgPower: number;
	efficiency: number;
	lastUpdate: string;
}

export interface BitaxeSystemInfo {
	hostname: string;
	ip: string;
	uptime: number;
	freeHeap: number;
	board: string;
	coreVoltage: number;
	frequency: number;
	hashRate: number;
	expectedHashrate: number;
	temp: number;
	vrTemp: number;
	power: number;
	voltage: number;
	overheatMode: boolean;
	fanSpeed: number;
	fanRpm: number;
}

export interface BitaxeStatus extends BitaxeSystemInfo {
	timestamp: string;
	iteration: number;
	oldStepDown: number;
	stepDown: number;
	desiredFreq: number;
	coreVoltage2: number;
	avgHashRate: number;
	minAvgHashRate: number;
	maxAvgHashRate: number;
	avgAsicTemp: number;
	avgVrTemp: number;
	avgVoltage: number;
	avgPower: number;
	efficiency: number;
	toExpected: number;
}

export interface MonitorState {
	running: boolean;
	stabilise: boolean;
	stepDown: number;
	stepUpCounter: number;
	stepDownCounter: number;
	lastFrequencyApplied: number;
	lastCoreVoltageApplied: number;
	drasticMeasureCounter: number;
	stepDownSettleCounter: number;
	changeFrequencyMode: boolean;
	changeFrequencyDirection: 'up' | 'down';
	preFrequencyChangeToExpected: number;
	preFrequencyChangeHashRate: number;
	preFrequencyChangeStepDown: number;
}

export interface AutotuneOptions {
	autotuneEnabled: boolean;
	maxCoreVoltage: number;
	voltageMap: VoltageEntry[];
	autotuneReversalThreshold?: number;
}
