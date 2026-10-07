#!/usr/bin/env bash
# Smoke test for the REST API (curl only, no jq). Exits non-zero on the first failed check.
#
#   BASE_URL=http://localhost:4100 MODE=dev npm run smoke -w apps/api
#
# MODE=dev|prod must match the server's NODE_ENV (error body shape differs).
# The script reseeds first (SKIP_RESEED=1 to disable): it deletes seeded rows, so it must start
# from fresh seed data to be repeatable.
set -u

BASE_URL="${BASE_URL:-http://localhost:4000}"
MODE="${MODE:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

STATUS=""
BODY=""

pass() { echo "PASS  $1"; }
fail() {
  echo "FAIL  $1"
  echo "      status=$STATUS body=$BODY"
  exit 1
}

# call METHOD PATH [JSON]  -> sets STATUS, BODY; response headers in $TMP/hdr
call() {
  local method="$1" path="$2" data="${3-}"
  if [ -n "$data" ]; then
    STATUS=$(curl -s -o "$TMP/body" -D "$TMP/hdr" -w '%{http_code}' -X "$method" \
      -H 'Content-Type: application/json' --data "$data" "$BASE_URL$path")
  else
    STATUS=$(curl -s -o "$TMP/body" -D "$TMP/hdr" -w '%{http_code}' -X "$method" "$BASE_URL$path")
  fi
  BODY="$(cat "$TMP/body")"
}

# status NAME CODE
status() { [ "$STATUS" = "$2" ] && pass "$1 -> $2" || fail "$1 expected $2"; }
# has NAME REGEX / lacks NAME REGEX (grep -E on the compact body)
has() { grep -qE -- "$2" <<<"$BODY" && pass "$1" || fail "$1 (missing /$2/)"; }
lacks() { grep -qE -- "$2" <<<"$BODY" && fail "$1 (unexpected /$2/)" || pass "$1"; }
count_of() { grep -o -- "$1" <<<"$BODY" | wc -l | tr -d ' '; }
first_id() { grep -o '"id":"[^"]*"' <<<"$BODY" | head -1 | cut -d'"' -f4; }
all_ids() { grep -o '"id":"[^"]*"' <<<"$BODY" | cut -d'"' -f4; }
# eq NAME ACTUAL EXPECTED
eq() { [ "$2" = "$3" ] && pass "$1" || fail "$1 (got '$2', want '$3')"; }

if [ "${SKIP_RESEED:-0}" != "1" ]; then
  (cd "$SCRIPT_DIR/.." && npm run db:seed >/dev/null 2>&1) && pass "reseed" || fail "reseed"
fi

# --- health ---
call GET /health; status "GET /health" 200

# --- teams: list / pagination ---
call GET /teams; status "GET /teams" 200
has "teams page envelope" '"items".*"total".*"limit":20,"offset":0'
call GET '/teams?limit=1'; status "GET /teams?limit=1" 200
eq "limit=1 returns 1 item" "$(count_of '"createdAt"')" 1
call GET '/teams?limit=0'; status "limit=0" 400; has "limit=0 array body" '^\{"error":\['
call GET '/teams?limit=101'; status "limit=101" 400; has "limit=101 array body" '^\{"error":\['

call GET '/teams?limit=100'
SEED_TEAM=$(grep -o '"id":"[^"]*","name":"Platform"' <<<"$BODY" | head -1 | cut -d'"' -f4)
[ -n "$SEED_TEAM" ] && pass "found seed team" || fail "seed team 'Platform' not found"

# --- teams: create / validation ---
call POST /teams '{"name":"smoke-a"}'; status "POST /teams" 201
TEAM_A=$(first_id)
call POST /teams '{"name":"  "}'; status "POST /teams blank name" 400
has "blank name array body" '^\{"error":\['
has "blank name path" '"path":\["name"\]'
call POST /teams '{bad'; status "POST /teams malformed JSON" 400
if [ "$MODE" = "prod" ]; then
  has "malformed JSON prod string" '^\{"error":"[^"]+"\}$'
