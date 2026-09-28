import { TournamentPage } from "@/components/tournament-app";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <TournamentPage tournamentKey={slug} view="rules" />; }
