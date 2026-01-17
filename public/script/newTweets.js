import { auth, db, collection, getDocs, getDoc, doc, query, orderBy, limit, where, startAfter, onSnapshot } from "./firebase.js";
import { renderTweet, scoreTweet } from "./index.js"; 

const newContainer = document.getElementById("new");

let newTweetDocs = [];
let newNoMore = false;
let newLoading = false;
let newLastDoc = null;
let firstVisible = null;
let unsubscribeNew = null;
let newIncoming = [];

const newBanner = document.createElement("div");
newBanner.style.cssText = `display:none;margin-top:20px;background:none;pointer-events:none;z-index:3;`;
newBanner.className = `overlay1`;
const banner = document.createElement("div");
banner.style.cssText = `position:absolute;top:0;right:auto;left:auto;width: fit-content; background: #00ba7c;color:white; padding: 8px 15px; border-radius: 50px;pointer-events:auto;cursor:pointer`;
banner.textContent = `0 new Wynt posted`;
newBanner.appendChild(banner);

async function resetNewListener() {
  if (unsubscribeNew) unsubscribeNew(); 

  if (!firstVisible) return;

  const listenQ = query(
    collection(db, "tweets"),
    orderBy("createdAt", "desc"),
    where("createdAt", ">", firstVisible.data().createdAt)
  );

  unsubscribeNew = onSnapshot(listenQ, async (snapshot) => {
    const docs = snapshot.docs.filter(d => !newIncoming.some(i => i.id === d.id));
    if (!docs.length) return;
    newIncoming.push(...docs);
    banner.textContent = `${newIncoming.length} new Wynt${newIncoming.length === 1 ? '' : 's'} posted`;
    newBanner.style.display = "flex";
  });
}

banner.onclick = async () => {
  if (!newIncoming.length) return;

  newIncoming.sort((a, b) => b.data().createdAt - a.data().createdAt);

  for (const docSnap of newIncoming) {
    const tweet = docSnap.data();
    const userDoc = await getDoc(doc(db, "users", tweet.uid));
    const user = userDoc.exists() ? { ...userDoc.data(), uid: tweet.uid } : { uid: tweet.uid };

    const temp = document.createElement("div");
    await renderTweet(tweet, docSnap.id, user, "append", temp);

    const firstChild = temp.firstElementChild;
    if (firstChild) newContainer.insertBefore(firstChild, newContainer.firstChild);
  }

  firstVisible = newIncoming[0];

  newIncoming = [];
  newBanner.style.display = "none";
  setTimeout(() => {
    if (!newIncoming.length) newBanner.style.display = "none";
  }, 300);

  window.scrollTo({ top: 0, behavior: "smooth" });

  await resetNewListener();
};

newContainer.parentElement.prepend(newBanner);

export async function loadNewTweets(reset = false) {
  if (newLoading) return;
  newLoading = true;

  if (reset) {
    newContainer.innerHTML = `<div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div>`;
    newTweetDocs = [];
    newNoMore = false;
    newLastDoc = null;
    firstVisible = null;
    if (unsubscribeNew) unsubscribeNew();
  }

  let q = query(collection(db, "tweets"), orderBy("createdAt", "desc"), limit(30));
  if (newLastDoc) {
    q = query(collection(db, "tweets"), orderBy("createdAt", "desc"), startAfter(newLastDoc), limit(30));
  }

  const snap = await getDocs(q);
  if (snap.empty) {
    newNoMore = true;
    newLoading = false;
    return;
  }

  if (!firstVisible) firstVisible = snap.docs[0];
  newLastDoc = snap.docs[snap.docs.length - 1];
  newTweetDocs.push(...snap.docs);

  for (const docSnap of snap.docs) {
    const tweet = docSnap.data();
    const userDoc = await getDoc(doc(db, "users", tweet.uid));
    const user = userDoc.exists() ? { ...userDoc.data(), uid: tweet.uid } : { uid: tweet.uid };
    if (!newContainer.querySelector(".tweet")) newContainer.innerHTML = "";
    await renderTweet(tweet, docSnap.id, user, "append", newContainer);
  }

  if (!unsubscribeNew && firstVisible) {
    await resetNewListener();
  }

  newLoading = false;
}

window.addEventListener("scroll", async () => {
  const newTab = document.querySelector("#new");
  if (!newTab || !newTab.classList.contains("active")) return;
  if (newNoMore || newLoading) return;

  const distanceFromBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
  if (distanceFromBottom < 300) {
    await loadNewTweets();
  }
});

