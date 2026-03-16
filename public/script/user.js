import { db, collection, query, writeBatch, where, getDocs, orderBy, limit, auth, getDoc, doc, setDoc, deleteDoc, startAfter, updateDoc, increment, deleteField, addDoc, serverTimestamp, runTransaction, Timestamp } from "./firebase.js";
import { renderTweet, getUserData, loadComments, currentUserRole } from './index.js';
import { sendFollowNotification } from "./notification.js";
import { homesvg, homefilled, searchsvg, searchfilled, tweetviewactive1, tweet } from "./nonsense.js";
import { tokenize, parseMentionsToLinks, formatNumber, info, log, confirmDialog, formatUTC8, formatDate } from "./texts.js";
import { sendToDiscord, reportToDiscord } from "./discord.js";
import { renderCommentViewer } from "./commentViewer.js";
import { renderTweetViewer } from "./tweetViewer.js";
import { openCommunity } from "./community.js"; 
import { base91ToImageSrc } from "./attachments.js";

const loading            = document.getElementById("loadingOverlay");
const searchBtn          = document.querySelector('.smallbar img[src="/image/search.svg"]');
const userOverlay        = document.getElementById("userOverlay");
const userSubOverlay     = document.getElementById("userSubOverlay");
const searchInput        = userOverlay.querySelector("input[type='text']");
const usersView          = document.getElementById("usersView");
const tweetsView         = document.getElementById("tweetsView");
const tagsView           = document.getElementById("tagsView");
const tagName            = document.getElementById("tagId");
const deleteReasonSubmit = document.getElementById("deleteReasonSubmit");
const usersSearch        = document.getElementById("usersSearch");

let tweetSearchResults   = [];
let renderedTweetCount   = 0;
let userAlreadyFetched   = false;
let isSearching          = false;
let lastUserDoc          = null;
let totalLoaded          = 0;
let previousTerm         = "";
let followList           = [];
let followLastDoc        = null;

const FOLLOW_PAGE_SIZE   = 10;

export const skeleton = `
  <div class="skeleton-card" style="margin-top:50px">
    <div class="skeleton-header">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-header-lines">
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton-dot"></div>
    </div>
    <div class="skeleton-body">
      <div class="skeleton-line long"></div>
      <div class="skeleton-line short"></div>
      <div class="skeleton-line medium"></div>
    </div>
    <div class="skeleton-footer">
      <div class="skeleton-pill small"></div>
      <div class="skeleton-pill small"></div>
      <div class="skeleton-pill small"></div>
      <div class="invisible skeleton-pill small"></div>
      <div class="skeleton-pill small last"></div>
    </div>
  </div>
  <div class="skeleton-card">
    <div class="skeleton-header">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-header-lines">
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton-dot"></div>
    </div>
    <div class="skeleton-body">
      <div class="skeleton-line medium"></div>
      <div class="skeleton-line long"></div>
      <div class="skeleton-line short"></div>
    </div>
    <div class="skeleton-footer">
      <div class="skeleton-pill small"></div>
      <div class="skeleton-pill small"></div>
      <div class="skeleton-pill small"></div>
      <div class="invisible skeleton-pill small"></div>
      <div class="skeleton-pill small last"></div>
    </div>
  </div>
  <div class="skeleton-card">
    <div class="skeleton-header">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-header-lines">
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton-dot"></div>
    </div>
    <div class="skeleton-body">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line long"></div>
      <div class="skeleton-line medium"></div>
    </div>
    <div class="skeleton-footer">
      <div class="skeleton-pill small"></div>
      <div class="skeleton-pill small"></div>
      <div class="skeleton-pill small"></div>
      <div class="invisible skeleton-pill small"></div>
      <div class="skeleton-pill small last"></div>
    </div>
  </div>
`;

function getSuspendedUntil(duration) {
  const now = Date.now();

  const map = {
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "2w": 14 * 24 * 60 * 60 * 1000,
    "1mo": 30 * 24 * 60 * 60 * 1000
  };

  if (duration === "permanent") return null;

  return Timestamp.fromMillis(now + map[duration]);
}

searchBtn.addEventListener("click", () => {
  userOverlay.classList.remove("hidden");
  document.querySelectorAll(".tab1").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
  const tweetsTab = document.querySelector('.tab1[data-target="tweetsView"]');
  tweetsTab.classList.add("active");
  tweetsView.classList.remove("hidden");
});

let a = false;
let b = false;
let skib = false;

document.querySelectorAll(".tab1").forEach(tab1 => {
  tab1.addEventListener("click", () => {
    document.querySelectorAll(".tab1").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
    tab1.classList.add("active");
    document.getElementById(tab1.dataset.target).classList.remove("hidden");

    searchInput.value = "";
    const tabTarget = tab1.dataset.target;

    if (tabTarget === "tagsView") {
      if (skib === true) return;
      previousTerm = "";
      fetchTags("");
      skib = true;
    } else if (tabTarget === "usersView") {
      if (!userAlreadyFetched) fetchUsers("");
      usersView.classList.remove("hidden");
      usersSearch.classList.add("hidden");
    } else if (tabTarget === "tweetsView") {
      resetTweetSearch();
      tweetsView.innerHTML = `          
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:400px;text-align:left;">
          <h2 style="margin:0;display:flex;gap:10px;"><img loading='lazy' height="33" style="transform:rotate(90deg)" src="/image/search.svg"> Search for Wynts</h2>
          <p style="color:grey;margin:7px 0;">enter at least 3 characters to search Wynts.</p>
        </div>
      </div>`;
    }
  });
});

const MIN_LEN = 3;

searchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const term = searchInput.value.trim();
    if (term === previousTerm) return;
    previousTerm = term;

    if (term.startsWith("https://wyntr.netlify.app")) {

      const url                 = term.replace("https://wyntr.netlify.app", "");
      const userMatch           = url.match(/^\/user\/([^/]+)/);
      const tweetMatch          = url.match(/^\/wynt\/([^/]+)$/);
      const communityTweetMatch = url.match(/^\/community\/([^/]+)\/wynt\/([^/]+)$/);
      const communityReplyMatch = url.match(/^\/community\/([^/]+)\/wynt\/([^/]+)\/reply\/([^/]+)$/);
      const replyMatch          = url.match(/^\/wynt\/([^/]+)\/reply\/([^/]+)$/);
      const communityMatch      = url.match(/^\/community\/([^/]+)$/);

      if (userMatch || tweetMatch || communityMatch || replyMatch || communityTweetMatch || communityReplyMatch) {
        searchInput.value = "";
        previousTerm = "";
      }
 
      if (communityMatch) {
        const communityId = communityMatch[1];
        loading.classList.add("show");
        const snap = await getDoc(doc(db, "communities", communityId));
        if (!snap.exists()) {
          loading.classList.remove("show");
          log("red", "community not found");
        }
        const data = snap.data();

        if (data.private === true && !(data.members || []).includes(auth.currentUser.uid)) {
          loading.classList.remove("show");
          info("x", "No access", "This community is a private community and you don't have permission to view this community.");
          return;
        }

        loading.classList.remove("show");
        return await openCommunity(communityId);
      }

      if (userMatch) {
        const userId = userMatch[1];
        return openUserSubProfile(userId);
      }

      if (communityReplyMatch) {
        loading.classList.add("show");
        const communityId = communityReplyMatch[1];
        const tweetId = communityReplyMatch[2];
        const commentId = communityReplyMatch[3];

        const comRef = doc(db, "communities", communityId);
        const comSnap = await getDoc(comRef);

        if (!comSnap.exists()) return;

        const cData = comSnap.data();

        if (cData.private === true && !(cData.members || []).includes(auth.currentUser.uid)) {
          loading.classList.remove("show");
          info("x", "No access", "The community this Wynt belongs to is a private community and you don't have permission to view this reply.");
          return;
        }

        const overlay = document.getElementById("commentViewer");
        const box = overlay.querySelector("#appendComment");
        const replyList = overlay.querySelector("#replyList");

        overlay.classList.remove("hidden");
        replyList.innerHTML = "";

        const commentRef = doc(db, "communities", communityId, "posts", tweetId, "comments", commentId);
        const snap = await getDoc(commentRef);

        if (snap.exists()) {
          loading.classList.remove("show");
          const commentData = { id: snap.id, ...snap.data() };
          await document.getElementById("tweetViewer").classList.add("hidden");
          renderCommentViewer(commentData, commentId, tweetId, box, communityId);
          loadComments(tweetId, true, commentId, replyList, communityId);
          openCommunity(communityId);
          document.body.classList.add("no-scroll");
        } else {
          box.innerHTML = `
          div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No reply found</h2><p style="color:grey;margin:7px 0;">seems like this reply have been deleted or you don't have permission to view it.</p></div></div>`;
        }
        
        loading.classList.remove("show");
        return;
      }

      if (communityTweetMatch) {
        const communityId = communityTweetMatch[1];
        const tweetId = communityTweetMatch[2];

        const comRef = doc(db, "communities", communityId);
        loading.classList.add("show");
        const comSnap = await getDoc(comRef);

        if (!comSnap.exists()) return;

        const cData = comSnap.data();

        if (cData.private === true && !(cData.members || []).includes(auth.currentUser.uid)) {
          loading.classList.remove("show");
          info("x", "No access", "The community this Wynt belongs to is a private community and you don't have permission to view this Wynt.");
          return;
        }

        const tweetViewer = document.getElementById("tweetViewer");
        const box = tweetViewer.querySelector("#appendTweet");

        tweetViewer.classList.remove("hidden");
        document.body.classList.add("no-scroll");

        const tweetRef = doc(db, "communities", communityId, "posts", tweetId);
        const tweetSnap = await getDoc(tweetRef);

        if (!tweetSnap.exists()) {
          loading.classList.remove("show");
          document.getElementById("commentList").innerHTML = "";
          box.innerHTML = `
          div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynt found</h2><p style="color:grey;margin:7px 0;">seems like this Wynt have been deleted or you don't have permission to view it.</p></div></div>`;
          return;
        }

        const tweetData = tweetSnap.data();
        loading.classList.remove("show");
        renderTweetViewer(tweetData, tweetId, box, auth.currentUser, communityId);
        loadComments(tweetId, true, null, null, communityId);
        openCommunity(communityId);
        return;
      }

      if (tweetMatch) {
        const tweetId = tweetMatch[1];
        const tweetViewer = document.getElementById("tweetViewer");
        const box = tweetViewer.querySelector("#appendTweet");

        tweetViewer.classList.remove("hidden");
        document.body.classList.add("no-scroll");

        const tweetRef = doc(db, "tweets", tweetId);
        const tweetSnap = await getDoc(tweetRef);

        if (!tweetSnap.exists()) {
          document.getElementById("commentList").innerHTML = "";
          box.innerHTML = `
          div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynt found</h2><p style="color:grey;margin:7px 0;">seems like this Wynt have been deleted or you don't have permission to view it.</p></div></div>`;
          return;
        }

        const tweetData = tweetSnap.data();
        renderTweetViewer(tweetData, tweetId, box, auth.currentUser);
        return loadComments(tweetId);
      }

      if (replyMatch) {
        const tweetId = replyMatch[1];
        const commentId = replyMatch[2];

        const overlay = document.getElementById("commentViewer");
        const box = overlay.querySelector("#appendComment");
        const replyList = overlay.querySelector("#replyList");

        overlay.classList.remove("hidden");
        replyList.innerHTML = "";

        const commentRef = doc(db, "tweets", tweetId, "comments", commentId);
        const snap = await getDoc(commentRef);

        if (snap.exists()) {
          const commentData = { id: snap.id, ...snap.data() };
          await document.getElementById("tweetViewer").classList.add("hidden");
          renderCommentViewer(commentData, commentId, tweetId, box);
          loadComments(tweetId, true, commentId, replyList);
          document.body.classList.add("no-scroll");
        } else {
          box.innerHTML = `
          div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No reply found</h2><p style="color:grey;margin:7px 0;">seems like this reply have been deleted or you don't have permission to view it.</p></div></div>`;
        }
        return;
      }
    }

    const activeTab = document.querySelector(".tab1.active")?.dataset.target;

    if (activeTab === "tweetsView") {
      if (term.length >= MIN_LEN) {
        tweetsView.innerHTML = `<div class="skeleton-card" style="margin:20px 0"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div>`;

        const tweets = await searchTweets(term, true);

        if (tweets.length === 0) {
          tweetsView.innerHTML = `
            <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
              <div style="max-width:400px;text-align:left;">
                <h2 style="margin:0;">No Wynts matched — yet</h2>
                <p style="color:grey;margin:7px 0;">when someone posts topic you're looking for, it will appear here.</p>
              </div>
            </div>`;
          return;
        }
        
        if (!tweetsView.querySelector(".tweet")) tweetsView.innerHTML = "";
        tweets.forEach(t => renderTweet(t, t.id, auth.currentUser, "append", tweetsView));
      } else {
        tweetsView.innerHTML = `
          <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
            <div style="max-width:400px;text-align:left;">
              <h2 style="margin:0;display:flex;gap:10px;">
                <img loading='lazy' height="33" style="transform:rotate(90deg)" src="/image/search.svg"> Search for Wynts
              </h2>
              <p style="color:grey;margin:7px 0;">enter at least 3 characters to search Wynts.</p>
            </div>
          </div>`;
      }
    } else if (activeTab === "usersView") {
      if (term) {
        usersView.classList.add("hidden");
        usersSearch.classList.remove("hidden");
        usersSearch.innerHTML = "";
        fetchUsers(term);
      } else {
        if (!userAlreadyFetched) fetchUsers("");
        usersView.classList.remove("hidden");
        usersSearch.classList.add("hidden");
      }
    } else if (activeTab === "tagsView") {
      tagsView.innerHTML = "";
      fetchTags(term);
      skib = false;
    }
  }
});

function resetTweetSearch() {
  tweetSearchResults = [];
  renderedTweetCount = 0;
  tweetsView.innerHTML = "";
}

const TWEETS_PAGE = 10;
let lastTweetDoc = null;

async function searchTweets(term, reset = true) {
  const words = tokenize(term);
  if (words.length === 0) return [];

  const searchList = words.slice(0, 10);

  if (reset) lastTweetDoc = null;

  const base = [
    where("searchTokens", "array-contains-any", searchList),
    orderBy("createdAt", "desc"),
    limit(TWEETS_PAGE),
  ];

  const q = lastTweetDoc ?
    query(collection(db, "tweets"), ...base, startAfter(lastTweetDoc)) :
    query(collection(db, "tweets"), ...base);

  const snap = await getDocs(q);

  const mustHaveAll = true;
  const results = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    if (
      !mustHaveAll ||
      words.every(w => (d.searchTokens || []).includes(w))
    ) {
      results.push({
        id: docSnap.id,
        ...d
      });
    }
  });

  if (!snap.empty) {
    lastTweetDoc = snap.docs[snap.docs.length - 1];
  }
  return results;
}

const list = document.getElementById("userList");

let userLastVisibleDoc = null;
let userLoadedCount = 0;
const USER_PAGE_SIZE = 3;

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
    list.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynts — yet</h2><p style="color:grey;margin:7px 0;">when this user posts something, it will appear here.</p></div></div>`;
    return;
  } else {
    const startEl = document.getElementById("start");
    if (startEl) startEl.style.display = "none";
  }

  for (const docSnap of snap.docs) {
    if (uid === document.querySelector("#user-name").dataset.uid) {
      renderTweet(docSnap.data(), docSnap.id, userData, "append", list);
    }
  }

  userLoadedCount += snap.docs.length;

  if (snap.docs.length < USER_PAGE_SIZE) {
  } else {
    userLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}

async function fetchUsers(term = "") {
  let snap;

  if (!term) {
    userAlreadyFetched = true;
  }

  if (term) {
    usersSearch.innerHTML = `<div style="margin:0 -20px"><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div></div>`;
    const lowerTerm = term.toLowerCase();

    const usernameQuery = query(
      collection(db, "users"),
      where("username", ">=", lowerTerm),
      where("username", "<=", lowerTerm + "\uf8ff"),
      limit(10)
    );

    snap = await getDocs(usernameQuery);

    if (snap.empty) {
      const nameQuery = query(
        collection(db, "users"),
        where("name", ">=", lowerTerm),
        where("name", "<=", lowerTerm + "\uf8ff"),
        limit(10)
      );
      snap = await getDocs(nameQuery);
    }

  } else {
    const q = query(
      collection(db, "users"), 
      orderBy("name"), 
      limit(10)
    );

    snap = await getDocs(q);
  }

  if (snap.empty) {
    usersSearch.innerHTML = "";
    usersSearch.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:400px;text-align:left;">
          <h2 style="margin:0;">No Matched users — yet</h2>
          <p style="color:grey;margin:7px 0;">there's no person that you're looking for.</p>
        </div>
      </div>`;
    return;
  }

  for (const docSnap of snap.docs) {
    const data = docSnap.data();

    const item = document.createElement("div");
    item.className = "user-search-item";
    item.id = `user-${docSnap.id}`;
    item.style.cssText =
      "display:flex;gap:10px;padding:15px 0 10px 0;border-bottom:var(--border);align-items:center";

    item.innerHTML = `
      <div style="display:flex; gap:12px; width:100%">
        <img loading="lazy" src="${base91ToImageSrc(data.photoURL)}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px; height:40px; border-radius:10px; object-fit:cover; align-self:flex-start;">
        
        <div style="display:flex; flex-direction:column; gap:7px">
          <strong style="cursor:pointer;" class="user-link" data-uid="${docSnap.id}">
            ${escapeHTML(data.displayName)}
          </strong>
          <span style="font-size:14px; color:grey;">
            @${escapeHTML(data.username)}
          </span>
        </div>
        
        <button class="mini-follow-btn" style="padding:0 10px; border-radius:50px; background:white; height:26px; cursor:pointer; border:1px solid var(--border); margin-left:auto; opacity:0;">...</button>
      </div>
    `;

    item.addEventListener("click", (e) => {
      if (!e.target.classList.contains("mini-follow-btn")) {
        openUserSubProfile(docSnap.id);
      }
    });
    
    if (!term) {
      if (!usersView.querySelector(`#user-${docSnap.id}`)) {
        if (!usersView.querySelector(".user-search-item")) usersView.innerHTML = "";
        usersView.appendChild(item);
      } 
    } else {
      if (!usersSearch.querySelector(`#user-${docSnap.id}`)) {
        if (!usersSearch.querySelector(".user-search-item")) usersSearch.innerHTML = "";
        usersSearch.appendChild(item);
      }
    }
    const btn = item.querySelector(".mini-follow-btn");
    setupMiniFollowBtn(btn, docSnap.id);

    totalLoaded++;
  }
}

