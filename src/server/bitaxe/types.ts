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
}

export interface HistoryEntry {
	timestamp: string;
	iteration: number;
	oldStepDown: number;
	stepDown: number;
	hostname: string;
	hashRate: number;
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

export interface HashrangeEntry {
	frequency: number;
	coreVoltage: number;
	minHashRate: number;
	avgHashRate: number;
	maxHashRate: number;
	expectedHashRate: number;
	toExpected: number;
	efficiency: number;
	avgAsicTemp: number;
	avgVrTemp: number;
	avgVoltage: number;
	avgPower: number;
	iterations: number;
	lastUpdate: string;
	sweepStartTime?: string;
}

export interface ControlCommand {
	action: 'start' | 'stop' | 'stabiliseOn' | 'stabiliseOff' | 'adjustFreq' | 'adjustVoltage' | 'startSweep' | 'stopSweep' | 'resetData' | 'resetAll';
	value?: number;
}

export interface MonitorState {
	running: boolean;
	stabilise: boolean;
	sweepMode: boolean;
	stepDown: number;
	stepUpCounter: number;
	stepDownCounter: number;
	stabilisedCounter: number;
	reachedInitialTemp: boolean;
	lastFrequencyApplied: number;
	lastCoreVoltageApplied: number;
	drasticMeasureCounter: number;
}
