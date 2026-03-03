import { BitaxeClient } from './client';
import { BitaxeStatus, HistoryEntry, Settings, MonitorState, HashrangeEntry, BitaxeSystemInfo, VoltageEntry } from './types';
import { DataStore } from '../store/data';
import { logMonitor } from '../utils/logger';

export type AutotuneStrategy = 'hashrate' | 'byVoltage';

export interface AutotuneOptions {
	autotuneEnabled: boolean;
	autotuneStrategy?: AutotuneStrategy;
	maxCoreVoltage: number;
	voltageMap: VoltageEntry[];
	autotuneReversalThreshold?: number;
}

export class MonitorService {
	private client: BitaxeClient;
	private settings: Settings;
	private state: MonitorState;
	private store: DataStore;
	private intervalId: NodeJS.Timeout | null = null;
	private loopStartTime = 0;
	private iteration = 0;
	private applyChange = true;
	private changeMessage = '';

	private asicTemps: number[] = [];
	private vrTemps: number[] = [];
	private voltages: number[] = [];
	private powers: number[] = [];
	private hashRates: number[] = [];

	private maxStepUp = 10;
	private secondsBetweenPasses = 1;
	private autotuneVoltageEveryXcycles = 5;	// Autotune by voltage adjusts every 5 cycles
	private autotuneEveryXcycles = 30-1; 		// minus 1 because we reset the counter at the start of the autotune function, so it runs on the next cycle after the delay
	private stepUpEveryXPasses = ((this.autotuneEveryXcycles+1)*3)+1;
	private stepDownEveryXPasses = 2;
	private drasticMeasureDelay = 3;
	private stepDownSettleDelay = 5;
	private voltageOverheatReduction = 5;
	private maxCoreVoltage = 1450;
	private initialMaxCoreVoltage = 1450;

	private maxSweepSteps = 24;
	private sweepIterations = 180;
	private sweepIterationsCounter = 0;
	private sweepStartTime = '';

	private minHashRate = 1000000000;
	private maxHashRate = 0;
	private overallAverageHashRate = 0;
	private overallAverageAsicTemp = 0;
	private overallAverageVrTemp = 0;
	private overallAverageVoltage = 0;
	private overallAveragePower = 0;
	private expectedHashRate = 0;
	private desiredFreq = 0;
	private autoAdjustFreq = true;

	private autotuneEnabled = true;
	private autotuneStrategy: AutotuneStrategy = 'byVoltage'; //'hashrate';
	private autotuneIncreasedVoltageCounter: number = 0;
	private autotuneStableCount: number = 0;
	private autotuneSettleDelayCounter = 0;
	private autotunePreventIncreaseDelayCounter = 0;

	private stepDownBlocklist: Map<number, number> = new Map();
	private stepDownBlocklistDuration = 150;
	private voltageMap: Map<number, number> = new Map();
	private baselineVoltages: Map<number, number> = new Map();
	// private lastStepDown: number | null = null;
	private currentTunedVoltage: number | null = null;
	private appliedCoreVoltage = 0;
	private hasSavedForCurrentStep = false;

	private getMinStepDown(): number {
		return Math.floor((this.settings.maxFreq - 400) / 6.25) * -1;
	}
	private alterStepDownValue(stepDelta: number, logPrefix: string): void {
		const oldStepDown = this.state.stepDown;

		this.state.stepDown += stepDelta;
		if (this.state.stepDown > this.maxStepUp) {
			this.state.stepDown = this.maxStepUp;
		} else if (this.state.stepDown < this.getMinStepDown()) {
			this.state.stepDown = this.getMinStepDown();
		}
		if (this.autotuneIncreasedVoltageCounter > 0) {
			this.reduceStoredVoltage(logPrefix, this.desiredFreq, oldStepDown);
		} else {
			this.logMon(`${logPrefix} Voltage was not recently increased so leaving as is`);
		}
		this.resetAfterStepChange();
		this.applyChange = true;
	}

	private resetAfterStepChange(): void {
		this.autotuneStableCount = 0;
		this.state.stepUpCounter = this.stepUpEveryXPasses;
		this.state.stepDownCounter = this.stepDownEveryXPasses;
		this.state.stepDownSettleCounter = this.stepDownSettleDelay;
		this.autotuneSettleDelayCounter = this.autotuneEveryXcycles;
		this.autotunePreventIncreaseDelayCounter = 0;
		this.hasSavedForCurrentStep = false;
	}

