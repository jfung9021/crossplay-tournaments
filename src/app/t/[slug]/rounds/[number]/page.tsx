import { TournamentPage } from "@/components/tournament-app";
export default async function Page({ params }: { params: Promise<{ slug: string; number: string }> }) { const { slug, number } = await params; return <TournamentPage tournamentKey={slug} view="round" roundNumber={Number(number)} />; }
