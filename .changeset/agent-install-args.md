---
"@figentra/testbed": patch
---

The box agent reads pnpm flags from a repository's `.testbed/install-args` and keeps Uniwind Pro's verified tarball in
the box's pnpm cache (`UNIWIND_CACHE_DIR`), byte for byte as figentra/stackra #417 and #425.
