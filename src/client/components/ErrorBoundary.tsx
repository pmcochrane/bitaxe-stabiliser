import { Component, ReactNode } from 'react';

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error('ErrorBoundary caught an error:', error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="container mx-auto max-xl:max-w-full p-4">
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
						<h1 className="text-2xl font-bold mb-4 dark:text-white text-red-500">
							Something went wrong
						</h1>
						<p className="text-gray-600 dark:text-gray-300 mb-4">
							{this.state.error?.message || 'An unexpected error occurred'}
						</p>
						<button
							onClick={() => window.location.reload()}
							className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded"
						>
							Reload Page
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