export async function fetchTags(term) {
  tagsView.innerHTML = `<div style="margin:0 -10px"><div class="skeleton-card" style="margin:20px 0"><div class="skeleton-header"><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card" style="margin:20px 0"><div class="skeleton-header"><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card" style="margin:20px 0"><div class="skeleton-header"><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div></div>`;

  const tagsRef = collection(db, "tags");

  if (!term || term.length < 1) {
    const q = query(tagsRef, 
      orderBy("tweetCount", "desc"), 
      limit(10)
    );
    const snap = await getDocs(q);

    for (const tagDoc of snap.docs) {
      const tagId = tagDoc.id;
      const count = tagDoc.data().tweetCount || 0;
      const data = tagDoc.data()

      const item = document.createElement("div");
      item.className = "tag-search-item";
      item.id = `tag-${tagId}`;
      item.innerHTML = `
        <div style="display:flex;align-items:center;padding:13px 0">
          <div style="width:100%">
            <div style="display:flex;align-items:center;">
              <h4 style="margin:0;font-size:18px;">${tagId}</h4>
              <p style="color:grey;margin:0;margin-left:auto;font-size:14px;">${formatDate(data.createdAt)}</p>
            </div>
            <span style="color:grey;font-size:14px">used on ${count} Wynts</span>
          </div>
        </div>
`;
      item.style.cssText = "border-bottom:var(--border);cursor:pointer;";
      item.onclick = () => openTag(tagId);

      if (!tagsView.querySelector(`tag-${tagId}`)) {
        if (!tagsView.querySelector(".tag-search-item")) tagsView.innerHTML = "";
        tagsView.appendChild(item);
      }
    }
    return;
  }

  const termLower = term.toLowerCase();

  const q = query(
    tagsRef,
    where("name", ">=", termLower),
    where("name", "<=", termLower + "\uf8ff"),
    limit(10)
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    tagsView.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No tags matched — yet</h2><p style="color:grey;margin:7px 0;">there's no tag that you're looking for.</p></div></div>`;
    return;
  }

  for (const tagDoc of snap.docs) {
    const tagId = tagDoc.id;
    const count = tagDoc.data().tweetCount || 0;
    const data = tagDoc.data();

    const item = document.createElement("div");
    item.className = "tag-search-item";
    item.id = `tagi-${tagId}`;
    item.innerHTML = `
        <div style="display:flex;align-items:center;padding:10px 0">
          <div style="width:100%;">
            <div style="display:flex;align-items:center;">
              <h4 style="margin:0;font-size:18px;">${tagId}</h4>
              <p style="color:grey;margin:0;margin-left:auto;font-size:14px;">${formatDate(data.createdAt)}</p>
            </div>
            <span style="color:grey;font-size:14px">used on ${count} Wynts</span>
          </div>
        </div>
    `;
    item.style.cssText = "border-bottom:var(--border);cursor:pointer;";
    item.onclick = () => openTag(tagId);
    if (!tagsView.querySelector(`tagi-${tagId}`)) {
      if (!tagsView.querySelector(".tag-search-item")) tagsView.innerHTML = "";
      tagsView.appendChild(item);
    }
  }
}

function escapeHTML(str) {
  return str?.replace(/[&<>]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
  } [c])) || "";
}

async function getIfUserfollows(uid) { 
  const theyFollowMeRef = doc(db, "users", uid, "following", auth.currentUser.uid);
  const theyFollowMeSnap = await getDoc(theyFollowMeRef);
  const followsBadge = document.getElementById("followsBadge");
  
  if (theyFollowMeSnap.exists()) {
    followsBadge.style.display = "inline";
  }
}

function softblank() {
  document.getElementById("username").textContent = "username"
  document.getElementById("user-description").textContent = "loading description...";
  document.getElementById("user-name").textContent = "user";
  document.getElementById("user-status").textContent = "i'm cold";
  document.getElementById("posts").textContent = "0";
  document.getElementById("followers").textContent = "0";
  document.getElementById("comCount").textContent = "0";
  document.getElementById("following").textContent = "0";
  document.getElementById("followsBadge").style.display = "none";
  document.getElementById("followBtn").style.display = "none";
  document.getElementById("user-pfp").style.background = "#16181c";
  document.getElementById("user-banner").style.background = "#16181c";
  document.getElementById("user-creation").textContent = "loading date";

  const userEffectEl = document.querySelector("#profile-effect");
  if (userEffectEl) {
    userEffectEl.style.setProperty("--user-effect-bg", "none");
    userEffectEl.style.setProperty("--user-effect-opacity", "0");
  }

  list.innerHTML = "";
  usermentionedList.innerHTML = "";
  highlightedList.innerHTML = "";
}

function blank() {
  document.getElementById("username").style.display = "none";
  document.getElementById("user-description").textContent = "";
  document.querySelectorAll(".status")[1].style.display = "none";
  document.getElementById("posts").textContent = "0";
  document.getElementById("followers").textContent = "0";
  document.getElementById("comCount").textContent = "0";
  document.getElementById("following").textContent = "0";
  document.getElementById("followsBadge").style.display = "none";
  document.getElementById("followBtn").style.display = "none";
  document.getElementById("user-creation").textContent = "";
  document.getElementById("ing").style.pointerEvents = "none";
  document.getElementById("ers").style.pointerEvents = "none";
  document.getElementById("user-pfp").style.background = "#16181c";
  document.getElementById("user-banner").style.background = "#16181c";
  document.getElementById("sujdiqu").style.display = "none";

  const userEffectEl = document.querySelector("#profile-effect");
  if (userEffectEl) {
    userEffectEl.style.setProperty("--user-effect-bg", "none");
    userEffectEl.style.setProperty("--user-effect-opacity", "0");
  }

  list.classList.add("hidden");
  usermentionedList.classList.add("hidden");
  highlightedList.classList.add("hidden");
}

async function isBanned(uid) {
  const bannedRef = doc(db, "banned", uid);
  const bannedSnap = await getDoc(bannedRef);
  if (bannedSnap.exists()) {
    document.getElementById("user-name").textContent = "user is suspended";
    blank();
    return;
  }
}

async function incrementUserVisits(uid) {
  if (uid === auth.currentUser.uid) return;

  const viewRef = doc(db, "users", uid, "views", auth.currentUser.uid);
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(viewRef, {
      viewedAt: new Date()
    });
    updateDoc(userRef, {
      visitedCount: increment(1)
    });
  }
}

export async function openUserSubProfile(uid) {
  softblank();
  window.cannotSeeFollows = false;
  tweetviewactive1();

  document.getElementById("comRule").style.display = "none";

  const followBtn = document.getElementById("followBtn");

  followBtn.style.cssText = `margin-right:-13px;background:none;margin-bottom:-10px;`;
  followBtn.innerHTML = `<img loading='lazy' height="30" src="/image/loader.svg">`;

  userLoadedCount = 0;
  userLastVisibleDoc = null;

  mentionedLoadedCount = 0;
  mentionedLastVisibleDoc = null;

  highlightedLoadedCount = 0;
  highlightedLastVisibleDoc = null;

  const docSnap = await getDoc(doc(db, "users", uid));
  if (!docSnap.exists()) {
    document.getElementById("user-name").textContent = "user not found";
    blank();
    return;
  }

  list.classList.remove("hidden");
  usermentionedList.classList.remove("hidden");
  highlightedList.classList.remove("hidden");

  document.getElementById("banBtn").classList.add("hidden");

  document.getElementById("user-name").dataset.uid = uid;
  document.getElementById("copyUserLinkBtn").dataset.uid = uid;
  document.getElementById("copyUserIdBtn").dataset.uid = uid;
  document.getElementById("banBtn").dataset.uid = uid;
  document.getElementById("reportUser").dataset.uid = uid;
  document.querySelectorAll(".status")[1].style.display = "inline";  
  document.getElementById("username").style.display = "inline";
  document.getElementById("ing").style.pointerEvents = "auto";
  document.getElementById("ers").style.pointerEvents = "auto";

  userOverlay.classList.add("hidden");
  userSubOverlay.classList.remove("hidden");

  incrementUserVisits(uid);

  const d = docSnap.data();

  if (d.suspended && d.suspendedUntil > Timestamp.now()) {
    document.getElementById("user-suspended").classList.remove("hidden");
    if (currentUserRole === "admin") { 
      document.getElementById("suspended-for1").textContent = `for: ${d.suspendedFor || "no reason specified"}`;
    }
  } else {
    document.getElementById("user-suspended").classList.add("hidden");
  }

  const banBtn = document.getElementById("banBtn");
  const suspendBtn = document.getElementById("suspendBtn");
  const currentUserId = auth.currentUser.uid;

  const followsBadge = document.getElementById("followsBadge");
  if (followsBadge) followsBadge.style.display = "none";

  if (uid !== currentUserId) {
    getIfUserfollows(uid);
  }

  if (uid === currentUserId) {
    followBtn.classList.add("hidden");
    banBtn.classList.add("hidden");
    suspendBtn.classList.add("hidden");
  } else {
    followBtn.classList.remove("hidden");

    const currentUserSnap = await getDoc(doc(db, "users", currentUserId));
    window.currentUserRole = currentUserSnap.data()?.role;

    const targetRole = d.role || "user";

    if (window.currentUserRole === "admin" && targetRole !== "admin") {
      banBtn.classList.remove("hidden");
      suspendBtn.classList.remove("hidden");

      const bannedRef = doc(db, "banned", uid);
      const bannedSnap = await getDoc(bannedRef);

      if (d.suspended && d.suspendedUntil > Timestamp.now()) {
        suspendBtn.innerHTML = `<img loading='lazy' src="/image/ban.svg"> Un-suspend this user`;
      } else {
        suspendBtn.innerHTML = `<img loading='lazy' src="/image/ban.svg"> Suspend this user`;
      }

      if (bannedSnap.exists()) {
        banBtn.innerHTML = `<img loading='lazy' src="/image/ban.svg"> Unban this user`;
      } else {
        banBtn.innerHTML = `<img loading='lazy' src="/image/ban.svg"> Ban this user`;
      }

      banBtn.onclick = async () => {
        document.getElementById("userMenuOverlay").classList.add("hidden");
        const bannedRef = doc(db, "banned", uid);
        const bannedSnap = await getDoc(bannedRef);
        const deleteReasonSubmit = document.getElementById("deleteReasonSubmit");
        const overlay = document.getElementById("deleteReasonOverlay");
        const reasonInput = document.getElementById("deleteReasonInput");

        if (bannedSnap.exists()) {
          overlay.classList.remove("hidden");
          document.body.classList.add("no-scroll");

          document.getElementById("deleteReasonCancel").onclick = () => {
            overlay.classList.add("hidden");
            document.body.classList.remove("no-scroll");
            reasonInput.value = "";
          };

          deleteReasonSubmit.onclick = async () => {
            const reason = reasonInput.value.trim();
            if (!reason) return log("red", "Please provide a reason");

            deleteReasonSubmit.disabled = true;
            deleteReasonSubmit.classList.add("disabled");

            const previousReason = bannedSnap.data().reason || "No reason provided";

            const userRef = doc(db, "users", uid);

            await runTransaction(db, async (tx) => {
              tx.update(userRef, {
                banned: false
              });
              tx.delete(bannedRef);
            });

            await openUserSubProfile(uid);

            let screenshotBase64 = null;
            const profileEl = document.querySelector("#userSubOverlay .user-box");
            if (profileEl) {
              try {
                const canvas = await html2canvas(profileEl, {
                  backgroundColor: null
                });
                screenshotBase64 = canvas.toDataURL("image/png");
              } catch (err) {
                console.error("Unban screenshot failed:", err);
              }
            }

            const { realusername: unbannedName } = await getUserData(uid);
            const { username: adminName } = await getUserData(auth.currentUser.uid);

            const susRef = doc(db, "susList", uid);

            const susSnap = await getDoc(susRef);
            const currentWarnings = susSnap.exists() ? susSnap.data().warnings || 0 : 0;

            const embed = {
              title: "User Unbanned",
              color: 4529510,
              fields: [
                { name: "User", value: unbannedName },
                { name: "Unbanned By", value: adminName },
                { name: "Reason", value: reason },
                { name: "Previous Ban Reason", value: previousReason },
                { name: "Redirect Link", value: `https://wyntr.netlify.app/user/${uid}` },
                { name: "user warnings", value: currentWarnings.toString() },
                { name: "unbanned at", value: formatUTC8() },
              ],
              timestamp: new Date(),
            };

            if (screenshotBase64) embed.image = {
              url: "attachment://screenshot.png"
            };

            await sendToDiscord(null, {
              embeds: [embed]
            }, screenshotBase64);

            banBtn.innerHTML = `<img loading='lazy' src="/image/ban.svg"> Ban this user`;
            document.getElementById("userMenuOverlay").classList.add("hidden");
            overlay.classList.add("hidden");
            document.body.classList.remove("no-scroll");
            reasonInput.value = "";
            deleteReasonSubmit.classList.remove("disabled");
            deleteReasonSubmit.disabled = false;
          };
          return;
        }

        overlay.classList.remove("hidden");
        document.body.classList.add("no-scroll");

        document.getElementById("deleteReasonCancel").onclick = () => {
          overlay.classList.add("hidden");
          document.body.classList.remove("no-scroll");
          reasonInput.value = "";
        };

        deleteReasonSubmit.onclick = async () => {
          const reason = reasonInput.value.trim();
          if (!reason) return log("red", "Please provide a reason");

          deleteReasonSubmit.disabled = true;
          deleteReasonSubmit.classList.add("disabled");

          let screenshotBase64 = null;
          const profileEl = document.querySelector("#userSubOverlay .user-box");
          if (profileEl) {
            try {
              const canvas = await html2canvas(profileEl, {
                backgroundColor: null
              });
              screenshotBase64 = canvas.toDataURL("image/png");
            } catch (err) {
              console.error("Ban screenshot failed:", err);
            }
          }

          const userRef = doc(db, "users", uid);
          await runTransaction(db, async (tx) => {
            tx.update(userRef, {
              banned: true,
              bannedFor: reason
            });
            tx.set(bannedRef, {
              bannedAt: serverTimestamp(),
              reason,
            });
          });

          openUserSubProfile(uid);

          const { username: bannedName } = await getUserData(uid);
          const { username: adminName } = await getUserData(auth.currentUser.uid);

          const susRef = doc(db, "susList", uid);
          const susSnap = await getDoc(susRef);
          const currentWarnings = susSnap.exists() ? susSnap.data().warnings || 0 : 0;

          const embed = {
            title: "User Banned",
            color: 16711680,
            fields: [
              { name: "User", value: bannedName },
              { name: "Banned By", value: adminName }, 
              { name: "Reason", value: reason },
              { name: "Redirect Link", value: `https://wyntr.netlify.app/user/${uid}` },
              { name: "user warnings", value: currentWarnings },
              { name: "banned at", value: formatUTC8() },
            ],
            timestamp: new Date(),
          };

          if (screenshotBase64) embed.image = {
            url: "attachment://screenshot.png"
          };

          await sendToDiscord(null, {
            embeds: [embed]
          }, screenshotBase64);

          banBtn.innerHTML = `<img loading='lazy' src="/image/ban.svg"> Unban this user`;
          document.getElementById("userMenuOverlay").classList.add("hidden");
          overlay.classList.add("hidden");
          document.body.classList.remove("no-scroll");
          reasonInput.value = "";
          deleteReasonSubmit.classList.remove("disabled");
          deleteReasonSubmit.disabled = false;
        };
      };

      suspendBtn.onclick = async () => {
        document.getElementById("userMenuOverlay").classList.add("hidden");
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const deleteReasonSubmit = document.getElementById("deleteReasonSubmit");
        const overlay = document.getElementById("deleteReasonOverlay");
        const reasonInput = document.getElementById("deleteReasonInput");

        if (userData.suspended === true && userData.suspendedUntil > Timestamp.now()) {
          overlay.classList.remove("hidden");
          document.body.classList.add("no-scroll");

          document.getElementById("deleteReasonCancel").onclick = () => {
            overlay.classList.add("hidden");
            document.body.classList.remove("no-scroll");
            reasonInput.value = "";
          };

          deleteReasonSubmit.onclick = async () => {
            const reason = reasonInput.value.trim();
            if (!reason) return log("red", "Please provide a reason");

            deleteReasonSubmit.disabled = true;
            deleteReasonSubmit.classList.add("disabled");

            const previousReason = userData.suspendedFor || "No reason provided";

            await runTransaction(db, async (tx) => {
              tx.update(userRef, {
                suspended: false
              });
            });

            await openUserSubProfile(uid);

            let screenshotBase64 = null;
            const profileEl = document.querySelector("#userSubOverlay .user-box");
            if (profileEl) {
              try {
                const canvas = await html2canvas(profileEl, {
                  backgroundColor: null
                });
                screenshotBase64 = canvas.toDataURL("image/png");
              } catch (err) {
                console.error("Unban screenshot failed:", err);
              }
            }

            const { realusername: unbannedName } = await getUserData(uid);
            const { username: adminName } = await getUserData(auth.currentUser.uid);

            const susRef = doc(db, "susList", uid);

            const susSnap = await getDoc(susRef);
            const currentWarnings = susSnap.exists() ? susSnap.data().warnings || 0 : 0;

            const embed = {
              title: "User Un-suspended",
              color: 4529510,
              fields: [
                { name: "User", value: unbannedName },
                { name: "un-suspended By", value: adminName },
                { name: "Reason", value: reason },
                { name: "Previous suspended Reason", value: previousReason },
                { name: "Redirect Link", value: `https://wyntr.netlify.app/user/${uid}` },
                { name: "user warnings", value: currentWarnings.toString() },
                { name: "un-suspended at", value: formatUTC8() },
              ],
              timestamp: new Date(),
            };

            if (screenshotBase64) embed.image = {
              url: "attachment://screenshot.png"
            };

            await sendToDiscord(null, {
              embeds: [embed]
            }, screenshotBase64);

            banBtn.innerHTML = `<img loading='lazy' src="/image/ban.svg"> Ban this user`;
            document.getElementById("userMenuOverlay").classList.add("hidden");
            overlay.classList.add("hidden");
            document.body.classList.remove("no-scroll");
            reasonInput.value = "";
            deleteReasonSubmit.classList.remove("disabled");
            deleteReasonSubmit.disabled = false;
          };
          return;
        }

        overlay.classList.remove("hidden");
        document.body.classList.add("no-scroll");

        document.getElementById("deleteReasonCancel").onclick = () => {
          overlay.classList.add("hidden");
          document.body.classList.remove("no-scroll");
          reasonInput.value = "";
        };

        deleteReasonSubmit.onclick = async () => {
          const reason = reasonInput.value.trim();
          if (!reason) return log("red", "Please provide a reason");

          document.getElementById("suspendOptions").classList.remove("hidden");
          console.log("SKIBIDI YANTO");
          const confirmSuspend = document.getElementById("confirmSuspend");
          
          confirmSuspend.onclick = async() => {
            confirmSuspend.classList.add("disabled");
            confirmSuspend.disabled = true;

            let screenshotBase64 = null;
            const profileEl = document.querySelector("#userSubOverlay .user-box");
            if (profileEl) {
              try {
                const canvas = await html2canvas(profileEl, {
                  backgroundColor: null
                });
                screenshotBase64 = canvas.toDataURL("image/png");
              } catch (err) {
                console.error("Ban screenshot failed:", err);
              }
            }

            const duration = document.getElementById("suspendDuration").value;

            await runTransaction(db, async (tx) => {
              tx.update(userRef, {
                suspended: true,
                suspendedFor: reason,
                suspendedUntil: getSuspendedUntil(duration)
              });
            });

            openUserSubProfile(uid);

            const { username: bannedName } = await getUserData(uid);
            const { username: adminName } = await getUserData(auth.currentUser.uid);

            const susRef = doc(db, "susList", uid);
            const susSnap = await getDoc(susRef);
            const currentWarnings = susSnap.exists() ? susSnap.data().warnings || 0 : 0;

            const embed = {
              title: "User Suspended",
              color: 16711680,
              fields: [
                { name: "User", value: bannedName },
                { name: "suspended By", value: adminName }, 
                { name: "Reason", value: reason },
                { name: "Redirect Link", value: `https://wyntr.netlify.app/user/${uid}` },
                { name: "user warnings", value: currentWarnings },
                { name: "suspended at", value: formatUTC8() },
              ],
              timestamp: new Date(),
            };

            if (screenshotBase64) embed.image = {
              url: "attachment://screenshot.png"
            };

            await sendToDiscord(null, {
              embeds: [embed]
            }, screenshotBase64);

            banBtn.innerHTML = `<img loading='lazy' src="/image/ban.svg"> Unban this user`;
            confirmSuspend.classList.remove("disabled");
            confirmSuspend.disabled = false;
            document.getElementById("suspendOptions").classList.add("hidden");
          };
          document.getElementById("userMenuOverlay").classList.add("hidden");
          overlay.classList.add("hidden");
          reasonInput.value = "";
          deleteReasonSubmit.classList.remove("disabled");
          deleteReasonSubmit.disabled = false;
        };
      };
    }
  };

  const reportBtn = document.getElementById("reportUser");
  if (uid === currentUserId) {
    reportBtn.classList.add("hidden");
  } else {
    reportBtn.classList.remove("hidden");
    reportBtn.onclick = async () => {
      document.getElementById("userMenuOverlay").classList.add("hidden");
      const overlay = document.getElementById("deleteReasonOverlay");
      const reasonInput = document.getElementById("deleteReasonInput");

      overlay.classList.remove("hidden");
      document.body.classList.add("no-scroll");

      document.getElementById("deleteReasonCancel").onclick = () => {
        overlay.classList.add("hidden");
        document.body.classList.remove("no-scroll");
        reasonInput.value = "";
      };

      deleteReasonSubmit.onclick = async () => {
        const reason = reasonInput.value.trim();
        if (!reason) return log("red", "Please provide a reason");
        if (!reason.length < 20) return log("red", "add minimum 20 characters");

        deleteReasonSubmit.classList.add("disabled");
        deleteReasonSubmit.disabled = true;

        const { username, avatar } = await getUserData(uid);
        const { username: reporterName } = await getUserData(auth.currentUser.uid);

        const profileEl = document.querySelector("#userSubOverlay .user-box");
        let screenshotBase64 = null;

        if (profileEl) {
          try {
            const canvas = await html2canvas(profileEl, { backgroundColor: null });
            screenshotBase64 = canvas.toDataURL("image/png");
          } catch (err) {
            console.error("Profile screenshot failed:", err);
            deleteReasonSubmit.classList.remove("disabled");
            deleteReasonSubmit.disabled = false;
            }
          }

        const embed = {
          title: "User Report",
          color: 8421504,
          fields: [
            { name: "Reported", value: username },
            { name: "Reason", value: reason },
            { name: "Reporter", value: reporterName },
            { name: "Redirect Link", value: `https://wyntr.netlify.app/user/${uid}` },
          ],
          timestamp: new Date(),
        };

        if (screenshotBase64) {
          embed.image = { url: "attachment://screenshot.png" };
        }

        await reportToDiscord(null, { embeds: [embed] }, screenshotBase64);

        overlay.classList.add("hidden");
        document.body.classList.remove("no-scroll");
        reasonInput.value = "";
        deleteReasonSubmit.classList.remove("disabled");
        deleteReasonSubmit.disabled = false;
        document.getElementById("userMenuOverlay").classList.add("hidden");
      };
    };
  }

  document.getElementById("user-status").textContent = d.status || "i'm cold";
  document.getElementById("user-name").textContent = d.displayName || "Unnamed";
  document.getElementById("username").textContent = `@${d.username}` || "unnamed";
  document.getElementById("user-description").innerHTML = await parseMentionsToLinks(d.description || "wsg homie?", d.descriptionMentions || []);
  document.getElementById("user-pfp").style.background = `url(${base91ToImageSrc(d.photoURL) || "/image/default-avatar.png"}) no-repeat center /cover`;
  document.getElementById("user-banner").style.background = d.banner ?
    `url(${base91ToImageSrc(d.banner)}) center/cover` :
    `url("/image/default-banner.png") center/cover`;

  const userEffectEl = document.querySelector("#profile-effect");
  if (userEffectEl) {
    userEffectEl.style.setProperty("--user-effect-bg", "none");
    userEffectEl.style.setProperty("--user-effect-filter", "brightness(1)");
    userEffectEl.style.setProperty("--user-effect-opacity", "1");

    let background = "";

    switch (d.effect) {
      case "custom-001":
        background = "/image/effects/custom/phoebe.gif";
        break;
      default:
        background = "";
    }

    userEffectEl.style.setProperty("--user-effect-bg", background ? `url('${background}')` : "none");
    userEffectEl.style.setProperty("--user-effect-opacity", "0.5");
  }

  if (window.currentUserRole === "admin") {
    document.getElementById("sujdiqu").style.display = "flex";
    document.getElementById("user-balance").textContent = formatNumber(d.balance);
  }

  if (d.createdAt?.toDate) {
    const date = d.createdAt.toDate();
    const formatted = `${date.getDate()} ${date.toLocaleString("default", { month: "short" })} ${date.getFullYear()}`;
    document.getElementById("user-creation").textContent = `${formatted}`;
  }

  list.innerHTML = "";
  if (document.getElementById("pinnedyo")) document.getElementById("pinnedyo").remove();

  if (d.pinned) {
    renderPinned(d, uid);
  }

  loadTweets(uid);
  loadIfFollow(uid);
  isBanned(uid);

  document.getElementById("posts").textContent = d.posts || 0;
  document.getElementById("followers").textContent = d.followers || 0;
  document.getElementById("following").textContent = d.following || 0;
  document.getElementById("comCount").textContent = d.communitiesCount || 0;
}

