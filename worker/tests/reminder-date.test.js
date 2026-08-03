import assert from "node:assert/strict";
import test from "node:test";

import { parseReminderDate } from "../src/index.js";

test("fortolker relativ tid", () => {
  const now = new Date("2026-08-03T10:00:00.000Z");
  assert.equal(
    parseReminderDate("om 10 minutter", now).toISOString(),
    "2026-08-03T10:10:00.000Z",
  );
});

test("fortolker i morgen i dansk tidszone", () => {
  const now = new Date("2026-08-03T10:00:00.000Z");
  assert.equal(
    parseReminderDate("i morgen klokken 14", now).toISOString(),
    "2026-08-04T12:00:00.000Z",
  );
});

test("fortolker næste ugedag", () => {
  const now = new Date("2026-08-03T10:00:00.000Z"); // Mandag
  assert.equal(
    parseReminderDate("på fredag klokken 09", now).toISOString(),
    "2026-08-07T07:00:00.000Z",
  );
});

test("afviser ugyldige klokkeslæt", () => {
  assert.equal(parseReminderDate("i morgen klokken 29"), null);
});
