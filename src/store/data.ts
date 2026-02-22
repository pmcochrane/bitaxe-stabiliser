import * as fs from 'fs';
import * as path from 'path';
import { HistoryEntry, Settings, HashrangeEntry } from '../bitaxe/types';

interface StoreData {
	settings: Settings;
	history: HistoryEntry[];
	hashrange: HashrangeEntry[];
	events: StoreEvent[];
}

interface StoreEvent {
	type: string;
	message: string;
	timestamp: string;
}

export class DataStore {
	private data: StoreData;
	private historyFile: string;
	private hashrangeFile: string;
	private eventsFile: string;
	private settingsFile: string;
	private maxHistoryEntries: number;

	constructor(
		settingsFile: string,
		historyFile: string,
		hashrangeFile: string,
		eventsFile: string,
		maxHistoryEntries: number = 172800
	) {
		this.settingsFile = settingsFile;
		this.historyFile = historyFile;
		this.hashrangeFile = hashrangeFile;
		this.eventsFile = eventsFile;
		this.maxHistoryEntries = maxHistoryEntries;

		this.data = {
			settings: this.loadSettings(),
			history: this.loadHistory(),
			hashrange: this.loadHashrange(),
			events: this.loadEvents(),
		};

		this.pruneHistory();
	}

	private loadSettings(): Settings {
		try {
			if (fs.existsSync(this.settingsFile)) {
				const content = fs.readFileSync(this.settingsFile, 'utf-8');
				return JSON.parse(content);
			}
		} catch (error) {
			console.error('Failed to load settings:', error);
		}
		return {
			ip: '',
			hostname: '',
			targetAsic: 70,
			maxVr: 93,
			coreVoltage: 1245,
			maxFreq: 924.5,
			maxHistoryEntries: 172800,
		};
	}

	private loadHistory(): HistoryEntry[] {
		try {
			if (fs.existsSync(this.historyFile)) {
				const content = fs.readFileSync(this.historyFile, 'utf-8');
				return JSON.parse(content);
			}
		} catch (error) {
			console.error('Failed to load history:', error);
		}
		return [];
	}

	private loadHashrange(): HashrangeEntry[] {
		try {
			if (fs.existsSync(this.hashrangeFile)) {
				const content = fs.readFileSync(this.hashrangeFile, 'utf-8');
				return JSON.parse(content);
			}
		} catch (error) {
			console.error('Failed to load hashrange:', error);
		}
		return [];
	}

	private loadEvents(): StoreEvent[] {
		try {
			if (fs.existsSync(this.eventsFile)) {
				const content = fs.readFileSync(this.eventsFile, 'utf-8');
				return JSON.parse(content);
			}
		} catch (error) {
			console.error('Failed to load events:', error);
		}
		return [];
	}

	saveSettings(settings: Settings): void {
		this.data.settings = settings;
		this.maxHistoryEntries = settings.maxHistoryEntries || 172800;
		try {
			fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2));
		} catch (error) {
			console.error('Failed to save settings:', error);
		}
	}

	getSettings(): Settings {
		return { ...this.data.settings };
	}

	getHistory(): HistoryEntry[] {
		return [...this.data.history];
	}

	getLastNHistory(n: number): HistoryEntry[] {
		return this.data.history.slice(-n);
	}

	getHistorySince(hoursAgo: number): HistoryEntry[] {
		const cutoff = new Date();
		cutoff.setHours(cutoff.getHours() - hoursAgo);
		const cutoffTime = cutoff.getTime();
		return this.data.history.filter((entry) => new Date(entry.timestamp).getTime() >= cutoffTime);
	}

	getHistoryPage(page: number, limit: number, sortDesc: boolean = true): {
		data: HistoryEntry[];
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	} {
		const start = (page - 1) * limit;
		let sorted = [...this.data.history];
		if (sortDesc) {
			sorted.reverse();
		}
		const data = sorted.slice(start, start + limit);
		return {
			data,
			total: this.data.history.length,
			page,
			limit,
			totalPages: Math.ceil(this.data.history.length / limit),
		};
	}

	addHistoryEntry(entry: HistoryEntry): void {
		this.data.history.push(entry);
		this.pruneHistory();
		this.saveHistoryDebounced();
	}

	private pruneHistory(): void {
		const maxEntries = this.maxHistoryEntries;
		if (this.data.history.length > maxEntries) {
			this.data.history = this.data.history.slice(-maxEntries);
		}
	}

	private saveHistoryTimeout: NodeJS.Timeout | null = null;

	private saveHistoryDebounced(): void {
		if (this.saveHistoryTimeout) {
			clearTimeout(this.saveHistoryTimeout);
		}
		this.saveHistoryTimeout = setTimeout(() => this.saveHistory(), 1000);
	}

	saveHistory(): void {
		try {
			fs.writeFileSync(this.historyFile, JSON.stringify(this.data.history));
		} catch (error) {
			console.error('Failed to save history:', error);
		}
	}

	clearHistory(): void {
		this.data.history = [];
		this.saveHistory();
	}

	getHashrange(): HashrangeEntry[] {
		return [...this.data.hashrange];
	}

	getHashrangeEntry(frequency: number, coreVoltage: number): HashrangeEntry | undefined {
		return this.data.hashrange.find(
			e => Math.abs(e.frequency - frequency) < 1 && e.coreVoltage === coreVoltage
		);
	}

	setHashrangeEntry(entry: HashrangeEntry): void {
		const existing = this.data.hashrange.findIndex(
			e => Math.abs(e.frequency - entry.frequency) < 1 && e.coreVoltage === entry.coreVoltage
		);
		if (existing >= 0) {
			this.data.hashrange[existing] = entry;
		} else {
			this.data.hashrange.push(entry);
		}
		this.data.hashrange.sort((a, b) => {
			if (a.frequency !== b.frequency) return a.frequency - b.frequency;
			return a.coreVoltage - b.coreVoltage;
		});
		this.saveHashrange();
	}

	saveHashrange(): void {
		try {
			fs.writeFileSync(this.hashrangeFile, JSON.stringify(this.data.hashrange, null, 2));
		} catch (error) {
			console.error('Failed to save hashrange:', error);
		}
	}

	clearHashrange(): void {
		this.data.hashrange = [];
		this.saveHashrange();
	}

	addEvent(event: StoreEvent): void {
		this.data.events.push(event);
		if (this.data.events.length > 1000) {
			this.data.events = this.data.events.slice(-1000);
		}
		this.saveEvents();
	}

	getEvents(): StoreEvent[] {
		return [...this.data.events].reverse().slice(0, 100);
	}

	private saveEvents(): void {
		try {
			fs.writeFileSync(this.eventsFile, JSON.stringify(this.data.events, null, 2));
		} catch (error) {
			console.error('Failed to save events:', error);
		}
	}

	forceSave(): void {
		this.saveHistory();
		this.saveHashrange();
	}
}
