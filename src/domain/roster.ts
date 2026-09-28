export const MAX_PLAYERS = 256;
export const MAX_NAME_LENGTH = 80;

export interface RosterIssue {
  line: number;
  name: string;
  message: string;
}

export interface ParsedRoster {
  names: string[];
  errors: RosterIssue[];
  count: number;
}

/** Identity is always an entrant ID; this key only prevents ambiguous labels. */
export function normalizePlayerName(name: string): string {
  // NFKC handles compatibility characters; explicit folds handle common
  // multi-character case folds that JavaScript's lower-case conversion misses.
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ")
    .toLocaleLowerCase("und").replace(/ß/gu, "ss").replace(/ς/gu, "σ");
}

export function parsePlayerNames(text: string, existingNames: readonly string[] = []): ParsedRoster {
  const names: string[] = [];
  const errors: RosterIssue[] = [];
  const seen = new Set(existingNames.map(normalizePlayerName));
  for (const [index, raw] of text.split(/\r\n|\n|\r/u).entries()) {
    const name = raw.trim().normalize("NFKC");
    if (!name) continue;
    const key = normalizePlayerName(name);
    if ([...name].length > MAX_NAME_LENGTH) {
      errors.push({ line: index + 1, name, message: `Names must be ${MAX_NAME_LENGTH} characters or fewer.` });
    } else if (/[\p{Cc}\p{Cf}]/u.test(name)) {
      errors.push({ line: index + 1, name, message: "Names cannot contain control characters." });
    } else if (seen.has(key)) {
      errors.push({ line: index + 1, name, message: "This name is already listed. Add a distinguishing name." });
    } else {
      seen.add(key);
      names.push(name);
    }
  }
  if (existingNames.length + names.length > MAX_PLAYERS) {
    errors.push({ line: 0, name: "", message: `A tournament supports at most ${MAX_PLAYERS} players.` });
  }
  return { names, errors, count: names.length };
}

export function suggestRoundCount(playerCount: number): number {
  return playerCount < 2 ? 1 : Math.ceil(Math.log2(playerCount));
}

export function maximumRoundCount(playerCount: number): number {
  return playerCount % 2 === 0 ? Math.max(0, playerCount - 1) : playerCount;
}

export function validateRoundCount(playerCount: number, rounds: number): string | null {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > MAX_PLAYERS) {
    return `Start with 2–${MAX_PLAYERS} active players.`;
  }
  const maximum = maximumRoundCount(playerCount);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > maximum) {
    return `Choose between 1 and ${maximum} rounds for ${playerCount} players.`;
  }
  return null;
}
