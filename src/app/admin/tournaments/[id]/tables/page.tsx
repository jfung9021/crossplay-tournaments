import { TournamentPage } from "@/components/tournament-app";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <TournamentPage tournamentKey={(await params).id} admin view="tables" />;
}
