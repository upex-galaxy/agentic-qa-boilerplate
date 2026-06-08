import { expect, test, describe } from "bun:test";
import { buildMediaNode, imageSize } from "./jira-attach-media.ts";
import { validateAdf } from "./md-to-adf.ts";

// 1x1 red PNG
const PNG_1x1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

describe("imageSize (zero-dep header read)", () => {
  test("reads PNG IHDR dimensions", () => {
    expect(imageSize(PNG_1x1)).toEqual({ width: 1, height: 1 });
  });

  test("reads GIF dimensions (little-endian)", () => {
    // GIF89a header, logical screen 3x2
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x03, 0x00, 0x02, 0x00]);
    expect(imageSize(gif)).toEqual({ width: 3, height: 2 });
  });

  test("returns null for an unknown format (e.g. video)", () => {
    expect(imageSize(Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]))).toBeNull();
  });
});

describe("buildMediaNode", () => {
  test("canonical shape — file type, empty collection, optional dims", () => {
    const node = buildMediaNode("abc-uuid", { width: 800, height: 600, alt: "shot.png" });
    expect(node).toEqual({
      type: "mediaSingle",
      attrs: { layout: "center" },
      content: [
        { type: "media", attrs: { type: "file", id: "abc-uuid", collection: "", width: 800, height: 600, alt: "shot.png" } },
      ],
    });
  });

  test("omits width/height when not provided; honours layout", () => {
    const node = buildMediaNode("u", { layout: "wide" });
    expect(node.attrs.layout).toBe("wide");
    expect(node.content[0].attrs).toEqual({ type: "file", id: "u", collection: "" });
  });

  test("the built node passes the ADF validator inside a doc", () => {
    const doc = { type: "doc", version: 1, content: [buildMediaNode("u", { width: 1, height: 1 })] };
    const { valid, errors } = validateAdf(doc);
    if (!valid) throw new Error(JSON.stringify(errors));
    expect(valid).toBe(true);
  });

  test("validator rejects a media node missing id", () => {
    const bad = { type: "doc", version: 1, content: [{ type: "mediaSingle", attrs: { layout: "center" }, content: [{ type: "media", attrs: { type: "file" } }] }] };
    expect(validateAdf(bad).valid).toBe(false);
  });
});
