import { describe, expect, it } from "vitest";
import { fitWithin, isOwnPhotoPath, photoPath } from "@/lib/photos";

describe("fitWithin", () => {
  it("shrinks the long edge to 1600 px and keeps the shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(4000, 4000)).toEqual({ width: 1600, height: 1600 });
  });

  it("never enlarges a small photo and survives nonsense sizes", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 600)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(Number.NaN, 600)).toEqual({ width: 0, height: 0 });
  });
});

describe("photo paths", () => {
  const me = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
  const photo = "0b6f6f0e-2c1a-4e8b-9a7d-5c3e2f1a0b9c";

  it("puts each photo in the uploader's own folder", () => {
    expect(photoPath(me, photo)).toBe(`${me}/${photo}.jpg`);
    expect(isOwnPhotoPath(photoPath(me, photo), me)).toBe(true);
    expect(isOwnPhotoPath(photoPath(photo, me), me)).toBe(false);
    expect(isOwnPhotoPath(`${me}/../x.jpg`, me)).toBe(false);
  });
});
