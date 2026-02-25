import axios, { AxiosInstance, AxiosError } from 'axios';
import { BitaxeSystemInfo } from './types';
import { logClient } from '../utils/logger';

export class BitaxeClient {
	private client: AxiosInstance;
	private ip: string;
	private lastError: string = '';

	constructor(ip: string, port: number = 80) {
		this.ip = ip;
		this.client = axios.create({
			baseURL: `http://${ip}:${port}`,
			timeout: 10000,
		});
	}

	getLastError(): string {
		return this.lastError;
	}

	setIp(ip: string): void {
		this.ip = ip;
		this.client.defaults.baseURL = `http://${ip}`;
	}

	getIp(): string {
		return this.ip;
	}

	async getSystemInfo(): Promise<BitaxeSystemInfo | null> {
		try {
			const response = await this.client.get('/api/system/info');
			const data = response.data;

			return {
				hostname: data.hostname || '',
				ip: data.ip || this.ip,
				uptime: data.uptime || 0,
				freeHeap: data.freeHeap || 0,
				coreVoltage: data.coreVoltage || 0,
				frequency: data.frequency || 0,
				hashRate: data.hashRate || 0,
				expectedHashrate: data.expectedHashrate || 0,
				temp: data.temp || 0,
				vrTemp: data.vrTemp || 0,
				power: data.power || 0,
				voltage: data.voltage || 0,
				overheatMode: data.overheatMode || false,
				board: data.board || '',
				fanSpeed: data.fanSpeed || 0,
				fanRpm: data.fanRpm || 0,
			};
		} catch (error) {
			this.setConnectionError(error);
			return null;
		}
	}

	private setConnectionError(error: unknown): void {
		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError;
			const hasNetwork = this.checkNetworkConnectivity();
			const networkStatus = hasNetwork ? 'OK' : 'NO NETWORK';
			
			if (axiosError.code === 'ECONNABORTED') {
				this.lastError = `Connection timed out. Server network: ${networkStatus}`;
			} else if (axiosError.code === 'ECONNREFUSED') {
				this.lastError = `Connection refused. Server network: ${networkStatus}`;
			} else if (axiosError.code === 'ENOTFOUND') {
				this.lastError = `DNS lookup failed. Server network: ${networkStatus}`;
			} else if (axiosError.code === 'ETIMEDOUT') {
				this.lastError = `Connection timed out. Server network: ${networkStatus}`;
			} else if (axiosError.code === 'EHOSTUNREACH') {
				this.lastError = `Host unreachable. Server network: ${networkStatus}`;
			} else {
				this.lastError = `${axiosError.message}. Server network: ${networkStatus}`;
			}
			logClient(`${this.lastError} (${this.ip})`);
		} else {
			this.lastError = `Unknown error: ${error}`;
			logClient(this.lastError);
		}
	}

	private checkNetworkConnectivity(): boolean {
		const { networkInterfaces } = require('os');
		const nets = networkInterfaces();
		
		for (const name of Object.keys(nets)) {
			for (const net of nets[name] || []) {
				if (net.family === 'IPv4' && !net.internal) {
					return true;
				}
			}
		}
		return false;
	}

	async setSystemSettings(frequency: number, coreVoltage: number): Promise<boolean> {
		try {
			await this.client.patch('/api/system', {
				frequency,
				coreVoltage,
			});
			return true;
		} catch (error) {
			logClient(`Failed to set system settings on ${this.ip}: ${error}`);
			return false;
		}
	}

	async isReachable(): Promise<boolean> {
		try {
			await this.client.get('/api/system/info', { timeout: 1000 });
			return true;
		} catch {
			return false;
		}
	}
}
