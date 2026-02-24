import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function About() {
	const [version, setVersion] = useState('');
	const [content, setContent] = useState('');

	useEffect(() => {
		fetch('/package.json')
			.then(pkg => pkg.json())
			.then(pkg => setVersion(pkg.version))
			.catch(() => setVersion('1.0.0'));

		fetch('/readme.md')
			.then(res => res.text())
			.then(text => {
				const withoutTitle = text.replace(/^# .+$/m, '').trim();
				setContent(withoutTitle);
			})
			.catch(() => setContent('Failed to load README'));
	}, []);

	return (
		<div className="container mx-auto p-4 max-w-4xl">
			<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
				<h1 className="text-2xl font-bold mb-4 dark:text-white">About Bitaxe Stabiliser</h1>
				
				<div className="prose dark:prose-invert max-w-none">
					<ReactMarkdown
						components={{
							h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4 dark:text-white">{children}</h1>,
							h2: ({ children }) => <h2 className="text-xl font-bold mt-6 mb-3 dark:text-white">{children}</h2>,
							h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2 dark:text-white">{children}</h3>,
							p: ({ children }) => <p className="mb-4 dark:text-gray-300">{children}</p>,
							li: ({ children }) => <li className="ml-6 mb-1 dark:text-gray-300">{children}</li>,
							ul: ({ children }) => <ul className="list-disc ml-6 mb-4 dark:text-gray-300">{children}</ul>,
							ol: ({ children }) => <ol className="list-decimal ml-6 mb-4 dark:text-gray-300">{children}</ol>,
							table: ({ children }) => <table className="w-full mb-4 border-collapse">{children}</table>,
							thead: ({ children }) => <thead className="bg-gray-100 dark:bg-gray-700">{children}</thead>,
							th: ({ children }) => <th className="border p-2 text-left dark:text-white">{children}</th>,
							td: ({ children }) => <td className="border p-2 dark:text-gray-300">{children}</td>,
							tr: ({ children }) => <tr className="border-b dark:border-gray-700">{children}</tr>,
							code: ({ children }) => <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-sm dark:text-gray-300">{children}</code>,
							pre: ({ children }) => <pre className="bg-gray-100 dark:bg-gray-700 p-4 rounded overflow-x-auto mb-4">{children}</pre>,
							blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic mb-4 dark:text-gray-400">{children}</blockquote>,
							a: ({ href, children }) => <a href={href} className="text-blue-500 hover:underline dark:text-blue-400">{children}</a>,
							hr: () => <hr className="my-6 border-gray-300 dark:border-gray-700" />,
						}}
					>
						{content}
					</ReactMarkdown>
				</div>

				<div className="mt-8 pt-4 border-t dark:border-gray-700">
					<p className="text-sm text-gray-500 dark:text-gray-400">
						Version: {version}
					</p>
				</div>
			</div>
		</div>
	);
}
