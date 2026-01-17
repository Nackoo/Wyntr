import { db, doc, getDoc, setDoc, collection, auth } from "./firebase.js";

export async function handleTags(text, tweetId) {
  const tagMatches = text.match(/#\w+/g);
  if (!tagMatches) return;

  const uniqueTags = [...new Set(tagMatches.map(t => t.slice(1)))];
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const userDocRef = doc(db, "users", uid);
  const userSnap = await getDoc(userDocRef);
  const username = userSnap.exists() ? userSnap.data().username || uid : uid;

  for (const tag of uniqueTags) {
    const tagName = tag.trim();
    if (!tagName) continue;

    try {
      const tagDoc = doc(db, "tags", tagName);
      await setDoc(tagDoc, {
        name: tagName.slice(0, 30),
        createdAt: new Date(),
        creator: username
      }, { merge: true });

      const tagRef = doc(collection(db, "tags", tagName, "tweets"), tweetId);
      await setDoc(tagRef, {
        taggedAt: new Date()
      });

    } catch (e) {
      console.error(`Tag save failed for #${tagName}:`, e);
    }
  }
}
