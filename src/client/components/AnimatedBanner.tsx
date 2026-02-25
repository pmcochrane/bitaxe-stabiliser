import { useState, useEffect, ReactNode } from 'react';

interface AnimatedBannerProps {
	children: ReactNode;
	show?: boolean | null | undefined;
	className?: string;
	onDismiss?: () => void;
}

export function AnimatedBanner({ children, show, className = '', onDismiss }: AnimatedBannerProps) {
	const [isVisible, setIsVisible] = useState(!!show);
	const [isAnimating, setIsAnimating] = useState(false);

	useEffect(() => {
		if (show) {
			setIsVisible(true);
			requestAnimationFrame(() => setIsAnimating(true));
		} else {
			setIsAnimating(false);
			const timer = setTimeout(() => setIsVisible(false), 300);
			return () => clearTimeout(timer);
		}
	}, [show]);

	if (!isVisible) return null;

	return (
		<div
			className={`transition-all duration-500 ease-in-out overflow-hidden ${
				isAnimating ? 'translate-y-0 max-h-[500px]' : '-translate-y-2 max-h-0'
			} ${className}`}
		>
			{onDismiss && (
				<button
					onClick={onDismiss}
					className="absolute top-2 right-2 text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100"
					aria-label="Dismiss"
				>
					✕
				</button>
			)}
			{children}
		</div>
	);
}
