import { Download } from 'lucide-react';
import { AnimatedBanner } from './AnimatedBanner';

interface ReleaseBannerProps {
	show: boolean;
	latestVersion: string;
	releaseUrl: string;
	onDismiss: () => void;
}

export function ReleaseBanner({ show, latestVersion, releaseUrl, onDismiss }: ReleaseBannerProps) {
	return (
		<AnimatedBanner
			show={show}
			onDismiss={onDismiss}
			className="bg-yellow-100 border-b border-amber-300"
		>
			<div className="container mx-auto px-4 py-2 flex items-center justify-center gap-4">
				<span className="text-amber-900 font-medium">
					A new version ({latestVersion}) is available
				</span>
				<a
					href={releaseUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1 px-3 py-1 bg-amber-900 hover:bg-amber-600 text-yellow-100 rounded text-sm font-medium"
				>
					<Download className="w-4 h-4" />
					Download
				</a>
			</div>
		</AnimatedBanner>
	);
}
