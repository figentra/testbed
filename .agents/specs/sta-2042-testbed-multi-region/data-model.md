# Data model: The testbed in four regions

**Spec**: `.agents/specs/sta-2042-testbed-multi-region/spec.md` · **Linear**: STA-2042

No database. The shapes below are configuration and CLI state.

## Plan input (`testbedPlan`)

| Field         | Change       | Meaning                                                                |
| ------------- | ------------ | ---------------------------------------------------------------------- |
| `region`      | new          | one of the four regions; default `eu-west-1`                           |
| (plan) `home` | new, derived | `region === TESTBED_DEFAULTS.homeRegion`; decides the global resources |

## Stack

`testbed-<region>`: config `region` plus today's keys (`identityId`, `ciGateProjectId`, `groups`, `heavyMin`,
`lightMin`, optional `sshCidrs`).

## CLI settings

| Field     | Change | Source, first wins                                                                   |
| --------- | ------ | ------------------------------------------------------------------------------------ |
| `regions` | new    | `--regions a,b`, then `STACKRA_TESTBED_REGIONS`, then `TESTBED_CLI_DEFAULTS.regions` |
| `region`  | kept   | `--region` narrows `regions` to that one                                             |

## A discovered box

The existing fields, plus `region`.

## Region state (picker input)

Per region: the boxes (each with region, kind, slots, health), and each group's desired and max counts, or
`unreachable`.
