import { BitaxeClient } from './client';
import { BitaxeStatus, HistoryEntry, Settings, MonitorState, HashrangeEntry, BitaxeSystemInfo, VoltageEntry } from './types';
import { DataStore } from '../store/data';
import { logMonitor } from '../utils/logger';

export interface AutotuneOptions {
	autotuneEnabled: boolean;
	maxCoreVoltage: number;
	voltageMap: VoltageEntry[];
}

export class MonitorService {
	private client: BitaxeClient;
	private settings: Settings;
	private state: MonitorState;
	private store: DataStore;
	private intervalId: NodeJS.Timeout | null = null;
	private iteration = 0;
	private applyChange = true;
	private changeMessage = '';

	private asicTemps: number[] = [];
	private vrTemps: number[] = [];

	private maxStepUp = 10;
	private secondsBetweenPasses = 1;
	private stepUpEveryXPasses = 3; // actually 4
	private stepDownEveryXPasses = 2; // actually 3
	private stabilisedCounterDefault = 15;
	private drasticMeasureDelay = 3;

	private maxSweepSteps = 24;
	private getMinStepDown(): number {
		return Math.floor((this.settings.maxFreq - 400) / 6.25) * -1;
	}
	private sweepIterations = 150;
	private sweepStabilisationTime = 20;
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

	private autotuneEnabled = false;
	private maxCoreVoltage = 1450;
	private initialMaxCoreVoltage = 1450;
	private voltageMap: Map<number, number> = new Map();
	private baselineVoltages: Map<number, number> = new Map();
	private stableLoopCount = 0;
	private lastStepDown = 0;
	private settleDelayCounter = 0;
	private autotuneIntervalCounts = 30;
	private currentTunedVoltage: number | null = null;
	private appliedCoreVoltage = 0;
	private autotuneFlipFlop: { voltage: number; toExpected: number; toExpectedDirection: number }[] = [];
	private flipFlopCount = 0;
	private bestToExpected = -Infinity;
	private bestVoltage = 0;