	constructor(settings: Settings, store: DataStore, autotuneOptions?: AutotuneOptions) {
		this.settings = settings;
		this.store = store;
		this.client = new BitaxeClient(settings.ip);

		if (autotuneOptions) {
			this.autotuneEnabled = autotuneOptions.autotuneEnabled ? true : false;
			this.autotuneStrategy = autotuneOptions.autotuneStrategy ?? 'hashrate';
			this.maxCoreVoltage = autotuneOptions.maxCoreVoltage;
			this.initialMaxCoreVoltage = autotuneOptions.maxCoreVoltage;
			// this.autotuneReversalThreshold = autotuneOptions.autotuneReversalThreshold ?? 0.1;
			for (const entry of autotuneOptions.voltageMap) {
				this.voltageMap.set(entry.frequency, entry.coreVoltage);
			}
		}
		this.autotuneEnabled=true;
		this.autotuneStrategy = 'byVoltage'; // if autotune is disabled, we can still use the byVoltage strategy to adjust voltage based on temperature, so default to that if autotune is off

		this.state = {
			running: false,
			stabilise: false,
			sweepMode: false,
			stepDown: settings.stepDownDefault ?? -10,
			stepUpCounter: this.stepUpEveryXPasses,
			stepDownCounter: this.stepDownEveryXPasses,
			lastFrequencyApplied: 0,
			lastCoreVoltageApplied: 0,
			drasticMeasureCounter: this.drasticMeasureDelay,
			stepDownSettleCounter: 0,
		};
	}

	updateSettings(settings: Partial<Settings>): void {
		if (settings.ip && settings.ip !== this.settings.ip) {
			this.client.setIp(settings.ip);
		}
		this.settings = { ...this.settings, ...settings };

		if (settings.maxCoreVoltage !== undefined) {
			this.maxCoreVoltage = Math.min(settings.maxCoreVoltage, this.initialMaxCoreVoltage);
		}

		if (settings.maxFreq !== undefined || settings.coreVoltage !== undefined) {
			const frequency = settings.maxFreq ?? this.settings.maxFreq;
			const coreVoltage = settings.coreVoltage ?? this.settings.coreVoltage;
			this.client.setSystemSettings(frequency, coreVoltage);
			this.appliedCoreVoltage = coreVoltage;
			this.applyChange = true;
		}
	}

	getSettings(): Settings {
		return { ...this.settings, maxCoreVoltage: this.maxCoreVoltage };
	}

	getState(): MonitorState {
		return { ...this.state };
	}

	getMaxCoreVoltage(): number {
		return this.maxCoreVoltage;
	}

	getSweepInfo(): { iterations: number; counter: number } {
		return {
			iterations: this.sweepIterations,
			counter: this.sweepIterationsCounter,
		};
	}

	getClient(): BitaxeClient {
		return this.client;
	}

	start(): void {
		if (this.state.running) return;

		this.state.running = true;
		this.changeMessage = 'Starting monitor service...';
		this.applyChange = true;
		this.state.stepDown = this.settings.stepDownDefault ?? -10;
		this.state.stepDownSettleCounter = 0;
		this.autotuneSettleDelayCounter = 0;
		this.asicTemps = [];
		this.vrTemps = [];
		this.iteration = 0;
		this.minHashRate = 1000000000;
		this.maxHashRate = 0;
		this.stepDownBlocklist.clear();

		this.runLoop();
	}

	stop(): void {
		this.state.running = false;
		if (this.intervalId) {
			clearTimeout(this.intervalId);
			this.intervalId = null;
		}
	}

	async resetToDefaults(): Promise<void> {
		this.logMon(`Resetting Bitaxe to defaults: ${this.settings.maxFreq}MHz @ ${this.settings.coreVoltage}mV`);
		await this.client.setSystemSettings(this.settings.maxFreq, this.settings.coreVoltage);
	}

	private logMon(message: string): void {
		logMonitor(`[${this.iteration}] [${this.state.stepDown}: ${this.desiredFreq.toFixed(2)}MHz @ ${this.appliedCoreVoltage}mv] `
			+`[${this.overallAverageAsicTemp.toFixed(1)}°C ${this.overallAverageVrTemp.toFixed(1)}°C ${this.overallAveragePower.toFixed(1)}W ${(this.overallAverageHashRate/1000).toFixed(3)}TH/s]`
			+`[${this.state.stepUpCounter} ${this.state.stepDownCounter}]`
			+`	${message}`);
	}

	stabiliseOn(): void {
		this.state.stabilise = true;
		this.logMon('[UI] Automated Stabilisation enabled');
	}

	stabiliseOff(): void {
		this.state.stabilise = false;
		this.logMon('[UI] Automated Stabilisation disabled');
	}

