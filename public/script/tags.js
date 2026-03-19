import { db, doc, collection, auth, runTransaction, increment } from "./firebase.js";
import { log } from "./texts.js";

export async function handleTags(text, tweetId) {
  const tagMatches = text.match(/#([a-zA-Z0-9_]+)/g);
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
      await runTransaction(db, async (tx) => {
        const tagDoc = doc(db, "tags", tag);
        const tagSnap = await tx.get(tagDoc);

        if (!tagSnap.exists()) {
          tx.set(tagDoc, {
            name: tag.slice(0, 30),
            createdAt: new Date(),
            tweetCount: 1
          });
        } else {
          tx.update(tagDoc, {
            createdAt: new Date(),
            tweetCount: increment(1)
          });
        }
        const tagRef = doc(collection(db, "tags", tag, "tweets"), tweetId);

        tx.set(tagRef, {
          taggedAt: new Date()
        });
      });
    } catch (e) {
      console.error(`Tag save failed for #${tag}:`, e);
    }
  }

  if (uniqueTags.length > 5) {
    log("red", "tags above the first 5 are invalid");
  }
}