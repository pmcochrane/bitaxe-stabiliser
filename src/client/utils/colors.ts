export const getTempColor = (temp: number, target: number) => {
	if (temp > target + 1) return 'text-red-600 dark:text-red-400';
	if (temp < target - 1) return 'text-blue-900 dark:text-blue-400';
	return 'text-green-600 dark:text-green-400';
};

export const getToExpectedColor = (value: number) => {
	if (value >= 1) return 'text-amber-500 dark:text-amber-400';
	if (value >= -1) return 'text-green-600 dark:text-green-400';
	if (value < -1) return 'text-red-600 dark:text-red-400';
	return 'text-amber-500 dark:text-amber-400';
};
