import { describe, expect, it } from "vitest";
import { paginateRows, tableGrid } from "../../src/client/display-pagination";

describe("TV display pagination", () => {
  it("fits the normal nine tables and eighteen rows at their measured 1080p sizes", () => {
    expect(tableGrid(1120, 740, 228)).toEqual({ columns: 3, rows: 3, capacity: 9 });
    expect(paginateRows(Array(18).fill(34), 640)).toHaveLength(1);
  });
  it("packs full long-name rows without losing, repeating, or splitting entrants", () => {
    const heights = Array.from({ length: 256 }, (_, index) => index % 4 ? 62 : 88);
    const pages = paginateRows(heights, 490);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat()).toEqual(Array.from({ length: 256 }, (_, index) => index));
    for (const page of pages) expect(page.reduce((sum, index) => sum + heights[index], 0)).toBeLessThanOrEqual(490);
  });
  it("reduces visible tables on a smaller screen rather than shrinking type", () => {
    expect(tableGrid(770, 460, 280)).toEqual({ columns: 2, rows: 1, capacity: 2 });
    expect(paginateRows([], 100)).toEqual([[]]);
    expect(paginateRows([120], 90)).toEqual([[0]]);
  });
});
