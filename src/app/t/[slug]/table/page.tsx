import { TournamentPage } from "@/components/tournament-app";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <TournamentPage tournamentKey={(await params).slug} view="table" />;
}
