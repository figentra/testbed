# Quickstart: validate the testbed in four regions

**Spec**: `.agents/specs/sta-2042-testbed-multi-region/spec.md` · **Linear**: STA-2042

Tests run on a ci-box. Applies are the owner's, through `apply-testbed.yml`.

1. **Unit:**
   ```
   pnpm --filter @stackra/infra-testbed test
   pnpm --filter @stackra/cli test
   ```
   Expected:
   - home and member stacks declare what P-001, P-003, P-004 and P-008 say;
   - the picker and `--json` match P-005 to P-012.
2. **Preview per region (owner):** `action=preview region=eu-west-2 groups=true`. Expected: a security group, a launch
   template and two groups in eu-west-2, and nothing else.
3. **Home `up` then `build-image` (owner).** Expected:
   - the stack is renamed `testbed-eu-west-1`;
   - the build's distribution lists four regions;
   - `aws ssm get-parameter --name /imagebuilder/stackra-testbed/ami --region <r>` returns an AMI in each region.
4. **A region joins:**
   - the owner applies `up` for the region (groups on, 0/0);
   - its line is added to `TESTBED_CLI_DEFAULTS.regions`;
   - `stackra testbed run … --json` with the earlier regions busy lands there (AC-001).
5. **Gate interface:** `stackra testbed status --json` lists each enabled region's free and total slots, and `run
--json` prints one result line with the job's exit code.
