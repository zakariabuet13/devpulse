---
name: new-endpoint
argument-hint: "<METHOD> <path> - <what it does>"
description: Scaffold a DevPulse API endpoint test-first.
disable-model-invocation: true
allowed-tools: Bash(git grep *) Bash(npm test *) Bash(npm run typecheck)
---

# New endpoint: $ARGUMENTS

## Routes that already exist
!`git grep -nE "Router\.(get|post|put|patch|delete)\(" -- apps/api/src/routes || true`

## Steps
1. Restate the endpoint, invoke the *api-conventions* skill and follow it, list the files to touch, and *wait for my OK*. If the request is ambiguous (ordering, filters, status codes), ask first.
2. Shared schema first (reuse before adding).
3. Tests next: run them and confirm they fail for the missing route, not for a typo.
4. Route + DTO, registered if the router is new.
5. After every change: `npm test -w apps/api` and `npm run typecheck`.
6. Report: files changed, tests added, anything you deviated from. Don't commit.
