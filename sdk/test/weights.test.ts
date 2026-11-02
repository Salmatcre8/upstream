import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  MAX_RECIPIENTS,
  TOTAL_WEIGHT,
  WeightError,
  account,
  assertValidRecipients,
  evenSplit,
  nested,
  payeeKey,
  recipientsFromShares,
  weightToPercent,
} from "../src/weights.js";

/** Distinct, well-formed account addresses to use as payees. */
const ADDRESSES = [
  "GBMDBJHWHLPYYO2LQH3W2WZYVB76HJFA2IS5AGPCPOH4NWMWYYKKOUBJ",
  "GBC3FCQMVSXZZQPGYWSLXU5KEYAXLA3PDHBNOAGTK5NKA2JBA4TZSKO6",
  "GDWNGXL6S6DN5RJYIJLJ6VRQ6FHRV7MWJVP7ML66NPZILI3NIXL6HVAB",
];
const [ALICE, BOB, CAROL] = ADDRESSES as [string, string, string];

const sum = (recipients: readonly { weight: number }[]) =>
  recipients.reduce((total, r) => total + r.weight, 0);

test("a 70/30 split becomes the ppm weights the contract expects", () => {
  const recipients = recipientsFromShares([
    { payee: account(ALICE), share: 70 },
    { payee: account(BOB), share: 30 },
  ]);

  assert.deepEqual(
    recipients.map((r) => r.weight),
    [700_000, 300_000],
  );
  assert.equal(sum(recipients), TOTAL_WEIGHT);
  assertValidRecipients(recipients);
});

test("shares are relative, so the units used do not matter", () => {
  const weights = ([
    [70, 30],
    [7, 3],
    [0.7, 0.3],
    [700, 300],
  ] as const).map(([a, b]) =>
    recipientsFromShares([
      { payee: account(ALICE), share: a },
      { payee: account(BOB), share: b },
    ]).map((r) => r.weight),
  );

  for (const w of weights) {
    assert.deepEqual(w, [700_000, 300_000]);
  }
});

test("an indivisible split still adds up to exactly the total", () => {
  const recipients = evenSplit([account(ALICE), account(BOB), account(CAROL)]);

  assert.deepEqual(
    recipients.map((r) => r.weight),
    [333_334, 333_333, 333_333],
  );
  assert.equal(sum(recipients), TOTAL_WEIGHT);
});

test("every split size from 1 to the maximum adds up to exactly the total", () => {
  for (let n = 1; n <= MAX_RECIPIENTS; n++) {
    const payees = Array.from({ length: n }, (_, i) => nested(i));
    const recipients = evenSplit(payees);

    assert.equal(sum(recipients), TOTAL_WEIGHT, `even split of ${n} does not sum to the total`);
    assert.ok(
      recipients.every((r) => r.weight > 0),
      `even split of ${n} produced a zero weight`,
    );
  }
});

test("the leftover goes to whoever rounding shortchanged the most", () => {
  // Exact weights are 166666.67, 333333.33 and 500000; one unit is spare and
  // belongs to the first, whose fractional part is the largest.
  const recipients = recipientsFromShares([
    { payee: account(ALICE), share: 1 },
    { payee: account(BOB), share: 2 },
    { payee: account(CAROL), share: 3 },
  ]);

  assert.deepEqual(
    recipients.map((r) => r.weight),
    [166_667, 333_333, 500_000],
  );
  assert.equal(sum(recipients), TOTAL_WEIGHT);
});

test("awkward share sets always add up to exactly the total", () => {
  const cases: number[][] = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [99.9999, 0.0001],
    [12.5, 87.5],
    [1, 1, 1, 999_997],
    [0.333333, 0.333333, 0.333334],
  ];

  for (const shares of cases) {
    const recipients = recipientsFromShares(
      shares.map((share, i) => ({ payee: nested(i), share })),
    );
    assert.equal(sum(recipients), TOTAL_WEIGHT, `${shares.join("/")} does not sum to the total`);
    assertValidRecipients(recipients);
  }
});

test("bigint shares are handled exactly", () => {
  const recipients = recipientsFromShares([
    { payee: account(ALICE), share: 2n },
    { payee: account(BOB), share: 1n },
  ]);

  assert.deepEqual(
    recipients.map((r) => r.weight),
    [666_667, 333_333],
  );
  assert.equal(sum(recipients), TOTAL_WEIGHT);
});

test("a split can mix accounts and nested splits", () => {
  const recipients = recipientsFromShares([
    { payee: account(ALICE), share: 90 },
    { payee: nested(0), share: 10 },
  ]);

  assert.deepEqual(recipients[0]!.payee.tag, "Account");
  assert.deepEqual(recipients[1]!.payee, { tag: "Split", values: [0n] });
  assertValidRecipients(recipients);
});

test("a share too small to earn a single ppm unit is rejected, not silently dropped", () => {
  assert.throws(
    () =>
      recipientsFromShares([
        { payee: account(ALICE), share: 1_000_000_000 },
        { payee: account(BOB), share: 1 },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof WeightError);
      assert.match((error as WeightError).message, /zero weight/);
      return true;
    },
  );
});

test("lists the contract would reject are refused before they cost a fee", () => {
  assert.throws(() => recipientsFromShares([]), WeightError);

  assert.throws(
    () =>
      recipientsFromShares(
        Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => ({ payee: nested(i), share: 1 })),
      ),
    /at most 50 recipients/,
  );

  assert.throws(
    () =>
      recipientsFromShares([
        { payee: account(ALICE), share: 1 },
        { payee: account(ALICE), share: 1 },
      ]),
    /duplicate recipient/,
  );

  for (const share of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => recipientsFromShares([{ payee: account(ALICE), share }]),
      WeightError,
      `share ${share} should be rejected`,
    );
  }

  assert.throws(() => recipientsFromShares([{ payee: account(ALICE), share: 0n }]), WeightError);
});

test("validation catches a hand-built list whose weights are wrong", () => {
  assert.throws(
    () =>
      assertValidRecipients([
        { payee: account(ALICE), weight: 700_000 },
        { payee: account(BOB), weight: 200_000 },
      ]),
    /add up to 900,000, not 1,000,000/,
  );

  assert.throws(
    () => assertValidRecipients([{ payee: account(ALICE), weight: TOTAL_WEIGHT + 1 }]),
    /add up to 1,000,001/,
  );

  assert.throws(
    () =>
      assertValidRecipients([
        { payee: account(ALICE), weight: TOTAL_WEIGHT },
        { payee: account(BOB), weight: 0 },
      ]),
    /positive whole numbers/,
  );

  assert.throws(
    () => assertValidRecipients([{ payee: account(ALICE), weight: 1.5 }]),
    /positive whole numbers/,
  );

  assert.doesNotThrow(() => assertValidRecipients([{ payee: account(ALICE), weight: TOTAL_WEIGHT }]));
});

test("payees read back as stable distinct keys", () => {
  assert.equal(payeeKey(account(ALICE)), `account:${ALICE}`);
  assert.equal(payeeKey(nested(7)), "split:7");
  assert.notEqual(payeeKey(nested(7)), payeeKey(account(ALICE)));
});

test("weights display as percentages", () => {
  assert.equal(weightToPercent(700_000), "70%");
  assert.equal(weightToPercent(333_333), "33.3333%");
  assert.equal(weightToPercent(1), "0.0001%");
});
