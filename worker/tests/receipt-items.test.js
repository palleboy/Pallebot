import assert from "node:assert/strict";
import test from "node:test";

import { allDeleteRequest, applyReceiptCorrection, canonicalItemName } from "../src/index.js";

test("samler sikre stavemåder af tun", () => {
  assert.equal(canonicalItemName("TUN"), "Tun");
  assert.equal(canonicalItemName("tunfisk"), "Tun");
  assert.equal(canonicalItemName("tun fisk"), "Tun");
});

test("retter antal og stykspris på en kvitteringslinje", () => {
  const items = [{ name: "Tun", quantity: 1, unitPrice: 20, lineTotal: 20 }];
  const result = applyReceiptCorrection(items, "ret 1 til 3 x 20");

  assert.equal(result.error, undefined);
  assert.equal(items[0].quantity, 3);
  assert.equal(items[0].unitPrice, 20);
  assert.equal(items[0].lineTotal, 60);
});

test("kan fjerne en fejllæst varelinje før gemning", () => {
  const items = [
    { name: "Tun", quantity: 1, unitPrice: 20, lineTotal: 20 },
    { name: "Mælk", quantity: 1, unitPrice: 15, lineTotal: 15 },
  ];
  const result = applyReceiptCorrection(items, "fjern 1");

  assert.equal(result.removed, true);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "Mælk");
});

test("genkender naturlige slet-alt-kommandoer", () => {
  assert.equal(allDeleteRequest("slet alle mine noter")?.table, "notes");
  assert.equal(allDeleteRequest("slet alle mine varer på indkøbslisten")?.table, "shopping_items");
  assert.equal(allDeleteRequest("ryd mine påmindelser")?.activeOnly, true);
  assert.equal(allDeleteRequest("slet note 1"), null);
});
