import { db, auth, doc, getDoc, collection, query, where, getDocs, orderBy, limit, startAfter, deleteDoc, Timestamp, onSnapshot } from "./firebase.js";
import { renderTweet } from './index.js';
import { youListActive } from "./nonsense.js"
import { parseMentionsToLinks, formatNumber } from "./texts.js"
import { base91ToImageSrc } from "./attachments.js";
import { loadFolderTweets } from "./highlight.js";

const myBanner = document.getElementById("my-banner");
const loading = document.getElementById("loadingOverlay");
 
let pinLoaded = false;

let userLastVisibleDoc = null;
let userLoadedCount = 0;
const USER_PAGE_SIZE = 5;

let mentionedLastVisibleDoc = null;
let mentionedLoadedCount = 0;
const MENTIONED_PAGE_SIZE = 5;

const list = document.getElementById("youList");
const usermentionedList = document.getElementById("mentionedList");

export function applyUserEffect(effectValue, targetId = "#user-profile-effect") {
  const el = document.querySelector(targetId);
  if (!el) return;

  el.style.setProperty("--user-effect-bg", "none");
  el.style.setProperty("--user-effect-filter", "brightness(0.5)");
  el.style.setProperty("--user-effect-opacity", "0.15");

  const effect = String(effectValue || "").trim();
  let background = "";

  switch (effect) {
    case "custom-001": background = "/image/effects/custom/phoebe.gif"; break;
    default: background = "";
  }

  if (background) {
    el.style.setProperty("--user-effect-bg", `url('${background}')`);
    el.style.setProperty("--user-effect-opacity", "0.5");
  }
}

let userHighlightLastDoc = null;
let userHighlightLoading = false;
let userHighlightNoMore = false;
let userHighlightLoaded = false;
let userHighlightNewestDoc = null;
const userHighlightRenderedIds = new Set();

