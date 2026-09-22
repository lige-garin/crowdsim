import { describe, expect, it } from "vitest";
import {
  findOptionalColumnIndex,
  parseCsv,
  parseFiniteNumber,
  resolveColumnIndexes,
  splitCsvLine,
} from "./csvParsing";

describe("parseCsv / splitCsvLine", () => {
  it("splits plain comma-separated rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a comma inside quotes as part of one cell", () => {
    expect(splitCsvLine('north,"Gate, main",1')).toEqual(["north", "Gate, main", "1"]);
  });

  it("unescapes a doubled quote inside a quoted cell", () => {
    expect(splitCsvLine('a,"she said ""hi""",b')).toEqual(["a", 'she said "hi"', "b"]);
  });
});

describe("parseFiniteNumber", () => {
  it("parses a finite number", () => {
    expect(parseFiniteNumber("3.5", 2, "x")).toBe(3.5);
  });

  it("throws a row-numbered error for a non-finite value", () => {
    expect(() => parseFiniteNumber("not a number", 4, "x")).toThrow(
      /row 4 has invalid x value/,
    );
  });

  it("throws for an undefined value (missing cell)", () => {
    expect(() => parseFiniteNumber(undefined, 4, "y")).toThrow(
      /row 4 has invalid y value/,
    );
  });
});

describe("resolveColumnIndexes", () => {
  it("resolves each field to the first alias present in the header", () => {
    const headers = ["id", "line_name", "x"];
    const indexes = resolveColumnIndexes(headers, {
      lineId: ["line_id", "id"],
      lineName: ["line_name"],
    });

    expect(indexes).toEqual({ lineId: 0, lineName: 1 });
  });

  it("throws naming the first (preferred) alias when a field is missing", () => {
    expect(() =>
      resolveColumnIndexes(["a"], { missing: ["missing_col", "alt_col"] }),
    ).toThrow(/missing 'missing_col' column/);
  });
});

describe("findOptionalColumnIndex", () => {
  it("returns the index when an alias is present", () => {
    expect(findOptionalColumnIndex(["a", "line_name"], ["line_name", "name"])).toBe(1);
  });

  it("returns undefined when no alias is present", () => {
    expect(findOptionalColumnIndex(["a", "b"], ["line_name", "name"])).toBeUndefined();
  });
});
