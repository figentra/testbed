/**
 * Stackra file contract:
 * Purpose: `fillComponent(document, values)`, which replaces every `@@NAME@@` placeholder of a component document with its value; a name with no value is an error, so no component ships unfilled.
 * Boundary: pure string work.
 * Runtime: node
 * Governing contract: ADR 0484 (decision 2); ADR 0171 (the program only declares).
 */

/** Replaces every `@@NAME@@` in a component document; a name with no value is an error, so none ships unfilled. */
export function fillComponent(document: string, values: Readonly<Record<string, string>>): string {
  return document.replaceAll(/@@([A-Z]+)@@/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`component placeholder @@${name}@@ has no value`);
    return value;
  });
}
