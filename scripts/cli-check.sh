#!/usr/bin/env bash
# The real `sv add` path: a fresh app, then `sv add file:<this package>`.
# Checks that Better Auth is pulled in with the GitHub demo by `dependsOn`, that the
# config is gated on `dev` on SvelteKit 3 and 2, that the app type-checks and builds,
# and that a project which already has auth is refused with nothing changed.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
sv="$root/node_modules/.bin/sv"

pnpm --dir "$root" build >/dev/null

# 1. Fresh app: our add-on alone. Drizzle's database question is answered on the
#    command line; Better Auth is not named, so `dependsOn` must add it.
"$sv" create "$work/app" --template minimal --types ts --no-add-ons --no-install >/dev/null
"$sv" add "file:$root" 'drizzle=database:sqlite+sqlite:libsql' \
	--cwd "$work/app" --no-git-check --no-download-check --install pnpm >"$work/add.log" 2>&1 \
	|| { cat "$work/add.log"; exit 1; }
auth="$work/app/src/lib/server/auth.ts"
grep -q "from '@mockatoo/connect-better-auth'" "$auth"
grep -Eq 'socialProviders: dev' "$auth"
grep -Eq 'dev \? \[mockGitHub\(\)\] : \[\]' "$auth"
grep -q 'Sign in with GitHub' "$work/app/src/routes/demo/better-auth/login/+page.svelte"
grep -q '"@mockatoo/connect-better-auth"' "$work/app/package.json"
echo "fresh app: Better Auth added with the GitHub demo, gated on dev"

(cd "$work/app" && pnpm exec svelte-kit sync >/dev/null && pnpm check >"$work/check.log" 2>&1) \
	|| { cat "$work/check.log"; exit 1; }
echo "fresh app: svelte-check passed"
(cd "$work/app" && pnpm build >"$work/build.log" 2>&1) || { cat "$work/build.log"; exit 1; }
echo "fresh app: production build passed"
grep -q "from '\$app/env'" "$auth"
grep -q 'redirect(302, result.url, { external: true })' "$work/app/src/routes/demo/better-auth/login/+page.server.ts"
echo "fresh app: SvelteKit 3 path (\$app/env, external redirect)"

# 1b. A SvelteKit 2 app. `sv` 1.x scaffolds SvelteKit 3; 0.17.1 is the last release
#     whose template is SvelteKit 2. The add-on itself still runs on the current `sv`.
pnpm dlx sv@0.17.1 create "$work/kit2" --template minimal --types ts --no-add-ons --no-install >/dev/null 2>&1
grep -q '"@sveltejs/kit": "^2' "$work/kit2/package.json"
"$sv" add "file:$root" 'drizzle=database:sqlite+sqlite:libsql' \
	--cwd "$work/kit2" --no-git-check --no-download-check --install pnpm >"$work/add2.log" 2>&1 \
	|| { cat "$work/add2.log"; exit 1; }
auth2="$work/kit2/src/lib/server/auth.ts"
login2="$work/kit2/src/routes/demo/better-auth/login/+page.server.ts"
grep -q "from '\$app/environment'" "$auth2"
grep -Eq 'socialProviders: dev' "$auth2"
grep -Eq 'dev \? \[mockGitHub\(\)\] : \[\]' "$auth2"
grep -q 'redirect(302, result.url)' "$login2"
! grep -q 'external: true' "$login2"
(cd "$work/kit2" && pnpm exec svelte-kit sync >/dev/null && pnpm check >"$work/check2.log" 2>&1) \
	|| { cat "$work/check2.log"; exit 1; }
(cd "$work/kit2" && pnpm build >"$work/build2.log" 2>&1) || { cat "$work/build2.log"; exit 1; }
echo "SvelteKit 2 app: \$app/environment, gated on dev, svelte-check and build passed"

# 2. An app that already has Better Auth: refused, nothing changed.
"$sv" create "$work/existing" --template minimal --types ts --no-add-ons --no-install >/dev/null
(cd "$work/existing" && node -e '
	const fs = require("fs"); const p = JSON.parse(fs.readFileSync("package.json"));
	p.dependencies = { ...p.dependencies, "better-auth": "^1.7.25" };
	fs.writeFileSync("package.json", JSON.stringify(p, null, "\t"));')
(cd "$work/existing" && git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init)
# `sv` reports an unsupported add-on and stops, but exits 0, so check the output instead.
"$sv" add "file:$root" --cwd "$work/existing" --no-git-check --no-download-check --no-install \
	>"$work/refuse.log" 2>&1 || true
grep -q 'changed nothing' "$work/refuse.log" || { cat "$work/refuse.log"; exit 1; }
grep -q 'npx skills add mockatoo/connectors --skill mockatoo' "$work/refuse.log"
test -z "$(cd "$work/existing" && git status --porcelain)"
echo "existing Better Auth: refused with the skill pointer, nothing changed"
