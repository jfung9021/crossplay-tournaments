import type { Metadata } from "next";
import { MatchClockPage } from "@/components/match-clock";

export const metadata: Metadata = { title: "Match clock", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <MatchClockPage matchId={matchId} />;
}
