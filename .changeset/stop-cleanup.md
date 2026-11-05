---
"@figentra/testbed": patch
---

testbed-agent: a job stopped while it cleans up (Ctrl-C, SIGTERM, `job stop`) still removes its workspace and drops
the box's scale-in protection. Seen live on 2026-11-05: a cancelled job left both. Changes a hashed image input, so it
reaches boxes with the next image build.
