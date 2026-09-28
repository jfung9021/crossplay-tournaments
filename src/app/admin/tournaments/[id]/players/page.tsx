import { TournamentPage } from "@/components/tournament-app";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <TournamentPage tournamentKey={id} admin view="players" />; }