	adjustFrequency(delta: number): void {
		const oldStepDown = this.state.stepDown;
		this.logMon(`[UI       ] -------------------------------------------------------------`);
		this.alterStepDownValue(delta, "[UI       ]");
		this.stepDownBlocklist.clear();
		this.changeMessage = `[UI       ] Step adjusted: ${oldStepDown}->${this.state.stepDown}`;
		this.store.addEvent({
			type: 'control',
			message: `Stepdown adjusted by ${delta}: ${this.changeMessage}`,
			timestamp: new Date().toISOString(),
		});
	}

	adjustVoltage(delta: number): void {
		this.settings.coreVoltage += delta;
		this.applyChange = true;
		this.store.addEvent({
			type: 'control',
			message: `Voltage adjusted by ${delta}mV to ${this.settings.coreVoltage}mV`,
			timestamp: new Date().toISOString(),
		});
	}

	startSweep(): void {
		const oldStepDown = this.state.stepDown;
		this.state.sweepMode = true;
		this.state.stepDown = 0-this.maxSweepSteps;
		this.autoAdjustFreq = false;
		this.applyChange = true;
		this.sweepIterationsCounter = 0;
		this.sweepStartTime = new Date().toISOString();
		this.store.clearHashrange();
		this.changeMessage = `[Sweep    ] [1/1] Started: Step ${oldStepDown}->${this.state.stepDown}`;
		this.store.addEvent({
			type: 'sweep',
			message: `${this.changeMessage}`,
			timestamp: new Date().toISOString(),
		});
	}

	stopSweep(): void {
		const oldStepDown = this.state.stepDown;
		this.state.sweepMode = false;
		this.state.stepDown = 0;
		this.autoAdjustFreq = true;
		this.applyChange = true;
		this.changeMessage = `[Sweep    ] [${this.sweepIterationsCounter}/${this.sweepIterations}] Stopped: Step ${oldStepDown}->${this.state.stepDown}`;
		this.store.addEvent({
			type: 'sweep',
			message: `${this.changeMessage}`,
			timestamp: new Date().toISOString(),
		});
	}

	resetData(): void {
		this.minHashRate = 1000000000;
		this.maxHashRate = 0;
		this.iteration = 0;
		this.applyChange = true;
		this.store.clearHistory();
		this.store.addEvent({
			type: 'reset',
			message: 'Current frequency data reset',
			timestamp: new Date().toISOString(),
		});
	}

	resetAll(): void {
		this.resetData();
		this.store.clearHashrange();
		this.store.addEvent({
			type: 'reset',
			message: 'All data reset',
			timestamp: new Date().toISOString(),
		});
	}

	private runLoop(): void {
		this.loopStartTime = Date.now();
		this.iteration++;

		if (this.autotuneIncreasedVoltageCounter > 0) {
			this.autotuneIncreasedVoltageCounter--;
		}

		for (const [step, count] of this.stepDownBlocklist.entries()) {
			if (count <= 1) {
				this.stepDownBlocklist.delete(step);
			} else {
				this.stepDownBlocklist.set(step, count - 1);
			}
		}

		this.client.getSystemInfo().then((info) => {
			if (!info) {
				this.logMon(`[ERROR] No data received from Bitaxe`);
				this.scheduleNext();
				return;

			} else {
				const status = this.processReading(info);
				if (status) {
					if (this.state.running) {
						const oldStepDown = this.state.stepDown;
						this.evaluateAndAdjust(status);
						status.oldStepDown = oldStepDown;
						status.stepDown = this.state.stepDown;

						if (this.autotuneEnabled) {
							this.runAutotune();
						}
					}
					this.store.addHistoryEntry(status);
				}
			}
			this.scheduleNext();
		}).catch((err) => {
			this.logMon(`[ERROR] Failed to get system info: ${err}`);
			this.scheduleNext();
		});
	}

	private scheduleNext(): void {
		const targetTime = this.loopStartTime + this.secondsBetweenPasses * 1000;
		const delay = Math.max(0, targetTime - Date.now());
		this.intervalId = setTimeout(() => this.runLoop(), delay);
	}

