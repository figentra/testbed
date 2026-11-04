---
"@figentra/testbed": patch
---

As figentra/stackra: `testbed run` runs the job detached on the box and follows its log, reattaching after a dropped
SSH-over-SSM connection (Ctrl-C stops the job), with SSH keepalives, and `--postgres` reaches the agent; the enabled regions are eu-west-1, eu-west-2 and
eu-central-1. The program keeps only subnets in zones offering the heavy type, sets an optional permissions boundary
on its roles, gives both groups a one-day max lifetime and in-service metrics, and pins the job image's base by
digest. The agent's mise shims path is overridable, so its tests' stubs win inside the job container.
