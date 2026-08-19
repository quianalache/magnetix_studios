import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]] = v;
}
initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n") }) });
const db = getFirestore();
const saId = "xvnedVCmQpEvHrcPhEDI";
const groupId = "3kFyMWLioCnW5loWEv14";

const postsSnap = await db.collection(`subAccounts/${saId}/communityGroups/${groupId}/posts`).get();
for (const d of postsSnap.docs) {
  const data = d.data();
  if (data.poll || data.hasPoll) {
    console.log(d.id, "title:", data.title, "hasPoll:", data.hasPoll, "subAccountId:", data.subAccountId, "has poll field:", !!data.poll);
  }
}

console.log("--- collectionGroup query test ---");
const cgSnap = await db.collectionGroup("posts").where("subAccountId", "==", saId).get();
console.log("collectionGroup total matches:", cgSnap.size);
const withPoll = cgSnap.docs.filter(d => d.data().hasPoll === true);
console.log("with hasPoll===true:", withPoll.length);
