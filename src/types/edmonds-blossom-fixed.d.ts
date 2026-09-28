declare module "edmonds-blossom-fixed" {
  /** Returns mate indices; unmatched vertices use -1. */
  export default function blossom(edges: [number, number, number][], maximumCardinality?: boolean): number[];
}
