import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getWebinarBySlugServerSide,
  registerForWebinarServerSide,
} from "@/lib/server/webinar-service";
import { signWebinarRegistrantToken } from "@/lib/server/webinar-token";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ subAccountId: string; webinarSlug: string }> }
) {
  const { subAccountId, webinarSlug } = await params;
  const webinar = await getWebinarBySlugServerSide(subAccountId, webinarSlug);
  if (!webinar)
    return NextResponse.json({ error: "Webinar not found" }, { status: 404 });
  return NextResponse.json({
    webinar: {
      title: webinar.title,
      description: webinar.description,
      startAt: webinar.startAt,
      endAt: webinar.endAt,
      timezone: webinar.timezone,
      status: webinar.status,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ subAccountId: string; webinarSlug: string }> }
) {
  const { subAccountId, webinarSlug } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const webinar = await getWebinarBySlugServerSide(subAccountId, webinarSlug);
  if (!webinar)
    return NextResponse.json({ error: "Webinar not found" }, { status: 404 });
  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName =
    typeof body.lastName === "string" ? body.lastName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email))
    return NextResponse.json(
      { error: "First name, last name, and a valid email are required." },
      { status: 400 }
    );
  const agencyId =
    webinar.agencyId ||
    (await getAdminDb().doc(`subAccounts/${subAccountId}`).get()).data()
      ?.agencyId;
  if (!agencyId)
    return NextResponse.json(
      { error: "Webinar is not configured." },
      { status: 400 }
    );
  try {
    const registrant = await registerForWebinarServerSide({
      subAccountId,
      agencyId,
      webinarId: webinar.id,
      firstName,
      lastName,
      email,
    });
    return NextResponse.json(
      {
        webinar: {
          title: webinar.title,
          slug: webinar.slug,
          startAt: webinar.startAt,
          endAt: webinar.endAt,
          timezone: webinar.timezone,
          status: webinar.status,
        },
        registrant: {
          id: registrant.id,
          firstName: registrant.firstName,
          lastName: registrant.lastName,
        },
        joinToken: signWebinarRegistrantToken(
          subAccountId,
          webinar.id,
          registrant.id
        ),
        joinUrl: `/webinar/join/${signWebinarRegistrantToken(
          subAccountId,
          webinar.id,
          registrant.id
        )}`,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to register" },
      { status: 400 }
    );
  }
}