async function loadIfFollow(uid) {
  const followBtn = document.getElementById("followBtn");
  const myFollowingRef = doc(db, "users", auth.currentUser.uid, "following", uid);
  const theirFollowersRef = doc(db, "users", uid, "followers", auth.currentUser.uid);

    followBtn.onclick = async () => {
      if (followBtn.disabled) return;

      followBtn.disabled = true;
      followBtn.classList.add("disabled");

      function reset() {
        followBtn.classList.remove("disabled");
        followBtn.disabled = false;
      }

      try {
        const currentlyFollowing = snap.exists();

        if (currentlyFollowing) {
          const ok = await confirmDialog("Unfollow this user?", "Are you sure you want to unfollow this user?");

          if (!ok) {
            reset();
            return;
          }

          const batch = writeBatch(db);

          batch.delete(myFollowingRef);
          batch.delete(theirFollowersRef);

          batch.update(doc(db, "users", auth.currentUser.uid), {
            following: increment(-1)
          });
          batch.update(doc(db, "users", uid), {
            followers: increment(-1)
          });

          await batch.commit();

          followBtn.style.cssText = `margin-right:-13px;background:none;margin-bottom:-10px;`;
          followBtn.innerHTML = `<img loading='lazy' height="30" src="/image/loader.svg">`;
          followBtn.classList.remove("disabled");
          followBtn.disabled = false;;

          log("green", `user unfollowed`);
          loading.classList.remove("show");
          await loadIfFollow(uid);
        } else {
          const { realdisplayName: tDisplayName, realusername: tUsername, realavatar: tPhotoURL } = await getUserData(uid);
          const { displayName, username, avatar: photoURL } = await getUserData(auth.currentUser.uid);

          await runTransaction(db, async (batch) => {
            const currentUserRef = doc(db, "users", auth.currentUser.uid);
            const targetUserRef = doc(db, "users", uid);

            const currentUserSnap = await batch.get(currentUserRef);
            const currentUserData = currentUserSnap.data();

            if (currentUserData.suspended === true && currentUserData.suspendedUntil > Timestamp.now()) {
              info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
              reset();
              return;
            }

            const targetUserSnap = await batch.get(targetUserRef);
            const targetUserData = targetUserSnap.data();

            if (targetUserData.suspended === true && targetUserData.suspendedUntil > Timestamp.now()) {
              info("x", "insufficient permission", "This user is temporarily suspended from using this platform. Please try again later");
              reset();
              return;
            }

            batch.set(doc(db, "users", uid, "followers", auth.currentUser.uid), {
              followedAt: serverTimestamp(),
              displayName:displayName,
              username: username,
              name: displayName?.toLowerCase(),
              photoURL: photoURL
            });

            batch.set(doc(db, "users", auth.currentUser.uid, "following", uid), {
              followedAt: serverTimestamp(),
              displayName: tDisplayName,
              username: tUsername,
              name: tDisplayName?.toLowerCase(),
              photoURL: tPhotoURL
            });

            batch.update(currentUserRef, {
              following: increment(1)
            });
            batch.update(targetUserRef, {
              followers: increment(1)
            });      

            sendFollowNotification(uid, username);
            log("green", `followed ${tDisplayName || "them"}`);
          });

          followBtn.style.cssText = `margin-right:-13px;background:none;margin-bottom:-10px;`;
          followBtn.innerHTML = `<img loading='lazy' height="30" src="/image/loader.svg">`;

          reset();
          await loadIfFollow(uid);
        }
      } catch (err) {
        console.error("Follow action failed:", err);
        log("red", "Something went wrong");
      }
    };

  const snap = await getDoc(myFollowingRef);
  followBtn.textContent = snap.exists() ? "Following" : "Follow";
  followBtn.style.cssText = snap.exists() ? "padding: 10px 32px; background:rgba(0,0,0,0.8);border:1px solid var(--color);color:var(--color);margin-right:10px;margin-bottom: -10px;" : "padding: 10px 32px;background:white;color:black;margin-right:10px;margin-bottom: -10px;border:1px solid black;";
}

