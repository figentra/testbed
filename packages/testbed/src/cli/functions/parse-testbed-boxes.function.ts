/**
 * Testbed file contract:
 * Purpose: `parseTestbedBoxes(json)`, the running testbed instances from `aws ec2 describe-instances` output (an array
 *          of `{ id, ip, group, launch }`), numbered by launch time, each tagged with the region it was read in.
 * Boundary: pure; unparsable output or a row without an address gives no box, never a throw.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI).
 */
import type { TestbedBox } from "#cli/types/testbed-box.type";

/**
 * The boxes in `json`, oldest launch first (box 1 is the oldest).
 *
 * @param json - the `--query` result of `aws ec2 describe-instances`.
 * @param region - the region the call was made in; every box carries it.
 * @example
 * parseTestbedBoxes('[{"id":"i-1","ip":"1.2.3.4","group":"heavy","launch":"2026-10-30T00:00:00Z"}]', "eu-west-1");
 */
export function parseTestbedBoxes(json: string, region: string): readonly TestbedBox[] {
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const boxes: TestbedBox[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    if (typeof row?.["id"] !== "string" || typeof row["ip"] !== "string") continue;
    boxes.push({
      id: row["id"],
      region,
      ip: row["ip"],
      group: typeof row["group"] === "string" ? row["group"] : "",
      launchedAt: Date.parse(String(row["launch"])) || 0,
    });
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts an array built here, which nothing else holds; toSorted is ES2023 and the base lib is ES2022
  return boxes.sort((a, b) => a.launchedAt - b.launchedAt || a.id.localeCompare(b.id));
}
