/**
 * Testbed file contract:
 * Purpose: `TestbedCommand(options)`, the base of every `testbed` verb: a @stackra/console `Command` that declares the
 *          flags the CLI has always taken on every verb (`--box`, `--slot`, `--preset`, `--ref`, `--no-wait`,
 *          `--on-demand`, `--ssh-direct`, `--profile`, `--region`, `--regions`, `--key`; `--json` and `--help` are the
 *          console's own), and a `handle` that builds the `TestbedRequest` and runs it through `runTestbed`. A verb
 *          adds its arguments and `args()`. Every verb declaring every flag keeps the old parser's acceptance and lets a
 *          value flag come before the verb (`testbed --box 2 ssh`).
 * Boundary: no verb logic here; `runTestbed` holds it. Writes only to the run's stdout and stderr, so under the bare
 *           `--json` of the console the one result line `runTestbed` prints is the only stdout. `--key` names a key
 *           file, not a secret (`secret: false`), so streamed tools may share the terminal.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI, decision 5); ADR 0506 (the console, amendment 2026-11-03).
 */
import { homedir } from "node:os";

import { Command, Option } from "@stackra/console";
import type { CommandIo } from "@stackra/console";
import type { CommandOptions } from "@stackra/console/contracts";
import { Str } from "@stackra/validation";

import { createTestbedDeps } from "#cli/functions/create-testbed-deps.function";
import { resolveTestbedSettings } from "#cli/functions/resolve-testbed-settings.function";
import { runTestbed } from "#cli/functions/run-testbed.function";
import type { TestbedDeps } from "#cli/types/testbed-deps.type";

/**
 * The base of one `testbed` verb, named by `options.name`.
 *
 * @param options - the verb's name, description and examples.
 * @example
 * export class ImageCommand extends TestbedCommand({ name: "image", description: "Show the AMI and its age" }) {}
 */
export function TestbedCommand(options: CommandOptions) {
  /** The flags of every verb, and the run. */
  class TestbedOptions extends Command(options) {
    /** `--box`: a number (by launch time, from 1) or an instance id. */
    @Option({ description: "The box: its number (by launch time, from 1) or its instance id" })
    @Str
    box?: string;

    /** `--slot`: the slot `unlock` stops and `scale` raises. */
    @Option({
      description: "The slot unlock stops or scale raises",
      choices: ["heavy", "light"],
    })
    slot?: string;

    /** `--preset`: the fallback workflow's preset when no box is healthy. */
    @Option({
      description:
        "With no healthy box, dispatch the fallback workflow: verify, e2e or integration",
    })
    @Str
    preset?: string;

    /** `--ref`: the git ref the fallback workflow runs. */
    @Option({ description: "The git ref the fallback workflow runs (needed with --preset)" })
    @Str
    ref?: string;

    /** `--no-wait` sets it false: with no healthy box exit 75, with every slot busy exit 73. */
    @Option({
      description:
        "Wait for a free slot; --no-wait exits 75 (no healthy box) or 73 (every slot busy)",
    })
    wait = true;

    /** `--on-demand`: the heavy (on-demand) slot whatever the command, so spot never interrupts it. */
    @Option({ description: "Run in the heavy (on-demand) slot whatever the command" })
    onDemand = false;

    /** `--ssh-direct`: the public IP and this machine's address in the allowlist, instead of SSM. */
    @Option({
      description: "Reach the box by its public IP (allowlisting this machine) instead of SSM",
    })
    sshDirect = false;

    /** `--profile`: the AWS profile. */
    @Option({
      description: "The AWS profile (default: STACKRA_TESTBED_AWS_PROFILE, then academorix)",
    })
    @Str
    profile?: string;

    /** `--region`: one region, narrowing the enabled list to it. */
    @Option({ description: "Use this one region" })
    @Str
    region?: string;

    /** `--regions`: the enabled regions, comma-separated. */
    @Option({
      description: "The enabled regions, comma-separated (default: STACKRA_TESTBED_REGIONS)",
    })
    @Str
    regions?: string;

    /** `--key`: the SSH key file; a path, not a secret value. */
    @Option({
      description: "The SSH key file (default: STACKRA_TESTBED_SSH_KEY, then the testbed key)",
      secret: false,
    })
    @Str
    key?: string;

    /** Stand-ins for the real processes, clock and claim folder; tests pass them through the container. */
    readonly deps: Partial<TestbedDeps>;

    /**
     * @param deps - stand-ins for parts of the real `TestbedDeps`.
     */
    constructor(deps: Partial<TestbedDeps> = {}) {
      super();
      this.deps = deps;
    }

    /** The verb's arguments, in the order `runTestbed` reads them. */
    args(): readonly string[] {
      return [];
    }

    /** Runs the verb and resolves with its exit code. */
    async handle(io: CommandIo): Promise<number> {
      return runTestbed(
        {
          verb: options.name,
          args: this.args(),
          cwd: io.cwd,
          box: this.box,
          slot: this.slot,
          preset: this.preset,
          ref: this.ref,
          noWait: !this.wait,
          onDemand: this.onDemand,
          json: io.json,
          settings: resolveTestbedSettings(
            {
              profile: this.profile,
              region: this.region,
              regions: this.regions,
              key: this.key,
              "ssh-direct": this.sshDirect,
            },
            process.env,
            homedir(),
          ),
        },
        { ...createTestbedDeps(io), ...this.deps },
        {
          out: (text) => io.stdout.write(text),
          err: (text) => io.stderr.write(text),
          inherit: false,
        },
      );
    }
  }
  return TestbedOptions;
}