async function renderPinned(d, uid) {
  const pinnedSnap = await getDoc(doc(db, "tweets", d.pinned));
  if (pinnedSnap.exists()) {
    const pinnedData = pinnedSnap.data();

    const userData = {
      ...d,
      uid
    };

    const pinnedLabel = document.createElement("div");
    pinnedLabel.id = "pinnedyo";
    pinnedLabel.innerHTML = `<div class="iq pinlabel userPinned-${d.pinned}" style="background:var(--color);margin-bottom:10px;margin-top:30px;width:fit-content;font-size:13px;">Pinned by Wynt author</div>`;
    if (!document.getElementById('pinnedyo')) {
      list.prepend(pinnedLabel);
    }
    if (uid === document.querySelector("#user-name").dataset.uid) {
      await renderTweet(pinnedData, d.pinned, userData, "prepend", list);
    }
  }
}

window.openUserSubProfile = openUserSubProfile;

window.openTag = async function (tagId) {
  const tweetList = document.getElementById("tagstweet");
  const scrollBox = document.querySelector("#tagSubOverlay .user-box");
  const tagOverlay = document.getElementById("tagSubOverlay");

  tagOverlay.classList.remove("hidden");
  tweetList.innerHTML = skeleton;
  tagName.textContent = tagId;

  const tagTweetsRef = collection(db, "tags", tagId, "tweets");

  const BATCH_SIZE = 5;
  let lastDoc = null;
  let isLoading = false;
  let reachedEnd = false;

  async function loadBatch() {
    if (isLoading || reachedEnd) return;
    isLoading = true;

    let q;

    if (lastDoc) {
      q = query(
        tagTweetsRef,
        orderBy("taggedAt", "desc"),
        startAfter(lastDoc),
        limit(BATCH_SIZE)
      );
    } else {
      q = query(
        tagTweetsRef,
        orderBy("taggedAt", "desc"),
        limit(BATCH_SIZE)
      );
    }

    const snap = await getDocs(q);

    if (snap.empty) {
      reachedEnd = true;
      isLoading = false;
      if (!tweetList.querySelector(".tweet")) {
        tweetList.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:70px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynts — yet</h2><p style="color:grey;margin:7px 0;">seems like nobody uses this tag. Invite people to use them.</p></div></div>`;
      }
      return;
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    for (const docSnap of snap.docs) {
      const tweetId = docSnap.id;

      const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
      if (tweetDoc.exists()) {
        if (!tweetList.querySelector(".tweet")) tweetList.innerHTML = "";
        renderTweet(tweetDoc.data(), tweetId, auth.currentUser, "append", tweetList);
      }
    }

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

const followOverlay = document.createElement("div");
followOverlay.id = "followOverlay";
followOverlay.className = "useroverlay hidden";
followOverlay.innerHTML = `
  <div class="user-box">
    <header style="margin:0 -20px;padding:0 20px;background:rgba(0, 0, 0, 0.9);backdrop-filter: blur(10px);border-bottom:var(--border)">
      <button onclick="document.getElementById('followOverlay').classList.add('hidden')" class="close-btn" style="position:absolute;top:13px;left:0;"><img src="/image/leftArrow.svg"></button>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:100%;padding:15px;display:flex;align-items:center;gap:10px;margin-right:-20px;">
          <input style="margin-left:10px;" type="text" placeholder="search anything">
        </div>
      </div>
    </header>
    <br>
    <div id="followList"></div>
    <br><br><br><br><br><br>
  </div>`;
document.body.appendChild(followOverlay);
window.followOverlay = followOverlay;

async function openFollowOverlay(type, userId, isMe) {
  const overlay = document.getElementById("followOverlay");
  const listEl = document.getElementById("followList");
  const input = overlay.querySelector("input");

  overlay.classList.remove("hidden");
  listEl.innerHTML = "";

  followList = [];
  followLastDoc = null;

  await loadFollowUsers(type, userId);

  let previousValue = "";

  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const value = input.value;

    if (!value) {
      listEl.innerHTML = "";
      followLastDoc = null;
      followList = [];
      isSearching = false;
      await loadFollowUsers(type, userId);
    }
    if (!value || value.trim().toLowerCase() === previousValue) return;

    previousValue = value.trim().toLowerCase();
    isSearching = true;
    await searchFollowUsers(previousValue);
  });

  async function searchFollowUsers(term) {
    followList = [];
    followLastDoc = null;

    if (window.cannotSeeFollows === true) {
      listEl.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:400px;text-align:left;">
            <h2 style="margin:0;">No permission</h2>
            <p style="color:grey;margin:7px 0;">This user chose to not show their followings publicly.</p>
          </div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = `
      <div style="margin:0 -20px"><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div></div>
    `;

    const q = query(
      collection(db, "users", userId, type),
      where("name", ">=", term),
      where("name", "<=", term + "\uf8ff"),
      orderBy("name"),
      limit(10)
    );

    const snap = await getDocs(q);

    if (snap.empty && !(listEl.querySelector(".user-search-item"))) {
      listEl.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;margin-top:30px;">
          <div style="max-width:400px;">
            <h2 style="margin:0;">No matched users</h2>
            <p style="color:grey;margin:7px 0;">There's no person you're looking for.</p>
          </div>
        </div>`;
      return;
    }

    if (!listEl.querySelector(".user-search-item")) {
      listEl.innerHTML = "";
    }

    for (const docSnap of snap.docs) {
      const data = docSnap.data();

      const item = document.createElement("div");
      item.className = "user-search-item";
      item.id = `itemm-${docSnap.id}`;
      item.style.cssText =
        "display:flex;gap:10px;padding:15px 0;border-bottom:var(--border);align-items:center";

      item.innerHTML = `
        <img src="${base91ToImageSrc(data.photoURL)}" loading="lazy"
             onerror="this.src='/image/default-avatar.jpg'"
             style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
        <div style="flex:1;">
          <strong class="user-link" data-uid="${docSnap.id}">
            ${escapeHTML(data.displayName)}
          </strong>
          <div style="color:grey;font-size:14px;margin-top:4px;">
            @${data.username}
          </div>
        </div>
        <button class="mini-follow-btn"
          style="padding:0 12px;border-radius:50px;border:1px solid var(--border);height:32px;opacity:0;">
          ...
        </button>
      `;

      if (!document.getElementById(`itemm-${docSnap.id}`)) {
        listEl.appendChild(item);
      }
      item.addEventListener("click", (e) => {
        if (!e.target.classList.contains("mini-follow-btn")) {
          document.getElementById("followOverlay").classList.add("hidden");
          openUserSubProfile(docSnap.id);
        }
      });
      const btn = item.querySelector(".mini-follow-btn");
      setupMiniFollowBtn(btn, docSnap.id);
    }
  }
}

async function loadFollowUsers(type, userId) {
  const ref = collection(db, "users", userId, type);

  if (!followLastDoc) {
    document.getElementById("followList").innerHTML = `
      <div style="margin:0 -20px"><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div></div>
    `;
  }

  if (type === "following" && !followLastDoc) {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    if (userData.cannotSeeFollows === true && userId != auth.currentUser.uid) {
      document.getElementById("followList").innerHTML = `
            <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
              <div style="max-width:400px;text-align:left;">
                <h2 style="margin:0;">No permission</h2>
                <p style="color:grey;margin:7px 0;">This user chose to not show their followings publicly.</p>
              </div>
            </div>
      `;
      window.cannotSeeFollows = true;
      return;
    }
  }

  window.cannotSeeFollows = false;
  window.type = type;
  window.userId = userId;

  const q = followLastDoc
    ? query(ref, orderBy("followedAt", "desc"), startAfter(followLastDoc), limit(FOLLOW_PAGE_SIZE))
    : query(ref, orderBy("followedAt", "desc"), limit(FOLLOW_PAGE_SIZE));

  const snap = await getDocs(q);
  if (snap.empty) return;

  followLastDoc = snap.docs[snap.docs.length - 1];

  if (!document.querySelector("#followList .user-search-item")) {
    document.getElementById("followList").innerHTML = "";
  }

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const theirId = data.uid ?? docSnap.id;

    if (followList.some(u => u.dataset?.uid === theirId)) continue;

    if (!document.getElementById("userSubOverlay").classList.contains("hidden")) {
      if (document.getElementById("user-name").dataset.uid != userId) return;
    } else {
      if (document.getElementById("my-name").dataset.uid != userId) return;
    }

    const item = await renderFollowUserItem(theirId, data);
    item.dataset.uid = theirId;
    item.id = `skibidi-${theirId}`;

    followList.push(item);
    if (!document.getElementById(`skibidi-${theirId}`)) {
      document.getElementById("followList").appendChild(item);
    }
  }
}

