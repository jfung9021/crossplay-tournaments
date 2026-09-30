import { describe, expect, it } from "vitest";
import { assertLocalEnvironment } from "../support/local-environment";

const local = { NODE_ENV: "test" as const, PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3001", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3001", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", CROSSPLAY_DATABASE_URL: "postgresql://crossplay_runtime:local@127.0.0.1:55432/crossplay_acceptance_ab12", CROSSPLAY_ACCEPTANCE_DATABASE: "crossplay_acceptance_ab12", CROSSPLAY_TEST_CONTAINER: "crossplay-test-db" };
describe("Swiss20 mutation target guard", () => {
  it("accepts only a matching isolated local run", () => expect(assertLocalEnvironment(local).database).toBe("crossplay_acceptance_ab12"));
  it.each([
    { PLAYWRIGHT_BASE_URL: "https://crossplay-tournaments.vercel.app" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" },
    { CROSSPLAY_DATABASE_URL: "postgresql://crossplay_runtime:local@host.example/crossplay_acceptance_ab12" },
    { CROSSPLAY_DATABASE_URL: "postgresql://crossplay_runtime:local@127.0.0.1:55432/postgres" },
    { CROSSPLAY_ACCEPTANCE_DATABASE: "crossplay_acceptance_cd34" },
    { CROSSPLAY_TEST_CONTAINER: "supabase_db_bite-open-card-draw" },
    { NEXT_PUBLIC_SITE_URL: "http://localhost:3001" },
    { CROSSPLAY_DATABASE_URL: "postgresql://postgres:local@127.0.0.1:55432/crossplay_acceptance_ab12" },
  ])("rejects unsafe or mismatched target %j", (override) => expect(() => assertLocalEnvironment({ ...local, ...override })).toThrow());
});
