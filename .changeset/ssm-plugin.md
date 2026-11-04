---
"@figentra/testbed": patch
---

As figentra/stackra: `testbed` finds the aws CLI's Session Manager plugin itself (on `PATH`, else the mise-installed
copy, whose folder it puts first on `PATH` for the `aws` and `ssh` it starts). Without the plugin, `run` exits 75 at
once and says why instead of waiting on "no healthy testbed box" while the boxes are healthy, and `status` names the
reason a box did not answer.
