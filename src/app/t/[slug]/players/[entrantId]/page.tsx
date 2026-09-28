import { TournamentPage } from "@/components/tournament-app";
export default async function Page({ params }: { params: Promise<{ slug: string; entrantId: string }> }) { const { slug, entrantId } = await params; return <TournamentPage tournamentKey={slug} view="history" entrantId={entrantId} />; }
