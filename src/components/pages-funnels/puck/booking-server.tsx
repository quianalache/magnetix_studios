import { BookingBlockView, type BookingRenderProps } from "@/components/pages-funnels/puck/booking-block";
import { normalizeBookingBlock } from "@/lib/pages-funnels/booking-block";

/**
 * SERVER/PUBLIC variant of the Booking block — used by `serverPuckConfig`
 * (published page + staff Preview). No fetch: reads the Booking Page the
 * calling route already resolved into `metadata.resolvedBookings` from the
 * page's OWN workspace. Published routes always pass `resolvedEmbeds` (the
 * staff Preview doesn't) — the same signal form-server.tsx uses — so the
 * Preview keeps bookings switched off and shows staff notices, while
 * visitors get the real flow or nothing.
 */
export function BookingElementServerRender({ id, style, metadata, ...rest }: BookingRenderProps) {
  const props = normalizeBookingBlock(rest);
  const context = metadata?.resolvedEmbeds !== undefined ? "published" : "preview";
  const payload = props.bookingPageSlug ? (metadata?.resolvedBookings?.[props.bookingPageSlug] ?? null) : null;
  return <BookingBlockView id={id} props={props} style={style} context={context} resolution={{ status: "done", payload }} />;
}
