---
"@figentra/testbed": minor
---

The `testbed` CLI runs on @stackra/console 0.9.0: one command class per verb over `runTestbed`, every verb taking every
flag, a bare `--json` and `requireCommand`. The frozen interface of ADR 0522 decision 5 holds byte for byte: the verbs
and flags, the `run --json` line and `status --json` alone on stdout, the job's output on stderr under `--json`, exits
2, 73, 75 and 124, usage errors (no verb included) on stderr with stdout empty, and `testbed --box 2 ssh`. Streamed
tools share the terminal through the console's `io.process` (`inherit`), so `ssh` works from agents and pipes. New:
`--help` per verb, `--version`, and the console's global flags (`-v`, `-q`, `--ansi`); `--wait` is the positive form
of `--no-wait`; an extra word after a verb that takes none is now a usage error (exit 2).
