import { describe, expect, it } from "vitest";
import {
  EVERYONE_DECIDING_WORDS,
  everyoneDecidingFromLead,
  everyoneDecidingLine,
  everyoneDecidingOf,
} from "@/lib/meetings/everyone-deciding";

describe("everyone who decides, as the meeting carries it (round 12)", () => {
  it("reads the column, and counts anything else as not asked", () => {
    expect(everyoneDecidingOf("yes")).toBe("yes");
    expect(everyoneDecidingOf("no")).toBe("no");
    expect(everyoneDecidingOf("not_asked")).toBe("not_asked");
    expect(everyoneDecidingOf(null)).toBe("not_asked");
    expect(everyoneDecidingOf(true)).toBe("not_asked");
  });

  it("turns the lead's own answer into the same words", () => {
    expect(everyoneDecidingFromLead(true)).toBe("yes");
    expect(everyoneDecidingFromLead(false)).toBe("no");
    expect(everyoneDecidingFromLead(null)).toBe("not_asked");
    expect(everyoneDecidingFromLead(undefined)).toBe("not_asked");
  });

  it("says it plainly when someone won't be there or it wasn't asked, and nothing on a yes", () => {
    expect(everyoneDecidingLine("yes")).toBeNull();
    expect(everyoneDecidingLine("no")).toBe("Someone who decides won't be there.");
    expect(everyoneDecidingLine("not_asked")).toBe("Not asked yet whether everyone who decides will be there.");
    expect(Object.keys(EVERYONE_DECIDING_WORDS)).toEqual(["no", "not_asked"]);
  });
});
