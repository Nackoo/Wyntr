import { auth, db, doc, getDoc, onAuthStateChanged, onSnapshot } from "./firebase.js";
import { loadNewTweets } from "./newTweets.js";
import { loadFollowingTweets } from "./followingTweets.js";
import { renderCommentViewer } from "./commentViewer.js";
import { renderTweetViewer } from "./tweetViewer.js";
import { openCommunity } from "./community.js";
import { homesvg, homefilled, searchsvg, searchfilled, tweetviewactive1 } from "./nonsense.js";
import { tokenize, parseMentionsToLinks, info, formatNumber } from "./texts.js";
import { renderTweet, getUserData, loadComments, } from './index.js'; 
import { base91ToImageSrc } from "./attachments.js";

function positionHoverCard(el, card) {
  const rect = el.getBoundingClientRect();
  const padding = 12;

  card.style.visibility = "hidden";
  card.classList.remove("hidden");

  const cardHeight = card.offsetHeight;
  const cardWidth = card.offsetWidth;

  let top = rect.bottom + padding;
  let left = rect.left;

  if (top + cardHeight > window.innerHeight) {
    top = rect.top - cardHeight - padding;
  }
  if (left + cardWidth > window.innerWidth) {
    left = window.innerWidth - cardWidth - 10;
  }
  if (left < 10) {
    left = 10;
  }
  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
  card.style.visibility = "visible";
}

const communityHoverCard = document.getElementById("community-hover-card");
const communityCache = new Map();
let communityHoverTimeout;

document.addEventListener("mouseout", () => {
  clearTimeout(communityHoverTimeout);
  communityHoverCard.classList.add("hidden");
});

