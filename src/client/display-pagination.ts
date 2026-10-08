/** Pack complete rows without splitting a player's full name across pages. */
export function paginateRows(heights: number[], availableHeight: number): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  heights.forEach((height, index) => {
    if (page.length && used + height > availableHeight) { pages.push(page); page = []; used = 0; }
    page.push(index); used += height;
  });
  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
}

export function tableGrid(width: number, height: number, measuredCardHeight = 210) {
  const columns = Math.max(1, Math.min(3, Math.floor((width + 16) / 336)));
  const rows = Math.max(1, Math.min(3, Math.floor((height + 16) / (measuredCardHeight + 16))));
  return { columns, rows, capacity: columns * rows };
}
