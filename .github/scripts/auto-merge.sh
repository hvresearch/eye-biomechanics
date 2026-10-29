#!/usr/bin/env bash
# Merge pull requests that the driver has approved.
#
# Gate, per open non-draft pull request against main (docs/automation/driver.md, Step 1d):
#   1. GitHub reports mergeable_state "clean": required checks green, branch up to
#      date with main under strict protection, no conflicts.
#   2. The required check runs `web` and `python` on the head commit both succeeded.
#   3. The newest `<!-- driver-review sha=... verdict=... -->` comment written by
#      the repository owner says APPROVE, and its sha is the head commit, or the head
#      is an update-from-main merge commit whose first parent is the approved sha
#      and whose tree equals the clean merge of its two parents.
#
# Set DRY_RUN=1 to report what would merge without writing anything.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY to owner/repo}"
OWNER="${REPO%%/*}"
DRY_RUN="${DRY_RUN:-0}"
log() { printf '%s\n' "$*" >&2; }

prs=$(gh api "repos/$REPO/pulls?state=open&base=main&per_page=50" \
  --jq '.[] | select(.draft == false) | .number')
if [ -z "$prs" ]; then
  log "No open ready pull requests against main."
  exit 0
fi

for n in $prs; do
  state=unknown
  for _ in 1 2 3 4 5 6; do
    pr=$(gh api "repos/$REPO/pulls/$n")
    state=$(jq -r '.mergeable_state' <<<"$pr")
    [ "$state" != "unknown" ] && break
    sleep 20
  done
  head=$(jq -r '.head.sha' <<<"$pr")
  branch=$(jq -r '.head.ref' <<<"$pr")
  title=$(jq -r '.title' <<<"$pr")
  log "PR #$n ($branch) head ${head:0:7} mergeable_state=$state"

  if [ "$state" != "clean" ]; then
    log "  skip: mergeable_state is $state"
    continue
  fi

  checks_ok=$(gh api "repos/$REPO/commits/$head/check-runs?per_page=100" --jq '
    [.check_runs[] | select(.name == "web" or .name == "python")]
    | group_by(.name) | map(max_by(.started_at))
    | length == 2 and all(.conclusion == "success")')
  if [ "$checks_ok" != "true" ]; then
    log "  skip: required check runs are not all green on the head"
    continue
  fi

  marker=$(gh api "repos/$REPO/issues/$n/comments?per_page=100" --paginate \
    --jq "[.[] | select(.user.login == \"$OWNER\" and .author_association == \"OWNER\")
                | .body
                | capture(\"<!-- driver-review sha=(?<sha>[0-9a-f]{40}) verdict=(?<verdict>APPROVE|CHANGES) -->\")]
           | .[] | \"\\(.sha) \\(.verdict)\"" | tail -n 1)
  if [ -z "$marker" ]; then
    log "  skip: no driver-review marker from $OWNER"
    continue
  fi
  read -r rsha verdict <<<"$marker"
  if [ "$verdict" != "APPROVE" ]; then
    log "  skip: newest driver review (${rsha:0:7}) is $verdict"
    continue
  fi

  git fetch -q origin main "$head"
  approved=0
  if [ "$rsha" = "$head" ]; then
    approved=1
  else
    read -r _ p1 p2 extra <<<"$(git rev-list --parents -n 1 "$head")"
    if [ -n "$p1" ] && [ -n "${p2:-}" ] && [ -z "${extra:-}" ] && [ "$p1" = "$rsha" ] \
      && git merge-base --is-ancestor "$p2" origin/main \
      && [ "$(git merge-tree --write-tree "$p1" "$p2" 2>/dev/null || true)" = "$(git rev-parse "$head^{tree}")" ]; then
      approved=1
      log "  APPROVE for ${rsha:0:7} carries over the update-from-main merge ${head:0:7}"
    fi
  fi
  if [ "$approved" != 1 ]; then
    log "  skip: APPROVE is for ${rsha:0:7}, head is ${head:0:7}"
    continue
  fi

  paragraph=$(jq -r '.body // ""' <<<"$pr" | tr -d '\r' | awk 'BEGIN { RS = ""; ORS = "" } NR == 1 { print; exit }')
  trailer=$(git log --format=%B "origin/main..$head" | grep -i '^co-authored-by:' \
    | sort | uniq -c | sort -rn | head -n 1 | sed 's/^ *[0-9]* //')
  [ -n "$trailer" ] || trailer="Co-Authored-By: Claude <noreply@anthropic.com>"
  message="$paragraph"$'\n\n'"Driver review: APPROVE for $rsha."$'\n\n'"$trailer"

  if [ "$DRY_RUN" = 1 ]; then
    log "  DRY RUN: would squash-merge as \"$title (#$n)\" and delete $branch"
    continue
  fi

  gh api -X PUT "repos/$REPO/pulls/$n/merge" \
    -f merge_method=squash -f sha="$head" \
    -f commit_title="$title (#$n)" -f commit_message="$message" >/dev/null
  log "  merged"
  gh api -X DELETE "repos/$REPO/git/refs/heads/$branch" >/dev/null || log "  could not delete branch $branch"
  run_url="${GITHUB_SERVER_URL:-https://github.com}/$REPO/actions/runs/${GITHUB_RUN_ID:-0}"
  gh api -X POST "repos/$REPO/issues/$n/comments" -f body="<!-- auto-merge sha=$head -->
Merged by the auto-merge workflow: driver review APPROVE for \`${rsha:0:7}\`, required checks green on \`${head:0:7}\`. Run: $run_url" >/dev/null || true
  # A push made with the workflow token starts no workflow runs, so dispatch them.
  gh workflow run ci.yml --repo "$REPO" --ref main || log "  could not dispatch CI"
  gh workflow run pages.yml --repo "$REPO" --ref main || log "  could not dispatch Pages"
done
