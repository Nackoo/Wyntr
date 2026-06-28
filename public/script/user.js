import { db, collection, query, writeBatch, where, getDocs, orderBy, limit, auth, getDoc, doc, startAfter, increment, serverTimestamp, runTransaction, Timestamp, updateDoc } from "./firebase.js";
import { renderTweet, getUserData, loadComments, currentUserRole, waitForAuth } from './index.js';
import { sendFollowNotification } from "./notification.js";
import { homesvg, homefilled, searchsvg, searchfilled, tweetviewactive1 } from "./nonsense.js";
import { tokenize, parseMentionsToLinks, formatNumber, info, log, confirmDialog, formatUTC8 } from "./texts.js";
import { sendToDiscord, reportToDiscord } from "./discord.js";
import { renderCommentViewer } from "./commentViewer.js";
import { renderTweetViewer } from "./tweetViewer.js";
import { openCommunity } from "./community.js"; 
import { base91ToImageSrc } from "./attachments.js";
import { loadFolderTweets } from "./highlight.js";

await waitForAuth();

const noaccess = `
  <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
    <div style="max-width:400px;text-align:left;">
      <h2 style="margin:0;">No permission</h2>
      <p style="color:grey;margin:7px 0;">This user chose to not show this list publicly.</p>
    </div>
  </div>
`;

const loading            = document.getElementById("loadingOverlay");
const searchBtn          = document.querySelector('.smallbar img[src="/image/search.svg"]');
const userOverlay        = document.getElementById("userOverlay");
const userSubOverlay     = document.getElementById("userSubOverlay");
const searchInput        = userOverlay.querySelector("input[type='text']");
const usersView          = document.getElementById("usersView");
const tweetsView         = document.getElementById("tweetsView");
const tagName            = document.getElementById("tagId");
const deleteReasonSubmit = document.getElementById("deleteReasonSubmit");

const displayUsers       = document.getElementById("displayUsers");
const displayTweets      = document.getElementById("displayTweets");
const displayskeletons   = document.getElementById("displaySkeletons");
const searchbar          = document.getElementById("userSearchBar");

let hasLoaded            = false;
let aa                   = false;
let bb                   = false;

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

searchsvg.addEventListener("click", async () =>  {
  if (hasLoaded) return;
  displayskeletons.innerHTML = skeleton;
      
  const [a, b] = await Promise.all([
    fetchUsers(null),
    searchTweets("")
  ]);
  b.forEach(t => renderTweet(t, t.id, auth.currentUser, "append", displayTweets));

  displayskeletons.innerHTML = "";
  hasLoaded = true;
})

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
      if (term == "" && hasLoaded) return;

      hasLoaded = false;
      displayskeletons.innerHTML = skeleton;
      
      const [a, b] = await Promise.all([
        fetchUsers(term),
        searchTweets(term)
      ])
      b.forEach(t => renderTweet(t, t.id, auth.currentUser, "append", displayTweets));
      displayskeletons.innerHTML = "";

      if (term == "") hasLoaded = true;

      if (b.length === 0 && !a) {
        displayskeletons.innerHTML = `
              <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:60px;">
                <div style="max-width:400px;text-align:left;">
                  <h2 style="margin:0;">No results</h2>
                  <p style="color:grey;margin:7px 0;">Try again with a different keywords.</p>
                </div>
              </div>
        `;
      }
    }
  }
});

let loadingMoreTweets = false;

document.querySelector("#userOverlay .user-box").addEventListener("scroll", async function () {
  const term = searchInput.value.trim();

  if (!term || loadingMoreTweets) return;

  const nearBottom =
    this.scrollTop + this.clientHeight >= this.scrollHeight - 50;

  if (!nearBottom) return;

  loadingMoreTweets = true;

  try {
    const tweets = await searchTweets(term, true);
    tweets.forEach(t => renderTweet(t, t.id, auth.currentUser, "append", displayTweets));
  } finally {
    loadingMoreTweets = false;
  }
});

const TWEETS_PAGE = 10;
let lastTweetDoc = null;

