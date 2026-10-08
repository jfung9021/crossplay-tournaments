import { TournamentDisplayPage } from "@/components/tournament-display";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TournamentDisplayPage slug={slug} />;
}
