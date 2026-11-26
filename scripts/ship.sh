#!/usr/bin/env bash
# Commit everything and push to `website`, which deploys the site.
# Usage: npm run ship ["Message"]
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  msg="${1:-site: $(date '+%Y-%m-%d %H:%M')}"
  git add -A
  git commit -q -m "$msg"
  echo "committed: $msg"
else
  echo "nothing to commit — pushing whatever is already on the branch"
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "website" ]]; then
  echo "you are on '$branch', not 'website'. Refusing to guess." >&2
  echo "run: git switch website" >&2
  exit 1
fi

echo "pushing to website…"
git push -q origin website

echo
echo "deploying. watch it here:"
echo "  https://github.com/22cav/22cav.github.io/actions"
echo "live in ~1 min at https://22cav.github.io"
