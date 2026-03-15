import { io, Socket } from 'socket.io-client';
import type { StatusResponse } from '../../both/types';

export interface LogMessage {
	timestamp: string;
	message: string;
	type: 'log' | 'monitor' | 'api' | 'client' | 'index';
}

type LogCallback = (log: LogMessage) => void;
type StatusCallback = (status: StatusResponse) => void;

class SocketService {
	private socket: Socket | null = null;
	private logCallbacks: LogCallback[] = [];
	private statusCallbacks: StatusCallback[] = [];
	private logs: LogMessage[] = [];

	connect(): void {
		if (this.socket?.connected) return;

		const wsUrl = window.location.origin;
		this.socket = io(wsUrl, {
			transports: ['websocket', 'polling'],
		});

		this.socket.on('connect', () => {
			console.log('WebSocket connected');
		});

		this.socket.on('disconnect', () => {
			console.log('WebSocket disconnected');
		});

		this.socket.on('log', (log: LogMessage) => {
			this.logs.push(log);
			if (this.logs.length > 70) {
				this.logs.shift();
			}
			this.logCallbacks.forEach(cb => cb(log));
		});

		this.socket.on('logs', (logs: LogMessage[]) => {
			this.logs = logs;
			logs.forEach(log => {
				this.logCallbacks.forEach(cb => cb(log));
			});
		});

		this.socket.on('status', (status: StatusResponse) => {
			this.statusCallbacks.forEach(cb => cb(status));
		});
	}

	disconnect(): void {
		this.socket?.disconnect();
		this.socket = null;
	}

	onLog(callback: LogCallback): () => void {
		this.logCallbacks.push(callback);
		return () => {
			this.logCallbacks = this.logCallbacks.filter(cb => cb !== callback);
		};
	}

	onStatus(callback: StatusCallback): () => void {
		this.statusCallbacks.push(callback);
		return () => {
			this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
		};
	}

	getLogs(): LogMessage[] {
		return [...this.logs];
	}
}

export const socketService = new SocketService();
