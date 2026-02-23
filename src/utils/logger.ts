export function timestamp(): string {
	return new Date().toISOString();
}

export function log(message: string): void {
	console.log(`[${timestamp()}] ${message}`);
}

export function logMonitor(message: string): void {
	log(`[monitor.ts] ${message}`);
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
	console.log(...args);
}

