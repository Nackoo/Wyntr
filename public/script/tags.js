import { db, doc, collection, auth, runTransaction, increment, getDoc, updateDoc, setDoc } from "./firebase.js";
import { log } from "./texts.js";

export async function handleTags(text) {
  if (typeof text !== "string") {
    throw new Error("Text must be a string");
  }

  const matches = text.match(/#([a-zA-Z0-9_]+)/g) || [];
  const uniqueMap = new Map();

  for (const raw of matches) {
    const original = raw.slice(1);
    const normalized = original.toLowerCase();

    if (!uniqueMap.has(normalized)) {
      uniqueMap.set(normalized, original);
    }
  }

  const tags = [...uniqueMap.keys()];

  if (tags.length > 10) {
    throw new Error("Maximum 10 unique tags allowed");
  }

  await Promise.all(
    tags.map(async (tagName) => {
      const ref = doc(db, "tags", tagName);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        await updateDoc(ref, {
          postCount: increment(1),
        });
      } else {
        await setDoc(ref, {
          postCount: 1,
        });
      }
    })
  );

  return tags;
}