async function renderFollowUserItem(uid, data) {
  const item = document.createElement("div");
  item.className = "user-search-item";
  item.style.cssText = "display:flex;gap:10px;padding:10px 0;border-bottom:var(--border);align-items:center";

  item.innerHTML = `
    <div style="display:flex;gap:12px;flex:1;">
      <img loading='lazy' src="${base91ToImageSrc(data.photoURL)}" onerror="this.src='/image/default-avatar.jpg'"
          style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
      <div style="display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;">
          <strong class="user-link" data-uid="${uid}" style="cursor:pointer;">
            ${escapeHTML(data.displayName) || "data unavailable"}
          </strong>
        </div>
        <div style="margin-top:5px;">
          <span style="color:grey;font-size:14px;">@${data.username || `<span class=user-link>${uid}</span>`}</span>
        </div>
      </div>
      <button class="mini-follow-btn"
          style="padding:0 10px;border-radius:50px;background:white;height:26px;cursor:pointer;border:1px solid var(--border);margin-left:auto;height:35px;opacity:0;">...</button>
    </div>
  `;
  item.addEventListener("click", (e) => {
    if (!e.target.classList.contains("mini-follow-btn")) {
      openUserSubProfile(uid);
      document.getElementById("followOverlay").classList.add("hidden");
    }
  });
  const btn = item.querySelector(".mini-follow-btn");
  setupMiniFollowBtn(btn, uid);

  return item;
}

