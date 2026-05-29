import { auth, db, doc, getDoc, onAuthStateChanged, onSnapshot, Timestamp } from "./firebase.js";
import { loadFollowingTweets } from "./followingTweets.js";
import { renderCommentViewer } from "./commentViewer.js";
import { renderTweetViewer } from "./tweetViewer.js";
import { openCommunity } from "./community.js";
import { info, formatNumber, escapeHTML, parseMentionsToLinks, log } from "./texts.js";
import { currentUserRole, getUserData, loadComments, } from './index.js'; 
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
  const tagsHtml = (c.tags || [])
    .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
    .join("");

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
    ${tagsHtml}
  `;
}

async function fillHoverCard(d) {
  if (d.banned === true) {
    document.getElementById("hover-avatar").style.display = "inline";
    document.getElementById("hover-avatar").src = "/image/default-avatar.jpg";
    document.getElementById("hover-name").textContent = "Suspended User";
    document.getElementById("hover-title").style.display = "none";
    document.getElementById("hover-name").style.display = "block";
    document.getElementById("hover-username").textContent = "";
    document.getElementById("hover-bio").textContent = "";
    document.querySelector(".hover-meta").style.display = "none";
  } else {
    document.getElementById("hover-avatar").style.display = "inline";
    document.getElementById("hover-avatar").src = base91ToImageSrc(d.photoURL) || "/image/default-avatar.png";
    document.querySelector(".hover-meta").style.display = "flex";
    document.getElementById("hover-name").textContent = d.displayName || "Unnamed";
    document.getElementById("hover-title").style.display = "none";
    document.getElementById("hover-name").style.display = "block";
    document.getElementById("hover-username").textContent = "@" + d.username;
    document.getElementById("hover-bio").textContent = "loading about...";
    document.getElementById("hover-followers").textContent = formatNumber(d.followers || 0);
    document.getElementById("hover-following").textContent = formatNumber(d.following || 0);
    document.getElementById("hover-bio").innerHTML = d.description ? await parseMentionsToLinks(d.description, d.descriptionMentions || []) : "no description";
    if (d.createdAt?.toDate) {
      const date = d.createdAt.toDate();
      document.getElementById("hover-joined").textContent = `${date.getDate()} ${date.toLocaleString("default", { month: "short" })} ${String(date.getFullYear()).slice(-2)}` || "some time ago";
    }
    if (d.suspended && d.suspendedUntil > Timestamp.now()) {
      document.getElementById("user1-suspended").classList.remove("hidden");
    } else {
      document.getElementById("user1-suspended").classList.add("hidden");
    }
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

        const { d } = await getUserData(uid);

        fillHoverCard(d);
        positionHoverCard(el, hoverCard);
        hoverCard.classList.remove("hidden");
      }, 400);
    }
    const el2 = e.target.closest(".viewbtn");
    if (el2) {
      hoverTimeout = setTimeout(async () => {
        fillHoverCard1("Views", "Times this post was opened.");
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
  document.getElementById("hover-bio").textContent = desc;
  document.getElementById("hover-followers").textContent = "";
  document.getElementById("hover-following").textContent = "";
  document.getElementById("hover-joined").textContent = "";
  document.querySelector(".hover-meta").style.display = "none";
  document.getElementById("user1-suspended").classList.add("hidden");
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
  }
  requestAnimationFrame(observeCommunityID);
}

export function updatePostZIndex() {
  const post = document.getElementById("post");
  if (!post) return;

  if (window.communityID == null && window.innerWidth < 700) {
    post.style.zIndex = "2";
  } else if (window.communityID != null && window.isJoined) {
    post.style.zIndex = "7";
  } else {
    post.style.zIndex = "2";
  }
}

export function updateCbDisplay() {
  const cb = document.getElementById("communityActiveCheckbox");
  const cd = document.getElementById("communityActiveCheckbox1");
  if (!cb) return;
  if (!cd) return;

  if (window.communityID != null && window.isOnPrivate === false && window.isJoined) {
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

    const target = tab.dataset.target;
    const targetEl = document.getElementById(target);
    targetEl.classList.remove("hidden");

    if (target === "following1" && !followingLoadedOnce) {
      await loadFollowingTweets(true);
      followingLoadedOnce = true;
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
    const overlay = el.closest(".overlay");
    const counter = overlay?.querySelector(".char-counter");
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

        if (data.private === true && !(data.members || []).includes(auth.currentUser.uid)) {
          loading.classList.remove("show");
          info("x", "No access", "This is a private community and you don't have permission to view this community.");
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
        const communityId = communityReplyMatch[1];
        const tweetId = communityReplyMatch[2];
        const commentId = communityReplyMatch[3];
        loading.classList.add("show");

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
        const tweetRef = doc(db, "communities", communityId, "posts", tweetId);

        const snap = await getDoc(commentRef);

        if (snap.exists()) {
          loading.classList.remove("show");
          const commentData = { id: snap.id, ...snap.data() };
          const tweetviewer = document.getElementById("tweetViewer");
          if (tweetviewer && !document.querySelector(`#appendTweet #tweet-${tweetId}`)) {
            await tweetviewer.classList.add("hidden");
          }
          renderCommentViewer(commentData, commentId, tweetId, box, communityId, true);
          loadComments(tweetId, true, commentId, replyList, communityId);
          openCommunity(communityId);
          document.body.classList.add("no-scroll");
        } else {
          box.innerHTML = `
          <div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No reply found</h2><p style="color:grey;margin:7px 0;">seems like this reply have been deleted or you don't have permission to view it.</p></div></div>`;
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
          <div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynt found</h2><p style="color:grey;margin:7px 0;">seems like this reply have been deleted or you don't have permission to view it.</p></div></div>`;
          return;
        }

        loading.classList.remove("show");
        const tweetData = tweetSnap.data();
        renderTweetViewer(tweetData, tweetId, box, auth.currentUser, communityId, true);
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
          <div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynt found</h2><p style="color:grey;margin:7px 0;">seems like this wynt have been deleted or you don't have permission to view it.</p></div></div>`;
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
          const tweetviewer = document.getElementById("tweetViewer");
          if (tweetviewer && !document.querySelector(`#appendTweet #tweet-${tweetId}`)) {
            await tweetviewer.classList.add("hidden");
          }
          renderCommentViewer(commentData, commentId, tweetId, box);
          loadComments(tweetId, true, commentId, replyList);
          document.body.classList.add("no-scroll");
        } else {
          box.innerHTML = `
          <div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No reply found</h2><p style="color:grey;margin:7px 0;">seems like this reply have been deleted or you don't have permission to view it.</p></div></div>`;
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

function setupPollToggle(inputId) {
  const poll = document.getElementById(inputId);
  const label = document.querySelector(`label[for='${inputId}']`);

  if (!poll || !label) return;

  const renderIcon = () => {
    label.innerHTML = `
      <svg fill="${poll.checked ? '#04aa63' : 'var(--color)'}"
           width="24px"
           height="24px"
           viewBox="0 0 24 24"
           xmlns="http://www.w3.org/2000/svg">
        <path d="M7 11h7v2H7zm0-4h10.97v2H7zm0 8h13v2H7zM4 4h2v16H4z"></path>
      </svg>
    `;
  };

  poll.addEventListener("click", renderIcon);
  renderIcon();
}

setupPollToggle("includePoll");
setupPollToggle("includePollComment");
setupPollToggle("includePollRetweet");

document.getElementById("tweetOptions").addEventListener("click", () => {
  document.getElementById("tweetOption").classList.remove("hidden");
  document.getElementById("permissionOnEdit").classList.remove("hidden");
  document.getElementById("settings-save").classList.add("hidden");
});

document.getElementById("retweetOptions").addEventListener("click", () => {
  document.getElementById("retweetOption").classList.remove("hidden");
});

document.getElementById("commentOptions").addEventListener("click", () => {
  document.getElementById("commentOption").classList.remove("hidden");
  document.getElementById("permissionOnEdit2").classList.remove("hidden");
  document.getElementById("settings-save1").classList.add("hidden");
});

document.getElementById("replyOptions").addEventListener("click", () => {
  document.getElementById("replyOption").classList.remove("hidden");
});

const everyone = document.getElementById("replyPermissionEveryone");
const mentioned = document.getElementById("replyPermissionMentioned");
const discon = document.getElementById("discon");

discon.addEventListener("change", () => {
  localStorage.setItem("disableConfirmation", discon.checked ? "true" : "false");
});

everyone.addEventListener("change", () => {
  if (everyone.checked === true) {
    mentioned.checked = false;
  }
  if (everyone.checked === false) {
    everyone.checked = true;
    log("red", "one option is required");
  }
});

mentioned.addEventListener("change", () => {
  if (mentioned.checked === true) {
    everyone.checked = false;
  }
  if (mentioned.checked === false) {
    mentioned.checked = true;
    log("red", "one option is required");
  }
});

const everyone1 = document.getElementById("replyPermission1Everyone");
const mentioned1 = document.getElementById("replyPermission1Mentioned");

everyone1.addEventListener("change", () => {
  if (everyone1.checked === true) {
    mentioned1.checked = false;
  }
  if (everyone1.checked === false) {
    everyone1.checked = true;
    log("red", "one option is required");
  }
});

mentioned1.addEventListener("change", () => {
  if (mentioned1.checked === true) {
    everyone1.checked = false;
  }
  if (mentioned1.checked === false) {
    mentioned1.checked = true;
    log("red", "one option is required");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("privateOK").checked = true;
  document.getElementById("rtprivateOK").checked = true;
  document.getElementById("replyPermissionEveryone").checked = true;
  document.getElementById("replyPermission1Everyone").checked = true;
  if (localStorage.getItem("disableConfirmation") === "true") {
    discon.checked = true;
  }
});

export async function showOriginal(text, mentions, title) {
  const parsedText = await parseMentionsToLinks(text, mentions || []);
  document.getElementById("originalEdited").classList.remove("hidden");
  document.getElementById("originalText").innerHTML = parsedText;
  if (title && title != "") document.getElementById("originalTitle").textContent = title;
}