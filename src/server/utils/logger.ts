import { addLog } from './socket';

export function timestamp(): string {
	return new Date().toISOString();
}

export function log(message: string): void {
	const fullMessage = `[${timestamp()}] ${message}`;
	console.log(fullMessage);
	addLog(message, 'log');
}

export function logMonitor(message: string, continueLine?: boolean): void {
	const fullMessage = !!continueLine 
		? message 
		: `\n[${timestamp()}] [monitor.ts] ${message}`;
	
	process.stdout.write(fullMessage);
	if (!continueLine) {
		addLog(message, 'monitor');
	}
}

export function logIndex(message: string): void {
	log(`[index.ts] ${message}`);
}

export function logApi(message: string): void {
	log(`[api.ts] ${message}`);
}

export function logClient(message: string): void {
	log(`[client.ts] ${message}`);
}

export function logUi(...args: unknown[]): void {
	// console.log(...args);
}

