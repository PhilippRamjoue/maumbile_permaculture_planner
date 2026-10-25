import { describe, expect, it } from "vitest";

import { formatLength } from "./format";

describe("formatLength", () => {
  it("gives metres with a decimal while short, whole metres, then kilometres", () => {
    expect(formatLength(4.23)).toBe("4.2 m");
    expect(formatLength(137.4)).toBe("137 m");
    expect(formatLength(1250)).toBe("1.25 km");
  });
});
