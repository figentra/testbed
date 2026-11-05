---
"@figentra/testbed": patch
---

`testbed run` exits 75 at once, with AWS's reason, when no enabled region answers (a bad or expired AWS profile),
instead of printing "no healthy testbed box, waiting" until the caller's own timeout. The GitHub fallback still goes
first. The docs name exit 130 (stopped by Ctrl-C or SIGTERM).
