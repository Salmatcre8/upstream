import { strict as assert } from "node:assert";
import { test } from "node:test";

import { AmountError, STROOP_DECIMALS, formatAmount, parseAmount } from "../src/amounts.js";

test("decimal amounts parse to exact base units", () => {
  assert.equal(parseAmount("1"), 10_000_000n);
  assert.equal(parseAmount("1.5"), 15_000_000n);
  assert.equal(parseAmount("0.7"), 7_000_000n);
  assert.equal(parseAmount("10"), 100_000_000n);
  assert.equal(parseAmount("0.0000001"), 1n);
  assert.equal(parseAmount("0"), 0n);
  assert.equal(parseAmount(" 2.25 "), 22_500_000n);
  assert.equal(parseAmount(".5"), 5_000_000n);
  assert.equal(parseAmount("-1.5"), -15_000_000n);
});

test("parsing is exact where floating point is not", () => {
  // 0.1 * 1e7 is 1000000.0000000001 in binary floating point.
  assert.equal(parseAmount("0.1"), 1_000_000n);
  assert.equal(parseAmount("0.29"), 2_900_000n);
  assert.equal(parseAmount("1234567.1234567"), 12_345_671_234_567n);
});

test("amounts beyond Number.MAX_SAFE_INTEGER survive", () => {
  assert.equal(parseAmount("922337203685.4775807"), 9_223_372_036_854_775_807n);
});

test("other token decimals are supported", () => {
  assert.equal(parseAmount("2", 6), 2_000_000n);
  assert.equal(parseAmount("250", 0), 250n);
  assert.equal(formatAmount(250n, 0), "250");
});

test("amounts that cannot be represented are rejected", () => {
  assert.throws(() => parseAmount("0.00000001"), AmountError, "8 decimals in a 7-decimal token");
  assert.throws(() => parseAmount("1.5", 0), AmountError);
  for (const bad of ["", " ", "abc", "1.2.3", "1e7", "0x10", "--1", "1,000"]) {
    assert.throws(() => parseAmount(bad), AmountError, `${JSON.stringify(bad)} should be rejected`);
  }
});

test("base units format back to readable decimals", () => {
  assert.equal(formatAmount(10_000_000n), "1");
  assert.equal(formatAmount(15_000_000n), "1.5");
  assert.equal(formatAmount(7_000_000n), "0.7");
  assert.equal(formatAmount(6_000_000n), "0.6");
  assert.equal(formatAmount(1n), "0.0000001");
  assert.equal(formatAmount(0n), "0");
  assert.equal(formatAmount(-15_000_000n), "-1.5");
  assert.equal(formatAmount(2_000_000n, 6), "2");
});

test("parse and format round-trip", () => {
  // Each of these is already in the canonical form formatAmount produces, so a
  // round trip must return the text unchanged. Note that going through Number
  // would not: String(Number("0.0000001")) is "1e-7".
  for (const text of ["0", "1", "0.7", "1.5", "123.4567891", "0.0000001", "999999.9999999"]) {
    assert.equal(formatAmount(parseAmount(text)), text, `round trip of ${text}`);
  }
  assert.equal(STROOP_DECIMALS, 7);
});
