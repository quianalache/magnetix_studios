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
const postId = "IelkANV4D72W3P5eUq1Q";

const postSnap = await db.doc(`subAccounts/${saId}/communityGroups/${groupId}/posts/${postId}`).get();
console.log("Post doc still exists:", postSnap.exists);

const votesSnap = await db.collection(`subAccounts/${saId}/communityGroups/${groupId}/posts/${postId}/pollVotes`).get();
console.log("pollVotes doc count AFTER delete:", votesSnap.size);
