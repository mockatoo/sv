<p align="center">
  <img src="mockatoo-logo.png" alt="Mockatoo" width="128" height="128">
</p>

<h1 align="center">Mockatoo</h1>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="readme-headline-dark.svg">
    <img src="readme-headline-light.svg" alt="Test Google, Microsoft, GitHub, Apple, Discord, LinkedIn, X and Facebook sign-in in CI, without getting blocked. One free OAuth provider for agentic development, E2E tests, and CI. No app registration, no bot checks, no fragile workarounds." width="880">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/mockatoo/sv/actions/workflows/ci.yml"><img src="https://github.com/mockatoo/sv/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center">
  <a href="https://mockatoo.globalunderdog.com">Website</a> ·
  <a href="https://mockatoo.globalunderdog.com/docs">Documentation</a> ·
  <a href="https://github.com/mockatoo/connectors">Connectors</a> ·
  <a href="https://app.mockatoo.globalunderdog.com">Create a free test account</a>
</p>

# @mockatoo/sv

**GitHub sign-in that works the moment you run `pnpm dev`, with no GitHub OAuth app.** A [Svelte CLI](https://svelte.dev/docs/cli/overview) community add-on that sets up [Better Auth](https://www.better-auth.com) with a GitHub demo, and signs in through Mockatoo's free hosted GitHub mock in development.

```sh
npx sv add @mockatoo
```

> [!IMPORTANT]
> Svelte maintainers have not reviewed community add-ons for malicious code. The CLI says so and asks before it runs this one. The source is all in [`src/index.js`](src/index.js).

## What it does

**It only sets up new auth.** It never edits an auth setup you already have.

| Your project | What happens |
| --- | --- |
| **No auth yet** (a new `sv create` app, or an existing app without auth) | Adds [Better Auth](https://www.better-auth.com) with its GitHub demo (and [Drizzle](https://orm.drizzle.team), if you have no database), then makes the GitHub demo sign in through Mockatoo in development. |
| **Already has auth**: Better Auth, Auth.js, Lucia, Arctic, Supabase, Clerk, Kinde, WorkOS, or a `src/lib/server/auth.(ts\|js)` file | **Changes nothing.** It stops with a message pointing to the Mockatoo skill and the matching example (see [Already have auth?](#already-have-auth)). |
| **Not SvelteKit** | Changes nothing. The add-on requires SvelteKit 2 or 3; CI tests both. |

On a project with no auth, `npx sv add @mockatoo`:

1. **Adds Better Auth with the GitHub demo** through the official `better-auth` add-on, as if you'd run `npx sv add better-auth="demo:github"`. You get its usual files: `src/lib/server/auth.ts`, the demo at `/demo/better-auth`, and `.env` entries. If the project has no database, the official add-on also adds Drizzle and asks which database to use.
2. **Gates GitHub on SvelteKit's `dev`** in `src/lib/server/auth.ts`:

   ```diff
   + import { dev } from '$app/env'; // '$app/environment' on SvelteKit 2
   + import { mockGitHub } from '@mockatoo/connect-better-auth';
     ...
   - socialProviders: {
   + socialProviders: dev
   +   ? {}
   +   : {
         github: { clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET }
       },
     plugins: [
   +   ...(dev ? [mockGitHub()] : []),
       sveltekitCookies(getRequestEvent)
     ]
   ```

3. **Adds [`@mockatoo/connect-better-auth`](https://github.com/mockatoo/connectors/tree/main/packages/connect-better-auth)**, a Better Auth plugin that registers Mockatoo's GitHub mock under the provider id `github`. The demo's "Sign in with GitHub" button and `auth.api.signInSocial({ provider: 'github' })` work unchanged.
4. **On SvelteKit 3**, adds `{ external: true }` to the demo's sign-in redirect, because the mock is on another origin.

If `auth.ts` isn't in the shape the official add-on generates (for example, you chose a demo without GitHub in the same command), it stops and changes nothing in it.

**Production is unchanged.** `dev` is `false` in production builds, so they use the real GitHub provider with `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, and the mock plugin isn't added.

## Try it

```sh
npx sv create my-app --template minimal --types ts
cd my-app
npx sv add @mockatoo
pnpm auth:schema && pnpm db:push   # create the auth tables
pnpm dev
```

Open `/demo/better-auth/login` and click **Sign in with GitHub**. You land on Mockatoo's login page: sign in with a [free Mockatoo account](https://app.mockatoo.globalunderdog.com), click **Authorize**, and you're back in the app, signed in as a GitHub user.

## Test sign-in in CI

The mock behaves like GitHub's OAuth, so a Playwright test can run the whole flow without bot checks or real accounts. Store your Mockatoo test account in `MOCKATOO_TEST_EMAIL` and `MOCKATOO_TEST_PASSWORD`, then:

```ts
await page.goto('/demo/better-auth/login');
await page.getByRole('button', { name: 'Sign in with GitHub' }).click();
await page.locator('#email').fill(process.env.MOCKATOO_TEST_EMAIL!);
await page.locator('#password').fill(process.env.MOCKATOO_TEST_PASSWORD!);
await page.getByRole('button', { name: 'Log in with password' }).click();
await page.getByRole('button', { name: 'Authorize' }).click();
await expect(page.locator('h1')).toContainText('Hi,');
```

The dev server must use the same host as `ORIGIN` in `.env`, such as `127.0.0.1` for both, or Better Auth rejects the state cookie. See the [Playwright guide](https://mockatoo.globalunderdog.com/docs/playwright) and the [CI guide](https://mockatoo.globalunderdog.com/docs/ci).

## Already have auth?

The add-on won't edit an existing auth setup: auth code varies too much for a blind edit to be safe. Instead, let your coding agent add Mockatoo to the code you have:

```sh
npx skills add mockatoo/connectors --skill mockatoo
```

Then ask it to add Mockatoo for development and tests. Working examples:

- [Better Auth + SvelteKit](https://github.com/mockatoo/examples/tree/main/better-auth-sveltekit)
- [Auth.js + SvelteKit](https://github.com/mockatoo/examples/tree/main/authjs-sveltekit)
- [All examples](https://github.com/mockatoo/examples) (Next.js, Nuxt, Remix, Hono, Flask, Django, Laravel, Spring Boot)

## Options

None. Run it without arguments: `npx sv add @mockatoo`. It installs as `@mockatoo` or `@mockatoo/sv`, and `npx sv add @mockatoo/sv@0.1.0` pins a version.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test          # refusal tests, plus a generated app on each SvelteKit variant
pnpm cli:check     # the real CLI on SvelteKit 3 and 2: `sv create` + `sv add file:.`, type check, build, refusal
```

`pnpm test` signs in to the hosted mock when `MOCKATOO_TEST_EMAIL` and `MOCKATOO_TEST_PASSWORD` are set. Without them, it checks the redirect to Mockatoo's login page and skips the full sign-in with a notice. To try it by hand: `pnpm demo-create`, then `pnpm demo-add`.

## Releasing

Bump `version` in `package.json`, then push a matching tag (`v0.1.1`). [`release.yml`](.github/workflows/release.yml) re-runs every check, including the full sign-in, and publishes to npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers): no npm token, and the package gets a provenance attestation. A prerelease version (`0.2.0-beta.1`) publishes under the `next` tag.

## License

MIT. Mockatoo is free; the hosted service is at [app.mockatoo.globalunderdog.com](https://app.mockatoo.globalunderdog.com).
