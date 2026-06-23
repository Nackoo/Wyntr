import { db, collection, query, getDocs, where } from "./firebase.js";

export async function extractMentions(text) {
  const map = {};

  const mentionMatches = text.match(/@[a-zA-Z0-9._-]+/g);
  if (!mentionMatches) return map;

  let uniqueHandles = [...new Set(
    mentionMatches.map(m => m.slice(1).toLowerCase())
  )];

  if (uniqueHandles.length > 10) {
    uniqueHandles = uniqueHandles.slice(0, 10);
  }

  for (const handle of uniqueHandles) {
    map[handle] = null;

    const q = query(collection(db, "users"), where("username", "==", handle));
    const snap = await getDocs(q);

    snap.forEach((docSnap) => {
      map[handle] = docSnap.id;
    });
  }

  return map;
}