/**
 * Developer-only Puck generation proof of concept.
 *
 * Creates one draft in the real Test sub-account through the existing
 * client page-creation service, then saves Puck data through the existing
 * server persistence service. It intentionally has no publish path.
 */
import { readFileSync } from "node:fs";
import {
  initializeApp as initializeAdminApp,
  getApps as getAdminApps,
  cert,
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import {
  initializeApp as initializeClientApp,
  getApps as getClientApps,
} from "firebase/app";
import { getAuth as getClientAuth, signInWithCustomToken } from "firebase/auth";
import { createPuckConfig } from "../src/components/pages-funnels/puck/config";
import { createPage } from "../src/lib/firestore/pages-funnels";
import { savePuckDraft } from "../src/lib/server/pages-funnels-puck-service";
import type { Data, ComponentData } from "@puckeditor/core";

const ENV_PATH = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match || process.env[match[1]] !== undefined) continue;
  let value = match[2].trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  process.env[match[1]] = value;
}

const AGENCY_ID = "w2xnqrCoj8djbNP2Nbgr";
const TEST_SUB_ACCOUNT_ID = "p4y0B6ZpDtE4F28RFixj";
function adminApp() {
  return (
    getAdminApps()[0] ??
    initializeAdminApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
          /\\n/g,
          "\n"
        ),
      }),
    })
  );
}

