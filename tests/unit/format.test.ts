import { describe, expect, it } from "vitest";
import { gp, gpCompact } from "@/lib/format";

describe("Kurzform grosser Beträge", () => {
  it("unter 10M keine Kurzform", () => {
    expect(gpCompact(9_999_999)).toBeNull();
    expect(gp(9_999_999)).not.toContain("(");
  });
  it("ab 10M auf 100k gerundet", () => {
    expect(gpCompact(10_000_000)).toBe("10.0M");
    expect(gpCompact(23_456_789)).toBe("23.5M");
    expect(gpCompact(123_440_000)).toBe("123.4M");
    expect(gpCompact(-45_670_000)).toBe("-45.7M");
  });
  it("ab 1B auf 10M gerundet", () => {
    expect(gpCompact(1_000_000_000)).toBe("1.00B");
    expect(gpCompact(5_312_345_678)).toBe("5.31B");
  });
  it("gp() hängt die Kurzform in Klammern an, abschaltbar", () => {
    expect(gp(23_456_789)).toMatch(/^23.456.789 \(23\.5M\)$/);
    expect(gp(23_456_789, { sign: true })).toMatch(/^\+23.456.789 \(23\.5M\)$/);
    expect(gp(23_456_789, { compact: false })).toMatch(/^23.456.789$/);
  });
});
