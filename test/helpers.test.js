import { test } from "node:test";
import assert from "node:assert/strict";
import { autoRegions, parseRegions } from "../src/swarm-build.js";

test("parseRegions reads comma or semicolon separated quads", () => {
  assert.deepEqual(parseRegions("0 0 10 100, 12 4.5 58 5;  70 4 30 13"), [
    { x: 0, y: 0, w: 10, h: 100 },
    { x: 12, y: 4.5, w: 58, h: 5 },
    { x: 70, y: 4, w: 30, h: 13 },
  ]);
});

test("parseRegions skips malformed parts", () => {
  assert.deepEqual(parseRegions("1 2 3, a b c d, 1 2 3 4,"), [{ x: 1, y: 2, w: 3, h: 4 }]);
});

test("autoRegions stays inside the image", () => {
  for (const { x, y, w, h } of autoRegions()) {
    assert.ok(x >= 0 && y >= 0 && x + w <= 100 && y + h <= 100);
  }
});
