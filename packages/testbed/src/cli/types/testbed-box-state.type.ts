/**
 * Testbed file contract:
 * Purpose: `TestbedBoxState`, one running box with what a look at it found: healthy or not, and each of its slots free
 *          or busy.
 * Boundary: type only; `runTestbed` builds it, `pickTestbedSlot` and `summarizeTestbedRegion` read it.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); the testbed regions contract (STA-2042).
 */
import type { TestbedBox } from "#cli/types/testbed-box.type";

/** A running box and its state. */
export type TestbedBoxState = TestbedBox & {
  /** Whether `testbed-agent health` passed. */
  readonly healthy: boolean;

  /** The slots that were looked at, by kind (`heavy`, `light`); none for an unhealthy box. */
  readonly slots: Readonly<Record<string, "free" | "busy" | undefined>>;
};
