import { useState, useEffect, ReactNode } from 'react';

interface AnimatedBannerProps {
	children: ReactNode;
	show?: boolean | null | undefined;
	className?: string;
}

export function AnimatedBanner({ children, show, className = '' }: AnimatedBannerProps) {
	const [isVisible, setIsVisible] = useState(!!show);

	useEffect(() => {
		if (show) {
			setIsVisible(true);
		} else {
			const timer = setTimeout(() => setIsVisible(false), 300);
			return () => clearTimeout(timer);
		}
	}, [show]);

	if (!isVisible) return null;

	return (
		<div
			className={`transition-all duration-300 ease-in-out ${
				show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
			} ${className}`}
		>
			{children}
		</div>
	);
}
