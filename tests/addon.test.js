import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect } from '@playwright/test';
import { expect as vitestExpect } from 'vitest';
import { officialAddons } from 'sv';
import addon from '../src/index.js';
import { setupTest } from './setup/suite.js';

const MOCK_LOGIN = /^https:\/\/app\.mockatoo\.globalunderdog\.com\/login\?next=/;

// `sv add` pulls in Better Auth (and Drizzle) through `dependsOn`; the programmatic
// `add` used here doesn't resolve dependencies, so the official add-ons are passed in,
// with the answers our `dependsOn` gives. scripts/cli-check.sh covers the real CLI path.
const { test, prepareServer, testCases } = setupTest(
	{ drizzle: officialAddons.drizzle, 'better-auth': officialAddons['better-auth'], addon },
	{
		kinds: [
			{
				type: 'fresh',
				options: {
					drizzle: { database: 'sqlite', sqlite: 'turso' },
					'better-auth': { demo: ['github'] },
					[addon.id]: {}
				}
			}
		],
		filter: (testCase) => testCase.variant.includes('kit'),
		browser: true
	}
);

/** @type {Map<string, Promise<void>>} */
const prepared = new Map();

/**
 * Checks the generated code, then points the app at a local SQLite file and creates
 * the auth tables. Runs once per generated app; both tests share it.
 * @param {string} cwd
 * @param {string} language
 */
function prepareApp(cwd, language) {
	if (!prepared.has(cwd)) {
		prepared.set(
			cwd,
			(async () => {
				const env = path.resolve(cwd, '.env');
				const content = fs.readFileSync(env, 'utf8');
				fs.writeFileSync(env, content.replace(/DATABASE_URL=".*"/, 'DATABASE_URL="file:local.db"'));
				execFileSync('npm', ['run', 'auth:schema'], { cwd, stdio: 'pipe' });
				execFileSync('npm', ['run', 'db:push', '--', '--force'], { cwd, stdio: 'pipe' });
			})()
		);
	}
	return prepared.get(cwd);
}

/**
 * Starts the dev server (`dev` is true only there) on a host that matches `ORIGIN`:
 * Better Auth's state cookie needs the host the browser uses.
 * @param {string} cwd
 * @param {import('@playwright/test').Page} page
 * @param {number} port
 */
async function startDev(cwd, page, port) {
	const env = path.resolve(cwd, '.env');
	const content = fs.readFileSync(env, 'utf8');
	fs.writeFileSync(env, content.replace(/ORIGIN=".*"/, `ORIGIN="http://127.0.0.1:${port}"`));
	return prepareServer({
		cwd,
		page,
		buildCommand: '',
		previewCommand: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`
	});
}

/** @param {import('@playwright/test').Page} page @param {string} url */
async function clickGitHub(page, url) {
	await page.goto(`${url}demo/better-auth/login`);
	await page.getByRole('button', { name: 'Sign in with GitHub' }).click();
	await expect(page).toHaveURL(MOCK_LOGIN);
	await expect(page.locator('#email')).toBeVisible();
}

// The two tests share each generated app, so they run one after the other.
test.for(testCases)('$variant: generated code, and GitHub goes to Mockatoo', async (testCase, { page, ...ctx }) => {
	const cwd = ctx.cwd(testCase);
	const language = testCase.variant.includes('ts') ? 'ts' : 'js';

	// The official Better Auth add-on ran with the GitHub demo, then ours gated it on `dev`.
	const auth = fs.readFileSync(path.resolve(cwd, `src/lib/server/auth.${language}`), 'utf8');
	vitestExpect(auth).toContain("from '@mockatoo/connect-better-auth'");
	vitestExpect(auth).toMatch(/socialProviders:\s*dev\s*\?\s*\{\}\s*:/);
	vitestExpect(auth).toMatch(/\.\.\.\(?dev \? \[mockGitHub\(\)\] : \[\]\)?/);
	const pkg = JSON.parse(fs.readFileSync(path.resolve(cwd, 'package.json'), 'utf8'));
	vitestExpect(pkg.devDependencies['@mockatoo/connect-better-auth']).toBeDefined();

	await prepareApp(cwd, language);
	const { url, close } = await startDev(cwd, page, testCase.variant === 'kit-ts' ? 41742 : 41741);
	ctx.onTestFinished(async () => await close());
	await clickGitHub(page, url);
});

test.for(testCases)('$variant: full sign-in through Mockatoo', async (testCase, { page, ...ctx }) => {
	const email = process.env.MOCKATOO_TEST_EMAIL;
	const password = process.env.MOCKATOO_TEST_PASSWORD;
	if (!email || !password) {
		console.log(
			'::notice::Skipping the full Mockatoo sign-in: MOCKATOO_TEST_EMAIL and MOCKATOO_TEST_PASSWORD are not set'
		);
		ctx.skip(true, 'MOCKATOO_TEST_EMAIL and MOCKATOO_TEST_PASSWORD are required');
		return;
	}
	const cwd = ctx.cwd(testCase);
	const language = testCase.variant.includes('ts') ? 'ts' : 'js';
	await prepareApp(cwd, language);
	const { url, close } = await startDev(cwd, page, testCase.variant === 'kit-ts' ? 41744 : 41743);
	ctx.onTestFinished(async () => await close());

	await clickGitHub(page, url);
	await page.locator('#email').fill(email);
	await page.locator('#password').fill(password);
	await page.getByRole('button', { name: 'Log in with password' }).click();
	await page.getByRole('button', { name: 'Authorize' }).click();
	await expect(page).toHaveURL(`${url}demo/better-auth`);
	await expect(page.locator('h1')).toContainText('Hi,');
	vitestExpect(page.url()).toBe(`${url}demo/better-auth`);
});
