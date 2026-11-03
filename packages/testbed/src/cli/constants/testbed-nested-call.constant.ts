/**
 * Testbed file contract:
 * Purpose: `TESTBED_NESTED_CALL`, a command that calls the testbed itself: `testbed`, `ci-box` or `stackra testbed`
 *          as a command word followed by one of their verbs.
 * Boundary: data only. It matches the command word, not a substring, so `pnpm --filter @figentra/testbed test` and
 *           `testbed-agent status` are allowed.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI).
 */

/**
 * A command word starts the line or follows `;`, `&`, `|`, `(`, a backtick or a quote, optionally behind `pnpm`,
 * `pnpm exec` or `npx`. `ci-box` and `stackra testbed` exist only to reach the testbed, so any call of them counts
 * (`ci-box -b 2 ssh` included); `testbed` counts when one of its verbs follows, after any flags (`testbed --json run`).
 * shortcut: an env prefix (`X=1 testbed run`) is not seen; widen the start set when one turns up.
 */
export const TESTBED_NESTED_CALL =
  /(?:^|[;&|(`'"])\s*(?:pnpm\s+(?:exec\s+)?|npx\s+)?(?:ci-box(?=\s|$)|stackra\s+testbed(?=\s|$)|testbed(?:\s+-\S+(?:\s+\d+)?)*\s+(?:run|status|unlock|ssh|sync|ip|scale|image)\b)/;
