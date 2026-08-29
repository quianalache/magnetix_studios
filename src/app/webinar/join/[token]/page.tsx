import WebinarRoomClient from "@/components/webinar/webinar-room-client";
export default async function WebinarJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <WebinarRoomClient token={(await params).token} />;
}