async function searchTweets(term = "", loadmore = false) {
  if (!loadmore) displayTweets.innerHTML = "";

  if (term == "") {
    const q = query(collection(db, "tweets"), 
      orderBy("createdAt", "desc"),
      where("archived", "!=", true),
      limit(3)
    );
    const snap = await getDocs(q);

    let results = [];
    snap.forEach(docSnap => {
      const d = docSnap.data();
      results.push({
        id: docSnap.id,
        ...d
      })
    })
    return results;

  } else {
    const words = tokenize(term);
    if (words.length === 0) return [];

    const searchList = words.slice(0, 10);

    if (!loadmore) lastTweetDoc = null;

    const base = [
      where("searchTokens", "array-contains-any", searchList),
      where("archived", "!=", true),
      orderBy("createdAt", "desc"),
      limit(5),
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
}

const list = document.getElementById("userList");

let userLastVisibleDoc = null;
let userLoadedCount = 0;
const USER_PAGE_SIZE = 5;

async function loadTweets(uid, term = "") {
  if (!userLastVisibleDoc) {
    list.innerHTML = skeleton;
  }

  const tweetsRef = collection(db, "tweets");
  let constraints = [
    where("uid", "==", uid),
    where("archived", "!=", true),
    orderBy("createdAt", "desc")
  ];

  if (term !== "") {
    const words = tokenize(term);
    constraints.push(where("searchTokens", "array-contains-any", words.slice(0, 10)));
  }

  if (userLastVisibleDoc) {
    constraints.push(startAfter(userLastVisibleDoc));
  }
  constraints.push(limit(USER_PAGE_SIZE));

  const q = query(tweetsRef, ...constraints);
  const snap = await getDocs(q);

  if (snap.empty && userLoadedCount === 0) {
    list.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynts — yet</h2><p style="color:grey;margin:7px 0;">when this user posts something, it will appear here.</p></div></div>`;
    aa = true;
    return;
  }

  aa = false;
  if (!list.querySelector('.tweet')) list.innerHTML = "";

  snap.docs.forEach((docSnap) => {
    const d = docSnap.data();
    if (docSnap.id === window.currentPinnedId) return;
    
    if (uid === document.querySelector("#user-name").dataset.uid) {
      renderTweet(d, docSnap.id, auth.currentUser, "append", list);
    }
  });

  userLoadedCount += snap.docs.length;

  if (!snap.empty) {
    userLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}

async function fetchUsers(term = "") {
  displayUsers.innerHTML = "";
  
  const uniqueDocs = new Map();

  if (term) {
    const lowerTerm = term.toLowerCase();

    const nameQuery = query(
      collection(db, "users"),
      where("name", ">=", lowerTerm),
      where("name", "<=", lowerTerm + "\uf8ff"),
      limit(10)
    );

    const usernameQuery = query(
      collection(db, "users"),
      where("username", ">=", lowerTerm),
      where("username", "<=", lowerTerm + "\uf8ff"),
      limit(10)
    );

    const [nameSnap, usernameSnap] = await Promise.all([
      getDocs(nameQuery),
      getDocs(usernameQuery)
    ]);

    nameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
    usernameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
  } else {
    const defaultQuery = query(
      collection(db, "users"), 
      orderBy("createdAt", "desc"), 
      limit(3)
    );
    const defaultSnap = await getDocs(defaultQuery);
    defaultSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
  }

  if (uniqueDocs.size === 0) {
    displayUsers.innerHTML = "";
    return;
  }

  const docArray = Array.from(uniqueDocs.values());

  for (const docSnap of docArray) {
    const data = docSnap.data();

    const item = document.createElement("div");
    item.className = "user-search-item";
    item.id = `user-${docSnap.id}`;
    item.style.cssText = "display:flex;gap:10px;padding:15px 0 10px 0;border-bottom:var(--border);align-items:center";

    item.innerHTML = `
      <div style="display:flex; gap:12px; width:100%">
        <img loading="lazy" src="${base91ToImageSrc(data.photoURL)}" onerror="this.src='/image/default-avatar.jpg'" style="min-width:40px; min-height:40px; max-width:40px; max-height:40px; border-radius:10px; object-fit:cover; align-self:flex-start;">
        <div style="display:flex;flex-direction:column;gap:6px;width:100%">
          <div style="display:flex;width:100%">
            <div style="display:flex; flex-direction:column; gap:6px">
              <strong style="cursor:pointer;" class="user-link" data-uid="${docSnap.id}">${escapeHTML(data.displayName)}</strong>
              <span style="font-size:14px; color:grey;">@${escapeHTML(data.username)}</span>
            </div>
            <button class="mini-follow-btn" style="padding:0 10px; border-radius:50px; background:white; height:26px; cursor:pointer; border:1px solid var(--border); margin-left:auto; opacity:0;">...</button>
          </div>
          <span style="font-size:14px;overflow-wrap:break-word;overflow-wrap:anywhere;">${data.description ? escapeHTML(data.description.slice(0, 100)) : ""}</span>
        </div>
      </div>`;

    item.addEventListener("click", (e) => {
      if (!e.target.classList.contains("mini-follow-btn")) {
        openUserSubProfile(docSnap.id);
      }
    });
    
    if (!displayUsers.querySelector(`#user-${docSnap.id}`)) {
      displayUsers.appendChild(item);
    } 

    const btn = item.querySelector(".mini-follow-btn");
    setupMiniFollowBtn(btn, docSnap.id);

    totalLoaded++;
  }
  
  return true;
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
  document.getElementById("stardenburdenhardenbart").textContent = "user";
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
  document.getElementById("highlights-container").innerHTML = "";

  const userEffectEl = document.querySelector("#profile-effect");
  if (userEffectEl) {
    userEffectEl.style.setProperty("--user-effect-bg", "none");
    userEffectEl.style.setProperty("--user-effect-opacity", "0");
  }

  list.innerHTML = "";
  usermentionedList.innerHTML = "";
}

function blank() {
  document.getElementById("stardenburdenhardenbart").textContent = "user";
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
}

async function isBanned(uid) {
  const bannedRef = doc(db, "banned", uid);
  const bannedSnap = await getDoc(bannedRef);
  if (bannedSnap.exists()) {
    document.getElementById("user-name").textContent = "user is suspended";
    document.getElementById("followBtn").classList.add("hidden");
    blank();
    return;
  }
}

function setupHighlightInfiniteScroll(uid) {
  const container = document.getElementById("highlights-container");

  container.addEventListener("scroll", async () => {
    const reachedEnd =
      container.scrollLeft + container.clientWidth >= container.scrollWidth - 20;

    if (reachedEnd) {
      await loadUserHighlights(uid);
    }
  });
}

let userHighlightLastDoc = null;
let userHighlightLoading = false;
let userHighlightNoMore = false;

async function loadUserHighlights(uid, initial = false) {
  const container = document.getElementById("highlights-container");

  if (uid != auth.currentUser.uid) {
    document.getElementById("hchangeFolderName").style.display = "none";
  }
  document.getElementById("hchangeFolderName").style.display = "inline";

  if (initial) {
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
    const data = docSnap.data();

    const item = document.createElement("div");
    item.className = "highlight-item";
    item.id = `highlight-item-${docSnap.id}-1`;

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

    if (!document.getElementById(`highlight-item-${docSnap.id}-1`)) {
      container.appendChild(item);
    }

    item.addEventListener('click', async () => {
      loadFolderTweets(docSnap.id, true, uid);
    });
  });

  userHighlightLastDoc = snap.docs[snap.docs.length - 1];

  if (snap.docs.length < 5) {
    userHighlightNoMore = true;
  }

  userHighlightLoading = false;
}

