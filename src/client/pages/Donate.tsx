import { useState } from 'react';
import { Modal } from '../components/Modal';

export default function Donate() {
	const address = 'bc1qna9cfhz6vuafp9vjkr5uvch7l82xgucdeejxtw';
	const [modalImage, setModalImage] = useState<{ src: string; title: string } | null>(null);

	const copyAddress = () => {
		if (navigator.clipboard) {
			navigator.clipboard.writeText(address);
			alert('Address copied to clipboard!');
		} else {
			prompt('Copy this Bitcoin address:', address);
		}
	};

	const openModal = (imageSrc: string, title: string) => {
		setModalImage({ src: imageSrc, title });
	};

	const closeModal = () => {
		setModalImage(null);
	};

	return (
		<div className="container mx-auto max-xl:max-w-full p-4 max-w-2xl">
			<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
				<h1 className="text-2xl font-bold mb-4 dark:text-white">
					Support Bitaxe Stabiliser
				</h1>

				<p className="text-gray-600 dark:text-gray-300 mb-6">
					If you find this software useful and would like to show your appreciation,
					any Bitcoin donations are greatly welcome. Thank you!
				</p>

				<div className="flex flex-col items-center gap-4">
					<button onClick={() => openModal(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${address}`, 'Bitcoin Address')}>
						<img
							src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}`}
							alt="Bitcoin QR Code"
							className="border-4 border-orange-500 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
						/>
					</button>

					<div className="w-full">
						<p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Bitcoin Address (on-chain):</p>
						<div className="flex gap-2">
							<input
								type="text"
								readOnly
								value={address}
								className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 dark:text-white rounded border dark:border-gray-600 text-sm font-mono"
							/>
							<button
								onClick={copyAddress}
								className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded"
							>
								Copy
							</button>
						</div>
					</div>

					<div className="mt-5">
						<h2 className="text-xl font-bold mb-4 dark:text-white">
							Lightning Donation:
						</h2>
						<button onClick={() => openModal('/lightningQR.png', 'Lightning Address')}>
							<img
								src="/lightningQR.png"
								alt="Lightning Bitcoin Donation QR Code"
								className="border-4 border-orange-500 rounded-lg cursor-pointer hover:opacity-80 transition-opacity mx-auto"
								style={{ maxWidth: '200px' }}
							/>
						</button>
					</div>
				</div>
			</div>

			<Modal
				isOpen={!!modalImage}
				title={modalImage?.title || ''}
				message={
					modalImage ? (
						<div className="flex flex-col items-center">
							<img
								src={modalImage.src}
								alt="QR Code"
								className="max-w-full h-auto"
								style={{ maxHeight: '70vh' }}
							/>
						</div>
					) : null
				}
				type="analysis"
				onConfirm={closeModal}
				onCancel={closeModal}
			/>
		</div>
	);
}