const followListContainer = document.querySelector("#followOverlay .user-box");

let isLoading = false;

followListContainer.addEventListener("scroll", async () => {
  if (isLoading) return;
  if (isSearching) return;

  const scrollBottom =
    followListContainer.scrollTop + followListContainer.clientHeight;
  const scrollHeight = followListContainer.scrollHeight;

  if (scrollBottom >= scrollHeight - 100) {
    isLoading = true;
    await loadFollowUsers(window.type, window.userId);
    isLoading = false;
  }
});

async function setupMiniFollowBtn(btn, targetId) {
  if (auth.currentUser?.uid !== targetId) {
    const currentUid = auth.currentUser.uid;
    const myFollowingRef = doc(db, "users", currentUid, "following", targetId);
    const theirFollowersRef = doc(db, "users", targetId, "followers", currentUid);

    const isFollowingSnap = await getDoc(myFollowingRef);
    btn.textContent = isFollowingSnap.exists() ? "UnFoll" : "Follow";
    btn.style.cssText = isFollowingSnap.exists() ? "background:none;padding:9px;border:1px solid grey;color:grey;margin-left:auto;height:35px;" : "padding:10px;background:white;color:black;margin-left:auto;height:35px;";
    btn.style.opacity = "1";

    btn.onclick = async (e) => {
      e.stopPropagation();
      if (btn.disabled) return;

      btn.disabled = true;
      btn.classList.add("disabled");

      function reset() {
        btn.classList.remove("disabled");
        btn.disabled = false;
      }

      try {
        const isNowFollowing = isFollowingSnap.exists();

        if (isNowFollowing) {
          const ok = await confirmDialog("Unfollow this user?", "Are you sure you want to unfollow this user?");
          if (!ok) return;

          const batch = writeBatch(db);

          batch.delete(myFollowingRef);
          batch.delete(theirFollowersRef);

          batch.update(doc(db, "users", currentUid), {
            following: increment(-1)
          });
          batch.update(doc(db, "users", targetId), {
            followers: increment(-1)
          });

          await batch.commit();

          btn.textContent = "Follow";
          btn.style.cssText = "background:white;color:black;margin-left:auto;padding:10px;height:35px;";

          log("green", `user unfollowed`);
          loading.classList.remove("show");
          setupMiniFollowBtn(btn, targetId);
        } else {
          const { realdisplayName: tDisplayName, realusername: tUsername, realavatar: tPhotoURL } = await getUserData(targetId);
          const { displayName, username, avatar: photoURL } = await getUserData(auth.currentUser.uid);

          await runTransaction(db, async (batch) => {
            const currentUserRef = doc(db, "users", auth.currentUser.uid);
            const targetUserRef = doc(db, "users", targetId);

            const currentUserSnap = await batch.get(currentUserRef);
            const currentUserData = currentUserSnap.data();

            if (currentUserData.suspended === true && currentUserData.suspendedUntil > Timestamp.now()) {
              info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
              reset();
              return;
            }

            const targetUserSnap = await batch.get(targetUserRef);
            const targetUserData = targetUserSnap.data();

            if (targetUserData.suspended === true && targetUserData.suspendedUntil > Timestamp.now()) {
              info("x", "insufficient permission", "This user is temporarily suspended from using this platform. Please try again later");
              reset();
              return;
            }

            batch.set(doc(db, "users", targetId, "followers", auth.currentUser.uid), {
              followedAt: serverTimestamp(),
              displayName: displayName,
              username: username,
              name: displayName?.toLowerCase(),
              photoURL: photoURL
            });

            batch.set(doc(db, "users", auth.currentUser.uid, "following", targetId), {
              followedAt: serverTimestamp(),
              displayName: tDisplayName,
              username: tUsername,
              name: tDisplayName?.toLowerCase(),
              photoURL: tPhotoURL
            });

            batch.update(currentUserRef, {
              following: increment(1)
            });
            batch.update(targetUserRef, {
              followers: increment(1)
            }); 

            log("green", `followed ${tDisplayName || "them"}`);
            sendFollowNotification(targetId, username);
          });

          btn.textContent = "UnFoll";
          btn.style.cssText =
            "background:none;border:1px solid grey;color:grey;margin-left:auto;padding:9px;height:35px;";
        
          setupMiniFollowBtn(btn, targetId);
        }
      } catch (err) {
        console.error("Follow toggle failed:", err);
        log("red", "Something went wrong");
      } finally {
        reset();
      }
    };
  } else {
    btn.style.display = "none";
  }
}