export async function openUserSubProfile(uid) {
  searchsvg.click();
  searchbar.value = "";

  softblank();
  window.cannotSeeFollows = false;
  window.cannotSeeFollowers = false;
  tweetviewactive1();

  document.getElementById("comRule").style.display = "none";

  const followBtn = document.getElementById("followBtn");

  followBtn.style.cssText = `margin-right:-13px;background:none;margin-bottom:-10px;`;
  followBtn.innerHTML = `<img loading='lazy' height="30" src="/image/loader.svg">`;

  userLoadedCount = 0;
  userLastVisibleDoc = null;

  mentionedLoadedCount = 0;
  mentionedLastVisibleDoc = null;

  const docSnap = await getDoc(doc(db, "users", uid));
  if (!docSnap.exists()) {
    document.getElementById("user-name").textContent = "user not found";
    blank();
    return;
  }

  list.classList.remove("hidden");
  usermentionedList.classList.remove("hidden");

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

  loadUserHighlights(uid, true);
  setupHighlightInfiniteScroll(uid);

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

  if (d.createdAt?.toDate) {
    const date = d.createdAt.toDate();
    const formatted = `${date.getDate()} ${date.toLocaleString("default", { month: "short" })} ${date.getFullYear()}`;
    document.getElementById("user-creation").textContent = `${formatted}`;
  }

  list.innerHTML = "";
  if (document.getElementById("pinnedyo")) document.getElementById("pinnedyo").remove();

  window.currentPinnedId = d.pinned || null;

  await loadTweets(uid); 
  
  if (d.pinned) {
    await renderPinned(d, uid);
  }
  loadIfFollow(uid);
  isBanned(uid);

  document.getElementById("posts").textContent = d.posts || 0;
  document.getElementById("followers").textContent = d.followers || 0;
  document.getElementById("following").textContent = d.following || 0;
  document.getElementById("comCount").textContent = d.communitiesCount || 0;
  document.getElementById("stardenburdenhardenbart").textContent = d.displayName || "user";
  document.getElementById("user-description").innerHTML = "loading about...";
  document.getElementById("user-description").innerHTML = await parseMentionsToLinks(d.description || "wsg homie?", d.descriptionMentions || []);
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
        const theirAccount = await getDoc(doc(db, "users", uid));

        if (currentlyFollowing) {
          if (localStorage.getItem("disableConfirmation") != "true") {
            const ok = await confirmDialog("Unfollow this user?", "Are you sure you want to unfollow this user?");

            if (!ok) {
              reset();
              return;
            }
          }

          const batch = writeBatch(db);

          batch.delete(myFollowingRef);
          batch.delete(theirFollowersRef);

          batch.update(doc(db, "users", auth.currentUser.uid), {
            following: increment(-1)
          });

          if (theirAccount.exists()) {
            batch.update(doc(db, "users", uid), {
              followers: increment(-1)
            });
          }

          await batch.commit();

          followBtn.style.cssText = `margin-right:-13px;background:none;margin-bottom:-10px;`;
          followBtn.innerHTML = `<img loading='lazy' height="30" src="/image/loader.svg">`;
          followBtn.classList.remove("disabled");
          followBtn.disabled = false;;

          log("green", `user unfollowed`);
          loading.classList.remove("show");
          await loadIfFollow(uid);
          document.querySelector(`#followList .user-search-item[data-uid="${id}"]`)?.remove();
        } else {
          const [
            { realdisplayName: tDisplayName, realusername: tUsername, realavatar: tPhotoURL, realdescription: tDescription },
            { displayName, username, realavatar: photoURL, realdescription: description }
          ] = await Promise.all([
            getUserData(uid),
            getUserData(auth.currentUser.uid)
          ]);

          await runTransaction(db, async (batch) => {
            const currentUserRef = doc(db, "users", auth.currentUser.uid);
            const targetUserRef = doc(db, "users", uid);

            const [currentUserSnap, targetUserSnap] = await Promise.all([
              batch.get(currentUserRef),
              batch.get(targetUserRef)
            ]);
            const targetUserData = targetUserSnap.data();
            const currentUserData = currentUserSnap.data();

            if (currentUserData.suspended === true && currentUserData.suspendedUntil > Timestamp.now()) {
              info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
              reset();
              return;
            }

            if (targetUserData.suspended === true && targetUserData.suspendedUntil > Timestamp.now()) {
              info("x", "insufficient permission", "This user is temporarily suspended from using this platform. Please try again later");
              reset();
              return;
            }

            const status = currentUserData.cannotSeeFollows ?
              "private" : "public"

            batch.set(doc(db, "users", uid, "followers", auth.currentUser.uid), {
              followedAt: serverTimestamp(),
              displayName:displayName,
              username: username,
              name: displayName?.toLowerCase(),
              photoURL: photoURL,
              description: description || null,
              status
            });

            batch.set(doc(db, "users", auth.currentUser.uid, "following", uid), {
              followedAt: serverTimestamp(),
              displayName: tDisplayName,
              username: tUsername,
              name: tDisplayName?.toLowerCase(),
              photoURL: tPhotoURL,
              description: tDescription || null
            });

            batch.update(currentUserRef, {
              following: increment(1)
            });
            batch.update(targetUserRef, {
              followers: increment(1)
            });      

            sendFollowNotification(uid, username, photoURL);
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

    const pinnedLabel = document.createElement("div");
    pinnedLabel.id = "pinnedyo";
    pinnedLabel.innerHTML = `<div class="iq pinlabel userPinned-${d.pinned}" style="background:var(--color);margin-bottom:10px;margin-top:30px;width:fit-content;font-size:13px;">Pinned by Wynt author</div>`;
    
    // 1. Render the tweet FIRST (prepends it to the top of the list)
    if (uid === document.querySelector("#user-name").dataset.uid) {
      await renderTweet(pinnedData, d.pinned, auth.currentUser, "skibidi", list);
      console.log("TWEET RENDERED");
    }

    // 2. Prepend the label SECOND (pushes it to the very top, resting right above the Wynt)
    if (!document.getElementById('pinnedyo')) {
      list.prepend(pinnedLabel);
      console.log(pinnedLabel)
      document.querySelectorAll("#userList .skeleton-card").forEach(e => {e.remove()});
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
        where("archived", "!=", true),
        startAfter(lastDoc),
        limit(BATCH_SIZE)
      );
    } else {
      q = query(
        tagTweetsRef,
        orderBy("taggedAt", "desc"),
        where("archived", "!=", true),
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

    snap.docs.forEach(async (docSnap) => {
      const tweetId = docSnap.id;

      const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
      if (tweetDoc.exists()) {
        if (!tweetList.querySelector(".tweet")) tweetList.innerHTML = "";
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

const followOverlay = document.createElement("div");
followOverlay.id = "followOverlay";
followOverlay.className = "useroverlay hidden";
followOverlay.innerHTML = `
  <div class="user-box" style="height:100dvh !important;">
    <header style="margin:0 -20px;padding:0 20px;background:rgba(0, 0, 0, 0.9);backdrop-filter: blur(10px);border-bottom:var(--border)">
      <button onclick="document.getElementById('followOverlay').classList.add('hidden')" class="close-btn" style="position:absolute;top:13px;left:0;"><img src="/image/leftArrow.svg"></button>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:100%;padding:12px;display:flex;align-items:center;gap:10px;margin-right:-20px;">
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

const skeleton1 = `<div style="margin:0 -20px"><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div></div>`;

async function openFollowOverlay(type, userId, isMe) {
  const overlay = document.getElementById("followOverlay");
  const listEl = document.getElementById("followList");
  const input = overlay.querySelector("input");

  overlay.classList.remove("hidden");
  listEl.innerHTML = "";

  followList = [];
  followLastDoc = null;
  let hasMore = true; 
  window.cannotSeeFollowers = false;
  window.cannotSeeFollows = false;

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
      hasMore = true; // 💡 Reset when clearing search
      await loadFollowUsers(type, userId);
      return;
    }
    if (value.trim().toLowerCase() === previousValue) return;

    previousValue = value.trim().toLowerCase();
    isSearching = true;
    listEl.innerHTML = "";
    hasMore = true; // 💡 Reset for new search term
    await searchFollowUsers(previousValue);
  });

  async function searchFollowUsers(term, isNextPage = false) {
    if (!isNextPage) {
      followList = [];
      followLastDoc = null;
    }

    if (window.cannotSeeFollows === true && window.type == "following") {
      listEl.innerHTML = noaccess;
      return;
    }
    if (window.cannotSeeFollowers === true && window.type == "followers") {
      listEl.innerHTML = noaccess;
      return;
    }

    if (!isNextPage && !listEl.querySelector(".user-search-item")) {
      listEl.innerHTML = skeleton1;
    }

    function buildFollowSearchQuery(field, searchVal) {
      const constraints = [];
      if (auth.currentUser.uid !== userId) {
        constraints.push(where("status", "!=", "private"));
      }
      constraints.push(
        where(field, ">=", searchVal),
        where(field, "<=", searchVal + "\uf8ff"),
        orderBy(field)
      );
      
      if (isNextPage && followLastDoc) {
        constraints.push(startAfter(followLastDoc));
      }
      
      constraints.push(limit(10));
      return query(collection(db, "users", userId, type), ...constraints);
    }

    const [nameSnap, usernameSnap] = await Promise.all([
      getDocs(buildFollowSearchQuery("name", term)),
      getDocs(buildFollowSearchQuery("username", term))
    ]);

    const uniqueDocs = new Map();
    nameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
    usernameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));

    // 💡 CHANGED HERE: Handle empty search response elegantly
    if (uniqueDocs.size === 0) {
      hasMore = false; 
      if (!isNextPage && !(listEl.querySelector(".user-search-item"))) {
        listEl.innerHTML = `
          <div style="width:100%;display:flex;justify-content:center;margin-top:30px;">
            <div style="max-width:400px;">
              <h2 style="margin:0;">No matched users</h2>
              <p style="color:grey;margin:7px 0;">There's no person you're looking for.</p>
            </div>
          </div>`;
      }
      return;
    }

    if (!isNextPage && !listEl.querySelector(".user-search-item")) {
      listEl.innerHTML = "";
    }

    const docArray = Array.from(uniqueDocs.values());
    
    if (docArray.length > 0) {
      followLastDoc = docArray[docArray.length - 1];
    }

    for (const docSnap of docArray) {
      const data = docSnap.data();
      const theirId = docSnap.id;

      if (document.getElementById(`itemm-${theirId}`)) continue;

      const item = document.createElement("div");
      item.className = "user-search-item";
      item.id = `itemm-${theirId}`;
      item.style.cssText = "display:flex;gap:10px;padding:15px 0;border-bottom:var(--border);align-items:center";

      item.innerHTML = `
        <div style="display:flex; gap:12px; width:100%">
          <img loading="lazy" src="${base91ToImageSrc(data.photoURL)}" onerror="this.src='/image/default-avatar.jpg'" style="min-width:40px; min-height:40px; max-width:40px; max-height:40px; border-radius:10px; object-fit:cover; align-self:flex-start;">
          <div style="display:flex;flex-direction:column;gap:6px;width:100%">
            <div style="display:flex;width:100%">
              <div style="display:flex; flex-direction:column; gap:6px">
                <strong style="cursor:pointer;" class="user-link" data-uid="${theirId}">
                  ${escapeHTML(data.displayName)}
                </strong>
                <span style="font-size:14px; color:grey;">
                  @${escapeHTML(data.username)}
                </span>
              </div>
              <div style="margin-left:auto;display:flex;align-items:center;">
                ${(theirId === auth.currentUser.uid || userId === auth.currentUser.uid) && data.status != "private" ? `
                <img class="hide-btn1" src="/image/eye.svg" style="cursor:pointer;height:22px;margin-left:15px;display:none;">`
                : ""}
                <button class="mini-follow-btn" style="padding:0 10px; border-radius:50px; background:white; height:26px; cursor:pointer; border:1px solid var(--border); opacity:0;">...</button>
              </div>
            </div>
            <span style="font-size:14px;overflow-wrap:break-word;overflow-wrap:anywhere;">${data.description ? escapeHTML(data.description.slice(0, 100)) : ""}</span>
          </div>
        </div>
      `;

      listEl.appendChild(item);

      const hideBtn = item.querySelector(".hide-btn1");

      if (hideBtn) {
        item.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          document.querySelectorAll(".hide-btn1").forEach(btn => btn.style.display = "none")
          if (hideBtn) hideBtn.style.display = "block";
        });

        document.addEventListener("mousedown", (e) => {
          if (!item.contains(e.target)) {
            if (hideBtn) hideBtn.style.display = "none";
          }
        });

        hideBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const confirmed = await confirmDialog(
            "hide this user connection?", 
            "people browsing this list won't see this entry. This action is irreversible", 
            "red"
          );
          if (!confirmed) return;

          try {
            const followDocRef = doc(db, "users", userId, type, theirId);
            await updateDoc(followDocRef, { status: "private" });
            loading.classList.remove("show");
            log("green", "user hidden from public");
          } catch(err) {
            console.error("Privacy update dropped:", err);
          }
        });
      }

      item.addEventListener("click", (e) => {
        if (!e.target.classList.contains("mini-follow-btn") && !e.target.classList.contains("hide-btn1")) {
          document.getElementById("followOverlay").classList.add("hidden");
          openUserSubProfile(theirId);
        }
      });

      const btn = item.querySelector(".mini-follow-btn");
      if (type === "following" && userId === auth.currentUser.uid) {
        setupMiniFollowBtn(btn, theirId, true);
      } else {
        setupMiniFollowBtn(btn, theirId);
      }
    }
  }

  async function loadFollowUsers(type, userId) {
    let ref;
    if (userId !== auth.currentUser.uid) {
      ref = query(collection(db, "users", userId, type), where("status", "!=", "private"));
    } else {
      ref = collection(db, "users", userId, type);
    }

    if (!followLastDoc) {
      document.getElementById("followList").innerHTML = skeleton1;
    }

    if (!followLastDoc) {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();

      if (userData.cannotSeeFollows === true && type == "following" && userId !== auth.currentUser.uid) {
        document.getElementById("followList").innerHTML = noaccess;
        if (userData.cannotSeeFollows) window.cannotSeeFollows = true;
        window.type = "following";
        return;
      }
      if (userData.cannotSeeFollowers && type == "followers" && userId !== auth.currentUser.uid) {
        document.getElementById("followList").innerHTML = noaccess;
        if (userData.cannotSeeFollowers) window.cannotSeeFollowers = true;
        window.type = "followers"
        return;
      }
    }

    window.cannotSeeFollows = false;
    window.cannotSeeFollowers = false;
    window.type = type;
    window.userId = userId;

    const q = followLastDoc
      ? query(ref, orderBy("followedAt", "desc"), startAfter(followLastDoc), limit(10))
      : query(ref, orderBy("followedAt", "desc"), limit(10));

    const snap = await getDocs(q);

    // 💡 CHANGED HERE: Halts execution safely if Firestore collection is exhausted
    if (snap.empty) {
      hasMore = false; 
      if (!followLastDoc) {
        document.getElementById("followList").innerHTML = `
          <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
            <div style="max-width:400px;text-align:left;">
              <h2 style="margin:0;">No results — yet</h2>
              <p style="color:grey;margin:7px 0;">${type == "following" ? "seems like nobody is followed by this user." : "seems like nobody follows them. Be the first one.s"}</p>
            </div>
          </div>`; // Fixed missing closing div tag from original code
      }
      return;
    }

    followLastDoc = snap.docs[snap.docs.length - 1];

    if (!document.querySelector("#followList .user-search-item")) {
      document.getElementById("followList").innerHTML = "";
    }

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const theirId = data.uid ?? docSnap.id;

      if (followList.some(u => u.dataset?.uid === theirId)) continue;

      if (!document.getElementById("userSubOverlay").classList.contains("hidden")) {
        if (document.getElementById("user-name").dataset.uid !== userId) return;
      } else {
        if (document.getElementById("my-name").dataset.uid !== userId) return;
      }

      const item = await renderFollowUserItem(theirId, data, type, userId);
      item.dataset.uid = theirId;
      item.id = `skibidi-${theirId}`;

      followList.push(item);
      if (!document.getElementById(`skibidi-${theirId}`)) {
        document.getElementById("followList").appendChild(item);
      }
    }
  }

  async function renderFollowUserItem(uid, data, type, targetListUserId) {
    const item = document.createElement("div");
    item.className = "user-search-item";
    item.style.cssText = "display:flex;gap:10px;padding:10px 0;border-bottom:var(--border);align-items:center";

    item.innerHTML = `
      <div style="display:flex; gap:12px; width:100%">
        <img loading="lazy" src="${base91ToImageSrc(data.photoURL)}" onerror="this.src='/image/default-avatar.jpg'" style="min-width:40px; min-height:40px; max-width:40px; max-height:40px; border-radius:10px; object-fit:cover; align-self:flex-start;">
        <div style="display:flex;flex-direction:column;gap:6px;width:100%">
          <div style="display:flex;width:100%">
            <div style="display:flex; flex-direction:column; gap:6px">
              <strong style="cursor:pointer;" class="user-link" data-uid="${uid}">
                ${escapeHTML(data.displayName)}
              </strong>
              <span style="font-size:14px; color:grey;">
                @${escapeHTML(data.username)}
              </span>
            </div>
            <div style="margin-left:auto;display:flex;align-items:center;">
              ${(targetListUserId === auth.currentUser.uid || uid === auth.currentUser.uid) && data.status != "private" ? `
              <img class="hide-btn1" src="/image/eye.svg" style="cursor:pointer;height:22px;margin-right:15px;display:none;">`
              : ""}
              <button class="mini-follow-btn" style="padding:0 10px; border-radius:50px; background:white; height:26px; cursor:pointer; border:1px solid var(--border);opacity:0;">...</button>
            </div>
          </div>
          <span style="font-size:14px;overflow-wrap:break-word;overflow-wrap:anywhere;">${data.description ? escapeHTML(data.description.slice(0, 100)) : ""}</span>
        </div>
      </div>
    `;

    const hideBtn = item.querySelector(".hide-btn1");
    if (hideBtn) {
      item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        document.querySelectorAll(".hide-btn1").forEach(btn => btn.style.display = "none")
        if (hideBtn) hideBtn.style.display = "block";
      });

      document.addEventListener("mousedown", (e) => {
        if (!item.contains(e.target)) {
          if (hideBtn) hideBtn.style.display = "none";
        }
      });

      hideBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = await confirmDialog(
          "hide this user connection?", 
          "people browsing this list won't see this entry. This action is irreversible", 
          "red"
        );
        if (!confirmed) return;

        try {
          const followDocRef = doc(db, "users", targetListUserId, type, uid);
          await updateDoc(followDocRef, { status: "private" });
          loading.classList.remove("show");
          log("green", "user hidden from public");
        } catch(err) {
          console.error("Privacy update dropped:", err);
        }
      });
    }

    item.addEventListener("click", (e) => {
      if (!e.target.classList.contains("mini-follow-btn") && !e.target.classList.contains("hide-btn1")) {
        openUserSubProfile(uid);
        document.getElementById("followOverlay").classList.add("hidden");
      }
    });

    const btn = item.querySelector(".mini-follow-btn");
    if (type === "following" && window.userId === auth.currentUser.uid) {
      setupMiniFollowBtn(btn, uid, true);
    } else {
      setupMiniFollowBtn(btn, uid);
    }

    return item;
  }

  const followListContainer = document.querySelector("#followOverlay .user-box");
  let isLoading = false;

  followListContainer.addEventListener("scroll", async () => {
    // 💡 CHANGED HERE: Instantly returns if hasMore is false to prevent redundant queries
    if (isLoading || !hasMore) return; 

    const scrollBottom = followListContainer.scrollTop + followListContainer.clientHeight;
    const scrollHeight = followListContainer.scrollHeight;

    if (scrollBottom >= scrollHeight - 100) {
      isLoading = true;
      
      const overlay = document.getElementById("followOverlay");
      const input = overlay.querySelector("input");
      const activeSearchTerm = input.value.trim().toLowerCase();
      
      if (activeSearchTerm) {
        await searchFollowUsers(activeSearchTerm, true); 
      } else {
        await loadFollowUsers(window.type, window.userId);
      }
      
      isLoading = false;
    }
  });
}

async function setupMiniFollowBtn(btn, targetId, skibidi) {
  if (auth.currentUser?.uid !== targetId) {
    const currentUid = auth.currentUser.uid;
    const myFollowingRef = doc(db, "users", currentUid, "following", targetId);
    const theirFollowersRef = doc(db, "users", targetId, "followers", currentUid);

    const [isFollowingSnap, theirAccount] = await Promise.all([
      getDoc(myFollowingRef),
      getDoc(doc(db, "users", targetId))
    ]);

    btn.textContent = isFollowingSnap.exists() ? "UnFoll" : "Follow";

    if (skibidi === true) {
      btn.style.cssText = isFollowingSnap.exists() ? "background:none;padding:9px;border:1px solid grey;color:grey;margin-left:auto;height:35px;" : "padding:10px;background:white;color:black;margin-left:auto;height:35px;";
    } else {
      btn.style.cssText = isFollowingSnap.exists() ? "display:none" : "padding:10px;background:white;color:black;margin-left:auto;height:35px;";
    }

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
          if (localStorage.getItem("disableConfirmation") != "true") {
            const ok = await confirmDialog("Unfollow this user?", "Are you sure you want to unfollow this user?");
            if (!ok) return;
          }

          const batch = writeBatch(db);

          batch.delete(myFollowingRef);
          batch.delete(theirFollowersRef);

          batch.update(doc(db, "users", currentUid), {
            following: increment(-1)
          });
          
          if (theirAccount.exists()) {
            batch.update(doc(db, "users", targetId), {
              followers: increment(-1)
            });
          }

          await batch.commit();

          btn.textContent = "Follow";
          btn.style.cssText = "background:white;color:black;margin-left:auto;padding:10px;height:35px;";

          log("green", `user unfollowed`);
          loading.classList.remove("show");
          setupMiniFollowBtn(btn, targetId);
          document.querySelector(`#followList .user-search-item[data-uid="${targetId}"]`)?.remove();
        } else {
          const [
            { realdisplayName: tDisplayName, realusername: tUsername, realavatar: tPhotoURL, realdescription: tDescription },
            { displayName, username, realavatar: photoURL, realdescription: description }
          ] = await Promise.all([
            getUserData(targetId),
            getUserData(auth.currentUser.uid)
          ])

          await runTransaction(db, async (batch) => {
            const currentUserRef = doc(db, "users", auth.currentUser.uid);
            const targetUserRef = doc(db, "users", targetId);

            const [currentUserSnap, targetUserSnap] = await Promise.all([
              batch.get(currentUserRef),
              batch.get(targetUserRef)
            ])
            const currentUserData = currentUserSnap.data();
            const targetUserData = targetUserSnap.data();

            if (currentUserData.suspended === true && currentUserData.suspendedUntil > Timestamp.now()) {
              info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
              reset();
              return;
            }

            if (targetUserData.suspended === true && targetUserData.suspendedUntil > Timestamp.now()) {
              info("x", "insufficient permission", "This user is temporarily suspended from using this platform. Please try again later");
              reset();
              return;
            }

            const status = currentUserData.cannotSeeFollows ?
              "private" : "public"

            batch.set(doc(db, "users", targetId, "followers", auth.currentUser.uid), {
              followedAt: serverTimestamp(),
              displayName: displayName,
              username: username,
              name: displayName?.toLowerCase(),
              photoURL: photoURL,
              description: description || null,
              status
            });

            batch.set(doc(db, "users", auth.currentUser.uid, "following", targetId), {
              followedAt: serverTimestamp(),
              displayName: tDisplayName,
              username: tUsername,
              name: tDisplayName?.toLowerCase(),
              photoURL: tPhotoURL,
              description: tDescription || null
            });

            batch.update(currentUserRef, {
              following: increment(1)
            });
            batch.update(targetUserRef, {
              followers: increment(1)
            }); 

            log("green", `followed ${tDisplayName || "them"}`);
            sendFollowNotification(targetId, username, photoURL);
          });

          btn.textContent = "UnFoll";

          if (skibidi === true) {
            btn.style.cssText = "background:none;padding:9px;border:1px solid grey;color:grey;margin-left:auto;height:35px;"
          } else {
            btn.style.cssText = "display:none";
          }
        
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

    const targetId = tab.dataset.target;
    document.getElementById(targetId).style.display = "block";

    const uid = document.getElementById("user-name").dataset.uid;
    searchbar.value = "";

    if (targetId === "userList") {
      loadTweets(uid);
    } else if (targetId === "usermentionedList") {
      loadUserMentionedTweets(uid);
    }
  });
});

searchbar.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return; 

  const term = searchbar.value.trim();
  const uid = document.getElementById("user-name").dataset.uid;
  if (!uid) return;

  userLastVisibleDoc = null;
  userLoadedCount = 0;
  mentionedLastVisibleDoc = null;
  mentionedLoadedCount = 0;
  aa = false;
  bb = false;

  list.innerHTML = "";
  usermentionedList.innerHTML = "";

  document.querySelectorAll(".tab3").forEach(tab => {
    const targetId = tab.dataset.target;
    if (targetId === "userList") {
      loadTweets(uid, term);
    } else if (targetId === "usermentionedList") {
      loadUserMentionedTweets(uid, term);
    }
  });
});

let mentionedLastVisibleDoc = null;
let mentionedLoadedCount = 0;
const usermentionedList = document.getElementById("usermentionedList");
const MENTIONED_PAGE_SIZE = 5;

async function loadUserMentionedTweets(uid, term = "") {
  if (!mentionedLastVisibleDoc) {
    usermentionedList.innerHTML = skeleton;
  }

  const mentionsRef = collection(db, "tweets");

  let constraints = [
    where("archived", "!=", true),
    orderBy("createdAt", "desc"),
    limit(7)
  ];

  if (term !== "") {
    const searchList = tokenize(term)
      .slice(0, 10)
      .map(word => `${uid}_${word}`);

    constraints.unshift(
      where("mentionedSearchTokens", "array-contains-any", searchList)
    );
  } else {
    constraints.unshift(
      where("mentioned", "array-contains", uid)
    );
  }

  if (mentionedLastVisibleDoc) {
    constraints.push(startAfter(mentionedLastVisibleDoc));
  }

  const q = query(mentionsRef, ...constraints);
  const snap = await getDocs(q);

  if (snap.empty && mentionedLoadedCount === 0) {
    bb = true;
    usermentionedList.innerHTML =
      `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:400px;text-align:left;">
          <h2 style="margin:0;">No mentions — yet</h2><p style="color:grey;margin:7px 0;">when this user gets mentioned, it will appear here. Be the first to mention them.</p>
        </div>
      </div>`;
    return;
  }

  bb = false;
  if (!usermentionedList.querySelector(".tweet")) usermentionedList.innerHTML = "";

  if (!snap.empty) {
    mentionedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }

  for (const mentionDoc of snap.docs) {
    if (uid === document.querySelector("#user-name").dataset.uid) {
      await renderTweet(mentionDoc.data(), mentionDoc.id, auth.currentUser, "append",usermentionedList);
    }
  }

  mentionedLoadedCount += snap.docs.length;
}

document.body.addEventListener("click", e => {
  const carduser = e.target.closest(".card-user");
  if (carduser) {
    openUserSubProfile(carduser.dataset.uid);
  }
  const cardcom = e.target.closest(".card-community");
  if (cardcom) {
    openCommunity(cardcom.dataset.id);
  }
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

async function init() {
  const user = await waitForAuth();
  if (!user) return info("x", "Unauthorized", "user is not logged in");
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
}

const profileScrollBox = document.querySelector("#userSubOverlay .user-box");

let tweetLoading = false;
let mentionLoading = false;

profileScrollBox.addEventListener("scroll", async () => {
  const nearBottom =
    profileScrollBox.scrollTop + profileScrollBox.clientHeight >=
    profileScrollBox.scrollHeight - 150;

  if (!nearBottom) return;

  const activeTab = document.querySelector(".tab3.active")?.dataset.target;
  const uid = document.getElementById("user-name").dataset.uid;
  const term = searchbar.value.trim();

  if (activeTab === "userList") {
    if (tweetLoading || aa) return;
    tweetLoading = true;
    await loadTweets(uid, term);
    tweetLoading = false;
  }
  
  if (activeTab === "usermentionedList") {
    if (mentionLoading || bb) return;
    mentionLoading = true;
    await loadUserMentionedTweets(uid, term);
    mentionLoading = false;
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