else
  has "malformed JSON dev code" '"code":"BAD_REQUEST"'
fi

# --- teams: CRUD ---
call GET "/teams/$TEAM_A"; status "GET /teams/:id" 200; has "team has createdAt" '"createdAt"'
call PATCH "/teams/$TEAM_A" '{"name":"smoke-b"}'; status "PATCH team rename" 200; has "renamed" '"name":"smoke-b"'
call PATCH "/teams/$TEAM_A" '{}'; status "PATCH team {}" 400
call PATCH "/teams/$TEAM_A" '{"nmae":"x"}'; status "PATCH team unknown key" 400
call GET /teams/nope; status "GET /teams/nope" 404
call POST /teams '{"name":"smoke-empty"}'; TEAM_EMPTY=$(first_id)
call DELETE "/teams/$TEAM_EMPTY"; status "DELETE empty team" 204
call DELETE "/teams/$TEAM_EMPTY"; status "DELETE empty team again" 404

# --- members ---
call POST "/teams/$TEAM_A/members" '{"name":"Smoke","githubLogin":"smoke-user"}'; status "POST member" 201
MEMBER=$(first_id)
call POST "/teams/$TEAM_A/members" '{"name":"Dup","githubLogin":"Ada"}'; status "POST member dup login (case)" 409
has "dup login message" 'githubLogin already exists'
if [ "$MODE" = "prod" ]; then
  has "409 prod body exact" '^\{"error":"githubLogin already exists"\}$'
else
  has "409 dev envelope" '"code":"CONFLICT".*"stack"|"stack".*"code":"CONFLICT"'
fi
call POST "/teams/$TEAM_A/members" '{"name":"Bad","githubLogin":"-x"}'; status "POST member bad login" 400
call PATCH "/members/$MEMBER" '{"githubLogin":"SMOKE-USER"}'; status "PATCH member own login, new case" 200
call POST /teams '{"name":"smoke-target"}'; TEAM_B=$(first_id)
call PATCH "/members/$MEMBER" "{\"teamId\":\"$TEAM_B\"}"; status "PATCH member move" 200
has "member moved" "\"teamId\":\"$TEAM_B\""
call PATCH "/members/$MEMBER" '{"teamId":"missing"}'; status "PATCH member move to missing team" 404
call GET /teams/nope/members; status "GET members of missing team" 404
call GET "/teams/$SEED_TEAM/members"; status "GET seed members" 200; has "seed members listed" '"githubLogin":"ada"'

# --- repositories ---
call GET "/teams/$SEED_TEAM/repositories"; status "GET seed repos" 200
API_REPO=$(grep -o '"id":"[^"]*","teamId":"[^"]*","githubFullName":"devpulse/api"' <<<"$BODY" | head -1 | cut -d'"' -f4)
[ -n "$API_REPO" ] && pass "found seed repo devpulse/api" || fail "seed repo not found"
call POST "/teams/$TEAM_A/repositories" '{"githubFullName":"devpulse/API"}'; status "POST repo dup name (case)" 409
has "dup repo message" 'githubFullName already exists'
call POST "/teams/$TEAM_A/repositories" '{"githubFullName":"bad"}'; status "POST repo bad name" 400
call POST "/teams/$TEAM_A/repositories" '{"githubFullName":"smoke/repo-one"}'; status "POST repo" 201
REPO=$(first_id)
call PATCH "/repositories/$REPO" "{\"teamId\":\"$TEAM_B\"}"; status "PATCH repo move" 200
call GET "/repositories/$REPO"; status "GET repo" 200

# --- team with members / repos ---
call DELETE "/teams/$TEAM_B"; status "DELETE non-empty team" 409
has "non-empty team message" 'Team has members or repositories'
if [ "$MODE" = "prod" ]; then
  has "409 prod body exact" '^\{"error":"Team has members or repositories"\}$'
