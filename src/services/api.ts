import axios from 'axios';
import type { StatusResponse, Settings, ControlCommand, HistoryResponse, HistoryEntry } from '../types';

const api = axios.create({
	baseURL: '/api',
});

export async function getStatus(): Promise<StatusResponse> {
	const { data } = await api.get<StatusResponse>('/status');
	return data;
}

export async function getSettings(): Promise<Settings> {
	const { data } = await api.get<Settings>('/settings');
	return data;
}

export async function updateSettings(settings: Partial<Settings>): Promise<Settings> {
	const { data } = await api.put<Settings>('/settings', settings);
	return data;
}

export async function sendControl(command: ControlCommand): Promise<{ success: boolean }> {
	const { data } = await api.post<{ success: boolean }>('/control', command);
	return data;
}

export async function getHistory(page = 1, limit = 50, sort: 'asc' | 'desc' = 'desc'): Promise<HistoryResponse> {
	const { data } = await api.get<HistoryResponse>('/history', {
		params: { page, limit, sort },
	});
	return data;
}

export async function getHistoryGraph(hours = 24, since?: string): Promise<HistoryEntry[]> {
	const params: { hours: number; since?: string } = { hours };
	if (since) {
		params.since = since;
	}
	const { data } = await api.get<HistoryEntry[]>('/history/graph', {
		params,
	});
	return data;
}

export default api;
