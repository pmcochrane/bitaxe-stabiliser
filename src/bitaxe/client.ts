import axios, { AxiosInstance } from 'axios';
import { BitaxeSystemInfo } from './types';

export class BitaxeClient {
	private client: AxiosInstance;
	private ip: string;

	constructor(ip: string, port: number = 80) {
		this.ip = ip;
		this.client = axios.create({
			baseURL: `http://${ip}:${port}`,
			timeout: 10000,
		});
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
			console.error(`Failed to get system info from ${this.ip}:`, error);
			return null;
		}
	}

	async setSystemSettings(frequency: number, coreVoltage: number): Promise<boolean> {
		try {
			await this.client.patch('/api/system', {
				frequency,
				coreVoltage,
			});
			return true;
		} catch (error) {
			console.error(`Failed to set system settings on ${this.ip}:`, error);
			return false;
		}
	}

	async isReachable(): Promise<boolean> {
		try {
			await this.client.get('/api/system/info', { timeout: 3000 });
			return true;
		} catch {
			return false;
		}
	}
}