	private processReading(info: BitaxeSystemInfo): BitaxeStatus | null {
		const timestamp = new Date().toISOString();
		this.expectedHashRate = info.expectedHashrate;
		const expectedHashRate = info.expectedHashrate;

		if (this.applyChange) {
			this.applyBitaxeSettings();
			if (info.hashRate <= 20000) {
				this.overallAverageHashRate = info.hashRate;
			}
			this.overallAverageAsicTemp = info.temp;
			this.overallAverageVrTemp = info.vrTemp;
			this.overallAverageVoltage = (info.voltage / 1000) | 0;
			this.overallAveragePower = ((info.power * 10) | 0) / 10;

			const existingRange = this.store.getHashrangeEntry(this.desiredFreq, this.settings.coreVoltage);
			if (existingRange) {
				this.minHashRate = existingRange.minHashRate;
				this.maxHashRate = existingRange.maxHashRate;
			} else {
				this.minHashRate = this.overallAverageHashRate;
				this.maxHashRate = this.overallAverageHashRate;
			}
		}

		if (info.temp > 5) {
			this.asicTemps.push(info.temp);
			this.vrTemps.push(info.vrTemp);
			this.voltages.push(info.voltage);
			this.powers.push(info.power);
			this.hashRates.push(info.hashRate);
			if (this.asicTemps.length > 6) this.asicTemps.shift();
			if (this.vrTemps.length > 6) this.vrTemps.shift();
			if (this.voltages.length > 6) this.voltages.shift();
			if (this.powers.length > 6) this.powers.shift();
			if (this.hashRates.length > 60) this.hashRates.shift();
		}

		const avgAsicTemp = this.asicTemps.length > 0
			? this.asicTemps.reduce((a, b) => a + b, 0) / this.asicTemps.length
			: info.temp;
		const avgVrTemp = this.vrTemps.length > 0
			? this.vrTemps.reduce((a, b) => a + b, 0) / this.vrTemps.length
			: info.vrTemp;
		const avgVoltage = this.voltages.length > 0
			? this.voltages.reduce((a, b) => a + b, 0) / this.voltages.length
			: info.voltage;
		const avgPower = this.powers.length > 0
			? this.powers.reduce((a, b) => a + b, 0) / this.powers.length
			: info.power;
		const avgHashRate = this.hashRates.length > 0
			? this.hashRates.reduce((a, b) => a + b, 0) / this.hashRates.length
			: info.hashRate;

		const history = this.store.getHistory();
		const filterVoltage = this.appliedCoreVoltage || this.settings.coreVoltage;
		const currentFreqHistory = history.filter(
			h => Math.abs(h.desiredFreq - this.desiredFreq) < 1 && h.coreVoltage2 === filterVoltage
		);

		if (currentFreqHistory.length > 0 && !this.applyChange) {
			this.overallAverageHashRate = avgHashRate;
			this.overallAverageAsicTemp = avgAsicTemp;
			this.overallAverageVrTemp = avgVrTemp;
			this.overallAverageVoltage = avgVoltage;
			this.overallAveragePower = avgPower;
		}

		const toExpected = this.overallAverageHashRate > 0 && expectedHashRate > 0
			? (this.overallAverageHashRate / expectedHashRate) * 100 - 100
			: 0;

		const efficiency = this.overallAverageHashRate > 0
			? (this.overallAveragePower * 1000) / this.overallAverageHashRate
			: 0;

		const currentHashRate = info.hashRate;
		if (currentHashRate < this.minHashRate) this.minHashRate = currentHashRate;
		if (currentHashRate > this.maxHashRate) this.maxHashRate = currentHashRate;

		return {
			...info,
			timestamp,
			iteration: this.iteration,
			oldStepDown: this.state.stepDown,
			stepDown: this.state.stepDown,
			desiredFreq: this.desiredFreq,
			coreVoltage2: this.appliedCoreVoltage || this.settings.coreVoltage,
			avgHashRate: this.overallAverageHashRate,
			minAvgHashRate: this.minHashRate,
			maxAvgHashRate: this.maxHashRate,
			avgAsicTemp: avgAsicTemp,
			avgVrTemp: avgVrTemp,
			avgVoltage: this.overallAverageVoltage,
			avgPower: this.overallAveragePower,
			efficiency,
			toExpected,
		};
	}

	private reduceStoredVoltage(logPrefix: string, frequency: number, oldStepDown: number): boolean {
		const currentVoltage = this.voltageMap.get(frequency);
		if (currentVoltage === undefined || currentVoltage <= 700) {
			return false;
		}
		const newVoltage = currentVoltage - this.voltageOverheatReduction;
		const clampedVoltage = Math.max(700, newVoltage);
		this.voltageMap.set(frequency, clampedVoltage);
		this.store.setVoltageForFrequency(frequency, clampedVoltage, 0, this.overallAverageHashRate, this.overallAverageAsicTemp, this.overallAverageVrTemp, this.overallAveragePower, (this.overallAveragePower * 1000) / (this.overallAverageHashRate || 1));
		this.logMon(`${logPrefix} Quick overheat after step change			Decreasing voltage to ${clampedVoltage}mV`);
		this.autotuneIncreasedVoltageCounter = 0;
		return true;
	}

