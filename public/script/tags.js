import { db, doc, collection, auth, runTransaction, increment, getDoc, updateDoc, setDoc } from "./firebase.js";
import { getUserData } from "./index.js";
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
  const d = await getUserData(auth.currentUser.uid);

  await Promise.all(
    tags.map(async (tagName) => {
      const ref = doc(db, "tags", tagName);
      const contributorsRef = doc(db, "tags", tagName, "contributors", auth.currentUser.uid);

      const [snap, contributorsSnap] = await Promise.all([
        getDoc(ref),
        getDoc(contributorsRef)
      ]);

      if (snap.exists()) {
        if (contributorsSnap.exists()) {
          const update_1 = updateDoc(ref, {
            postCount: increment(1),
          });
          const update_2 = updateDoc(contributorsRef, {
            contributions: increment(1)
          });
          
          await Promise.all([update_1, update_2]);
        } else {
          const update_1 = updateDoc(ref, {
            postCount: increment(1),
            contributors: increment(1)
          });
          const update_2 = setDoc(contributorsRef, {
            contributions: 1,
            photoURL: d.d.photoURL,
            username: d.username,
            displayName: d.displayName,
            name: d.displayName.toLowerCase()
          });
          
          await Promise.all([update_1, update_2]);
        }
      } else {
        const update_1 = setDoc(ref, {
          postCount: 1,
          contributors: 1,
          name: tagName
        });
        const update_2 = setDoc(contributorsRef, {
          contributions: 1,
          photoURL: d.d.photoURL,
          username: d.username,
          displayName: d.displayName,
          name: d.displayName.toLowerCase()
        });

        await Promise.all([update_1, update_2]);
      }
    })
  );

  return tags;
}