fi
call DELETE "/members/$MEMBER"; status "DELETE member" 204
call DELETE "/repositories/$REPO"; status "DELETE repo" 204
call DELETE "/teams/$TEAM_B"; status "DELETE team after children removed" 204
call DELETE "/teams/$TEAM_A"; status "DELETE team A" 204

# --- issues (seed repo devpulse/api: 5 issues; 2 labelled bug) ---
call GET "/repositories/$API_REPO/issues?state=OPEN"; status "issues ?state=OPEN" 200
has "OPEN present" '"state":"OPEN"'; lacks "no CLOSED" '"state":"CLOSED"'
call GET "/repositories/$API_REPO/issues?priority=HIGH,URGENT"; status "issues ?priority=HIGH,URGENT" 200
has "HIGH present" '"priority":"HIGH"'; lacks "no LOW/MEDIUM" '"priority":"(LOW|MEDIUM)"'
call GET "/repositories/$API_REPO/issues?label=bug"; status "issues ?label=bug" 200
eq "2 bug issues" "$(count_of '"githubCreatedAt"')" 2
call GET "/repositories/$API_REPO/issues?sort=priority&order=asc"; status "issues sort priority asc" 200
FIRST_PRIORITY=$(grep -o '"priority":"[A-Z]*"' <<<"$BODY" | head -1)
eq "lowest priority first" "$FIRST_PRIORITY" '"priority":"LOW"'
call GET "/repositories/$API_REPO/issues?limit=2&offset=0"; status "issues page 0" 200; P0=$(all_ids)
call GET "/repositories/$API_REPO/issues?limit=2&offset=2"; status "issues page 1" 200; P1=$(all_ids)
eq "pages hold 2+2 distinct ids" "$(printf '%s\n%s\n' "$P0" "$P1" | sort -u | wc -l | tr -d ' ')" 4
call GET "/repositories/$API_REPO/issues?state=BOGUS"; status "issues ?state=BOGUS" 400
call GET /repositories/nope/issues; status "issues of missing repo" 404

call GET "/repositories/$API_REPO/issues?limit=1"; ISSUE=$(first_id)
call PATCH "/issues/$ISSUE" '{"priority":"LOW"}'; status "PATCH issue priority" 200; has "priority LOW" '"priority":"LOW"'
call GET "/issues/$ISSUE"; status "GET issue" 200; has "GET reflects LOW" '"priority":"LOW"'
call PATCH "/issues/$ISSUE" '{"title":"x"}'; status "PATCH issue title" 400
call PATCH "/issues/$ISSUE" '{"priority":"NOPE"}'; status "PATCH issue bad priority" 400

# --- pull requests ---
call GET "/repositories/$API_REPO/pull-requests"; status "PR list" 200
PR=$(first_id)
call GET "/repositories/$API_REPO/pull-requests?state=MERGED"; status "PR ?state=MERGED" 200
has "MERGED present" '"state":"MERGED"'; lacks "only MERGED" '"state":"(OPEN|CLOSED)"'
lacks "mergedAt set" '"mergedAt":null'
call GET "/pull-requests/$PR"; status "GET PR" 200
call PATCH "/pull-requests/$PR" '{"title":"x"}'; status "PATCH PR (no route)" 404

# --- error shape by mode ---
call GET /teams/nope; status "404 for shape check" 404
if [ "$MODE" = "prod" ]; then
  eq "404 prod body exact" "$BODY" '{"error":"Team not found"}'
else
  has "404 dev code" '"code":"NOT_FOUND"'; has "404 dev stack" '"stack"'
fi
call GET /no/such/route; status "unknown route" 404
has "unknown route message" 'Route not found'

# --- request id ---
grep -qi '^x-request-id: ' "$TMP/hdr" && pass "X-Request-Id header" || fail "X-Request-Id header missing"

# --- cascade: deleting a repo removes its issues (last: removes seed data) ---
call DELETE "/repositories/$API_REPO"; status "DELETE seed repo with issues" 204
call GET "/issues/$ISSUE"; status "cascaded issue gone" 404

echo "ALL CHECKS PASSED"
