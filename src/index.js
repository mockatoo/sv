import fs from 'node:fs';
import path from 'node:path';
import { defineAddon, defineAddonOptions } from 'sv';
import { defineDemoPage, defineEnv, isKit3, transforms } from './sv-utils.js';

export const CONNECTOR = '@mockatoo/connect-better-auth';
export const CONNECTOR_VERSION = '^0.3.3';
const SKILL = 'npx skills add mockatoo/connectors --skill mockatoo';
const EXAMPLES = 'https://github.com/mockatoo/examples';

/**
 * Auth libraries this add-on refuses to touch, with the closest Mockatoo example for each.
 * @type {Array<[pkg: string, example: string]>}
 */
export const EXISTING_AUTH = [
	['better-auth', `${EXAMPLES}/tree/main/better-auth-sveltekit`],
	['@auth/sveltekit', `${EXAMPLES}/tree/main/authjs-sveltekit`],
	['@auth/core', `${EXAMPLES}/tree/main/authjs-sveltekit`],
	['lucia', EXAMPLES],
	['arctic', EXAMPLES],
	['@supabase/ssr', EXAMPLES],
	['@supabase/auth-helpers-sveltekit', EXAMPLES],
	['svelte-clerk', EXAMPLES],
	['clerk-sveltekit', EXAMPLES],
	['@kinde-oss/kinde-auth-sveltekit', EXAMPLES],
	['@workos-inc/authkit-sveltekit', EXAMPLES]
];

/**
 * Why this project already has auth, or `undefined` when it has none.
 * @param {{ cwd: string, dependencyVersion: (pkg: string) => string | undefined, directory: { lib: string } }} workspace
 */
export function existingAuthReason({ cwd, dependencyVersion, directory }) {
	const found = EXISTING_AUTH.find(([pkg]) => dependencyVersion(pkg));
	const authFile = ['ts', 'js']
		.map((ext) => `${directory.lib}/server/auth.${ext}`)
		.find((file) => fs.existsSync(path.resolve(cwd, file)));
	if (!found && !authFile) return undefined;
	const what = found ? `\`${found[0]}\`` : `\`${authFile}\``;
	const example = found ? found[1] : EXAMPLES;
	return (
		`This project already has auth (${what}), and @mockatoo/sv only sets up new auth, so it changed nothing. ` +
		`To add Mockatoo to your existing setup, install the Mockatoo skill (${SKILL}) and ask your coding agent to add it. ` +
		`Example: ${example}`
	);
}

/**
 * Edits the generated Better Auth config: real GitHub in production, Mockatoo's GitHub mock in `dev`.
 * Returns `false` (no change) when the file isn't the shape the official add-on generates.
 * @param {{ ast: any, js: any }} file
 * @param {(ast: any, js: any, imports: string[]) => void} importEnv
 */
export function gateGitHub({ ast, js }, importEnv) {
	/** @type {any} */
	let config;
	visit(ast, (node) => {
		if (config || node.type !== 'ObjectExpression') return;
		const plugins = findProperty(node, 'plugins');
		if (
			plugins?.value.type === 'ArrayExpression' &&
			plugins.value.elements.some(
				(/** @type {any} */ el) =>
					el?.type === 'CallExpression' && el.callee.name === 'sveltekitCookies'
			)
		)
			config = node;
	});
	if (!config) return false;
	const social = findProperty(config, 'socialProviders');
	if (social?.value.type !== 'ObjectExpression' || !findProperty(social.value, 'github'))
		return false;

	const gated = js.common.parseExpression('dev ? {} : {}');
	gated.alternate = social.value;
	social.value = gated;

	const mock = js.common.parseExpression('[...(dev ? [mockGitHub()] : [])]').elements[0];
	findProperty(config, 'plugins').value.elements.unshift(mock);

	js.imports.addNamed(ast, { from: CONNECTOR, imports: ['mockGitHub'] });
	importEnv(ast, js, ['dev']);
}

/**
 * Kit 3 refuses to redirect to another origin unless asked, and the mock lives on one.
 * @param {{ ast: any }} file
 */
export function allowExternalRedirect({ ast }) {
	let changed = false;
	visit(ast, (node) => {
		if (
			node.type === 'CallExpression' &&
			node.callee.name === 'redirect' &&
			node.arguments.length === 2 &&
			node.arguments[1].type === 'MemberExpression' &&
			node.arguments[1].object.name === 'result' &&
			node.arguments[1].property.name === 'url'
		) {
			node.arguments.push({
				type: 'ObjectExpression',
				properties: [
					{
						type: 'Property',
						kind: 'init',
						method: false,
						shorthand: false,
						computed: false,
						key: { type: 'Identifier', name: 'external' },
						value: { type: 'Literal', value: true }
					}
				]
			});
			changed = true;
		}
	});
	if (!changed) return false;
}

/**
 * @param {any} node
 * @param {(node: any) => void} fn
 */
function visit(node, fn) {
	if (!node || typeof node.type !== 'string') return;
	fn(node);
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) value.forEach((child) => visit(child, fn));
		else if (value && typeof value === 'object') visit(value, fn);
	}
}

/**
 * @param {any} object
 * @param {string} name
 */
function findProperty(object, name) {
	return object.properties.find(
		(/** @type {any} */ p) =>
			p.type === 'Property' && (p.key.name === name || p.key.value === name)
	);
}

export default defineAddon({
	id: '@mockatoo/sv',
	shortDescription: 'GitHub sign-in in dev without an OAuth app (Mockatoo)',
	homepage: 'https://github.com/mockatoo/sv',
	options: defineAddonOptions().build(),

	setup: (workspace) => {
		if (!workspace.isKit) return workspace.unsupported('Requires SvelteKit');
		const reason = existingAuthReason(workspace);
		if (reason) return workspace.unsupported(reason);
		workspace.dependsOn('better-auth', { demo: ['github'] });
	},

	run: ({ sv, cwd, language, directory, dependencyVersion, cancel }) => {
		const env = defineEnv({ sv, cwd, dependencyVersion });
		const authFile = `${directory.lib}/server/auth.${language}`;
		let gated = false;

		sv.file(
			authFile,
			transforms.script((file) => {
				if (file.content.includes(CONNECTOR)) return false;
				const result = gateGitHub(file, env.importEnv);
				if (result === false) return false;
				gated = true;
			})
		);
		if (!gated) {
			return cancel(
				`Couldn't find Better Auth's GitHub demo config in ${authFile}, so nothing was changed. ` +
					`Run \`npx sv add better-auth="demo:github" @mockatoo\`, or use the Mockatoo skill: ${SKILL}`
			);
		}
		sv.devDependency(CONNECTOR, CONNECTOR_VERSION);

		if (isKit3(dependencyVersion('@sveltejs/kit'))) {
			const demo = defineDemoPage('better-auth', language, directory.kitRoutes);
			sv.file(
				`${demo.addonPath}/login/+page.server.${language}`,
				transforms.script((file) => allowExternalRedirect(file))
			);
		}
	},

	nextSteps: () => [
		'Run the dev server and open /demo/better-auth/login, then click "Sign in with GitHub"',
		'Sign in with a free Mockatoo account (https://app.mockatoo.globalunderdog.com); no GitHub OAuth app is needed in development',
		'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are only needed for production builds, which use real GitHub'
	]
});
