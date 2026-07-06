import { db, collection, query, getDocs, where, limit } from "./firebase.js";
import { dev } from "./texts.js";

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

  dev("handling mentions");
  const promises = uniqueHandles.map(async (handle) => {
    map[handle] = null; 

    const q = query(
      collection(db, "users"), 
      where("username", "==", handle),
      limit(1)
    );

    const snap = await getDocs(q);

    snap.forEach((docSnap) => {
      map[handle] = docSnap.id;
    });
  });

  await Promise.all(promises);

  return map;
}