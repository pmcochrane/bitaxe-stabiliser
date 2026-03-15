import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketServer | null = null;

export interface LogMessage {
	timestamp: string;
	message: string;
	type: 'log' | 'monitor' | 'api' | 'client' | 'index';
}

const MAX_LOGS = 70;
const logBuffer: LogMessage[] = [];

export function initSocketServer(httpServer: HttpServer): SocketServer {
	io = new SocketServer(httpServer, {
		cors: {
			origin: '*',
		},
	});

	io.on('connection', (socket) => {
		socket.emit('logs', logBuffer);
	});

	return io;
}

export function getSocketServer(): SocketServer | null {
	return io;
}

export function addLog(message: string, type: LogMessage['type']): void {
	const log: LogMessage = {
		timestamp: new Date().toISOString(),
		message,
		type,
	};

	logBuffer.push(log);
	if (logBuffer.length > MAX_LOGS) {
		logBuffer.shift();
	}

	if (io) {
		io.emit('log', log);
	}
}

export function getLogs(): LogMessage[] {
	return [...logBuffer];
}

export function emitStatus(status: unknown): void {
	if (io) {
		io.emit('status', status);
	}
}