document.getElementById("my-ers").onclick = () => openFollowOverlay("followers", auth.currentUser.uid, true);
document.getElementById("my-ing").onclick = () => openFollowOverlay("following", auth.currentUser.uid, true);
document.getElementById("ers").onclick = () => {
  window.lastViewedUserId = document.getElementById("user-name").dataset.uid;
  openFollowOverlay("followers", window.lastViewedUserId, false);
};
document.getElementById("ing").onclick = () => {
  window.lastViewedUserId = document.getElementById("user-name").dataset.uid;
  openFollowOverlay("following", window.lastViewedUserId, false);
};

document.querySelectorAll(".tab3").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab3").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    document.getElementById("userList").style.display = "none";
    document.getElementById("usermentionedList").style.display = "none";
    document.getElementById("userHighlights").style.display = "none";

    const targetId = tab.dataset.target;
    document.getElementById(targetId).style.display = "block";

    const uid = document.getElementById("user-name").dataset.uid;

    if (targetId === "userList") {
      loadTweets(uid);
    } else if (targetId === "usermentionedList") {
      loadUserMentionedTweets(uid);
    } else if (targetId === "userHighlights") {
      loadHighlights(uid);
    }
  });
});

let mentionedLastVisibleDoc = null;
let mentionedLoadedCount = 0;
const usermentionedList = document.getElementById("usermentionedList");
const MENTIONED_PAGE_SIZE = 3;

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

    if (uid === document.querySelector("#user-name").dataset.uid) {
      await renderTweet(tweetData, tweetId, userData, "append", usermentionedList);
    }
  }

  mentionedLoadedCount += snap.docs.length;

  if (snap.docs.length >= MENTIONED_PAGE_SIZE) {
    mentionedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}

let highlightedLastVisibleDoc = null;
let highlightedLoadedCount = 0;
const highlightedList = document.getElementById("userHighlights");
const HIGHLIGHTED_PAGE_SIZE = 3;

async function loadHighlights(uid) {
  const highlightedRef = collection(db, "users", uid, "highlights");
  let q;

  if (!highlightedLastVisibleDoc) {
    q = query(highlightedRef, orderBy("highlightedAt", "desc"), limit(HIGHLIGHTED_PAGE_SIZE));
  } else {
    q = query(highlightedRef, orderBy("highlightedAt", "desc"), startAfter(highlightedLastVisibleDoc), limit(HIGHLIGHTED_PAGE_SIZE));
  }

  const snap = await getDocs(q);

  if (snap.empty && highlightedLoadedCount === 0) {
    highlightedList.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No highlights — yet</h2><p style="color:grey;margin:7px 0;">seems like this user hasn't bought premium yet. Donate wcoins to help them.</p></div></div>`;
    return;
  }

  if (snap.docs.length >= HIGHLIGHTED_PAGE_SIZE) {
    highlightedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }

  for (const highlightDoc of snap.docs) {
    const tweetId = highlightDoc.id;
    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
    if (!tweetDoc.exists()) continue;

    const tweetData = tweetDoc.data();
    const userDoc = await getDoc(doc(db, "users", uid));
    const userData = {
      ...userDoc.data(),
      uid
    };

    if (uid === document.querySelector("#user-name").dataset.uid) {
      await renderTweet(tweetData, tweetId, userData, "append", highlightedList);
    }
  }

  highlightedLoadedCount += snap.docs.length;

  if (snap.docs.length >= HIGHLIGHTED_PAGE_SIZE) {
    highlightedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}

document.body.addEventListener("click", e => {
  const copyBtn = e.target.closest(".copy-uid-btn");
  if (copyBtn) {
    document.getElementById("userMenuOverlay").classList.add("hidden");
    document.getElementById("profileMenuOverlay").classList.add("hidden");
    const uid = copyBtn.dataset.uid;

    navigator.clipboard.writeText(uid)
      .then(() => {
        log("green", "user ID copied");
      })
      .catch(() => {
        info("i", "Copy this ID", uid);
      });
  }
});

document.body.addEventListener("click", e => {
  const copyBtn = e.target.closest(".copy-link-btn");
  if (copyBtn) {
    document.getElementById("userMenuOverlay").classList.add("hidden");
    document.getElementById("profileMenuOverlay").classList.add("hidden");

    const uid = copyBtn.dataset.uid;
    const link = `${window.location.origin}/user/${uid}`;

    navigator.clipboard.writeText(link)
      .then(() => {
        log("green", "user link copied");
      })
      .catch(() => {
        info("i", "Copy this link", link);
      });
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  const userMatch = path.match(/^\/user\/([^/]+)$/);
  if (userMatch) {
    const uid = userMatch[1];
    openUserSubProfile(uid);
    searchsvg.classList.add('hidden');
    searchfilled.classList.remove('hidden');
    homefilled.classList.add('hidden');
    homesvg.classList.remove('hidden');
  }
});

const profileScrollBox = document.querySelector("#userSubOverlay .user-box");

let tweetLoading = false;
let mentionLoading = false;
let highlightLoading = false;

profileScrollBox.addEventListener("scroll", async () => {
  const nearBottom =
    profileScrollBox.scrollTop + profileScrollBox.clientHeight >=
    profileScrollBox.scrollHeight - 150;

  if (!nearBottom) return;

  const activeTab = document.querySelector(".tab3.active")?.dataset.target;
  const uid = document.getElementById("user-name").dataset.uid;

  if (activeTab === "userList") {
    if (tweetLoading) return;
    tweetLoading = true;
    await loadTweets(uid);
    tweetLoading = false;
  }
  
  if (activeTab === "usermentionedList") {
    if (mentionLoading) return;
    mentionLoading = true;
    await loadUserMentionedTweets(uid);
    mentionLoading = false;
  }

  if (activeTab === "userHighlights") {
    if (highlightLoading) return;
    highlightLoading = true;
    await loadHighlights(uid);
    highlightLoading = false;
  }
});

document.addEventListener("contextmenu", (e) => {
  const btn = e.target.closest(".user-link");
  if (!btn) return;

  const uid = btn.dataset.uid;
  if (!uid) return;

  e.preventDefault(); 

  const url = `https://wyntr.netlify.app/user/${uid}`;
  window.open(url, "_blank", "noopener");
});
