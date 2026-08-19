export const TB810_BUILDING_ID = "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810" as const;

export const TB810_BUILDING_NAME = "TB810" as const;

export function getFixedBuildingIdentity() {
  return {
    id: TB810_BUILDING_ID,
    name: TB810_BUILDING_NAME,
  };
}
