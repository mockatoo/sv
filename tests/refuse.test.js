import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import addon, { EXISTING_AUTH } from '../src/index.js';

/**
 * Runs the add-on's `setup` against a fake workspace and records what it asked for.
 * @param {{ deps?: Record<string, string>, files?: string[], isKit?: boolean }} [opts]
 */
function setup({ deps = {}, files = [], isKit = true } = {}) {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mockatoo-sv-'));
	for (const file of files) {
		fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
		fs.writeFileSync(path.join(cwd, file), '');
	}
	/** @type {{ unsupported: string[], dependsOn: unknown[][] }} */
	const calls = { unsupported: [], dependsOn: [] };
	/** @type {any} */
	const workspace = {
		cwd,
		isKit,
		directory: { src: 'src', lib: 'src/lib', kitRoutes: 'src/routes' },
		dependencyVersion: (/** @type {string} */ pkg) => deps[pkg],
		unsupported: (/** @type {string} */ reason) => calls.unsupported.push(reason),
		dependsOn: (/** @type {string} */ id, /** @type {unknown} */ options) =>
			calls.dependsOn.push([id, options])
	};
	addon.setup?.(workspace);
	fs.rmSync(cwd, { recursive: true, force: true });
	return calls;
}

describe('setup', () => {
	test('a project without auth gets Better Auth with the GitHub demo', () => {
		const calls = setup();
		expect(calls.unsupported).toEqual([]);
		expect(calls.dependsOn).toEqual([['better-auth', { demo: ['github'] }]]);
	});

	test.each(EXISTING_AUTH.map(([pkg]) => pkg))('refuses a project that has %s', (pkg) => {
		const calls = setup({ deps: { [pkg]: '1.0.0' } });
		expect(calls.dependsOn).toEqual([]);
		expect(calls.unsupported).toHaveLength(1);
		expect(calls.unsupported[0]).toContain('changed nothing');
		expect(calls.unsupported[0]).toContain('npx skills add mockatoo/connectors --skill mockatoo');
	});

	test('points Better Auth and Auth.js users at their example', () => {
		expect(setup({ deps: { 'better-auth': '1.7.0' } }).unsupported[0]).toContain(
			'/better-auth-sveltekit'
		);
		expect(setup({ deps: { '@auth/sveltekit': '1.0.0' } }).unsupported[0]).toContain(
			'/authjs-sveltekit'
		);
	});

	test('refuses a project with a hand-written auth file', () => {
		const calls = setup({ files: ['src/lib/server/auth.ts'] });
		expect(calls.dependsOn).toEqual([]);
		expect(calls.unsupported[0]).toContain('src/lib/server/auth.ts');
	});

	test('requires SvelteKit', () => {
		expect(setup({ isKit: false }).unsupported).toEqual(['Requires SvelteKit']);
	});
});
