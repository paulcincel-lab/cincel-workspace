#!/usr/bin/env bash
# Computes an app's next release version from the Conventional Commits that
# touched it since its last release tag, and writes the release notes.
#
# Usage: next-version.sh <app-dir> <notes-file> [extra-path...]
#   Tags are "<app-dir>-vX.Y.Z". With no tag yet, the baseline is the app's
#   package.json version. Extra paths (e.g. its workflow file) also count as
#   changes to the app.
#
# Bump rules (from commit subjects, plus "BREAKING CHANGE:" in bodies):
#   breaking (type! or BREAKING CHANGE) -> major; minor while still 0.x
#   feat                                -> minor
#   anything else                       -> patch
# Cutting 1.0.0 is a deliberate step: push the tag "<app-dir>-v1.0.0" by hand.
#
# Prints key=value lines for $GITHUB_OUTPUT: version, tag, release
# (release=false when nothing touched the app since its last tag).
set -euo pipefail

app="$1"
notes_file="$2"
shift 2
paths=("$app" "$@")
prefix="${app}-v"

last_tag="$(git tag --list "${prefix}*" --sort=-v:refname | head -n 1)"
if [[ -n "$last_tag" ]]; then
  base="${last_tag#"$prefix"}"
  range="${last_tag}..HEAD"
else
  base="$(sed -n 's/^  "version": "\([0-9.]*\)".*/\1/p' "$app/package.json" | head -n 1)"
  range="HEAD"
fi
[[ "$base" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || { echo "::error::bad base version '$base'" >&2; exit 1; }
major="${BASH_REMATCH[1]}" minor="${BASH_REMATCH[2]}" patch="${BASH_REMATCH[3]}"

subjects="$(git log --format='%s' "$range" -- "${paths[@]}")"
if [[ -z "$subjects" ]]; then
  echo "version=$base"
  echo "tag=${prefix}${base}"
  echo "release=false"
  exit 0
fi

breaking=false
if grep -qE '^[a-z]+(\([^)]*\))?!:' <<<"$subjects" \
  || git log --format='%b' "$range" -- "${paths[@]}" | grep -qE '^BREAKING[ -]CHANGE:'; then
  breaking=true
fi

if [[ "$breaking" == true && "$major" -ge 1 ]]; then
  major=$((major + 1)) minor=0 patch=0
elif [[ "$breaking" == true ]] || grep -qE '^feat(\([^)]*\))?:' <<<"$subjects"; then
  minor=$((minor + 1)) patch=0
else
  patch=$((patch + 1))
fi
version="${major}.${minor}.${patch}"

section() {
  local title="$1" pattern="$2" invert="${3:-}"
  local lines
  if [[ -n "$invert" ]]; then
    lines="$(grep -vE "$pattern" <<<"$subjects" || true)"
  else
    lines="$(grep -E "$pattern" <<<"$subjects" || true)"
  fi
  [[ -z "$lines" ]] && return 0
  printf '## %s\n\n' "$title"
  sed 's/^/- /' <<<"$lines"
  printf '\n'
}

{
  section "Breaking changes" '^[a-z]+(\([^)]*\))?!:'
  section "Features" '^feat(\([^)]*\))?:'
  section "Fixes" '^fix(\([^)]*\))?:'
  section "Other changes" '^(feat|fix)(\([^)]*\))?:|^[a-z]+(\([^)]*\))?!:' invert
} >"$notes_file"

echo "version=$version"
echo "tag=${prefix}${version}"
echo "release=true"
