/**
 * Stackra file contract:
 * Purpose: `TestbedInputFile`, one file the program uploads: the S3 key under `build/` and where it is read from.
 * Boundary: a type only.
 * Runtime: node
 * Governing contract: ADR 0484 (decision 2).
 */

/** One file the image build reads from the build bucket. */
export type TestbedInputFile = {
  /** The object key in the build bucket, `build/<name>`. */
  readonly key: string;
  /** The local file uploaded under that key. */
  readonly path: string;
};