function fillCommunityHoverCard(c) {
  communityHoverCard.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;">
      <img src="${base91ToImageSrc(c.avatar) || '/image/default.png'}" style="width:48px;height:48px;border-radius:10px;object-fit:cover;">
      <div>
        <strong>${c.name}</strong>
        <div style="color:grey;font-size:14px">
          by ${c.creatorName}
        </div>
      </div>
    </div>
    <p style="margin:10px 0;color:#ccc;font-size:15px;overflow-wrap: break-word;">
      ${c.description || "No description"}
    </p>
    <div style="color:grey;font-size:14px;">
      ${formatNumber(c.posts || 0)} posts • ${formatNumber(c.membersCount || 0)} members • ${c.private ? "private" : "public"}
    </div>
  `;
}

function fillHoverCard(d) {
  document.getElementById("hover-avatar").style.display = "inline";
  document.getElementById("hover-avatar").src = base91ToImageSrc(d.photoURL) || "/image/default-avatar.png";
  document.getElementById("hover-name").textContent = d.displayName || "Unnamed";
  document.getElementById("hover-title").style.display = "none";
  document.getElementById("hover-iq").style.display = "inline";
  document.getElementById("hover-iq").textContent = d.IQ.toFixed(2) || "0.00";
  document.getElementById("hover-name").style.display = "block";
  document.getElementById("hover-username").textContent = "@" + d.username;
  document.getElementById("hover-bio").textContent = d.description || "no description";
  document.getElementById("hover-followers").textContent = `${formatNumber(d.followers || 0)} Followers` || "0 Followers";
  document.getElementById("hover-following").textContent = `${formatNumber(d.following || 0)} Following` || "0 Following";
  if (d.createdAt?.toDate) {
    const date = d.createdAt.toDate();
    document.getElementById("hover-joined").textContent = `${date.getDate()} ${date.toLocaleString("default", { month: "short" })} ${String(date.getFullYear()).slice(-2)}` || "some time ago";
  }
}

const hoverCard = document.getElementById("user-hover-card");

let hoverTimeout;
const hoverCache = new Map();

if (window.innerWidth > 700) {
  document.addEventListener("mouseover", async (e) => {
    const el0 = e.target.closest(".communityLink");
    if (el0 && el0.dataset.id) {
      communityHoverTimeout = setTimeout(async () => {
        const comId = el0.dataset.id;

        let cData;
        if (communityCache.has(comId)) {
          cData = communityCache.get(comId);
        } else {
          const snap = await getDoc(doc(db, "communities", comId));
          if (!snap.exists()) return;
          cData = snap.data();
          communityCache.set(comId, cData);
        }

        fillCommunityHoverCard(cData);
        positionHoverCard(el0, communityHoverCard);
        communityHoverCard.classList.remove("hidden");
      }, 400);
    }
    const el = e.target.closest(".user-link");
    if (el && el.dataset.uid) {
      hoverTimeout = setTimeout(async () => {
        const uid = el.dataset.uid;

        let userData;
        if (hoverCache.has(uid)) {
          userData = hoverCache.get(uid);
        } else {
          const snap = await getDoc(doc(db, "users", uid));
          if (!snap.exists()) return;
          userData = snap.data();
          hoverCache.set(uid, userData);
        }

        fillHoverCard(userData);
        positionHoverCard(el, hoverCard);
        hoverCard.classList.remove("hidden");
      }, 400);
    }
    const el2 = e.target.closest(".viewbtn");
    if (el2) {
      hoverTimeout = setTimeout(async () => {
        fillHoverCard1("Views", "Times this Wynt was seen.");
        positionHoverCard(el2, hoverCard);
        hoverCard.classList.remove("hidden");
      }, 400);
    }
  });
}

function fillHoverCard1(name, desc) {
  document.getElementById("hover-avatar").style.display = "none";
  document.getElementById("hover-name").style.display = "none";
  document.getElementById("hover-title").textContent = name;
  document.getElementById("hover-title").style.display = "inline";
  document.getElementById("hover-username").textContent = "";
  document.getElementById("hover-iq").style.display = "none";
  document.getElementById("hover-bio").textContent = desc;
  document.getElementById("hover-followers").textContent = "";
  document.getElementById("hover-following").textContent = "";
  document.getElementById("hover-joined").textContent = "";
}

document.addEventListener("mouseout", () => {
  clearTimeout(hoverTimeout);
  hoverCard.classList.add("hidden");
});

const loading = document.getElementById("loadingOverlay");
let lastCommunityID = window.communityID || null;

function observeCommunityID() {
  if (window.communityID !== lastCommunityID) {
    lastCommunityID = window.communityID;
    updatePostZIndex();
    updateCbDisplay();
  }
  requestAnimationFrame(observeCommunityID);
}

function updatePostZIndex() {
  const post = document.getElementById("post");
  if (!post) return;

  if (window.communityID == null && window.innerWidth < 700) {
    post.style.zIndex = "2";
  } else if (window.communityID != null) {
    post.style.zIndex = "7";
  }
}

function updateCbDisplay() {
  const cb = document.getElementById("communityActiveCheckbox");
  const cd = document.getElementById("communityActiveCheckbox1")
  if (!cb) return;
  if (!cd) return;

  if (window.communityID != null && window.isOnPrivate === false) {
    cb.style.display = "flex";
    cd.style.display = "flex";
  } else {
    cb.style.display = "none";
    cd.style.display = "none";
  }
}

window.addEventListener("resize", updatePostZIndex);
observeCommunityID();

function setupScrollSync() {
  const whoFollow = document.getElementById("nanat1");
  if (!whoFollow) return console.warn("#nanat1 not found");

  const scrollTargets = [
    window,
    ...document.querySelectorAll(".useroverlay > div")
  ];

  let isSyncing = false;
  let lastScroll = 0;
  let stopDirection = null; 

  function getScrollTop(el) {
    return el === window ? window.scrollY : el.scrollTop;
  }

  scrollTargets.forEach((el) => {
    el.addEventListener("scroll", () => {
      if (isSyncing) return;
      isSyncing = true;

      const currentScroll = getScrollTop(el);
      const diff = currentScroll - lastScroll;
      lastScroll = currentScroll;

      if (diff === 0) {
        isSyncing = false;
        return;
      }

      const atTop = whoFollow.scrollTop <= 0;
      const atBottom =
        whoFollow.scrollTop + whoFollow.clientHeight >= whoFollow.scrollHeight - 1;

      const direction = diff > 0 ? "down" : "up";

      if (
        (direction === "down" && atBottom) ||
        (direction === "up" && atTop)
      ) {
        stopDirection = direction; 
        isSyncing = false;
        return;
      }

      if (
        (stopDirection === "down" && direction === "up") ||
        (stopDirection === "up" && direction === "down")
      ) {
        stopDirection = null; 
      }

      if (!stopDirection) {
        whoFollow.scrollTop += diff; 
      }

      requestAnimationFrame(() => (isSyncing = false));
    });
  });
}

document.addEventListener("DOMContentLoaded", setupScrollSync);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js");
}

let lastScrollTop = 0;

window.addEventListener('scroll', () => {
  let currentScroll = window.pageYOffset || document.documentElement.scrollTop;
  if (window.innerWidth <= 700) {
    const post = document.querySelector('#post');
    const bar = document.querySelector('.smallbar');
    if (post) {
      if (currentScroll > lastScrollTop) {
        post.style.opacity = '0.3';
        bar.style.opacity = '0.3';
      } else {
        post.style.opacity = '1';
        bar.style.opacity = '1';
      }
    }
  }

  const header = document.querySelector('#timeline-header');
  if (header) {
    if (currentScroll > lastScrollTop) {
      header.style.top = '-100vh';
    } else {
      header.style.top = '0';
    }
  }

  lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
});

document.querySelectorAll(".tab1").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab1").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));

    tab.classList.add("active");
    document.getElementById(tab.dataset.target).classList.remove("hidden");
  });
});

let followingLoadedOnce = false;
let newLoadedOnce = false;

const scrollCache = new Map();

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", async () => {

    document.querySelector('#timeline-header').style.top = "0";
    const activeTab = document.querySelector(".tab.active");
    if (activeTab) {
      scrollCache.set(activeTab.dataset.target, window.scrollY);
    }

    document.querySelector(".tab.active")?.classList.remove("active");
    tab.classList.add("active");

    document.getElementById("timeline").classList.add("hidden");
    document.getElementById("following1").classList.add("hidden");
    document.getElementById("new").classList.add("hidden");

    const target = tab.dataset.target;
    const targetEl = document.getElementById(target);
    targetEl.classList.remove("hidden");

    if (target === "following1" && !followingLoadedOnce) {
      await loadFollowingTweets(true);
      followingLoadedOnce = true;
    }

    if (target === "new" && !newLoadedOnce) {
      await loadNewTweets(true);
      newLoadedOnce = true;
    }

    requestAnimationFrame(() => {
      window.scrollTo({
        top: scrollCache.get(target) ?? 0,
        behavior: "auto"
      });
    });
  });
});

let maxLengths = {
  tweetInput: 1000,
  retweetText: 1000,
  commentInput: 1000,
  replyInput: 1000,
  editTextArea: 1000,
  deleteReasonInput: 1000
};

let unsubscribeUserDoc = null;

export function applyLimits(isPremium) {
  const limit = isPremium ? 2000 : 1000;
  maxLengths.tweetInput = limit;
  maxLengths.retweetText = limit;
  maxLengths.commentInput = limit;
  maxLengths.replyInput = limit;
  maxLengths.editTextArea = limit;
  updateAllCounters();
}

export function updateAllCounters() {
  ["tweetInput", "retweetText", "commentInput", "deleteReasonInput", "replyInput", "editTextArea"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const parent = el.parentNode?.parentNode;
    const counter = parent?.querySelector?.(".char-counter");
    const max = maxLengths[id] || 1000;
    if (counter) counter.textContent = `${el.value.length}/${max}`;
  });
}

onAuthStateChanged(auth, (user) => {
  if (unsubscribeUserDoc) {
    unsubscribeUserDoc();
    unsubscribeUserDoc = null;
  }

  if (!user) {
    applyLimits(false);
    return;
  }

  const userRef = doc(db, "users", user.uid);
  unsubscribeUserDoc = onSnapshot(userRef, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    const premiumExpiry = data.premium ? data.premium.toDate() : null;
    const isPremium = premiumExpiry && premiumExpiry > new Date();
    applyLimits(isPremium);
  }, (err) => {
    console.warn("failed to watch user doc for premium:", err);
    (async () => {
      try {
        const dSnap = await getDoc(userRef);
        const data = dSnap.exists() ? dSnap.data() : {};
        const premiumExpiry = data.premium ? data.premium.toDate() : null;
        const isPremium = premiumExpiry && premiumExpiry > new Date();
        applyLimits(isPremium);
      } catch (e) {
        console.error("fallback getDoc failed:", e);
      }
    })();
  });
});

document.body.addEventListener("input", (e) => {
  const t = e.target;
  if (t.tagName !== "TEXTAREA" && !(t.tagName === "INPUT" && t.type === "text")) return;

  const max = maxLengths[t.id] || 1000; 
  if (t.value.length > max) {
    t.value = t.value.slice(0, max);
  }

  const counter = t.parentNode.parentNode.querySelector(".char-counter");
  if (counter) {
    counter.textContent = `${t.value.length}/${max}`;
  }
});

document.body.addEventListener("paste", (e) => {
  const t = e.target;
  if (t.tagName !== "TEXTAREA" && !(t.tagName === "INPUT" && t.type === "text")) return;

  const max = maxLengths[t.id] || 1000;

  e.preventDefault();
  const pasted = (e.clipboardData || window.clipboardData).getData("text");
  const current = t.value;
  const { selectionStart: start, selectionEnd: end } = t;
  const maxInsert = max - (current.length - (end - start));
  const insertableText = pasted.slice(0, maxInsert);

  t.setRangeText(insertableText, start, end, "end");

  const counter = t.parentNode.parentNode.querySelector(".char-counter");
  if (counter) {
    counter.textContent = `${t.value.length}/${max}`;
  }
});

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

const textareas = ["#retweetText", "#commentInput", "#tweetInput", "#reportReasonInput", "#replyInput", "#editTextArea"]
  .map(sel => document.querySelector(sel))
  .filter(Boolean);

textareas.forEach(el => {
  autoResizeTextarea(el);
  el.addEventListener("input", () => autoResizeTextarea(el));
});

const postBtn = document.getElementById("post");
const bar = document.querySelector('.smallbar');

function isOverlayVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);

  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  const rect = el.getBoundingClientRect();
  return !(rect.bottom < 0 || rect.top > window.innerHeight);
}

function checkOverlays() {
  const overlays = document.querySelectorAll(".useroverlay");
  let anyVisible = false;

  overlays.forEach(overlay => {
    if (isOverlayVisible(overlay)) {
      anyVisible = true;
    }
  });
  if (anyVisible) {
    postBtn.style.opacity = "1";
    bar.style.opacity = "1";
  }
}

const observer = new MutationObserver(checkOverlays);

observer.observe(document.body, {
  childList: true,
  attributes: true,
  subtree: true
});

checkOverlays();

document.addEventListener("click", async (e) => {
  const link = e.target.closest("a.internal-link");
  if (!link) return;

  e.preventDefault(); 

  const term = link.dataset.url;
  if (term.startsWith("https://wyntr.netlify.app")) {
    const url = term.replace("https://wyntr.netlify.app", "");

    const userMatch           = url.match(/^\/user\/([^/]+)/);
    const tweetMatch          = url.match(/^\/wynt\/([^/]+)$/);
    const communityTweetMatch = url.match(/^\/community\/([^/]+)\/wynt\/([^/]+)$/);
    const communityReplyMatch = url.match(/^\/community\/([^/]+)\/wynt\/([^/]+)\/reply\/([^/]+)$/);
    const replyMatch          = url.match(/^\/wynt\/([^/]+)\/reply\/([^/]+)$/);
    const communityMatch      = url.match(/^\/community\/([^/]+)$/);

      if (communityMatch) {
        const communityId = communityMatch[1];
        loading.classList.add("show");
        const snap = await getDoc(doc(db, "communities", communityId));
        const data = snap.data();

        if (data.private === true) {
          const memberSnap = await getDoc(doc(db, "communities", communityId, "members", auth.currentUser.uid));
          if (!memberSnap.exists()) {
            loading.classList.remove("show");
            info("x", "No access", "This is a private community and you don't have permission to view this community.");
            return;
          }
        }
        loading.classList.remove("show");
        return await openCommunity(communityId);
      }

      if (userMatch) {
        const userId = userMatch[1];
        return openUserSubProfile(userId);
      }

      if (communityReplyMatch) {
        const communityId = communityReplyMatch[1];
        const tweetId = communityReplyMatch[2];
        const commentId = communityReplyMatch[3];
        loading.classList.add("show");

        const comRef = doc(db, "communities", communityId);
        const comSnap = await getDoc(comRef);

        if (!comSnap.exists()) return;

        const cData = comSnap.data();

        if (cData.private === true) {
          const memberRef = doc(db, "communities", communityId, "members", auth.currentUser.uid);
          const memberSnap = await getDoc(memberRef);
          const isMember = memberSnap.exists();

          if (!isMember) {
            loading.classList.remove("show");
            info("x", "No access", "The community this Wynt belongs to is a private community and you don't have permission to view this reply.");
            return;
          }
        }

        const overlay = document.getElementById("commentViewer");
        const box = overlay.querySelector("#appendComment");
        const replyList = overlay.querySelector("#replyList");

        overlay.classList.remove("hidden");
        box.innerHTML = "";
        replyList.innerHTML = "";

        const commentRef = doc(db, "communities", communityId, "posts", tweetId, "comments", commentId);
        const tweetRef = doc(db, "communities", communityId, "posts", tweetId);

        const snap = await getDoc(commentRef);

        if (snap.exists()) {
          loading.classList.remove("show");
          const commentData = { id: snap.id, ...snap.data() };
          const tweetviewer = document.getElementById("tweetViewer");
          if (tweetviewer && !document.querySelector(`#appendTweet #tweet-${tweetId}`)) {
            await tweetviewer.classList.add("hidden");
          }
          await renderCommentViewer(commentData, commentId, tweetId, box, communityId, true);
          await loadComments(tweetId, true, commentId, replyList, communityId);
          await openCommunity(communityId);
          document.body.classList.add("no-scroll");
        } else {
          box.innerHTML = `
            <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
              <div style="max-width:400px;text-align:left;">
                <h2 style="margin:0;">No reply found</h2>
                <p style="color:grey;margin:7px 0;">Seems like this reply has been deleted.</p>
              </div>
            </div>`;
          replyList.innerHTML = "";
        }
        
        loading.classList.remove("show");
        return;
      }

      if (communityTweetMatch) {
        const communityId = communityTweetMatch[1];
        const tweetId = communityTweetMatch[2];
        loading.classList.add("show");

        const comRef = doc(db, "communities", communityId);
        const comSnap = await getDoc(comRef);

        if (!comSnap.exists()) return;

        const cData = comSnap.data();

        if (cData.private === true) {
          const memberRef = doc(db, "communities", communityId, "members", auth.currentUser.uid);
          const memberSnap = await getDoc(memberRef);
          const isMember = memberSnap.exists();

          if (!isMember) {
            loading.classList.remove("show");
            info("x", "No access", "The community this Wynt belongs to is a private community and you don't have permission to view this Wynt.");
            return;
          }
        }

        const tweetViewer = document.getElementById("tweetViewer");
        const box = tweetViewer.querySelector("#appendTweet");

        box.innerHTML = "";
        tweetViewer.classList.remove("hidden");
        document.body.classList.add("no-scroll");

        const tweetRef = doc(db, "communities", communityId, "posts", tweetId);
        const tweetSnap = await getDoc(tweetRef);

        if (!tweetSnap.exists()) {
          loading.classList.remove("show");
          document.getElementById("commentList").innerHTML = "";
          box.innerHTML = `
            <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
              <div style="max-width:400px;text-align:left;">
                <h2 style="margin:0;">No Wynt found</h2>
                <p style="color:grey;margin:7px 0;">seems like this Wynt have been deleted.</p>
              </div>
            </div>`;
          return;
        }

        loading.classList.remove("show");
        const tweetData = tweetSnap.data();
        await renderTweetViewer(tweetData, tweetId, box, auth.currentUser, communityId, true);
        await loadComments(tweetId, true, null, null, communityId);
        await openCommunity(communityId);
        return;
      }

      if (tweetMatch) {
        const tweetId = tweetMatch[1];
        const tweetViewer = document.getElementById("tweetViewer");
        const box = tweetViewer.querySelector("#appendTweet");

        box.innerHTML = "";
        tweetViewer.classList.remove("hidden");
        document.body.classList.add("no-scroll");

        const tweetRef = doc(db, "tweets", tweetId);
        const tweetSnap = await getDoc(tweetRef);

        if (!tweetSnap.exists()) {
          document.getElementById("commentList").innerHTML = "";
          box.innerHTML = `
            <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
              <div style="max-width:400px;text-align:left;">
                <h2 style="margin:0;">No Wynt found</h2>
                <p style="color:grey;margin:7px 0;">seems like this Wynt have been deleted.</p>
              </div>
            </div>`;
          return;
        }

        const tweetData = tweetSnap.data();
        await renderTweetViewer(tweetData, tweetId, box, auth.currentUser);
        return await loadComments(tweetId);
      }

      if (replyMatch) {
        const tweetId = replyMatch[1];
        const commentId = replyMatch[2];

        const overlay = document.getElementById("commentViewer");
        const box = overlay.querySelector("#appendComment");
        const replyList = overlay.querySelector("#replyList");

        overlay.classList.remove("hidden");
        box.innerHTML = "";
        replyList.innerHTML = "";

        const commentRef = doc(db, "tweets", tweetId, "comments", commentId);
        const snap = await getDoc(commentRef);

        if (snap.exists()) {
          const commentData = { id: snap.id, ...snap.data() };
          const tweetviewer = document.getElementById("tweetViewer");
          if (tweetviewer && !document.querySelector(`#appendTweet #tweet-${tweetId}`)) {
            await tweetviewer.classList.add("hidden");
          }
          await renderCommentViewer(commentData, commentId, tweetId, box);
          await loadComments(tweetId, true, commentId, replyList);
          document.body.classList.add("no-scroll");
        } else {
          box.innerHTML = `
            <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
              <div style="max-width:400px;text-align:left;">
                <h2 style="margin:0;">No reply found</h2>
                <p style="color:grey;margin:7px 0;">Seems like this reply has been deleted.</p>
              </div>
            </div>`;
          replyList.innerHTML = "";
        }
        return;
      }
  }
});

const titleInput = document.getElementById("tweetTitle");

titleInput.addEventListener("input", () => {
  titleInput.value = titleInput.value.slice(0, 100);
});

const titleInput1 = document.getElementById("retweetTitle");

titleInput1.addEventListener("input", () => {
  titleInput1.value = titleInput1.value.slice(0, 100);
});