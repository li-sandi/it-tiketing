import { notFound } from "next/navigation";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicTicketStatus from "@/components/tiket/PublicTicketStatus";

export const instant = false;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PublicTicketStatusPage({
  params,
}: PageProps<"/status/[token]">) {
  const { token } = await params;
  if (!UUID_PATTERN.test(token)) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <PublicHeader />
      <PublicTicketStatus token={token} />
    </div>
  );
}
