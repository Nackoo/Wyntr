import { db, doc, collection, auth, runTransaction, increment, getDoc, updateDoc, setDoc, orderBy, startAfter, where, limit, getDocs, query } from "./firebase.js";
import { getUserData, renderTweet } from "./index.js";
import { log, dev } from "./texts.js";
import { TWEETS_SKELETON } from "./element.js";
import { initViews } from "./view_users.js";

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
  dev("handling tags: reading auth")
  const d = await getUserData(auth.currentUser.uid);

  dev("handling tags")
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
            lastUpdated: new Date()
          });
          const update_2 = updateDoc(contributorsRef, {
            contributions: increment(1)
          });
          
          await Promise.all([update_1, update_2]);
        } else {
          const update_1 = updateDoc(ref, {
            postCount: increment(1),
            contributors: increment(1),
            lastUpdated: new Date()
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
          name: tagName,
          lastUpdated: new Date()
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

window.openTag = async function (tagId) {
  document.getElementById("searchsvg").click();

  const tweetList       = document.getElementById("tagstweet");
  const scrollBox       = document.querySelector("#tagSubOverlay .user-box");
  const tagOverlay      = document.getElementById("tagSubOverlay");
  const tagtweets       = document.getElementById("tagTweets");
  const tagName         = document.getElementById("tagId");
  const tagcontributors = document.getElementById("tagContributors");

  tagOverlay.classList.remove("hidden");
  tweetList.innerHTML = TWEETS_SKELETON;
  tagName.textContent = tagId;
  tagtweets.textContent = "loading...";
  tagcontributors.textContent = "";

  const tagTweetsRef = collection(db, "tweets");
  const tagRef = doc(db, "tags", tagId);

  const BATCH_SIZE = 5;
  let lastDoc = null;
  let isLoading = false;
  let reachedEnd = false;

  async function loadBatch() {
    if (isLoading || reachedEnd) return;
    isLoading = true;

    const queryConstraints = [
      tagTweetsRef,
      orderBy("createdAt", "desc"),
      where("archived", "!=", true),
      where("tags", "array-contains", tagId),
      limit(BATCH_SIZE)
    ];

    if (lastDoc) queryConstraints.push(startAfter(lastDoc));
    const q = query(...queryConstraints);

    const [snap, tagSnap] = await Promise.all([
      getDocs(q),
      getDoc(tagRef)
    ])

    if (tagSnap.exists()) {
      const data = tagSnap.data();
      tagtweets.textContent = `${data.postCount} Wynts •`;
      tagcontributors.textContent = `${data.contributors} participants`;
    } else {
      tagtweets.textContent = "data unavailable";
    }

    tagcontributors.onclick = () => {
      initViews(null, null, null, null, tagId);
    }

    if (snap.empty) {
      reachedEnd = true;
      isLoading = false;
      if (!tweetList.querySelector(".tweet")) {
        tweetList.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:70px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynts — yet</h2><p style="color:grey;margin:7px 0;">seems like nobody uses this tag. Invite people to use them.</p></div></div>`;
      }
      return;
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    snap.docs.forEach(async (docSnap) => {
      const tweetId = docSnap.id;

      const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
      if (tweetDoc.exists()) {
        tweetList.querySelectorAll(".skeleton-card").forEach(e => {e.remove()});
        renderTweet(tweetDoc.data(), tweetId, auth.currentUser, "append", tweetList);
      }
    });

    isLoading = false;
  }

  scrollBox.addEventListener("scroll", async () => {
    const nearBottom =
      scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 40;

    if (nearBottom) {
      await loadBatch();
    }
  });

  await loadBatch();
};