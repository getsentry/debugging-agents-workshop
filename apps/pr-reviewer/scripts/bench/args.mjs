// Shared by the bench scripts: parse `--key value` and bare `--flag` arguments.
export function parseArgs(argv, defaults = {}) {
	const args = { ...defaults };
	for (let i = 0; i < argv.length; i++) {
		if (!argv[i].startsWith('--')) continue;
		const key = argv[i].slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) args[key] = true;
		else {
			args[key] = next;
			i++;
		}
	}
	return args;
}

export const VARIANTS = ['stock', 'fanout'];

export function expand(value, all) {
	return value === 'all' ? all : [value];
}
