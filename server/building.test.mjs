import assert from "node:assert/strict";
import test from "node:test";

import { TB810_BUILDING_ID, TB810_BUILDING_NAME, getFixedBuildingIdentity } from "./building.ts";

test("fixed TB810 building identity is the canonical seeded UUID", () => {
  assert.equal(TB810_BUILDING_ID, "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810");
  assert.equal(TB810_BUILDING_NAME, "TB810");
  assert.deepEqual(getFixedBuildingIdentity(), {
    id: "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810",
    name: "TB810",
  });
});
