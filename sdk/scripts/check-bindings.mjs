/**
 * Fail if src/bindings.ts has drifted from what the contract's own interface
 * generates, so the client cannot silently describe a contract that no longer
 * exists.
 *
 * The contract's Wasm is built from this repository and the bindings are
 * generated from that, so this needs no network access.
 *
 *   node scripts/check-bindings.mjs          # verify
 *   node scripts/check-bindings.mjs --write  # regenerate in place
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(sdkRoot, "..");
const vendored = join(sdkRoot, "src", "bindings.ts");
const wasm = join(repoRoot, "target", "wasm32v1-none", "release", "upstream.wasm");
const write = process.argv.includes("--write");
let failed = false;

/** The header we keep on top of the generated file. */
function headerOf(text) {
  const marker = 'import { Buffer } from "buffer";';
  const at = text.indexOf(marker);
  return at === -1 ? "" : text.slice(0, at);
}

/**
 * Report a failure and make sure the process really exits non-zero. Setting
 * `process.exitCode` alone is easy to lose, and a check that reports a problem
 * while exiting 0 is worse than no check at all.
 */
function fail(message) {
  console.error(message);
  failed = true;
}

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

let out;
try {
  // The CLI insists the output directory's basename is a valid npm package
  // name, so it must be lowercase — which mkdtemp's suffix is not.
  out = mkdtempSync(join(tmpdir(), "upstream-"));
  const generatedDir = join(out, "bindings");
  mkdirSync(generatedDir);

  console.log("building the contract...");
  run("stellar", ["contract", "build"], repoRoot);

  console.log("generating bindings...");
  run(
    "stellar",
    [
      "contract",
      "bindings",
      "typescript",
      "--wasm",
      wasm,
      "--output-dir",
      generatedDir,
      "--overwrite",
    ],
    repoRoot,
  );

  const generated = readFileSync(join(generatedDir, "src", "index.ts"), "utf8");
  const current = readFileSync(vendored, "utf8");
  const header = headerOf(current);
  const expected = header + generated;

  // Generating from a local Wasm leaves no contract address behind, so compare
  // everything except the `networks` block, which we maintain by hand.
  const withoutNetworks = (text) => text.replace(/export const networks = \{[\s\S]*?\} as const/, "");

  if (withoutNetworks(expected).trim() === withoutNetworks(current).trim()) {
    console.log("bindings are up to date");
  } else if (write) {
    const networks = /export const networks = \{[\s\S]*?\} as const/.exec(current)?.[0];
    const merged = networks
      ? expected.replace(/export const networks = \{[\s\S]*?\} as const/, networks)
      : expected;
    writeFileSync(vendored, merged);
    console.log("bindings rewritten; review the diff and commit it");
  } else {
    console.error(
      "src/bindings.ts does not match the contract's interface.\n" +
        "Run `npm run regenerate` and commit the result.",
    );
    process.exitCode = 1;
  }
} catch (error) {
  const message = error?.stderr?.toString() || error?.message || String(error);
  if (/ENOENT|not recognized|is not recognized/i.test(message)) {
    fail(
      "the stellar CLI is required for this check: " +
        "https://developers.stellar.org/docs/tools/cli/install-cli",
    );
  } else {
    fail(message);
  }
} finally {
  if (out) rmSync(out, { recursive: true, force: true });
}

if (failed) {
  process.exit(1);
}