	private runAutotune(): void {
		if (this.autotuneStrategy === 'byVoltage') {
			this.runAutotuneByVoltage();
		}
	}

	// Auto tune strategy: adjust coreVoltage on a set frequency to align ASIC and VR temperatures with target values, while also considering the hashrate performance relative to expected. 
	// This strategy is designed to find the optimal voltage for a given frequency that keeps temperatures in check while maximizing hashrate.
	private runAutotuneByVoltage(): void {
		// if (this.state.stepDown !== this.lastStepDown) {
		// 	this.lastStepDown = this.state.stepDown;
		// 	this.autotuneSettleDelayCounter = this.autotuneVoltageEveryXcycles;
		// 	return;
		// }

		// Decrement the prevent further voltage increase counter if required
		if (this.autotunePreventIncreaseDelayCounter > 0) {
			this.autotunePreventIncreaseDelayCounter--;
		}

		// Only run autotune every 5 cycles to allow time for changes to take effect and be measured
		if (this.autotuneSettleDelayCounter > 0) {
			this.autotuneSettleDelayCounter--;
			return;
		}
		this.autotuneSettleDelayCounter = this.autotuneVoltageEveryXcycles;

		const fmaxAsic = this.settings.targetAsic + this.settings.asicTempTolerance;
		const fminAsic = this.settings.targetAsic - this.settings.asicTempTolerance;
		const fmaxVr = this.settings.maxVr;
		const asicDiff= this.overallAverageAsicTemp - this.settings.targetAsic;
		const vrDiff = this.overallAverageVrTemp - fmaxVr;


		const currentVoltage = this.currentTunedVoltage ?? this.appliedCoreVoltage ?? this.settings.coreVoltage;
		let newVoltage = currentVoltage;
		let voltageChanged = false;

		// Calculate how far we are from the expected hashrate as a percentage, to use as context in decision making and logging
		const toExpected = this.overallAverageHashRate > 0 && this.expectedHashRate > 0
			? (this.overallAverageHashRate / this.expectedHashRate) * 100 - 100
			: 0;
		const toExpectedString= ` [exp:${toExpected.toFixed(1)}%]`;

		// Decide if we have hit point to consider changing frequency based on how far we are from expected hashrate, 
		// but only if we have been stable for at least 20 cycles to allow time for accurate measurement and prevent overreacting to temporary fluctuations
		let freqChangeString = '';
		if (toExpected > 1 && this.autotuneStableCount>20) {
			freqChangeString = '	-> Scale Frequency Up';
		} else if (toExpected < 3 && this.autotuneStableCount>20) {
			freqChangeString = '	-> Scale Frequency Down';
		}

		if (this.overallAverageVrTemp > fmaxVr) {
			newVoltage = Math.max(700, currentVoltage - 10);
			this.changeMessage += `[Autotune-]${toExpectedString}VR (Too High)	${vrDiff.toFixed(2)}°C	Reducing `;
			voltageChanged = true;
			this.autotunePreventIncreaseDelayCounter = this.autotuneVoltageEveryXcycles*6;
			this.autotuneStableCount = 0;

		} else if (this.overallAverageAsicTemp > fmaxAsic) {
			newVoltage = Math.max(700, currentVoltage - 5);
			this.changeMessage += `[Autotune-]${toExpectedString} ASIC (Too High)	${asicDiff.toFixed(2)}°C	Reducing `;
			voltageChanged = true;
			this.autotunePreventIncreaseDelayCounter = this.autotuneVoltageEveryXcycles*6;		// prevent increasing voltage again to allow change to take effect and be averaged out
			this.autotuneStableCount = 0;

		} else if (this.overallAverageAsicTemp < fminAsic) {
			if (this.autotunePreventIncreaseDelayCounter === 0) {
				newVoltage = Math.min(this.maxCoreVoltage, currentVoltage + 5);
				this.changeMessage += `[Autotune+]${toExpectedString} ASIC (Too Low)	${asicDiff.toFixed(2)}°C	Increasing`;
				voltageChanged = true;
				this.autotunePreventIncreaseDelayCounter = this.autotuneVoltageEveryXcycles*4;	// prevent increasing voltage again to allow change to take effect and be averaged out
				this.autotuneStableCount = 0;
			} else {	
				this.logMon(`[Blocked  ] [Autotune ]${toExpectedString} ASIC (Too Low)	${asicDiff.toFixed(2)}°C	----------`);
				this.autotuneStableCount = 0;
			}
		} else {
			this.autotuneStableCount++;
			const saved = [5, 10, 15,20].indexOf(this.autotuneStableCount)>=0 ? '	(Saved)' : '';
			this.logMon(`[STABLE   ] [Autotune=]${toExpectedString} ASIC (In Range)	${asicDiff.toFixed(2)}°C  Stable for ${this.autotuneStableCount}${saved}${freqChangeString}`);
			if (saved!=='') { // Store stable values to voltage.json for recall
				this.store.setVoltageForFrequency(this.desiredFreq, currentVoltage, toExpected, this.overallAverageHashRate, this.overallAverageAsicTemp, this.overallAverageVrTemp, this.overallAveragePower, (this.overallAveragePower * 1000) / (this.overallAverageHashRate || 1));
			}
		}

		if (voltageChanged && newVoltage !== currentVoltage) {
			this.currentTunedVoltage = newVoltage;
			this.voltageMap.set(this.desiredFreq, newVoltage);
			this.applyChange = true;
		}
	}

