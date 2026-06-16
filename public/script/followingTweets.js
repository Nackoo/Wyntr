import { auth, db, collection, getDocs, query, orderBy, limit, where, startAfter, onSnapshot } from "./firebase.js";
import { renderTweet, scoreTweet } from "./index.js"; 
import { getFollowingIdsFromCache } from "./followingCache.js";
import { log } from "./texts.js";

const followingContainer = document.getElementById("following1");

/*
let followingTweetDocs = [];
let followingNoMore = false;
let followingLoading = false;
let followingLastDoc = null;
let firstVisibleFollowing = null;
let unsubscribeFollowing = [];
let newFollowingIncoming = [];

const followingBanner = document.createElement("div");
followingBanner.style.cssText = `display:none;margin-top:20px;background:none;pointer-events:none;z-index:3;`;
followingBanner.className = "overlay1";
const followingBannerInner = document.createElement("div");
followingBannerInner.style.cssText = `position:absolute;top:0;right:auto;left:auto;width: fit-content; background:#04aa6d;color:white; padding: 8px 15px; border-radius: 50px;pointer-events:auto;cursor:pointer;`;
followingBannerInner.textContent = `0 new Wynt posted`;
followingBanner.appendChild(followingBannerInner);

async function resetFollowingListener(followedUserIds) {
  if (!followedUserIds || !followedUserIds.length) return;
  for (const unsub of unsubscribeFollowing) unsub();
  unsubscribeFollowing = [];

  if (!firstVisibleFollowing) return;

  const chunks = [];
  for (let i = 0; i < followedUserIds.length; i += 10) {
    chunks.push(followedUserIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const listenQ = query(
      collection(db, "tweets"),
      where("uid", "in", chunk),
      where("createdAt", ">", firstVisibleFollowing.data().createdAt),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(listenQ, async (snapshot) => {
      const docs = snapshot.docs.filter(
        d =>
          !newFollowingIncoming.some(i => i.id === d.id) &&
          !document.querySelector(`[data-id="${d.id}"]`)
      );
      if (!docs.length) return;
      newFollowingIncoming.push(...docs);
      followingBannerInner.textContent = `${newFollowingIncoming.length} new Wynt${newFollowingIncoming.length === 1 ? "" : "s"} posted`;
      followingBanner.style.display = "flex";
    });
    unsubscribeFollowing.push(unsub);
  }
}

followingContainer.parentElement.prepend(followingBanner);

followingBannerInner.onclick = async () => {
  if (!newFollowingIncoming.length) return;

  newFollowingIncoming.sort((a, b) => b.data().createdAt - a.data().createdAt);

  newFollowingIncoming.forEach(async (docSnap) => {
    const tweet = docSnap.data();
    const user = window.followingUserCache?.get(tweet.uid) ?? { uid: tweet.uid };

    const temp = document.createElement("div");
    await renderTweet(tweet, docSnap.id, user, "append", temp);
    const firstChild = temp.firstElementChild;
    if (firstChild) followingContainer.insertBefore(firstChild, followingContainer.firstChild);
  });

  firstVisibleFollowing = newFollowingIncoming[0];
  newFollowingIncoming = [];
  followingBanner.style.display = "none";

  window.scrollTo({ top: 0, behavior: "smooth" });

  await resetFollowingListener(getFollowingIdsFromCache());
};
*/

export async function loadFollowingTweets(reset = false) {
    followingContainer.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:400px;text-align:left;margin:0 40px"><h2 style="margin:0;">Feature unavailable</h2><p style="color:grey;margin:7px 0;">This feature is still being under construction and will be updated soon.</p>
        </div>
      </div>
    `;
/*
  if (!auth.currentUser || followingLoading) return;
  followingLoading = true;

  if (reset) {
    followingContainer.innerHTML = `<div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div>`;
    followingTweetDocs = [];
    followingNoMore = false;
    followingLastDoc = null;
  }

  const currentUserId = auth.currentUser.uid;
  const followedUserIds = getFollowingIdsFromCache();

  if (!followedUserIds) {
    log("red", "following cache isn't ready yet");
    followingLoading = false;
    return;
  }

  if (followedUserIds.length === 0) {
    followingContainer.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No followings — yet</h2><p style="color:grey;margin:7px 0;">seems like you don't have anyone followed, or everyone that you follow have no posts.</p>
        </div>
      </div>
    `;
    followingLoading = false;
    return;
  }

  const chunks = [];
  for (let i = 0; i < followedUserIds.length; i += 10) {
    chunks.push(followedUserIds.slice(i, i + 10));
  }

  const allTweets = [];
  for (const chunk of chunks) {
    let q = query(
      collection(db, "tweets"),
      where("uid", "in", chunk),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    if (followingLastDoc) {
      q = query(
        collection(db, "tweets"),
        where("uid", "in", chunk),
        orderBy("createdAt", "desc"),
        startAfter(followingLastDoc),
        limit(30)
      );
    }
    const snap = await getDocs(q);
    allTweets.push(...snap.docs);
    if (!snap.empty) {
      followingLastDoc = snap.docs[snap.docs.length - 1];
    }
  }

  if (!allTweets.length) {
    followingNoMore = true;
    followingLoading = false;
    return;
  }

  const seen = new Set();
  const scored = allTweets.filter(doc => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  }).map(docSnap => {
    const data = docSnap.data();
    return { docSnap, score: scoreTweet(data, new Set(followedUserIds)) };
  }).sort((a, b) => b.score - a.score);

  scored.forEach(async ({ docSnap }) => {
    const tweet = docSnap.data();
    const user = window.followingUserCache?.get(tweet.uid) ?? { uid: tweet.uid };
    
    try {
      if (!followingContainer.querySelector(".tweet")) followingContainer.innerHTML = "";
      await renderTweet(tweet, docSnap.id, user, "append", followingContainer);
    } catch (err) {
      console.error("[FOLLOWING] renderTweet error:", err);
    }
  });

  if (!firstVisibleFollowing && allTweets.length) {
    firstVisibleFollowing = allTweets[0];
    await resetFollowingListener(getFollowingIdsFromCache());
  }

  followingLoading = false;
*/
}

/*
window.addEventListener("scroll", async () => {
  const followingTab = document.querySelector("#following1");
  if (!followingTab || !followingTab.classList.contains("active")) return;

  if (followingNoMore || followingLoading) return;

  const distanceFromBottom =
    document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);

  if (distanceFromBottom < 300) {
    await loadFollowingTweets();
  }
});*/