import { db, auth, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, startAfter, deleteDoc } from "./firebase.js";
import { renderTweet } from './index.js';
import { youListActive } from "./nonsense.js"
import { parseMentionsToLinks, formatNumber } from "./texts.js"
import { base91ToImageSrc } from "./attachments.js";

const myPfp = document.getElementById("my-pfp");
const myBanner = document.getElementById("my-banner");
const myDescription = document.querySelector("#my-description");
const myName = document.querySelector("#my-name");
 
let pinLoaded = false;

let userLastVisibleDoc = null;
let userLoadedCount = 0;
const USER_PAGE_SIZE = 3;

let replyLastVisibleDoc = null;
let replyLoadedCount = 0;
const REPLY_PAGE_SIZE = 3;

let mentionedLastVisibleDoc = null;
let mentionedLoadedCount = 0;
const MENTIONED_PAGE_SIZE = 3;

let highlightedLastVisibleDoc = null;
let highlightedLoadedCount = 0;
let highlightsLoadedOnce = false;
const HIGHLIGHTED_PAGE_SIZE = 3;

const list = document.getElementById("youList");
const usermentionedList = document.getElementById("mentionedList");
const highlightedList = document.getElementById("highlightedList");
const replyList = document.getElementById("replyList1");

export function applyUserEffect(effectValue, targetId = "#user-profile-effect") {
  const el = document.querySelector(targetId);
  if (!el) return;

  el.style.setProperty("--user-effect-bg", "none");
  el.style.setProperty("--user-effect-filter", "brightness(0.5)");
  el.style.setProperty("--user-effect-opacity", "0.15");

  const effect = String(effectValue || "").trim();
  let background = "";

  switch (effect) {
    case "002": background = "/image/effects/flame.gif"; break;
    case "003": background = "/image/effects/rain.webp"; break;
    case "005": background = "/image/effects/earth.gif"; break;
    case "008": background = "/image/effects/wave.gif"; break;
    case "009": background = "/image/effects/fih.gif"; break;
    case "010": background = "/image/effects/sakura.gif"; break;
    case "custom-001": background = "/image/effects/custom/phoebe.gif"; break;
    default: background = "";
  }

  if (background) {
    el.style.setProperty("--user-effect-bg", `url('${background}')`);
    el.style.setProperty("--user-effect-opacity", "0.5");
  }
}

document.getElementById('usersvg').addEventListener("click", async () => {
  youListActive();
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  document.getElementById("youList").classList.remove('hidden');
  document.getElementById("my-name").dataset.uid = uid;
  document.querySelector("#copyMyLinkBtn").dataset.uid = uid;
  document.getElementById("copyMyIdBtn").dataset.uid = uid;
  document.getElementById("profileOverlay").classList.remove("hidden");

  const docSnap = await getDoc(doc(db, "users", uid));
  if (!docSnap.exists()) return;

  const d = docSnap.data();
  applyUserEffect(d.effect, "#user-profile-effect");
  const adminBadge = document.querySelector("#user-admin");

  const premiumExpiry = d.premium ? d.premium.toDate() : null;
  const now = new Date();
  const isPremium = premiumExpiry && premiumExpiry > now;

  if (isPremium) { adminBadge.style.display = "inline-block"; } else { adminBadge.style.display = "none"; }

  const data = docSnap.data();

  const banner = base91ToImageSrc(data.banner);

  if (banner) {
    myBanner.style.backgroundImage = `url('${banner}')`;
  } else {
    myBanner.style.backgroundImage = "url('/image/default-banner.png')";
  }

  myBanner.style.backgroundRepeat = 'no-repeat';
  myBanner.style.backgroundPosition = 'center';
  myBanner.style.backgroundSize = 'cover';
  myBanner.style.backgroundColor = 'unset';

  const avatarURL = base91ToImageSrc(data.photoURL) || auth.currentUser.photoURL;
  const myPfp = document.getElementById("my-pfp");

  if (avatarURL) {
    myPfp.style.background = `url('${avatarURL}') no-repeat center / cover`;
  } else {
    myPfp.style.background = "url('/image/default-avatar.jpg') no-repeat center / cover";
  }

  const userSnap = await getDoc(doc(db, "users", uid));
  const userData = userSnap.data();
  const postCount = userData?.posts || 0;
  const myFollowers = userData?.followers || 0;
  const myFollowing = userData?.following || 0;
  const balance = formatNumber(userData?.balance || 0);
  const streak = userData?.streak || 0;
  const iq = userData.IQ ? userData?.IQ.toFixed(2) : 0;
  const status = userData?.status || "i'm cold";

  document.getElementById("my-posts").textContent = postCount;
  document.getElementById("my-balance").textContent = balance;
  document.getElementById("my-streak").textContent = streak;
  document.getElementById("my-followers").textContent = myFollowers;
  document.getElementById("my-following").textContent = myFollowing;
  document.getElementById("my-iq").textContent = iq;
  document.getElementById("my-status").textContent = status;

  const name = data.displayName || auth.currentUser.displayName;
  document.getElementById("my-name").textContent = name;
  document.getElementById("my-username").textContent = `@${data.username}`

  document.getElementById("my-description").innerHTML =
    await parseMentionsToLinks(data.description || "wsg homie?", data.descriptionMentions || []);

  if (d.createdAt?.toDate) {
    const date = d.createdAt.toDate();
    const formatted = `${date.getDate()} ${date.toLocaleString("default", { month: "short" })} ${date.getFullYear()}`;
    document.getElementById("my-creation").textContent = `${formatted}`;
  }

  if (d.pinned && !pinLoaded) {
    const pinnedSnap = await getDoc(doc(db, "tweets", d.pinned));
    if (pinnedSnap.exists()) {
      const pinnedData = pinnedSnap.data();

      const userData = {
        ...d,
        uid
      };

      if (!document.getElementById("pinnedyeah")) {
        const pinnedLabel = document.createElement("div");
        pinnedLabel.id = "pinnedyeah";
        pinnedLabel.innerHTML = `<div class="iq pinlabel" style="background:var(--color);margin-bottom:10px;margin-top:30px;width:fit-content;font-size:13px;">Pinned by Wynt author</div>`;
        list.prepend(pinnedLabel);
      }
      await renderTweet(pinnedData, d.pinned, userData, "prepend", list);
    }
  }

  loadTweets(uid);
  pinLoaded = true;
});