function clientApp() {
  return (
    getClientApps()[0] ??
    initializeClientApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const config = createPuckConfig(
  () => null,
  () => null,
  () => null
);
const registry = config.components;
const ids = new Set<string>();
let serial = 0;

function nextId(prefix: string): string {
  serial += 1;
  const id = `ai-luma-${prefix}-${serial}`;
  if (ids.has(id)) throw new Error(`Duplicate generated id: ${id}`);
  ids.add(id);
  return id;
}

function propsFor(type: string, overrides: Record<string, unknown> = {}) {
  const component = registry[type as keyof typeof registry] as
    | { defaultProps?: Record<string, unknown> }
    | undefined;
  if (!component) throw new Error(`Unregistered Puck component: ${type}`);
  return { ...clone(component.defaultProps ?? {}), ...overrides };
}

function node(
  type: string,
  overrides: Record<string, unknown> = {}
): ComponentData {
  return {
    type,
    props: propsFor(type, { id: nextId(type.toLowerCase()), ...overrides }),
  } as ComponentData;
}

function column(elements: ComponentData[], width = "1/3") {
  return node("Column", { width, elements });
}

function section(rows: ComponentData[], type = "Section") {
  return node(type, { rows });
}

function row(columns: ComponentData[], gap = 24) {
  return node("Row", { columns, gap, verticalAlign: "top" });
}

function heading(text: string, level: "h1" | "h2" | "h3" = "h2") {
  return node("Heading", { text, level, alignment: "left" });
}

function text(value: string) {
  return node("Text", { text: value, alignment: "left" });
}

function button(label: string) {
  return node("Button", {
    text: label,
    action: { type: "url", url: "#" },
    style: "primary",
    alignment: "left",
  });
}

function buildData(): Data {
  const content: ComponentData[] = [];

  content.push(
    node("Hero", {
      rows: [
        row(
          [
            column(
              [
                text("CONTENT WITHOUT THE CHAOS"),
                heading("Turn one good idea into a month of content.", "h1"),
                text(
                  "The Content Lab helps busy creators turn their expertise into clear, consistent content without spending every day staring at a blank screen."
                ),
                button("Join The Content Lab"),
                text("$49/month. Cancel anytime."),
              ],
              "1/2"
            ),
            column(
              [
                text(
                  "A warm, practical content system for solo creators and small digital businesses."
                ),
              ],
              "1/2"
            ),
          ],
          32
        ),
      ],
    })
  );

  content.push(
    section([
      row([
        column(
          [
            heading(
              "Creating content should not feel like a second full-time job.",
              "h2"
            ),
          ],
          "full"
        ),
      ]),
    ])
  );
  content.push(
    section([
      row([
        column([
          heading("Start from your best ideas", "h3"),
          text(
            "You know what you want to say, but turning it into content takes forever."
          ),
        ]),
        column([
          heading("Stop rebuilding from zero", "h3"),
          text(
            "You keep starting from scratch instead of building from your best ideas."
          ),
        ]),
        column([
          heading("Stay consistent when busy", "h3"),
          text("Consistency disappears the moment business gets busy."),
        ]),
      ]),
    ])
  );

  content.push(
    section([
      row([column([heading("A simpler way to stay visible.", "h2")], "full")]),
    ])
  );
  content.push(
    section([
      row([
        column([
          heading("Monthly content planning", "h3"),
          text(
            "Choose the ideas that matter and turn them into a practical monthly rhythm."
          ),
        ]),
        column([
          heading("Repurposing frameworks", "h3"),
          text(
            "Make one strong idea work harder across the channels you already use."
          ),
        ]),
        column([
          heading("Prompt library", "h3"),
          text(
            "Reach for useful prompts when the blank page is slowing you down."
          ),
        ]),
        column(
          [
            heading("Weekly implementation guidance", "h3"),
            text("Keep momentum with small, focused actions each week."),
          ],
          "1/3"
        ),
      ]),
    ])
  );

  content.push(
    section([
      row([
        column(
          [
            heading("A visual pause for the ideas you are building.", "h2"),
            node("Image", {
              src: "",
              alt: "Intentional placeholder visual for Luma Creative",
            }),
            text(
              "Placeholder visual: the native Image component renders its safe empty state when no durable Test-workspace asset is selected."
            ),
          ],
          "full"
        ),
      ]),
    ])
  );

  content.push(
    section([
      row([
        column(
          [heading("Creators are making room for better ideas.", "h2")],
          "full"
        ),
      ]),
    ])
  );
  content.push(
    section([
      row([
        column([
          text(
            '"I finally have a repeatable way to turn a spark into a week of useful content."'
          ),
          heading("Maya R.", "h3"),
        ]),
        column([
          text(
            '"The frameworks make planning feel lighter, not like another giant project."'
          ),
          heading("Jordan K.", "h3"),
        ]),
        column([
          text(
            '"I stopped staring at a blank screen and started shipping consistently."'
          ),
          heading("Alex T.", "h3"),
        ]),
      ]),
    ])
  );

  content.push(
    section([
      row([
        column(
          [
            heading("Everything inside The Content Lab", "h2"),
            heading("$49/month", "h3"),
            text(
              "Monthly planning framework · prompt library · repurposing system · weekly guidance · cancel anytime"
            ),
            button("Join The Content Lab"),
          ],
          "full"
        ),
      ]),
    ])
  );

  content.push(
    section([
      row([
        column(
          [
            heading("Frequently asked questions", "h2"),
            node("Accordion", {
              items: [
                {
                  title: "Is this a course?",
                  content:
                    "It is a practical content system with guidance and tools you can use at your own pace.",
                },
                {
                  title: "How much time should I expect to spend each week?",
                  content:
                    "Plan for a focused hour or two, then adapt the rhythm to your business.",
                },
                {
                  title: "Can I cancel anytime?",
                  content:
                    "Yes. This fictional offer is designed to be flexible.",
                },
                {
                  title: "Does this work for different types of businesses?",
                  content:
                    "Yes. The frameworks are designed to adapt to different audiences and offers.",
                },
              ],
              allowMultiple: false,
            }),
          ],
          "full"
        ),
      ]),
    ])
  );

  content.push(
    section([
      row([
        column(
          [
            heading(
              "You already have enough ideas. Let’s make them easier to use.",
              "h2"
            ),
            button("Join The Content Lab"),
          ],
          "full"
        ),
      ]),
    ])
  );

  const data: Data = { content, root: { props: {} } };
  validate(data);
  return data;
}

function validate(data: Data) {
  if (
    !Array.isArray(data.content) ||
    !data.root ||
    typeof data.root !== "object"
  )
    throw new Error("Malformed Puck root data");
  function visit(item: ComponentData) {
    if (
      typeof item.type !== "string" ||
      !registry[item.type as keyof typeof registry]
    )
      throw new Error(`Unsupported component: ${item.type}`);
    if (
      !item.props ||
      typeof item.props !== "object" ||
      typeof item.props.id !== "string"
    )
      throw new Error(`Malformed props for ${item.type}`);
    if (!ids.has(item.props.id as string))
      throw new Error(`Unknown generated id: ${item.props.id}`);
    for (const value of Object.values(item.props)) {
      if (Array.isArray(value))
        for (const child of value)
          if (
            child &&
            typeof child === "object" &&
            "type" in child &&
            "props" in child
          )
            visit(child as ComponentData);
    }
  }
  for (const item of data.content) visit(item);
}

async function main() {
  const admin = adminApp();
  const adminAuth = getAdminAuth(admin);
  const db = getAdminFirestore(admin);
  const subSnap = await db.doc(`subAccounts/${TEST_SUB_ACCOUNT_ID}`).get();
  if (!subSnap.exists || subSnap.data()?.agencyId !== AGENCY_ID)
    throw new Error("Test workspace precondition failed");
  const agencySnap = await db.doc(`agencies/${AGENCY_ID}`).get();
  const ownerUid = agencySnap.data()?.ownerUid as string | undefined;
  if (!ownerUid) throw new Error("Agency owner missing");
  const owner = await adminAuth.getUser(ownerUid);
  if (!owner.email) throw new Error("Agency owner email missing");

  const customToken = await adminAuth.createCustomToken(ownerUid);
  const client = clientApp();
  const clientAuth = getClientAuth(client);
  await signInWithCustomToken(clientAuth, customToken);
  const pageId = await createPage(
    { agencyId: AGENCY_ID, subAccountId: TEST_SUB_ACCOUNT_ID },
    ownerUid,
    {
      name: "AI Page Generation Test — Luma Creative",
      pageType: "sales",
      goal: "sales",
      origin: "ai",
    }
  );

  const data = buildData();
  // The production auth-edge endpoint cannot be called from a standalone
  // Node process without the browser's signed session cookie. This helper
  // therefore invokes the same server persistence service used by that
  // authenticated route, after authenticating the owner for the client-side
  // page-creation path above. It never writes a Firestore document directly.
  const result = await savePuckDraft(TEST_SUB_ACCOUNT_ID, pageId, data);
  if (!result.ok)
    throw new Error(
      `Puck draft service failed (${result.status}): ${result.error}`
    );
  console.log(
    JSON.stringify({
      pageId,
      agencyId: AGENCY_ID,
      subAccountId: TEST_SUB_ACCOUNT_ID,
      componentCount: ids.size,
      persistence: "savePuckDraft service",
      published: false,
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
