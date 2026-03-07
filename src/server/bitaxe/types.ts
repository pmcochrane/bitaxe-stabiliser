export * from '../../both/types';

export interface AutotuneOptions {
	autotuneEnabled: boolean;
	autotuneStrategy?: 'hashrate' | 'byVoltage';
	maxCoreVoltage: number;
	voltageMap: import('../../both/types').VoltageEntry[];
	autotuneReversalThreshold?: number;
}