async function loadTweets(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return;

  const userData = {
    ...userDoc.data(),
    uid
  };

  const tweetsRef = collection(db, "tweets");
  let q;

  if (!userLastVisibleDoc) {
    q = query(
      tweetsRef,
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(USER_PAGE_SIZE)
    );
  } else {
    q = query(
      tweetsRef,
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
      startAfter(userLastVisibleDoc),
      limit(USER_PAGE_SIZE)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty && userLoadedCount === 0) {
    list.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynts — yet</h2><p style="color:grey;margin:7px 0;">post something, and you'll see it here.</p></div></div>`;
    return;
  }

  for (const docSnap of snap.docs) {
    await renderTweet(docSnap.data(), docSnap.id, userData, "append", list);
  }

  userLoadedCount += snap.docs.length;

  if (snap.docs.length < USER_PAGE_SIZE) {
  } else {
    userLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}

const profileScrollBox = document.querySelector("#profileOverlay .user-box");

let tweetLoading = false;
let mentionLoading = false;
let highlightLoading = false;
let replyLoading = false;

profileScrollBox.addEventListener("scroll", async () => {
  const nearBottom =
    profileScrollBox.scrollTop + profileScrollBox.clientHeight >=
    profileScrollBox.scrollHeight - 150;

  if (!nearBottom) return;

  const activeTab = document.querySelector(".tab2.active")?.dataset.target;
  const uid = document.getElementById("my-name").dataset.uid;
  const mention = document.getElementById("mentionedList");
  const you = document.getElementById("youList");
  const highlighted = document.getElementById("highlightedList");
  const replies = document.getElementById("replyList1");

  // TWEETS TAB
  if (activeTab === "youList" && you.querySelectorAll(".tweet").length >= USER_PAGE_SIZE) {
    if (tweetLoading) return;
    tweetLoading = true;
    await loadTweets(uid);
    tweetLoading = false;
  }

  if (activeTab === "replyList1" && replies.querySelectorAll(".tweet").length >= REPLY_PAGE_SIZE) {
    if (replyLoading) return;
    replyLoading = true;
    await loadReply(uid);
    replyLoading = false;
  }

  // MENTIONED TAB
  if (activeTab === "mentionedList" && mention.querySelectorAll(".tweet").length >= MENTIONED_PAGE_SIZE) {
    if (mentionLoading) return;
    mentionLoading = true;
    await loadUserMentionedTweets(uid);
    mentionLoading = false;
  }

  // HIGHLIGHTS TAB
  if (activeTab === "highlightedList" && highlighted.querySelectorAll(".tweet").length >= HIGHLIGHTED_PAGE_SIZE) {
    if (highlightLoading) return;
    highlightLoading = true;
    await loadHighlighted(uid);
    highlightLoading = false;
  }
});

document.querySelectorAll(".tab2").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab2").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    document.getElementById("youList").style.display = "none";
    document.getElementById("mentionedList").style.display = "none";
    document.getElementById("highlightedList").style.display = "none";
    document.getElementById("replyList1").style.display = "none";

    document.getElementById("youList").classList.add("hidden");
    document.getElementById("mentionedList").classList.add("hidden");
    document.getElementById("highlightedList").classList.add("hidden");
    document.getElementById("replyList1").classList.add("hidden");

    const targetId = tab.dataset.target;
    document.getElementById(targetId).style.display = "block";
    document.getElementById(targetId).classList.remove("hidden");

    const uid = document.getElementById("my-name").dataset.uid;

    if (targetId === "youList") {
      loadTweets(uid);
    } else if (targetId === "mentionedList") {
      loadUserMentionedTweets(uid);
    } else if (targetId === "replyList1") {
      loadReply(uid);
    } else if (targetId === "highlightedList") {
      if (!highlightsLoadedOnce) {
        loadHighlighted(uid, true);
      }
    }
  });
});

