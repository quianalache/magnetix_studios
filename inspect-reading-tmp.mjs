import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const envContent = fs.readFileSync("/Users/quianamatthews/Documents/magnetix_studios/.env.local", "utf8");
function getEnv(key) {
  const line = envContent.split("\n").find((l) => l.startsWith(key + "="));
  if (!line) return undefined;
  let val = line.slice(key.length + 1);
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  return val;
}
const projectId = getEnv("FIREBASE_ADMIN_PROJECT_ID");
const clientEmail = getEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
const privateKey = getEnv("FIREBASE_ADMIN_PRIVATE_KEY")?.replace(/\\n/g, "\n");
if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

const doc = await db.collection("energeticDecoderReadings").doc("FlzlXsTIuUrWnGZpEuZT").get();
const d = doc.data();
console.log("name:", d.name);
console.log("createdAt:", d.createdAt?.toDate?.() ?? d.createdAt);
console.log("has humanDesign:", !!d.humanDesign);
console.log("has astrology:", !!d.astrology);
console.log("humanDesign.variables present:", !!d.humanDesign?.variables);
console.log("humanDesign.bodygraphSvg present:", !!d.humanDesign?.bodygraphSvg, d.humanDesign?.bodygraphSvg?.length ?? 0);
console.log("astrology?.bodygraphSvg present:", !!d.astrology?.bodygraphSvg);
console.log("astrology chironLongitude / placements has chiron:", d.astrology?.placements?.some(p => p.body === "chiron"));
