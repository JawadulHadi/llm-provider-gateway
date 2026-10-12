# Changelog

All notable changes to llm-provider-gateway. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has no version tags yet, so
past entries are grouped by merged pull request and date.

Every change adds an entry under **Unreleased** in the same pull request. CI checks this.

## [Unreleased]

### Added
- Hosted demo on Vercel: `public/index.html` plus the `api/demo.ts` function, which runs
  `src/demo.ts` against mock providers (no model, no API key). It shows retries with backoff,
  fallback, the circuit breaker opening, cost tracking and a `chatJson` repair. `vercel.json`
  sets the build command and the `public` output directory, which fixes the Vercel error
  "No Output Directory named public found". Test in `test/demo.test.ts`.
- `CHANGELOG.md` (this file), a pull request template, and a CI job that fails a pull request
  which doesn't update the changelog. Label a PR `skip-changelog` to bypass it.
- README "Changelog and contributing" section.

### Security
- The `changelog` CI workflow now limits its token to read-only repository access.

## PR #2 (2026-10-12)

### Added
- First real `NOTES.md` entries.

## PR #1 (2026-10-12)

### Added
- Architecture diagram in the README, install-from-GitHub instructions (`prepare` builds `dist/`), MIT license, and CI (typecheck, tests, build).

## Initial commit (2026-10-11)

### Added
- Provider-agnostic LLM layer in TypeScript: Ollama, Anthropic and OpenAI-compatible adapters, retries with jitter, timeouts, fallback chain, circuit breaker, cost tracking, and zod-validated JSON output.