async function loadReply(uid) {
  const replyRef = collection(db, "users", uid, "replies");
  let q;

  if (!replyLastVisibleDoc) {
    q = query(replyRef, orderBy("repliedAt", "desc"), limit(REPLY_PAGE_SIZE));
  } else {
    q = query(replyRef, orderBy("repliedAt", "desc"), startAfter(replyLastVisibleDoc), limit(REPLY_PAGE_SIZE));
  }

  const snap = await getDocs(q);

  if (snap.empty && replyLoadedCount === 0) {
    replyList.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Replies — yet</h2><p style="color:grey;margin:7px 0;">when you reWynted a post, it'll appear here.</p></div></div>`;
    return;
  }

  if (snap.docs.length >= REPLY_PAGE_SIZE) {
    replyLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }

  for (const mentionDoc of snap.docs) {
    const tweetId = mentionDoc.id;
    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
    if (!tweetDoc.exists()) continue;

    const tweetData = tweetDoc.data();
    const userDoc = await getDoc(doc(db, "users", uid));
    const userData = {
      ...userDoc.data(),
      uid
    };

    await renderTweet(tweetData, tweetId, userData, "append", replyList);
  }

  replyLoadedCount += snap.docs.length;

  if (snap.docs.length >= REPLY_PAGE_SIZE) {
    replyLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}


async function loadUserMentionedTweets(uid) {
  const mentionedRef = collection(db, "users", uid, "mentioned");
  let q;

  if (!mentionedLastVisibleDoc) {
    q = query(mentionedRef, orderBy("mentionedAt", "desc"), limit(MENTIONED_PAGE_SIZE));
  } else {
    q = query(mentionedRef, orderBy("mentionedAt", "desc"), startAfter(mentionedLastVisibleDoc), limit(MENTIONED_PAGE_SIZE));
  }

  const snap = await getDocs(q);

  if (snap.empty && mentionedLoadedCount === 0) {
    usermentionedList.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No mentions — yet</h2><p style="color:grey;margin:7px 0;">when this user gets mentioned, it will appear here. Be the first to mention them.</p></div></div>`;
    return;
  }

  if (snap.docs.length >= MENTIONED_PAGE_SIZE) {
    mentionedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }

  for (const mentionDoc of snap.docs) {
    const tweetId = mentionDoc.id;
    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
    if (!tweetDoc.exists()) continue;

    const tweetData = tweetDoc.data();
    const userDoc = await getDoc(doc(db, "users", uid));
    const userData = {
      ...userDoc.data(),
      uid
    };

    await renderTweet(tweetData, tweetId, userData, "append", usermentionedList);
  }

  mentionedLoadedCount += snap.docs.length;

  if (snap.docs.length >= MENTIONED_PAGE_SIZE) {
    mentionedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}

async function loadHighlighted(uid, initial = false) {
  const highlightedRef = collection(db, "users", uid, "highlights");
  let q;

  if (!highlightedLastVisibleDoc) {
    q = query(highlightedRef, orderBy("highlightedAt", "desc"), limit(HIGHLIGHTED_PAGE_SIZE));
  } else {
    q = query(highlightedRef, orderBy("highlightedAt", "desc"), startAfter(highlightedLastVisibleDoc), limit(HIGHLIGHTED_PAGE_SIZE));
  }

  const snap = await getDocs(q);

  if (snap.empty && highlightedLoadedCount === 0) {
    highlightedList.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No highlights — yet</h2><p style="color:grey;margin:7px 0;">when you've bought premium, you'll see it here.</p></div></div>`;
    return;
  }

  for (const highlightedDoc of snap.docs) {
    const tweetId = highlightedDoc.id;
    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));

    if (!tweetDoc.exists()) {
      const deletedDiv = document.createElement("div");
      deletedDiv.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-bottom:var(--border);color:grey;"><i>This Wynt is unavailable</i> <div class='delBtn' style="cursor:pointer"><img src="/image/trash.svg"></div></div>`;

      const delBtn = deletedDiv.querySelector(".delBtn");

      delBtn.onclick = async () => {
        await deleteDoc(doc(db, "users", uid, "highlights", tweetId));
        deletedDiv.remove();
      };

      highlightedList.appendChild(deletedDiv);
      continue;
    }

    const tweetData = tweetDoc.data();

    const userDoc = await getDoc(doc(db, "users", tweetData.uid));
    const userData = {
      ...userDoc.data(),
      uid: tweetData.uid
    };

    await renderTweet(tweetData, tweetId, userData, "append", highlightedList);
    highlightsLoadedOnce = true;
  }

  highlightedLoadedCount += snap.docs.length;

  if (snap.docs.length < HIGHLIGHTED_PAGE_SIZE) {
  } else {
    highlightedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}