	private applyBitaxeSettings(): void {
		const stepFreq = this.state.stepDown * 6.25;
		this.desiredFreq = this.settings.maxFreq + stepFreq;

		if (!this.baselineVoltages.has(this.desiredFreq)) {
			this.baselineVoltages.set(this.desiredFreq, this.appliedCoreVoltage || this.settings.coreVoltage);
		}

		const hasStoredVoltage = this.voltageMap.has(this.desiredFreq);
		const storedVoltage = this.voltageMap.get(this.desiredFreq);
		const baselineVoltage = this.baselineVoltages.get(this.desiredFreq);
		const hasTunedVoltage = this.currentTunedVoltage !== null &&
			Math.abs(this.desiredFreq - this.state.lastFrequencyApplied) < 1;

		let baseVoltage = storedVoltage ?? baselineVoltage ?? this.appliedCoreVoltage ?? this.settings.coreVoltage;
		let voltageSource = hasStoredVoltage ? '[Stored] ' : '';

		if (hasTunedVoltage && this.currentTunedVoltage !== null) {
			baseVoltage = this.currentTunedVoltage;
			voltageSource = '[Tuned] ';
		} else if (!hasStoredVoltage && baselineVoltage !== undefined && baselineVoltage !== this.settings.coreVoltage) {
			voltageSource = '[Baseline] ';
		} else if (!hasStoredVoltage && !hasTunedVoltage && this.appliedCoreVoltage > 0) {
			voltageSource = '[PrevVolt] ';
		} else if (!hasStoredVoltage && !hasTunedVoltage) {
			voltageSource = '[Default] ';
		}

		let adjustedVoltage = baseVoltage;

		if (adjustedVoltage > this.maxCoreVoltage) {
			adjustedVoltage = this.maxCoreVoltage;
		}
		if (adjustedVoltage < 700) {
			adjustedVoltage = 700;
		}

		if (this.desiredFreq === this.state.lastFrequencyApplied &&
			adjustedVoltage === this.state.lastCoreVoltageApplied) {
			return;
		}

		if (this.changeMessage.includes('[Step Up')) {
			this.logMon(`[BITAXE   ] -------------------------------------------------------------`);
		}

		this.logMon(`[BITAXE   ] ${this.changeMessage !== '' ? this.changeMessage : ''}\tApplying voltage: ${adjustedVoltage}mV ${voltageSource}`);
		this.changeMessage = '';
		this.client.setSystemSettings(this.desiredFreq, adjustedVoltage);

		this.appliedCoreVoltage = adjustedVoltage;
		this.state.lastCoreVoltageApplied = adjustedVoltage;
		this.state.lastFrequencyApplied = this.desiredFreq;
		// this.state.stepUpCounter = this.stepUpEveryXPasses;
		// this.state.stepDownCounter = this.stepDownEveryXPasses;
		this.applyChange = false;
	}

