import { expect, test, describe } from "bun:test";
import { mdToAdf, validateAdf } from "./md-to-adf.ts";

const valid = (md: string) => {
  const adf = mdToAdf(md);
  const { valid, errors } = validateAdf(adf);
  if (!valid) throw new Error("invalid ADF:\n" + JSON.stringify(errors, null, 2));
  return adf;
};

describe("tables (GFM)", () => {
  test("header + body → table/tableRow/tableHeader/tableCell", () => {
    const adf = valid("| Name | Role |\n| --- | --- |\n| Ada | Eng |\n| Lin | PM |");
    const table = adf.content[0];
    expect(table.type).toBe("table");
    expect(table.content).toHaveLength(3); // 1 header row + 2 body rows
    expect(table.content![0].content![0].type).toBe("tableHeader");
    expect(table.content![1].content![0].type).toBe("tableCell");
    // inline marks survive inside cells
    const adf2 = valid("| A | B |\n|---|---|\n| **bold** | `code` |");
    const cell0 = adf2.content[0].content![1].content![0];
    expect(cell0.content![0].content![0].marks?.[0].type).toBe("strong");
  });

  test("edge pipes optional + escaped pipe", () => {
    const adf = valid("a | b\n:--|--:\nx \\| y | z");
    const row = adf.content[0].content![1];
    expect(row.content![0].content![0].content![0].text).toBe("x | y");
  });

  test("a lone pipe in prose is NOT a table", () => {
    const adf = mdToAdf("use a | b pipe in a sentence");
    expect(adf.content[0].type).toBe("paragraph");
  });
});

describe("panels (GitHub alerts)", () => {
  test.each([
    ["NOTE", "info"],
    ["TIP", "success"],
    ["IMPORTANT", "note"],
    ["WARNING", "warning"],
    ["CAUTION", "error"],
    ["INFO", "info"],
    ["SUCCESS", "success"],
    ["ERROR", "error"],
  ])("[!%s] → panelType %s", (kw, panelType) => {
    const adf = valid(`> [!${kw}]\n> body text`);
    expect(adf.content[0].type).toBe("panel");
    expect(adf.content[0].attrs!.panelType).toBe(panelType);
  });

  test("panel body re-parses as markdown (holds a list)", () => {
    const adf = valid("> [!WARNING]\n> - one\n> - two");
    expect(adf.content[0].content![0].type).toBe("bulletList");
    expect(adf.content[0].content![0].content).toHaveLength(2);
  });

  test("plain blockquote stays a blockquote", () => {
    const adf = valid("> just a quote");
    expect(adf.content[0].type).toBe("blockquote");
  });
});

describe("nested lists", () => {
  test("indentation deepens a level", () => {
    const adf = valid("- a\n- b\n  - b1\n  - b2\n- c");
    const list = adf.content[0];
    expect(list.type).toBe("bulletList");
    expect(list.content).toHaveLength(3); // a, b, c
    const b = list.content![1];
    expect(b.content).toHaveLength(2); // paragraph + nested list
    expect(b.content![1].type).toBe("bulletList");
    expect(b.content![1].content).toHaveLength(2); // b1, b2
  });

  test("ordered nested under bullet", () => {
    const adf = valid("- step\n  1. first\n  2. second");
    const nested = adf.content[0].content![0].content![1];
    expect(nested.type).toBe("orderedList");
  });
});

describe("expand", () => {
  test("<details><summary> → expand with title", () => {
    const adf = valid("<details>\n<summary>More</summary>\n\nhidden **body**\n\n</details>");
    expect(adf.content[0].type).toBe("expand");
    expect(adf.content[0].attrs!.title).toBe("More");
    expect(adf.content[0].content![0].type).toBe("paragraph");
  });
});

describe("validator gate", () => {
  test("unknown panelType rejected", () => {
    const bad = { type: "doc", version: 1, content: [{ type: "panel", attrs: { panelType: "bogus" }, content: [{ type: "paragraph", content: [] }] }] };
    expect(validateAdf(bad).valid).toBe(false);
  });

  test("regression: existing subset still valid", () => {
    valid("# H1\n\npara with **b** and `c`\n\n- x\n- y\n\n```ts\nconst a = 1;\n```\n\n> quote\n\n---");
  });
});

