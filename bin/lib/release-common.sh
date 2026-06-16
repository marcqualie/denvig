# shellcheck shell=bash
#
# Shared helpers for bin/tag-release and bin/tag-prerelease.
# Source this file; do not execute it directly.

# Resolve the repository root from this library's location so the helpers work
# regardless of the caller's working directory.
RELEASE_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

release_die() {
  echo "Error: $*" >&2
  exit 1
}

# Print the current version from the workspace root package.json.
release_current_version() {
  node -e "process.stdout.write(require('$RELEASE_REPO_ROOT/package.json').version)"
}

# Today's date in YYYY-MM-DD.
release_today() {
  date +%Y-%m-%d
}

# Compare two semver versions. Prints -1, 0, or 1 (v1 <, ==, > v2).
# Implements semver precedence (including prerelease rules) with no dependency.
release_semver_compare() {
  node -e '
    const [v1, v2] = process.argv.slice(1);
    const parse = (v) => {
      const [main, pre] = v.split("-");
      return { nums: main.split(".").map(Number), pre: pre ? pre.split(".") : null };
    };
    const cmpMain = (a, b) => {
      for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
      return 0;
    };
    const cmpPre = (a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;   // a has no prerelease -> higher precedence
      if (!b) return -1;
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i++) {
        if (a[i] === undefined) return -1;
        if (b[i] === undefined) return 1;
        const an = /^\d+$/.test(a[i]);
        const bn = /^\d+$/.test(b[i]);
        if (an && bn) { const x = +a[i], y = +b[i]; if (x !== y) return x < y ? -1 : 1; }
        else if (an) return -1;   // numeric identifiers rank below alphanumeric
        else if (bn) return 1;
        else if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
      }
      return 0;
    };
    const p1 = parse(v1), p2 = parse(v2);
    const m = cmpMain(p1.nums, p2.nums);
    process.stdout.write(String(m !== 0 ? m : cmpPre(p1.pre, p2.pre)));
  ' "$1" "$2"
}

# Abort unless $1 (new version) is strictly greater than $2 (current version).
release_assert_greater() {
  local new="$1" current="$2"
  local cmp
  cmp="$(release_semver_compare "$new" "$current")"
  if [ "$cmp" != "1" ]; then
    release_die "$new is not greater than the current version $current"
  fi
}

# Ensure we are on the main branch with a clean working tree, so the release
# commit contains only the version bump and changelog entry.
release_assert_clean_main() {
  local branch
  branch="$(git -C "$RELEASE_REPO_ROOT" branch --show-current)"
  [ "$branch" = "main" ] || release_die "must be on the main branch (currently on '$branch')"
  if ! git -C "$RELEASE_REPO_ROOT" diff --quiet || ! git -C "$RELEASE_REPO_ROOT" diff --cached --quiet; then
    release_die "working tree is not clean; commit or stash changes before releasing"
  fi
}

# Bump the version in the workspace root and every package in lockstep.
release_bump_versions() {
  local version="$1"
  ( cd "$RELEASE_REPO_ROOT" && node -e "
    const fs = require('fs');
    const files = ['package.json', ...fs.readdirSync('packages').map((p) => 'packages/' + p + '/package.json').filter((f) => fs.existsSync(f))];
    for (const file of files) {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      pkg.version = '$version';
      fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
      console.log('Updated ' + file + ' -> $version');
    }
  ")
}

# Insert a new '## [version] - date' heading directly below the '## [Unreleased]'
# heading, keeping [Unreleased] in place so future work keeps accumulating.
release_update_changelog() {
  local version="$1" date="$2"
  ( cd "$RELEASE_REPO_ROOT" && node -e "
    const fs = require('fs');
    const path = 'CHANGELOG.md';
    const lines = fs.readFileSync(path, 'utf8').split('\n');
    const idx = lines.findIndex((l) => l.trim() === '## [Unreleased]');
    if (idx === -1) { console.error('Could not find ## [Unreleased] in CHANGELOG.md'); process.exit(1); }
    if (lines.some((l) => l.trim() === '## [$version] - $date' || l.startsWith('## [$version]'))) {
      console.error('CHANGELOG.md already has an entry for $version'); process.exit(1);
    }
    lines.splice(idx + 1, 0, '', '## [$version] - $date');
    fs.writeFileSync(path, lines.join('\n'));
    console.log('Inserted ## [$version] - $date below [Unreleased]');
  ")
}

# Stage the version/changelog changes, commit on main, and tag the commit.
release_commit_and_tag() {
  local tag="$1"
  git -C "$RELEASE_REPO_ROOT" add package.json packages/*/package.json CHANGELOG.md
  git -C "$RELEASE_REPO_ROOT" commit -m "release $tag"
  git -C "$RELEASE_REPO_ROOT" tag "$tag"
  echo "Committed and tagged $tag"
}

# Extract the changelog section body for a given version (used as release notes).
release_changelog_section() {
  local version="$1"
  ( cd "$RELEASE_REPO_ROOT" && awk -v v="## [$version]" '
    index($0, v) == 1 { f = 1; next }
    /^## \[/ { if (f) exit }
    f { print }
  ' CHANGELOG.md )
}

# Push the commit and tag, then create the GitHub release.
# $1=tag $2=date $3=prerelease flag (1 = --prerelease)
release_push_and_publish() {
  local tag="$1" date="$2" prerelease="$3"
  local version="${tag#v}"

  git -C "$RELEASE_REPO_ROOT" push
  git -C "$RELEASE_REPO_ROOT" push origin "$tag"

  local notes
  notes="$(release_changelog_section "$version")"

  local gh_args=(release create "$tag" --title "$tag - $date" --notes "$notes")
  [ "$prerelease" = "1" ] && gh_args+=(--prerelease)
  ( cd "$RELEASE_REPO_ROOT" && gh "${gh_args[@]}" )
}

# Prompt for confirmation (unless --yes was passed). Returns 0 to proceed.
release_confirm() {
  if [ "${RELEASE_ASSUME_YES:-0}" = "1" ]; then
    return 0
  fi
  local reply
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}