	private evaluateAndAdjust(status: BitaxeStatus): void {
		const fmaxAsic = this.settings.targetAsic + this.settings.asicTempTolerance;
		const fminAsic = this.settings.targetAsic - this.settings.asicTempTolerance;
		const fmaxVr = this.settings.maxVr;
		const emergencyOverheat = this.settings.targetAsic + 2;

		// this.logMon(`[DEBUG] EvaluateAndAdjust`);

		if (status.overheatMode) {
			this.changeMessage = 'Overheat mode detected!';
			this.applyChange = true;
			return;
		}

		if (!this.state.stabilise) {
			if (status.temp > emergencyOverheat) {
				const oldStepDown = this.state.stepDown;
				this.logMon(`[EMERGENCY] -------------------------------------------------------------`);
				this.alterStepDownValue(-1, "[EMERGENCY]");
				this.changeMessage = `[EMERGENCY] Emergency cooling: ${status.temp.toFixed(1)}°C > ${emergencyOverheat}°C\tStep Down ${oldStepDown}->${this.state.stepDown}`;
			}
			return;
		}

		if (status.avgVrTemp > fmaxVr && this.autoAdjustFreq && this.state.stepDownSettleCounter <= 0) {
			this.logMon(`[DEBUG] VR temp check: ${status.avgVrTemp.toFixed(1)}°C > ${fmaxVr}°C (maxVr)`);
			if (this.state.stepDownCounter < 0) {
				const oldStepDown = this.state.stepDown;
				this.logMon(`[Blocking ] step ${oldStepDown} for ${this.stepDownBlocklistDuration} cycles due to VR temp`);
				this.logMon(`[StepDownV] -------------------------------------------------------------`);
				this.alterStepDownValue(-1, "[StepDownV]");
				this.stepDownBlocklist.set(oldStepDown, this.stepDownBlocklistDuration);
				this.changeMessage = `[StepDownV] VR temp high: ${status.avgVrTemp.toFixed(1)}°C\tStep Down ${oldStepDown}->${this.state.stepDown}`;
			}

			if (this.autotuneEnabled && this.currentTunedVoltage !== null && this.currentTunedVoltage < this.maxCoreVoltage) {
				this.maxCoreVoltage = this.currentTunedVoltage;
				this.logMon(`[Autotune-] VR temp exceeded maxVr (${fmaxVr}°C). Reducing maxCoreVoltage to ${this.maxCoreVoltage}mV`);
				this.changeMessage = `						`;
			}
		} else if (status.avgAsicTemp > fmaxAsic && this.autoAdjustFreq && this.state.stepDownSettleCounter <= 0) {
			if (this.state.stepDownCounter >= 0) {
				this.state.stepDownCounter--;
			}
			if (status.temp > emergencyOverheat) {
				if (this.state.drasticMeasureCounter >= this.drasticMeasureDelay) {
					const oldStepDown = this.state.stepDown;
					this.logMon(`[Blocking ] step ${oldStepDown} for ${this.stepDownBlocklistDuration} cycles due to ASIC temp critical [${status.temp.toFixed(1)}°C > ${emergencyOverheat}°C]`);
					this.logMon(`[Drastic ] -------------------------------------------------------------`);
					this.alterStepDownValue(-10, "[Drastic  ]");
					this.stepDownBlocklist.set(oldStepDown, this.stepDownBlocklistDuration);
					this.changeMessage = `[Drastic  ] ASIC temp Critical: ${status.avgAsicTemp.toFixed(1)}°C\tDrastic measures ${oldStepDown}->${this.state.stepDown}`;
					this.state.drasticMeasureCounter = 0;
				} else {
					this.state.drasticMeasureCounter++;
				}
			} else {
				this.state.drasticMeasureCounter = 0;
				if (this.state.stepDownCounter < 0) {
					const oldStepDown = this.state.stepDown;
					this.logMon(`[Blocking ] Blocking step up to ${oldStepDown} for ${this.stepDownBlocklistDuration} cycles due to ASIC temp high (${status.avgAsicTemp.toFixed(1)}°C)`);
					this.logMon(`[StepDownA] -------------------------------------------------------------`);
					this.alterStepDownValue(-1, "[StepDownA]");
					this.stepDownBlocklist.set(oldStepDown, this.stepDownBlocklistDuration);
					this.changeMessage = `[StepDownA] ASIC temp high: ${status.avgAsicTemp.toFixed(1)}°C\tStep Down ${oldStepDown}->${this.state.stepDown}`;
				}
			}
		} else if (status.avgAsicTemp < fminAsic && this.autoAdjustFreq) {
			if (this.state.stepDown < this.maxStepUp) {
				const targetStep = this.state.stepDown + 1;
				if (!this.stepDownBlocklist.has(targetStep)) {
					if (this.state.stepUpCounter >= 0) {
						this.state.stepUpCounter--;
					}
					if (this.state.stepUpCounter < 0) {
						const oldStepDown = this.state.stepDown;
						this.state.stepDown++;
						if (this.state.stepDown > this.maxStepUp) {
							this.state.stepDown = this.maxStepUp;
							this.changeMessage = `[Step Max ] ASIC temp low: ${status.avgAsicTemp.toFixed(1)}°C\tCannot Step Up above ${this.maxStepUp}`;
							this.applyChange = true;
						} else {
							this.changeMessage = `[Step Up  ] ASIC temp low: ${status.avgAsicTemp.toFixed(1)}°C\tStep Up ${oldStepDown}->${this.state.stepDown}`;
							this.resetAfterStepChange();
							this.applyChange = true;}
					}
				} else {
					// logMonitor(`[${this.iteration}] [Blocked ] Step up to ${targetStep} blocked by blocklist (${this.stepDownBlocklist.get(targetStep)} cycles remaining)`);
					this.state.stepUpCounter = this.stepUpEveryXPasses;
				}
			}
		}

		if (this.state.stepDownSettleCounter > 0) {
			this.state.stepDownSettleCounter--;
		}

		// Processing for sweep mode
		if (this.state.sweepMode) {
			const fmaxAsic = this.settings.targetAsic + this.settings.asicTempTolerance;
			const fmaxVr = this.settings.maxVr;

			if (status.avgVrTemp > fmaxVr || status.avgAsicTemp > fmaxAsic) {
				const baseline = this.baselineVoltages.get(this.desiredFreq) ?? this.settings.coreVoltage;
				const currentVoltage = this.currentTunedVoltage ?? this.voltageMap.get(this.desiredFreq) ?? baseline;
				const throttleVoltage = Math.max(700, currentVoltage - 5);
				this.currentTunedVoltage = throttleVoltage;
				this.voltageMap.set(this.desiredFreq, throttleVoltage);
				this.applyChange = true;
				this.autotuneSettleDelayCounter = this.autotuneEveryXcycles * 2;
				this.logMon(`[Sweep  !  ] [${this.sweepIterationsCounter}/${this.sweepIterations}] Temp limit exceeded! VR: ${status.avgVrTemp.toFixed(1)}°C > ${fmaxVr}°C or ASIC: ${status.avgAsicTemp.toFixed(1)}°C > ${fmaxAsic}°C. Throttling voltage to ${throttleVoltage}mV`);
			}

			this.sweepIterationsCounter++;
			if (this.sweepIterationsCounter % 15 === 0 || this.sweepIterationsCounter >= this.sweepIterations) {
				this.logMon(`[Sweep    ] [${this.sweepIterationsCounter}/${this.sweepIterations}] To Expected: ${status.toExpected.toFixed(2)}% | Avg Hash: ${(this.overallAverageHashRate/1000).toFixed(3)} TH/s, ASIC: ${this.overallAverageAsicTemp.toFixed(1)}°C, VR: ${this.overallAverageVrTemp.toFixed(1)}°C, Voltage: ${this.overallAverageVoltage}mV, Power: ${this.overallAveragePower}W, Efficiency: ${status.efficiency.toFixed(2)} J/TH`);
			}
			if (this.sweepIterationsCounter >= this.sweepIterations) {
				if (this.state.stepDown >= 0) {
					this.stopSweep();
				} else {
					const oldStepDown = this.state.stepDown;
					this.logMon(`[Sweep Up ] -------------------------------------------------------------`);
					this.alterStepDownValue(1, "[Sweep Up ]");
					this.sweepIterationsCounter = 0;
					this.changeMessage = `[Sweep Up ] [${this.sweepIterationsCounter}/${this.sweepIterations}] Sweep increment: Step ${oldStepDown}->${this.state.stepDown}`;
				}
			}
			if (this.sweepIterationsCounter >= 20 && !this.hasSavedForCurrentStep) {
				this.saveHashrange();
				this.hasSavedForCurrentStep = true;
			}
		}
	}

	private saveHashrange(): void {
		const toExpected = this.overallAverageHashRate > 0 && this.expectedHashRate > 0
			? (this.overallAverageHashRate / this.expectedHashRate) * 100 - 100
			: 0;
		const entry: HashrangeEntry = {
			frequency: this.desiredFreq,
			coreVoltage: this.settings.coreVoltage,
			minHashRate: this.minHashRate,
			avgHashRate: this.overallAverageHashRate,
			maxHashRate: this.maxHashRate,
			expectedHashRate: this.expectedHashRate,
			toExpected: toExpected,
			efficiency: (this.overallAveragePower * 1000) / (this.overallAverageHashRate || 1),
			avgAsicTemp: this.overallAverageAsicTemp,
			avgVrTemp: this.overallAverageVrTemp,
			avgVoltage: this.overallAverageVoltage,
			avgPower: this.overallAveragePower,
			iterations: this.iteration,
			lastUpdate: new Date().toISOString(),
			sweepStartTime: this.sweepStartTime,
		};

		this.store.setHashrangeEntry(entry);
	}
}