	constructor(settings: Settings, store: DataStore, autotuneOptions?: AutotuneOptions) {
		this.settings = settings;
		this.store = store;
		this.client = new BitaxeClient(settings.ip);

		if (autotuneOptions) {
			this.autotuneEnabled = autotuneOptions.autotuneEnabled;
			this.maxCoreVoltage = autotuneOptions.maxCoreVoltage;
			this.initialMaxCoreVoltage = autotuneOptions.maxCoreVoltage;
			for (const entry of autotuneOptions.voltageMap) {
				this.voltageMap.set(entry.frequency, entry.coreVoltage);
			}
		}

		this.state = {
			running: false,
			stabilise: true,
			sweepMode: false,
			stepDown: settings.stepDownDefault ?? -10,
			stepUpCounter: this.stepUpEveryXPasses,
			stepDownCounter: this.stepDownEveryXPasses,
			stabilisedCounter: this.stabilisedCounterDefault,
			reachedInitialTemp: false,
			lastFrequencyApplied: 0,
			lastCoreVoltageApplied: 0,
			drasticMeasureCounter: this.drasticMeasureDelay,
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
		this.applyChange = true;
		this.state.stepDown = this.settings.stepDownDefault ?? -10;
		this.state.stabilisedCounter = this.stabilisedCounterDefault;
		this.state.reachedInitialTemp = false;
		this.asicTemps = [];
		this.vrTemps = [];
		this.iteration = 0;
		this.minHashRate = 1000000000;
		this.maxHashRate = 0;

		this.runLoop();
	}

	stop(): void {
		this.state.running = false;
		if (this.intervalId) {
			clearTimeout(this.intervalId);
			this.intervalId = null;
		}
	}

	stabiliseOn(): void {
		this.state.stabilise = true;
		logMonitor(`[${this.iteration}] Stabilise enabled`);
	}

	stabiliseOff(): void {
		this.state.stabilise = false;
		logMonitor(`[${this.iteration}] Stabilise disabled`);
	}

	adjustFrequency(delta: number): void {
		const oldStepDown = this.state.stepDown;
		this.state.stepDown += delta;
		if (this.state.stepDown > this.maxStepUp) {
			this.state.stepDown = this.maxStepUp;
		}
		if (this.state.stepDown < this.getMinStepDown()) {
			this.state.stepDown = this.getMinStepDown();
		}
		this.applyChange = true;
		this.changeMessage=`[Manual] Step adjusted: ${oldStepDown} -> ${this.state.stepDown}`;
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
		this.state.stepDown = -this.maxSweepSteps;
		this.autoAdjustFreq = false;
		this.applyChange = true;
		this.sweepIterationsCounter = 0;
		this.sweepStartTime = new Date().toISOString();
		this.store.clearHashrange();
		this.changeMessage=`[Sweep] [1/1] Started: Step ${oldStepDown} -> ${this.state.stepDown}`;
		this.store.addEvent({
			type: 'sweep',
			message: '${this.changeMessage}',
			timestamp: new Date().toISOString(),
		});
	}

	stopSweep(): void {
		const oldStepDown = this.state.stepDown;
		this.state.sweepMode = false;
		this.state.stepDown = 0;
		this.autoAdjustFreq = true;
		this.applyChange = true;
		this.changeMessage=`[Sweep] [${this.sweepIterationsCounter}/${this.sweepIterations}] Stopped: Step ${oldStepDown} -> ${this.state.stepDown}`;
		this.store.addEvent({
			type: 'sweep',
			message: '${this.changeMessage}',
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
		this.iteration++;

		this.client.getSystemInfo().then((info) => {
			if (!info) {
				logMonitor(`[${this.iteration}] No data received from Bitaxe`);
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
			logMonitor(`[${this.iteration}] Failed to get system info: ${err}`);
			this.scheduleNext();
		});
	}

	private scheduleNext(): void {
		this.intervalId = setTimeout(() => this.runLoop(), this.secondsBetweenPasses * 1000);
	}

	private processReading(info: BitaxeSystemInfo): BitaxeStatus | null {
		const timestamp = new Date().toISOString();
		this.expectedHashRate = info.expectedHashrate;
		const expectedHashRate = info.expectedHashrate;

		if (this.applyChange) {
			this.applyBitaxeSettings();
			this.overallAverageHashRate = info.hashRate;
			this.overallAverageAsicTemp = info.temp;
			this.overallAverageVrTemp = info.vrTemp;
			this.overallAverageVoltage = (info.voltage / 1000) | 0;
			this.overallAveragePower = (info.power * 10) | 0 / 10;

			const existingRange = this.store.getHashrangeEntry(this.desiredFreq, this.settings.coreVoltage);
			if (existingRange) {
				this.minHashRate = existingRange.minHashRate;
				this.maxHashRate = existingRange.maxHashRate;
			} else {
				this.minHashRate = this.overallAverageHashRate;
				this.maxHashRate = this.overallAverageHashRate;
			}

			if (this.state.sweepMode) {
				this.waitForStabilization();
			}
		}

		if (info.temp > 30) {
			this.asicTemps.push(info.temp);
			this.vrTemps.push(info.vrTemp);
			if (this.asicTemps.length > 6) this.asicTemps.shift();
			if (this.vrTemps.length > 6) this.vrTemps.shift();
		}

		const avgAsicTemp = this.asicTemps.length > 0
			? this.asicTemps.reduce((a, b) => a + b, 0) / this.asicTemps.length
			: info.temp;
		const avgVrTemp = this.vrTemps.length > 0
			? this.vrTemps.reduce((a, b) => a + b, 0) / this.vrTemps.length
			: info.vrTemp;

		const history = this.store.getHistory();
		const filterVoltage = this.appliedCoreVoltage || this.settings.coreVoltage;
		const currentFreqHistory = history.filter(
			h => Math.abs(h.desiredFreq - this.desiredFreq) < 1 && h.coreVoltage2 === filterVoltage
		);

		if (currentFreqHistory.length > 0 && !this.applyChange) {
			this.overallAverageHashRate = this.average(currentFreqHistory.map(h => h.hashRate));
			this.overallAverageAsicTemp = this.average(currentFreqHistory.map(h => h.temp));
			this.overallAverageVrTemp = this.average(currentFreqHistory.map(h => h.vrTemp));
			this.overallAverageVoltage = this.average(currentFreqHistory.map(h => h.voltage));
			this.overallAveragePower = this.average(currentFreqHistory.map(h => h.power));
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

	private average(numbers: number[]): number {
		if (numbers.length === 0) return 0;
		return Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 100) / 100;
	}

	private runAutotune(): void {
		if (this.state.stepDown === this.lastStepDown) {
			this.stableLoopCount++;
		} else {
			this.lastStepDown = this.state.stepDown;
			this.stableLoopCount = 0;
			this.settleDelayCounter = this.autotuneIntervalCounts * 2;
			this.currentTunedVoltage = null;
			this.autotuneFlipFlop = [];
			this.flipFlopCount = 0;
			this.bestToExpected = -Infinity;
			this.bestVoltage = 0;
			return;
		}

		if (this.settleDelayCounter > 0) {
			this.settleDelayCounter--;
			return;
		}

		if (this.stableLoopCount < 20) {
			return;
		}

		const baseline = this.baselineVoltages.get(this.desiredFreq) ?? this.settings.coreVoltage;
		let currentVoltage = this.currentTunedVoltage ?? this.voltageMap.get(this.desiredFreq) ?? baseline;

		const toExpected = this.overallAverageHashRate > 0 && this.expectedHashRate > 0
			? (this.overallAverageHashRate / this.expectedHashRate) * 100 - 100
			: 0;

		if (toExpected > this.bestToExpected) {
			this.bestToExpected = toExpected;
			this.bestVoltage = currentVoltage;
		}

		const flipFlopEntry = { voltage: currentVoltage, toExpected, toExpectedDirection: 0 };
		const lastEntry = this.autotuneFlipFlop[this.autotuneFlipFlop.length - 1];

		const toExpectedDirection = toExpected > 0 ? 1 : -1;
		flipFlopEntry.toExpectedDirection = toExpectedDirection;

		if (lastEntry) {
			this.autotuneFlipFlop.push(flipFlopEntry);
			if (this.autotuneFlipFlop.length > 2) {
				this.autotuneFlipFlop.shift();
			}

			if (lastEntry.toExpectedDirection !== 0 && toExpectedDirection !== lastEntry.toExpectedDirection) {
				this.flipFlopCount++;
			}
		} else {
			this.autotuneFlipFlop.push(flipFlopEntry);
		}

		if (this.flipFlopCount >= 3) {
			currentVoltage = this.bestVoltage;
			this.currentTunedVoltage = currentVoltage;
			this.voltageMap.set(this.desiredFreq, currentVoltage);
			this.store.setVoltageForFrequency(this.desiredFreq, currentVoltage, this.bestToExpected, this.overallAverageHashRate);
			logMonitor(`[${this.iteration}] [Autotune] [${this.state.stepDown} @ ${this.desiredFreq.toFixed(2)}MHz]	toExpected=${this.bestToExpected.toFixed(2)}%		Flip-flop detected! Selected best ${currentVoltage}mV`);
			this.autotuneFlipFlop = [];
			this.flipFlopCount = 0;
			this.bestToExpected = -Infinity;
			this.bestVoltage = 0;
			this.stableLoopCount = 0;
			return;
		}

		if (toExpected < 0) {
			if (currentVoltage < this.maxCoreVoltage) {
				currentVoltage += 5;
				this.currentTunedVoltage = currentVoltage;
				this.voltageMap.set(this.desiredFreq, currentVoltage);
				this.applyChange = true;
				this.stableLoopCount = 0;
				this.settleDelayCounter = this.autotuneIntervalCounts * 2;
				logMonitor(`[${this.iteration}] [Autotune] [${this.state.stepDown} @ ${this.desiredFreq.toFixed(2)}MHz]	toExpected=${toExpected.toFixed(2)}%		Increasing voltage to ${currentVoltage}mV`);
			} else {
				currentVoltage = this.bestVoltage;
				this.currentTunedVoltage = currentVoltage;
				this.store.setVoltageForFrequency(this.desiredFreq, currentVoltage, this.bestToExpected, this.overallAverageHashRate);
				this.voltageMap.set(this.desiredFreq, currentVoltage);
				logMonitor(`[${this.iteration}] [Autotune] [${this.state.stepDown} @ ${this.desiredFreq.toFixed(2)}MHz]	toExpected=${this.bestToExpected.toFixed(2)}%		Max voltage reached, using best: ${currentVoltage}mV`);
				this.bestToExpected = -Infinity;
				this.bestVoltage = 0;
				this.stableLoopCount = 0;
			}
		} else if (currentVoltage > 700 && toExpected > 1) {
			currentVoltage -= 5;
			this.currentTunedVoltage = currentVoltage;
			this.voltageMap.set(this.desiredFreq, currentVoltage);
			this.applyChange = true;
			this.stableLoopCount = 0;
			this.settleDelayCounter = this.autotuneIntervalCounts * 2;
			logMonitor(`[${this.iteration}] [Autotune] [${this.state.stepDown} @ ${this.desiredFreq.toFixed(2)}MHz]	toExpected=${toExpected.toFixed(2)}%		Decreasing voltage to ${currentVoltage}mV`);
		} else {
			currentVoltage = this.bestVoltage;
			this.currentTunedVoltage = currentVoltage;
			this.store.setVoltageForFrequency(this.desiredFreq, currentVoltage, this.bestToExpected, this.overallAverageHashRate);
			this.voltageMap.set(this.desiredFreq, currentVoltage);
			logMonitor(`[${this.iteration}] [Autotune] [${this.state.stepDown} @ ${this.desiredFreq.toFixed(2)}MHz]	toExpected=${this.bestToExpected.toFixed(2)}%		Optimal found, using best: ${currentVoltage}mV`);
			this.bestToExpected = -Infinity;
			this.bestVoltage = 0;
			this.stableLoopCount = 0;
		}
	}

	private applyBitaxeSettings(): void {
		const stepFreq = this.state.stepDown * 6.25;
		this.desiredFreq = this.settings.maxFreq + stepFreq;

		if (!this.baselineVoltages.has(this.desiredFreq)) {
			this.baselineVoltages.set(this.desiredFreq, this.settings.coreVoltage);
		}

		let baseVoltage = this.voltageMap.get(this.desiredFreq) ?? this.settings.coreVoltage;

		if (this.currentTunedVoltage !== null && 
			Math.abs(this.desiredFreq - this.state.lastFrequencyApplied) < 1) {
			baseVoltage = this.currentTunedVoltage;
		}

		const hasTunedVoltage = this.voltageMap.has(this.desiredFreq);
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

		logMonitor(`[${this.iteration}] [BITAXE]   [${this.state.stepDown} @ ${this.desiredFreq.toFixed(2)}MHz] ${this.changeMessage!=="" ? ' '+this.changeMessage : ''} 		Applying: Voltage=${adjustedVoltage}mV`);
		this.changeMessage='';
		this.client.setSystemSettings(this.desiredFreq, adjustedVoltage);

		this.appliedCoreVoltage = adjustedVoltage;
		this.state.lastFrequencyApplied = this.desiredFreq;
		this.state.lastCoreVoltageApplied = adjustedVoltage;
		this.state.stepUpCounter = this.stepUpEveryXPasses;
		this.state.stepDownCounter = this.stepDownEveryXPasses;
		this.applyChange = false;
	}

	private waitForStabilization(): void {
		return;
	}

	private evaluateAndAdjust(status: BitaxeStatus): void {
		const fmaxAsic = this.settings.targetAsic + this.settings.asicTempTolerance;
		const fminAsic = this.settings.targetAsic - this.settings.asicTempTolerance;
		const fmaxVr = this.settings.maxVr;
		const emergencyOverheat = this.settings.targetAsic + 2;

		if (status.overheatMode) {
			this.changeMessage='Overheat mode detected!';
		}

		if (!this.state.stabilise) {
			if (status.temp > emergencyOverheat) {
				const oldStepDown = this.state.stepDown;
				this.state.stepDown--;
				if (this.state.stepDown < this.getMinStepDown()) {
					this.state.stepDown = this.getMinStepDown();
				}
				this.changeMessage=`[Stabilise] Emergency cooling:	${status.temp.toFixed(1)}°C > ${emergencyOverheat}°C	Step Down ${oldStepDown} -> ${this.state.stepDown}`;
				this.applyChange = true;
			}
			return;
		}

		if (status.avgVrTemp > fmaxVr && this.autoAdjustFreq) {
			this.state.stepDownCounter--;
			if (this.state.stepDownCounter < 0) {
				const oldStepDown = this.state.stepDown;
				this.state.stepDown--;
				if (this.state.stepDown < this.getMinStepDown()) {
					this.state.stepDown = this.getMinStepDown();
				}
				this.changeMessage=`[Stabilise] VR temp high:	${status.avgVrTemp.toFixed(1)}°C		Step Down ${oldStepDown} -> ${this.state.stepDown} `;
				this.applyChange = true;
				this.state.stepUpCounter = this.stepUpEveryXPasses;
				this.state.stepDownCounter = this.stepDownEveryXPasses;
			}

			if (this.autotuneEnabled && this.currentTunedVoltage !== null && this.currentTunedVoltage < this.maxCoreVoltage) {
				this.maxCoreVoltage = this.currentTunedVoltage;
				logMonitor(`[Autotune] VR temp exceeded maxVr (${fmaxVr}°C). Reducing maxCoreVoltage to ${this.maxCoreVoltage}mV`);
			}
		} else if (status.avgAsicTemp > fmaxAsic && this.autoAdjustFreq) {
			if (status.temp > emergencyOverheat) {
				if (this.state.drasticMeasureCounter >= this.drasticMeasureDelay) {
					const oldStepDown = this.state.stepDown;
					this.state.stepDown -= 10;
					if (this.state.stepDown < this.getMinStepDown()) {
						this.state.stepDown = this.getMinStepDown();
					}
					this.changeMessage = `[Stabilise] ASIC temp Critical:	${status.avgAsicTemp.toFixed(1)}°C	Drastic measures ${oldStepDown} -> ${this.state.stepDown} `;
					this.applyChange = true;
					this.state.drasticMeasureCounter = 0;
				} else {
					this.state.drasticMeasureCounter++;
				}
			} else {
				this.state.drasticMeasureCounter = 0;
				this.state.stepDownCounter--;
				if (this.state.stepDownCounter < 0) {
					const oldStepDown = this.state.stepDown;
					this.state.stepDown--;
					if (this.state.stepDown < this.getMinStepDown()) {
						this.state.stepDown = this.getMinStepDown();
					}
					this.changeMessage=`[Stabilise] ASIC temp high:	${status.avgAsicTemp.toFixed(1)}°C	Step Down ${oldStepDown} -> ${this.state.stepDown}`;
					this.applyChange = true;
				}
			}
			this.state.reachedInitialTemp = true;
		} else if (status.avgAsicTemp < fminAsic && this.autoAdjustFreq && this.state.reachedInitialTemp) {
			if (status.temp < this.settings.targetAsic) {
				if (this.state.stepDown < this.maxStepUp) {
					this.state.stepUpCounter--;
					if (this.state.stepUpCounter < 0) {
						const oldStepDown = this.state.stepDown;
						this.state.stepDown++;
						if (this.state.stepDown > this.maxStepUp) {
							this.state.stepDown = this.maxStepUp;
						} else {
							this.changeMessage=`[Stabilise] ASIC temp low:	${status.avgAsicTemp.toFixed(1)}°C	Step Up ${oldStepDown} -> ${this.state.stepDown}`;
							this.applyChange = true;
						}
					}
				}
			}
		}

		this.state.stabilisedCounter--;
		if (this.state.stabilisedCounter < 0) {
			this.state.reachedInitialTemp = true;
		}

		if (this.state.sweepMode) {
			this.sweepIterationsCounter++;
			if (this.sweepIterationsCounter === 1 || this.sweepIterationsCounter % 15 === 0 || this.sweepIterationsCounter >= this.sweepIterations) {
				logMonitor(`[Sweep] [${this.sweepIterationsCounter}/${this.sweepIterations}] Step ${this.state.stepDown} @ ${this.desiredFreq.toFixed(2)}MHz - To Expected: ${status.toExpected.toFixed(2)}% | Avg Hash: ${(this.overallAverageHashRate / 1e6).toFixed(2)} MH/s, ASIC: ${this.overallAverageAsicTemp.toFixed(1)}°C, VR: ${this.overallAverageVrTemp.toFixed(1)}°C, Voltage: ${this.overallAverageVoltage}mV, Power: ${this.overallAveragePower}W, Efficiency: ${status.efficiency.toFixed(2)} J/MH`);
			}
			if (this.sweepIterationsCounter >= this.sweepIterations) {
				if (this.state.stepDown >= 0) {
					this.stopSweep();
				} else {
					const oldStepDown = this.state.stepDown;
					this.state.stepDown++;
					this.sweepIterationsCounter = 0;
					this.changeMessage=`[Sweep] [${this.sweepIterationsCounter}/${this.sweepIterations}] Sweep increment: Step ${oldStepDown} -> ${this.state.stepDown}`;
					this.applyChange = true;
				}
			}
			if (this.sweepIterationsCounter >= 20) {
				this.saveHashrange();
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
