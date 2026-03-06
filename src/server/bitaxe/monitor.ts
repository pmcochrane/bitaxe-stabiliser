import { BitaxeClient } from './client';
import { BitaxeStatus, HistoryEntry, Settings, MonitorState, BitaxeSystemInfo, VoltageEntry } from './types';
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
	private stableHashRates: number[] = [];

	private maxStepUp = 10;
	private secondsBetweenPasses = 1;
	private autotuneVoltageEveryXcycles = 5;	// Autotune by voltage adjusts every 5 cycles
	private maxCoreVoltage = 1450;
	private initialMaxCoreVoltage = 1450;

	private minHashRate = 1000000000;
	private maxHashRate = 0;
	private overallAverageHashRate = 0;
	private stableAverageHashRate = 0;
	private overallAverageAsicTemp = 0;
	private overallAverageVrTemp = 0;
	private overallAverageVoltage = 0;
	private overallAveragePower = 0;
	private expectedHashRate = 0;
	private desiredFreq = 0;
	
	private autotuneEnabled = true;
	private autotuneStrategy: AutotuneStrategy = 'byVoltage'; //'hashrate';
	private autotuneIncreasedVoltageCounter: number = 0;
	private autotuneStableCount: number = 0;
	private autotuneSettleDelayCounter = 0;
	private autotunePreventIncreaseDelayCounter = 0; 
	private autotunePreventDecreaseDelayCounter = 0;
	private voltageMap: Map<number, number> = new Map();
	private baselineVoltages: Map<number, number> = new Map();
	private currentTunedVoltage: number | null = null;
	private appliedCoreVoltage = 0;

	private expectationMessageCount = 0;
	private lastExpectationMessage = '';

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
		// if (this.autotuneIncreasedVoltageCounter > 0) {
		// 	this.reduceStoredVoltage(logPrefix, this.desiredFreq, oldStepDown);
		// } else {
		// 	this.logMon(`${logPrefix} Voltage was not recently increased so leaving as is`);
		// }
		this.autotuneStableCount = 0;
		this.autotuneSettleDelayCounter = this.autotuneVoltageEveryXcycles;
		this.autotunePreventIncreaseDelayCounter = 0;

		this.applyChange = true;
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
		this.autotuneStrategy = 'byVoltage';
		
		// Start with a delay on allowing voltage increases to prevent autotune from immediately increasing voltage on startup before it has had a chance to measure the effect of the default settings
		this.autotunePreventIncreaseDelayCounter  = this.autotuneVoltageEveryXcycles*5; 

		this.state = {
			running: false,
			stabilise: false,
			stepDown: settings.stepDownDefault ?? -10,
			stepUpCounter: 0,
			stepDownCounter: 0,
			lastFrequencyApplied: 0,
			lastCoreVoltageApplied: 0,
			drasticMeasureCounter: 0,
			stepDownSettleCounter: 0,
			changeFrequencyMode: false,
			changeFrequencyDirection: 'up',
			preFrequencyChangeToExpected: 0,
			preFrequencyChangeHashRate: 0,
			preFrequencyChangeStepDown: 0,
		};
	}

	updateSettings(settings: Partial<Settings>): void {
		this.logMon(`[UI       ] -------------------------------------------------------------`);
		this.logMon(`[UI       ] Updating settings:`);
		if (settings.ip && settings.ip !== this.settings.ip) {
			this.client.setIp(settings.ip);
		}
		this.settings = { ...this.settings, ...settings };

		if (settings.maxCoreVoltage !== undefined) {
			this.maxCoreVoltage = Math.min(settings.maxCoreVoltage, this.initialMaxCoreVoltage);
		}

		if (settings.maxFreq !== undefined || settings.coreVoltage !== undefined) {
			const newFrequency = settings.maxFreq ?? this.settings.maxFreq;
			const newCoreVoltage = settings.coreVoltage ?? this.settings.coreVoltage;
			if (this.appliedCoreVoltage!==newCoreVoltage) {
				this.logMon(`[UI       ] Core voltage updated: ${this.appliedCoreVoltage}mV -> ${newCoreVoltage}mV`);
				this.appliedCoreVoltage = newCoreVoltage;
			}
			if (this.desiredFreq !== newFrequency) {	
				this.logMon(`[UI       ] Frequency updated: ${this.desiredFreq}MHz -> ${newFrequency}MHz`);
				this.desiredFreq = newFrequency;
			}
			this.client.setSystemSettings(newFrequency, newCoreVoltage);
			this.voltageMap.set(this.desiredFreq, newCoreVoltage);
			this.applyChange = true;
			this.logMon(`[UI       ] -------------------------------------------------------------`);
			
			if (this.intervalId) {	clearTimeout(this.intervalId); }	
			this.intervalId = setTimeout(() => this.runLoop(), 0); // Apply new settings immediately
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

	getClient(): BitaxeClient {
		return this.client;
	}

	start(): void {
		if (this.state.running) return;

		this.state.running = true;
		this.changeMessage = 'Starting monitor service...';
		this.applyChange = true;
		this.state.stepDown = this.settings.stepDownDefault ?? -10;
		this.autotuneSettleDelayCounter = 0;
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

	async resetToDefaults(): Promise<void> {
		this.logMon(`Resetting Bitaxe to defaults: ${this.settings.maxFreq}MHz @ ${this.settings.coreVoltage}mV`);
		await this.client.setSystemSettings(this.settings.maxFreq, this.settings.coreVoltage);
	}

	private logMon(message: string, continueLine?: boolean): void {
		if (!!continueLine) {
			logMonitor(`${message}`, continueLine);
		} else {
			logMonitor(`[${this.iteration}] [${this.state.stepDown}: ${this.desiredFreq.toFixed(2)}MHz @ ${this.appliedCoreVoltage}mv] `
				+`[${this.overallAverageAsicTemp.toFixed(1)}°C ${this.overallAverageVrTemp.toFixed(1)}°C ${this.overallAveragePower.toFixed(1)}W`
				+` ${(this.stableAverageHashRate>0 
						? (this.stableAverageHashRate/1000).toFixed(3)+"TH/s"
						: (this.overallAverageHashRate/1000).toFixed(3)+"TH/s*")}] `
				+`	${message}`, 
				continueLine);
		}
	}

	stabiliseOn(): void {
		this.state.stabilise = true;
		this.logMon('[UI] Automated Stabilisation enabled');
	}

	stabiliseOff(): void {
		this.state.stabilise = false;
		this.logMon('[UI] Automated Stabilisation disabled');
	}

	adjustStep(delta: number): void {
		const oldStepDown = this.state.stepDown;
		this.logMon(`[UI       ] -------------------------------------------------------------`);
		this.alterStepDownValue(delta, "[UI       ]");
		this.logMon(`[UI       ] Step adjusted: ${oldStepDown}->${this.state.stepDown}`);
		this.store.addEvent({
			type: 'control',
			message: `Stepdown adjusted by ${delta}: ${this.changeMessage}`,
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
						// this.evaluateAndAdjust(status);
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

			this.minHashRate = this.overallAverageHashRate;
			this.maxHashRate = this.overallAverageHashRate;
		}

		if (info.temp > 5) {
			this.asicTemps.push(info.temp);
			this.vrTemps.push(info.vrTemp);
			this.voltages.push(info.voltage);
			this.powers.push(info.power);
			this.hashRates.push(info.hashRate);
			if (this.asicTemps.length > 5) this.asicTemps.shift();
			if (this.vrTemps.length > 5) this.vrTemps.shift();
			if (this.voltages.length > 5) this.voltages.shift();
			if (this.powers.length > 5) this.powers.shift();
			if (this.hashRates.length > 50) this.hashRates.shift();
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

	private runAutotune(): void {
		if (this.autotuneStrategy === 'byVoltage') {
			this.runAutotuneByVoltage();
		}
	}

	// Auto tune strategy: adjust coreVoltage on a set frequency to align ASIC and VR temperatures with target values, while also considering the hashrate performance relative to expected. 
	// This strategy is designed to find the optimal voltage for a given frequency that keeps temperatures in check while maximizing hashrate.
	private runAutotuneByVoltage(): void {
		// Decrement the prevent further voltage increase counter if required
		if (this.autotunePreventIncreaseDelayCounter > 0) {
			this.autotunePreventIncreaseDelayCounter--;
		}
		// Decrement the prevent further voltage decrease counter if required
		if (this.autotunePreventDecreaseDelayCounter > 0) {
			this.autotunePreventDecreaseDelayCounter--;
		}

		// Only run autotune every X cycles to allow time for changes to take effect and be measured
		if (this.autotuneSettleDelayCounter > 0) {
			this.autotuneSettleDelayCounter--;
			return;
		}
		this.autotuneSettleDelayCounter = this.autotuneVoltageEveryXcycles-1;

		const fmaxAsic = this.settings.targetAsic + this.settings.asicTempTolerance;
		const fminAsic = this.settings.targetAsic - this.settings.asicTempTolerance;
		const fmaxVr = this.settings.maxVr;
		const asicDiff= this.overallAverageAsicTemp - this.settings.targetAsic;
		const vrDiff = this.overallAverageVrTemp - fmaxVr;


		const currentVoltage = this.currentTunedVoltage ?? this.appliedCoreVoltage ?? this.settings.coreVoltage;
		let newVoltage = currentVoltage;
		let voltageChanged = false;

		// Calculate how far we are from the expected hashrate as a percentage, to use as context in decision making and logging
		const toExpected = this.stableAverageHashRate > 0 && this.expectedHashRate > 0
			? (this.stableAverageHashRate / this.expectedHashRate) * 100 - 100
			: ((this.overallAverageHashRate||0) / this.expectedHashRate) * 100 - 100;
		const toExpectedString= ` [exp:${toExpected.toFixed(1)}%${this.stableAverageHashRate===0 ? '*]' : '] '} 	`;

		// Decide if we have hit point to consider changing frequency based on how far we are from expected hashrate, 
		// but only if we have been stable for at least 20 cycles to allow time for accurate measurement and prevent overreacting to temporary fluctuations
		let expectationMessage = '';
		const stableForLongEnough = this.autotuneStableCount >= 10;
		if (toExpected >= 1 && stableForLongEnough) {
			expectationMessage = '	-> Over Expectations';
		} else if (toExpected <= -1 && stableForLongEnough) {
			expectationMessage = '	<- Under Expectations';
		} else if (stableForLongEnough) {
			expectationMessage = '	No Change Required';
		}

		let modeIndicator = this.state.changeFrequencyMode ? '[FREQ-CHG] ' : '';

		let saveStatsToVoltagesJson = "";
		if (this.overallAverageVrTemp > fmaxVr) {
			if (this.autotunePreventDecreaseDelayCounter === 0) {
				newVoltage = Math.max(700, currentVoltage - 10);
				this.logMon(`[Autotune-]${modeIndicator}${toExpectedString}VR High	${vrDiff.toFixed(2)}°C	Reducing `);
				voltageChanged = true;
				this.autotunePreventIncreaseDelayCounter = this.autotuneVoltageEveryXcycles*6;		// prevent increasing voltage again to allow change to take effect and be averaged out
				this.autotunePreventDecreaseDelayCounter = this.autotuneVoltageEveryXcycles*2;		// prevent decreasing voltage again to allow change to take effect and be averaged out
				this.autotuneStableCount = 0;
				this.stableHashRates = [];
				// this.exitFrequencyChangeMode();	// New freq is overheating VR so exit frequency change mode

			} else {
				this.logMon(`[Blocked  ]${modeIndicator}${toExpectedString}VR High	${vrDiff.toFixed(2)}°C	---------- ${this.autotunePreventDecreaseDelayCounter} cycles until next decrease allowed`);
				this.autotuneStableCount = 0;
				this.stableHashRates = [];
			}

		} else if (this.overallAverageAsicTemp > fmaxAsic) {
			if (this.autotunePreventDecreaseDelayCounter === 0) {
				newVoltage = Math.max(700, currentVoltage - 5);
				this.logMon(`[Autotune-]${modeIndicator}${toExpectedString}ASIC High	${asicDiff.toFixed(2)}°C	Reducing `);
				voltageChanged = true;
				this.autotunePreventIncreaseDelayCounter = this.autotuneVoltageEveryXcycles*6;		// prevent increasing voltage again to allow change to take effect and be averaged out
				this.autotunePreventDecreaseDelayCounter = this.autotuneVoltageEveryXcycles*2;		// prevent decreasing voltage again to allow change to take effect and be averaged out
				this.autotuneStableCount = 0;
				this.stableHashRates = [];
				// this.exitFrequencyChangeMode(); // New freq is too hot so exit frequency change mode 

			} else {
				this.logMon(`[Blocked  ]${modeIndicator}${toExpectedString}ASIC High	${asicDiff.toFixed(2)}°C	---------- ${this.autotunePreventDecreaseDelayCounter} cycles until next decrease allowed`);
				this.autotuneStableCount = 0;
				this.stableHashRates = [];
			}

		} else if (this.overallAverageAsicTemp < fminAsic) {
			if (this.autotunePreventIncreaseDelayCounter === 0) {
				newVoltage = Math.min(this.maxCoreVoltage, currentVoltage + 5);
				this.logMon(`[Autotune+]${modeIndicator}${toExpectedString}ASIC Low	${asicDiff.toFixed(2)}°C	Increasing`);
				voltageChanged = true;
				this.autotunePreventIncreaseDelayCounter = this.autotuneVoltageEveryXcycles*6;	// prevent increasing voltage again to allow change to take effect and be averaged out
				this.autotuneStableCount = 0;
				this.stableHashRates = [];
			} else {	
				this.logMon(`[Blocked  ]${modeIndicator}${toExpectedString}ASIC Low	${asicDiff.toFixed(2)}°C	---------- ${this.autotunePreventIncreaseDelayCounter} cycles until next increase allowed`);
				this.autotuneStableCount = 0;
				this.stableHashRates = [];
			}
		} else {
			if (this.autotunePreventIncreaseDelayCounter === 0) {
				this.autotuneStableCount++;
				this.stableHashRates.push(this.overallAverageHashRate);
				saveStatsToVoltagesJson = this.autotuneStableCount%5===0 ? '*' : '';

				// stable for long enough so check for if freq change is required
				if (stableForLongEnough) {
					if (expectationMessage === this.lastExpectationMessage && this.lastExpectationMessage !== '') {
						this.expectationMessageCount++;
					} else {
						this.expectationMessageCount = 1;
						this.lastExpectationMessage = expectationMessage;
					}
				}

				if (!this.state.changeFrequencyMode) {
					if (this.expectationMessageCount>=10 && expectationMessage!=='') {
						// Enter frequency change mode
						this.logMon(`------------------------------------------------------------------------------------------`, false);
						this.logMon(`[Autotune  ]${modeIndicator}${toExpectedString}Stable but ${expectationMessage.trim()} for 10 cycles - entering frequency change mode`, true);
						this.state.preFrequencyChangeToExpected = toExpected;
						this.state.preFrequencyChangeHashRate = this.stableAverageHashRate;
						this.state.preFrequencyChangeStepDown = this.state.stepDown;
						this.state.changeFrequencyMode = true;

						const directionText = this.state.changeFrequencyDirection==='up' ? 'UP (+1)' : 'DOWN (-1)';
						this.logMon(`[Autotune  ]${modeIndicator}${toExpectedString}Entering frequency change mode: Storing:	toExpected=${this.state.preFrequencyChangeToExpected.toFixed(2)}% 	Step=${this.state.preFrequencyChangeStepDown}	Direction=${directionText}`);

						this.alterStepDownValue((this.state.changeFrequencyDirection==='up' ? 1 : -1), '[FREQ-CHG]');
					}
					this.logMon(`[Stable   ]${modeIndicator}${toExpectedString}Temps OK	${asicDiff.toFixed(2)}°C	${this.autotuneStableCount>=10 ? 'Stable' : 'Stablising'} for ${this.autotuneStableCount}${saveStatsToVoltagesJson}${expectationMessage}`);
				
				} else {	// We have already changed frequency and are now assessing the effect, so calculate the new stable to expected and compare to before the frequency change to see if it was an improvement or not
					const modeIndicator = '[FREQ-CHG] ';
						this.logMon(`[Stable   ]${modeIndicator}${toExpectedString}Temps OK	${asicDiff.toFixed(2)}°C	${this.autotuneStableCount>=10 ? 'Stable' : 'Stablising'} for ${this.autotuneStableCount}${saveStatsToVoltagesJson}${expectationMessage} (${this.expectationMessageCount})`);

					if (this.expectationMessageCount>=10 && expectationMessage!=='') {
						const previousDistanceFromZero = Math.abs(this.state.preFrequencyChangeToExpected);
						const currentDistanceFromZero = Math.abs(toExpected);
						if (currentDistanceFromZero <= previousDistanceFromZero) {
							// New frequency is better or equal to previous frequency & stable so keep it and exit frequency change mode
							this.logMon(`[Stable   ]${modeIndicator}${toExpectedString}IMPROVED toExpected at new frequency: toExpected ${this.state.preFrequencyChangeToExpected.toFixed(2)}% -> ${toExpected.toFixed(2)}%. Exiting frequency change mode.`);
							this.logMon(`------------------------------------------------------------------------------------------`, false);
							this.exitFrequencyChangeMode();

						} else {
							// New frequency is worse than previous frequency so revert back to previous frequency and exit frequency change mode
							this.logMon(`[Stable   ]${modeIndicator}${toExpectedString}WORSE toexpected at new frequency: toExpected ${this.state.preFrequencyChangeToExpected.toFixed(2)}% -> ${toExpected.toFixed(2)}%. Reversing direction & back to previous frequency.`);
							this.state.changeFrequencyDirection = this.state.changeFrequencyDirection==='up' ? 'down' : 'up';
							this.alterStepDownValue((this.state.changeFrequencyDirection==='up' ? 1 : -1), '[FREQ-CHG]');
							this.logMon(`------------------------------------------------------------------------------------------`, false);
							this.exitFrequencyChangeMode();
						}
					} else {
					}
				}

			} else {
				this.logMon(`[Blocked  ]${toExpectedString}Temps OK	${asicDiff.toFixed(2)}°C	---------- ${this.autotunePreventIncreaseDelayCounter} cycles until next increase allowed`);
			}
		}

		// Calculate the stable average hashrate over the last X readings
		if (this.stableHashRates.length > 50) this.stableHashRates.shift();
		if (this.stableHashRates.length > 0) {
			this.stableAverageHashRate = this.stableHashRates.reduce((a, b) => a + b, 0) / this.stableHashRates.length;
		} else {
			this.stableAverageHashRate = 0;
		}

		// Save stats if required
		if (saveStatsToVoltagesJson!=='') { // Store stable values to voltage.json for recall
			this.store.setVoltageForFrequency(this.desiredFreq, currentVoltage, toExpected, 
				this.stableAverageHashRate, // this.overallAverageHashRate, 
				this.overallAverageAsicTemp, 
				this.overallAverageVrTemp, 
				this.overallAveragePower, 
				(this.overallAveragePower * 1000) / (this.stableAverageHashRate || 1));
		}

		if (voltageChanged && newVoltage !== currentVoltage) {
			this.currentTunedVoltage = newVoltage;
			this.voltageMap.set(this.desiredFreq, newVoltage);
		}
		this.applyChange = true;
	}

	// Turn off frequency change mode and reset related state variables to prepare for next time we may need to enter frequency change mode.
	private exitFrequencyChangeMode(): void {
		this.state.changeFrequencyMode = false;
		this.lastExpectationMessage = '';
	}

	// Apply settings to Bitaxe based on current desired frequency and voltage, which are determined by the stepDown value and autotune adjustments. 
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

		if (this.changeMessage !== '') {
			this.logMon(`[BITAXE   ] ${this.changeMessage}\tApplying voltage: ${adjustedVoltage}mV ${voltageSource}`);
		} else {
			this.logMon(`\tApplying voltage: ${adjustedVoltage}mV ${voltageSource}`, true);
		}
	
		this.changeMessage = '';
		this.client.setSystemSettings(this.desiredFreq, adjustedVoltage);

		this.appliedCoreVoltage = adjustedVoltage;
		this.state.lastCoreVoltageApplied = adjustedVoltage;
		this.state.lastFrequencyApplied = this.desiredFreq;
		this.applyChange = false;
	}

}
