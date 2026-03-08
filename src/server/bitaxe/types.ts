export * from '../../both/types';

export interface AutotuneOptions {
	autotuneEnabled: boolean;
	maxCoreVoltage: number;
	voltageMap: import('../../both/types').VoltageEntry[];
	autotuneReversalThreshold?: number;
}
