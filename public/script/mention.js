import { db, collection, query, orderBy, limit, startAfter, onSnapshot, doc, getDoc, auth, getDocs, where } from "./firebase.js";
import { renderTweet } from "./index.js";

export async function extractMentions(text) {
  const results = [];

  const mentionMatches = text.match(/@[a-zA-Z0-9._-]+/g);
  if (!mentionMatches) return results;

  let uniqueHandles = [...new Set(
    mentionMatches.map(m => m.slice(1).toLowerCase())
  )];

  if (uniqueHandles.length > 10) {
    uniqueHandles = uniqueHandles.slice(0, 10);
  }

  for (const handle of uniqueHandles) {
    const q = query(collection(db, "users"), where("username", "==", handle));
    const snap = await getDocs(q);

    snap.forEach((docSnap) => {
      results.push({
        uid: docSnap.id,
        username: handle
      });
    });
  }

  return results;
}

/*
let mentionedLoadedOnce = false;
let mentionedLastDoc = null;
let mentionedTweetIds = new Set();
let mentionedObserver = null;

const MENTION_BATCH_SIZE = 30;

async function loadMentionedTweets(container) {
  const user = auth.currentUser;
  if (!user) return;

  const mentionedRef = collection(db, "users", user.uid, "mentioned");
  const q = mentionedLastDoc ?
    query(mentionedRef, orderBy("mentionedAt", "desc"), startAfter(mentionedLastDoc), limit(MENTION_BATCH_SIZE)) :
    query(mentionedRef, orderBy("mentionedAt", "desc"), limit(MENTION_BATCH_SIZE));

  const snapshot = await getDocs(q);
  if (snapshot.empty) return;

  mentionedLastDoc = snapshot.docs[snapshot.docs.length - 1];

  for (const docSnap of snapshot.docs) {
    const tweetId = docSnap.id;
    mentionedTweetIds.add(tweetId);

    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
    if (tweetDoc.exists()) {
      const tweetData = tweetDoc.data();
      await renderTweet(tweetData, tweetId, user, "append", container);
    }
  }
}

function setupMentionScrollPagination(container) {
  const observerOptions = {
    root: container,
    rootMargin: "0px",
    threshold: 1.0
  };

  if (mentionedObserver) mentionedObserver.disconnect();

  mentionedObserver = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        await loadMentionedTweets(container);
      }
    }
  }, observerOptions);

  const tweets = container.querySelectorAll(".tweet");
  const lastTweet = tweets[tweets.length - 6];
  if (lastTweet) mentionedObserver.observe(lastTweet);
}

document.querySelectorAll(".tab2").forEach(tab => {
  tab.addEventListener("click", async () => {
    document.querySelectorAll(".tab2").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    const targetId = tab.dataset.target;
    const allLists = ["youList", "replyList", "mentionedList", "likedList"];

    allLists.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return; 
      if (id === targetId) {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    });

    const youLoadMore = document.getElementById("youLoadMore");
    if (targetId === "youList") {
      youLoadMore.classList.remove("hidden");
    } else {
      youLoadMore.classList.add("hidden");
    }

    if (targetId === "mentionedList" && !mentionedLoadedOnce) {
      mentionedLoadedOnce = true;
      const container = document.getElementById("mentionedList");

      await loadMentionedTweets(container);

      if (!container.querySelector(".tweet")) {
        container.innerHTML = ``;
      }

      setupMentionScrollPagination(container);

      const user = auth.currentUser;
      const mentionedRef = collection(db, "users", user.uid, "mentioned");

      onSnapshot(mentionedRef, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
          const tweetId = change.doc.id;

          if (change.type === "added" && !mentionedTweetIds.has(tweetId)) {
            const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
            if (tweetDoc.exists()) {
              const tweetData = tweetDoc.data();
              mentionedTweetIds.add(tweetId);
              await renderTweet(tweetData, tweetId, user, "prepend", container);
            }
          }

          if (change.type === "removed") {
            const el = container.querySelector(`#tweet-${tweetId}`);
            if (el) el.remove();
            mentionedTweetIds.delete(tweetId);
          }
        }
      });
    }
  });
});*/