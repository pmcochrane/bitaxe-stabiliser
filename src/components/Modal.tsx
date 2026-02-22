import { useState, useEffect } from 'react';

interface ModalProps {
	isOpen: boolean;
	title: string;
	message: string;
	type: 'confirm' | 'alert';
	onConfirm?: () => void;
	onCancel?: () => void;
}

export function Modal({ isOpen, title, message, type, onConfirm, onCancel }: ModalProps) {
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && isOpen) {
				onCancel?.();
			}
		};
		document.addEventListener('keydown', handleEscape);
		return () => document.removeEventListener('keydown', handleEscape);
	}, [isOpen, onCancel]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<div 
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onCancel}
			/>
			<div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6 border dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200">
				<h2 className="text-xl font-semibold mb-2 dark:text-white">{title}</h2>
				<p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
				
				<div className="flex justify-end gap-3">
					{type === 'confirm' ? (
						<>
							<button
								onClick={onCancel}
								className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={onConfirm}
								className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
							>
								Confirm
							</button>
						</>
					) : (
						<button
							onClick={onConfirm}
							className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
						>
							OK
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

export function useModal() {
	const [modalState, setModalState] = useState<{
		isOpen: boolean;
		title: string;
		message: string;
		type: 'confirm' | 'alert';
		onConfirm?: () => void;
	}>({
		isOpen: false,
		title: '',
		message: '',
		type: 'alert',
	});

	const showConfirm = (title: string, message: string): Promise<boolean> => {
		return new Promise((resolve) => {
			setModalState({
				isOpen: true,
				title,
				message,
				type: 'confirm',
				onConfirm: () => {
					setModalState(prev => ({ ...prev, isOpen: false }));
					resolve(true);
				},
			});
		});
	};

	const showAlert = (title: string, message: string): Promise<void> => {
		return new Promise((resolve) => {
			setModalState({
				isOpen: true,
				title,
				message,
				type: 'alert',
				onConfirm: () => {
					setModalState(prev => ({ ...prev, isOpen: false }));
					resolve();
				},
			});
		});
	};

	const closeModal = () => {
		setModalState(prev => ({ ...prev, isOpen: false }));
	};

	return { modalState, showConfirm, showAlert, closeModal };
}
