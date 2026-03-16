import { db, doc, getDoc, setDoc, collection, auth } from "./firebase.js";
import { log } from "./texts.js";

export async function handleTags(text, tweetId) {
  const tagMatches = text.match(/#\w+/g);
  if (!tagMatches) return;

  const uniqueTags = [
    ...new Set(
      tagMatches.map(t => t.slice(1).toLowerCase().trim())
    )
  ];

  const limitedTags = uniqueTags.slice(0, 5);

  const uid = auth.currentUser?.uid;
  if (!uid) return;

  for (const tag of limitedTags) {
    if (!tag) continue;

    try {
      const tagDoc = doc(db, "tags", tag);

      await setDoc(tagDoc, {
        name: tag.slice(0, 30),
        createdAt: new Date(),
      }, { merge: true });

      const tagRef = doc(collection(db, "tags", tag, "tweets"), tweetId);

      await setDoc(tagRef, {
        taggedAt: new Date()
      });

    } catch (e) {
      console.error(`Tag save failed for #${tag}:`, e);
    }
  }

  if (uniqueTags.length > 5) {
    log("red", "tags above the first 5 are invalid");
  }
}