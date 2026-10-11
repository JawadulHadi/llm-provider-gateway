# Notes: mistakes and fixes

## 2026-10-11: npm pulled in a TypeScript that the test tooling could not use

**What happened:** A plain `npm install` resolved TypeScript 7, which the Jest toolchain cannot use yet, so the tests could not run.
**Fix:** Pinned TypeScript to 5.6 in `package.json`.
**What I would do differently:** Pin the compiler version from day one in any repo whose test runner depends on it.

## 2026-10-11: CI "failed" in 3 seconds with no logs

**What happened:** The first CI runs went red in 2 to 3 seconds. `gh run view --log-failed` returned "log not found", which made it look like a broken workflow file.
**Root cause:** Not the code or the workflow. The run annotation said the job was not started because the GitHub account was locked over a billing issue, so no step ever ran.
**Fix:** Once the account lock was cleared, re-ran the checks. CI then passed on the same workflow with no changes to it.
**What I would do differently:** Read the run annotations (`gh run view <id>`) before touching the workflow. A red check that finishes in seconds with no logs is an account or runner problem, not a test failure.