describe("emoji (Jira-native shortNames)", () => {
  test(":short_name: → emoji node, curated ones carry text fallback", () => {
    const adf = valid("status :white_check_mark: done, :x: failed");
    const inline = adf.content[0].content!;
    const emojis = inline.filter((n) => n.type === "emoji");
    expect(emojis).toHaveLength(2);
    expect(emojis[0].attrs).toEqual({ shortName: ":white_check_mark:", text: "✅" });
    expect(emojis[1].attrs).toEqual({ shortName: ":x:", text: "❌" });
  });

  test("unknown shortName still converts (shortName-only, no text)", () => {
    const adf = valid("ship it :rocket:");
    const emoji = adf.content[0].content!.find((n) => n.type === "emoji");
    expect(emoji!.attrs).toEqual({ shortName: ":rocket:" });
  });

  test("a lone colon / time is NOT an emoji", () => {
    const adf = valid("meeting at 12:30 sharp");
    const inline = adf.content[0].content!;
    expect(inline.some((n) => n.type === "emoji")).toBe(false);
    // text may split across nodes around the colon — join and check round-trip
    const joined = inline.map((n) => n.text ?? "").join("");
    expect(joined).toBe("meeting at 12:30 sharp");
  });

  test("emoji survives inside bold", () => {
    const adf = valid("**done :white_check_mark:**");
    const emoji = adf.content[0].content!.find((n) => n.type === "emoji");
    expect(emoji).toBeDefined();
  });
});

describe("status lozenge", () => {
  test("{status:color|TEXT} → status node", () => {
    const adf = valid("build {status:green|DONE} and {status:yellow|IN PROGRESS}");
    const statuses = adf.content[0].content!.filter((n) => n.type === "status");
    expect(statuses).toHaveLength(2);
    expect(statuses[0].attrs).toEqual({ text: "DONE", color: "green" });
    expect(statuses[1].attrs).toEqual({ text: "IN PROGRESS", color: "yellow" });
  });

  test("invalid color is not matched (stays literal text)", () => {
    const adf = valid("{status:fuchsia|NOPE}");
    expect(adf.content[0].content!.some((n) => n.type === "status")).toBe(false);
  });

  test("validator rejects a hand-authored bad status color", () => {
    const bad = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "status", attrs: { text: "X", color: "fuchsia" } }] }] };
    expect(validateAdf(bad).valid).toBe(false);
  });

  test("validator rejects emoji missing shortName", () => {
    const bad = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "emoji", attrs: {} }] }] };
    expect(validateAdf(bad).valid).toBe(false);
  });
});

describe("mention", () => {
  test("@[Name](accountId) → mention node", () => {
    const adf = valid("ping @[Ada Lovelace](557058:abc-123) please");
    const mention = adf.content[0].content!.find((n) => n.type === "mention");
    expect(mention!.attrs).toEqual({ id: "557058:abc-123", text: "@Ada Lovelace" });
  });

  test("a bare @name is NOT a mention (no accountId available)", () => {
    const adf = valid("cc @ada and @bob");
    expect(adf.content[0].content!.some((n) => n.type === "mention")).toBe(false);
    expect(adf.content[0].content!.map((n) => n.text ?? "").join("")).toBe("cc @ada and @bob");
  });

  test("a normal [label](url) link is not mistaken for a mention", () => {
    const adf = valid("see [docs](https://x.dev)");
    const link = adf.content[0].content!.find((n) => n.marks?.some((m) => m.type === "link"));
    expect(link).toBeDefined();
    expect(adf.content[0].content!.some((n) => n.type === "mention")).toBe(false);
  });

  test("validator rejects a mention missing id", () => {
    const bad = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "mention", attrs: { text: "@x" } }] }] };
    expect(validateAdf(bad).valid).toBe(false);
  });
});
