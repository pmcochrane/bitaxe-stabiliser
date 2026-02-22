import axios, { AxiosInstance, AxiosError } from 'axios';
import { BitaxeSystemInfo } from './types';
import { logClient } from '../utils/logger';

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
			this.logConnectionError(error);
			return null;
		}
	}

	private logConnectionError(error: unknown): void {
		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError;
			const hasNetwork = this.checkNetworkConnectivity();
			
			if (axiosError.code === 'ECONNABORTED') {
				logClient(`Connection to ${this.ip} timed out. Server network: ${hasNetwork ? 'OK' : 'NO NETWORK'}`);
			} else if (axiosError.code === 'ECONNREFUSED') {
				logClient(`Connection refused by ${this.ip}. Server network: ${hasNetwork ? 'OK' : 'NO NETWORK'}`);
			} else if (axiosError.code === 'ENOTFOUND') {
				logClient(`DNS lookup failed for ${this.ip}. Server network: ${hasNetwork ? 'OK' : 'NO NETWORK'}`);
			} else if (axiosError.code === 'ETIMEDOUT') {
				logClient(`Connection timed out to ${this.ip}. Server network: ${hasNetwork ? 'OK' : 'NO NETWORK'}`);
			} else if (axiosError.code === 'EHOSTUNREACH') {
				logClient(`Host unreachable ${this.ip}. Server network: ${hasNetwork ? 'OK' : 'NO NETWORK'}`);
			} else {
				logClient(`Failed to connect to ${this.ip}: ${axiosError.message}. Server network: ${hasNetwork ? 'OK' : 'NO NETWORK'}`);
			}
		} else {
			logClient(`Unknown error connecting to ${this.ip}: ${error}`);
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
			await this.client.get('/api/system/info', { timeout: 3000 });
			return true;
		} catch {
			return false;
		}
	}
}
