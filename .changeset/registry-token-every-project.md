---
"@figentra/testbed": patch
---

Every project's box job can read the registry: the plan grants `prod` `/ci/registry` of the CI project to every
project (the `*` key of `grants.json`, which the agent adds to each project's own paths), and the agent gives pnpm the
token under both names (`FIGENTRA_REGISTRY_TOKEN` first, `STACKRA_REGISTRY_TOKEN` second) with the repository's own
`.npmrc` as its auth file, since pnpm 12 ignores `${...}` in a project `.npmrc`. Changes a hashed image input: the image
is rebuilt, and each region's launch template changes with its next `up`.