function createHighlightItem(docSnap) {
  const data = docSnap.data();

  const item = document.createElement("div");
  item.className = "highlight-item";
  item.id = `highlight-item-${docSnap.id}`;

  item.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;align-items:center;">
      <div>
      ${
        data.icon
          ? `<img class="highlight-icon" src="${base91ToImageSrc(data.icon)}" onerror="this.onerror=null;this.src='/image/folder.svg';">`
          : `<img src="/image/folder.svg">`
      }
      </div>
      <div style="align-self:flex-start;">
        <div class="user-link">${data.name || "Untitled"}</div>
        <div style="color:grey;margin-top:5px;font-size:14pxtext-overflow:ellipsis;white-space:nowrap;overflow: hidden;"><b>${formatNumber(data.tweetsCount)}</b> Wynts</div>
      </div>
    </div>
  `;

  item.addEventListener('click', async () => {
    loadFolderTweets(docSnap.id, true, auth.currentUser.uid);
  });

  return item;
}

function setupHighlightInfiniteScroll(uid) {
  const container = document.getElementById("profile-highlights-container");

  container.addEventListener("scroll", async () => {
    const reachedEnd =
      container.scrollLeft + container.clientWidth >= container.scrollWidth - 20;

    if (reachedEnd) {
      await loadUserHighlights(uid);
    }
  });
}

function setupHighlightSnapshot(uid) {
  const container = document.getElementById("profile-highlights-container");
  const highlightRef = collection(db, "users", uid, "highlights");
  const q = query(highlightRef, orderBy("createdAt", "desc"), limit(10));

  let isFirst = true;
  onSnapshot(q, (snap) => {
    // Skip first emission — Firestore fires immediately and would duplicate the initial load
    if (isFirst) {
      isFirst = false;
      return;
    }

    snap.docChanges().forEach((change) => {
      if (change.type === "removed") {
        // Remove from DOM and tracking set
        userHighlightRenderedIds.delete(change.doc.id);
        document.getElementById(`highlight-item-${change.doc.id}`)?.remove();
        if (container.querySelectorAll(".highlight-item").length === 0) {
          container.classList.remove("active");
        }
        return;
      }

      if (change.type === "added") {
        // Skip if already rendered (backfill from deletion window or initial load)
        if (userHighlightRenderedIds.has(change.doc.id)) return;

        userHighlightRenderedIds.add(change.doc.id);
        userHighlightNewestDoc = change.doc;

        const el = createHighlightItem(change.doc);
        container.classList.add("active");
        container.prepend(el);
      }
    });
  });
}

async function loadUserHighlights(uid, initial = false) {
  const container = document.getElementById("profile-highlights-container");

  if (uid != auth.currentUser.uid) {
    document.getElementById("hchangeFolderName").style.display = "none";
  }
  document.getElementById("hchangeFolderName").style.display = "inline";

  if (initial) {
    container.innerHTML = "";
    userHighlightLastDoc = null;
    userHighlightNoMore = false;
    userHighlightLoading = false;
  }

  if (userHighlightLoading || userHighlightNoMore) return;
  userHighlightLoading = true;

  const highlightRef = collection(db, "users", uid, "highlights");
  let q = query(
    highlightRef,
    orderBy("createdAt", "desc"),
    limit(5)
  );

  if (userHighlightLastDoc) {
    q = query(
      highlightRef,
      orderBy("createdAt", "desc"),
      startAfter(userHighlightLastDoc),
      limit(5)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty) {
    if (!userHighlightLastDoc) {
      container.innerHTML = "";
      container.classList.remove("active");
    }

    userHighlightNoMore = true;
    userHighlightLoading = false;
    return;
  }
  container.classList.add("active");

  snap.forEach((docSnap) => {
    userHighlightRenderedIds.add(docSnap.id);
    container.appendChild(createHighlightItem(docSnap));
  });

  // Track the newest doc so onSnapshot can detect truly new ones
  if (initial && snap.docs.length > 0) {
    userHighlightNewestDoc = snap.docs[0];
  }

  userHighlightLastDoc = snap.docs[snap.docs.length - 1];

  if (snap.docs.length < 5) {
    userHighlightNoMore = true;
  }

  userHighlightLoading = false;
}

document.addEventListener("DOMContentLoaded", () => {
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

    if (d.suspended && d.suspendedUntil > Timestamp.now()) {
      document.getElementById("my-suspended").classList.remove("hidden");
      if (d.suspendedFor) document.getElementById("suspended-for").textContent = `for: ${d.suspendedFor}`;
    } else {
      document.getElementById("my-suspended").classList.add("hidden");
    }

    applyUserEffect(d.effect, "#user-profile-effect");
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

    if (!userHighlightLoaded) {
      userHighlightLoaded = true;
      loadUserHighlights(uid, true);
      setupHighlightInfiniteScroll(uid);
      setupHighlightSnapshot(uid);
    }

    document.getElementById("my-posts").textContent = userData.posts || 0;
    document.getElementById("my-followers").textContent = userData.followers || 0;
    document.getElementById("my-comCount").textContent = userData.communitiesCount || 0;
    document.getElementById("my-following").textContent = userData.following || 0;
    document.getElementById("my-status").textContent = userData.status || "i'm cold";

    const name = data.displayName || auth.currentUser.displayName;
    document.getElementById("my-name").textContent = name;
    document.getElementById("my-username").textContent = `@${data.username}`;
    document.getElementById("my-description").textContent = "loading about...";
    document.getElementById("skuter").textContent = name;

    if (d.createdAt?.toDate) {
      const date = d.createdAt.toDate();
      const formatted = `${date.getDate()} ${date.toLocaleString("default", { month: "short" })} ${date.getFullYear()}`;
      document.getElementById("my-creation").textContent = `${formatted}`;
    }

    document.getElementById("my-description").innerHTML =
      await parseMentionsToLinks(data.description || "wsg homie?", data.descriptionMentions || []);

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
          pinnedLabel.innerHTML = `<div class="iq pinlabel profilePinned-${d.pinned}" style="background:var(--color);margin-bottom:10px;margin-top:30px;width:fit-content;font-size:13px;">Pinned by Wynt author</div>`;
          list.prepend(pinnedLabel);
        }
        await renderTweet(pinnedData, d.pinned, userData, "prepend", list);
      }
    }

    loadTweets(uid);
    pinLoaded = true;
  });
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

  snap.docs.forEach(async (docSnap) => {
    await renderTweet(docSnap.data(), docSnap.id, userData, "append", list);
  });

  userLoadedCount += snap.docs.length;

  if (snap.docs.length < USER_PAGE_SIZE) {
  } else {
    userLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}

const profileScrollBox = document.querySelector("#profileOverlay .user-box");

let tweetLoading = false;
let mentionLoading = false;

profileScrollBox.addEventListener("scroll", async () => {
  const nearBottom =
    profileScrollBox.scrollTop + profileScrollBox.clientHeight >=
    profileScrollBox.scrollHeight - 150;

  if (!nearBottom) return;

  const activeTab = document.querySelector(".tab2.active")?.dataset.target;
  const uid = document.getElementById("my-name").dataset.uid;
  const mention = document.getElementById("mentionedList");
  const you = document.getElementById("youList");

  // TWEETS TAB
  if (activeTab === "youList" && you.querySelectorAll(".tweet").length >= USER_PAGE_SIZE) {
    if (tweetLoading) return;
    tweetLoading = true;
    await loadTweets(uid);
    tweetLoading = false;
  }

  // MENTIONED TAB
  if (activeTab === "mentionedList" && mention.querySelectorAll(".tweet").length >= MENTIONED_PAGE_SIZE) {
    if (mentionLoading) return;
    mentionLoading = true;
    await loadUserMentionedTweets(uid);
    mentionLoading = false;
  }
});

document.querySelectorAll(".tab2").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab2").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    document.getElementById("youList").style.display = "none";
    document.getElementById("mentionedList").style.display = "none";

    document.getElementById("youList").classList.add("hidden");
    document.getElementById("mentionedList").classList.add("hidden");

    const targetId = tab.dataset.target;
    document.getElementById(targetId).style.display = "block";
    document.getElementById(targetId).classList.remove("hidden");

    const uid = document.getElementById("my-name").dataset.uid;

    if (targetId === "youList") {
      loadTweets(uid);
    } else if (targetId === "mentionedList") {
      loadUserMentionedTweets(uid);
    }
  });
});

async function loadUserMentionedTweets(uid) {
  const ref = collection(db, "tweets");
  let q;

  if (!mentionedLastVisibleDoc) {
    q = query(ref, 
      where("mentioned", "array-contains", uid),
      orderBy("createdAt", "desc"), 
      limit(MENTIONED_PAGE_SIZE));
  } else {
    q = query(ref, 
      where("mentioned", "array-contains", uid),
      orderBy("createdAt", "desc"), 
      startAfter(mentionedLastVisibleDoc), 
      limit(MENTIONED_PAGE_SIZE));
  }

  const snap = await getDocs(q);

  if (snap.empty && mentionedLoadedCount === 0) {
    usermentionedList.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No mentions — yet</h2><p style="color:grey;margin:7px 0;">when this user gets mentioned, it will appear here. Be the first to mention them.</p></div></div>`;
    return;
  }

  if (snap.docs.length >= MENTIONED_PAGE_SIZE) {
    mentionedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }

  snap.docs.forEach(async (mentionDoc) => {
    const tweetId = mentionDoc.id;
    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
    if (!tweetDoc.exists()) return;

    const tweetData = tweetDoc.data();
    const userDoc = await getDoc(doc(db, "users", uid));
    const userData = {
      ...userDoc.data(),
      uid
    };

    await renderTweet(tweetData, tweetId, userData, "append", usermentionedList);
  });

  mentionedLoadedCount += snap.docs.length;

  if (snap.docs.length >= MENTIONED_PAGE_SIZE) {
    mentionedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}