import { auth, db, increment, onAuthStateChanged, collection, query, orderBy, limit, startAfter, where, onSnapshot, runTransaction, doc, setDoc, getDoc, getDocs, updateDoc, serverTimestamp, deleteField, Timestamp, writeBatch } from "./firebase.js";
import { extractMentions } from './mention.js';
import { handleTags } from './tags.js';
import { listenForSystemNotifications, sendPinNotification, sendCommunityPinNotification, sendCommentNotification, sendCommunityCommentNotification, listenForUnreadNotifications, loadNotifications, sendMentionNotification, sendCommunityMentionNotification, sendRetweetNotification, sendCommunityRetweetNotification, sendDonationNotification, sendCommunityDonationNotification,sendReplyMentionNotification, sendCommunityReplyMentionNotification, sendReplyNotification, sendReplyRetweetNotification, sendCommentMentionNotification, sendCommunityCommentMentionNotification, sendTweetWarningNotification, sendCommunityReplyNotification, sendCommunityReplyRetweetNotification, sendCommentWarningNotification, sendCommunityPinNotification1, sendCommunityTweetDeleteNotification, sendHideNotification, sendCommunityReplyDeleteNotification } from './notification.js';
import { supabase } from "./firebase.js";
import { uploadToSupabase, compressImageTo480, downloadFile, makeCollage, getSupabaseVideo, base91ToImageSrc, extractVideoFrame } from "./attachments.js";
import { comment  } from "./nonsense.js"
import { viewTweet } from "./tweetViewer.js";
import { tokenize, formatDate, applyReadMoreLogic, parseMentionsToLinks, escapeHTML, formatNumber, formatTime, info, log, confirmDialog, getDefaultLanguage, detectLanguage, isTranslateEnabled, randomString, formatUTC8, isOlderThanBlankDays, inputDialog, dev } from "./texts.js";
import { updateCommentUI, discord } from "./moderation.js";
import { openBookmarkOverlay } from "./bookmark.js";
import { updateAllCounters, applyLimits, showOriginal } from "./main.js";
import { openCommunity, getCommunityNameById } from "./community.js";
// import { loadFollowingFromCache, saveFollowingToCache, startFollowingListener } from "./followingCache.js";
import { openHighlightOverlay } from "./highlight.js";
import { initViews, incrementViews } from "./view_users.js";
import { viewArchivePerm } from "./viewArchivePerm.js";
import { TWEETS_SKELETON } from "./element.js";

//2541

const loading = document.getElementById("loadingOverlay");

async function initNotifications() {
  if (!("Notification" in window)) return;
  let permission = Notification.permission;
  if (permission !== "granted") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      console.warn("Notification permission request failed.");
    }
  }
}

initNotifications();
const userCache = {};
const userFetches = {};
window.avatarBlobCache = new Map();

export async function getUserData(uid) {
  if (userCache[uid]) return userCache[uid];
  if (userFetches[uid]) return userFetches[uid];
  userFetches[uid] = (async () => {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() : {};
    let IQ = data.IQ || 0;
    if (typeof IQ === "number" && !Number.isInteger(IQ)) {
      IQ = Math.trunc(IQ);
    }
    const avatarURL = base91ToImageSrc(data.photoURL) || "/image/default-avatar.jpg";
    let avatarBlobURL = null;
    let username = "";
    let displayName = "Unknown User";

    const cached = window.avatarBlobCache.get(uid);

    if (data.banned != true) {
      if (cached && cached.originalURL === avatarURL) {
        avatarBlobURL = cached.url;
      } else {
        try {
          const response = await fetch(avatarURL);
          const blob = await response.blob();
          const blobURL = URL.createObjectURL(blob);
          window.avatarBlobCache.set(uid, {
            url: blobURL,
            blob,
            originalURL: avatarURL
          });
          avatarBlobURL = blobURL;
        } catch (e) {
          console.warn("Failed to fetch avatar blob:", e);
          avatarBlobURL = "/image/default-avatar.jpg";
        }
      }
      username = data.username || "";
      displayName = data.displayName || "Unknown User";
    } else if (data.banned === true) {
      avatarBlobURL = "/image/default-avatar.jpg";
      username = "";
      displayName = "Suspended User";
    }

    const userData = {
      displayName,
      username,
      avatar: avatarBlobURL,
      realusername: data.username || "",
      realavatar: data.photoURL,
      realdisplayName: data.displayName,
      realdescription: data.description,
      IQ,
      premium: data.premium || null,
      d: data
    };

    userCache[uid] = userData;
    delete userFetches[uid];
    return userData;
  })();
  return userFetches[uid];
}

let loadingMore = false;
window.currentUserFollowing = new Set();
export let currentUserRole = "user";
async function initMainFeatures() {
  loadTweets(true);
  loadNotifications(true);
  // loadFollowing(user.uid);
  listenForUnreadNotifications();
  listenForSystemNotifications();
}

function shouldRunFeatures(pathname) {
  if (/^\/user\//.test(pathname)) return false;
  if (/^\/community\//.test(pathname)) return false;
  if (/^\/wynt\/[^/]+$/.test(pathname)) return false;
  if (/^\/wynt\/[^/]+\/reply\/[^/]+$/.test(pathname)) return false;
  return true;
}

function monitorUrlChanges() {
  let lastPath = window.location.pathname;
  setInterval(() => {
    const current = window.location.pathname;
    if (current !== lastPath) {
      lastPath = current;
      if (shouldRunFeatures(current)) {
        initMainFeatures();
      }
    }
  }, 500);
}

async function checkBans(user) {
  const { d } = await getUserData(user.uid);
  if (d.banned) {
    const banReason = d.bannedFor || "Violation of Wyntr community guidelines.";
    document.body.classList.add("suspended-body");
    document.body.innerHTML = `
      <div class="suspended-container">
          <div class="suspended-card">
            <h2>Account Suspended</h2>
            <p class="subtitle">This account has been suspended for violating the Wyntr guidelines.</p>
            <div class="reason-box">“${banReason}”</div>
            <a href="/user/login" class="btn-primary" style="color:white">Log out</a>
            <p class="support">If you believe this is a mistake, contact us on <a target="_blank" href="https://discord.gg/9SsDWAjfVV">Discord</a>.</p>
          </div>
        </div>
      `;
    return;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await waitForAuth();
    checkBans(user);
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const data = snap.data();

    const path = window.location.pathname;
    if (shouldRunFeatures(path)) {
      initMainFeatures();
    }
    monitorUrlChanges();

    const avatarEl = document.querySelector(".account-avatar");
    const nameEl = document.querySelector(".account-name");
    const usernameEl = document.querySelector(".account-username");

    let displayName = user.displayName || "Anonymous";
    let photoURL = "/image/default-avatar.jpg";
    let username = user.username || "unknown";

    if (snap.exists()) {
      if (data.premium instanceof Timestamp) {
        const premiumDate = data.premium.toDate();
        const today = new Date();
        
        if (premiumDate < today && !data.hasSeenPremiumEnded) {
          info("i", "Your premium has ended", "But, you still smell like fancy features.");
          updateDoc(ref, {
            hasSeenPremiumEnded: true
          });
        }
      }
      currentUserRole = data.role || "user";
      if (data.role == "admin") log("green", "logged in as admin");
      if (data.displayName) displayName = data.displayName;
      if (data.photoURL) photoURL = data.photoURL;
      if (data.username) username = `@${data.username}`;
    } else {
      currentUserRole = "user";
    }

    if (window.innerWidth > 700) {
      if (snap.exists()) {
        const data = snap.data();
        if (data.displayName) displayName = data.displayName;
        if (data.photoURL) photoURL = data.photoURL;
        if (data.username) username = data.username;
      }
      if (avatarEl) {
        avatarEl.src = base91ToImageSrc(photoURL);
        avatarEl.style.display = "inline";
      }
      if (nameEl) nameEl.textContent = displayName;
      if (usernameEl) usernameEl.textContent = `@${username}`;
    }

    async function generateUnique(fieldValue, field, lower = false) {
      let base = fieldValue || "user";
      base = base.replace(/\s+/g, "");
      base = base.replace(/[^a-zA-Z0-9._-]/g, "");
      if (!base) base = "user";
      if (lower) base = base.toLowerCase();
      if (base.length > 20) base = base.slice(0, 20);
      let candidate = base;
      let suffix = 1;
      while (suffix <= 100) {
        const qSnap = await getDocs(query(
          collection(db, "users"), 
          where(field, "==", candidate)
        ));
        if (qSnap.empty) break;
        candidate = `${base}${suffix}`;
        suffix++;
      }
      return candidate;
    }
    
    if (!snap.exists()) {
      const overlayContainer = document.createElement('div');
      overlayContainer.innerHTML = `
        <div id="loadingO" class="overlay" style="background:var(--dark);z-index:100">
          <div style="display:flex;flex-direction:column;gap:35px;">
            <img height="60" src="/image/loader.svg">Setting up your account
          </div>
        </div>
      `;
      document.body.appendChild(overlayContainer);

      const rawName = user.displayName || "user";
      let finalDisplayName = rawName.slice(0, 15);
      let finalName = finalDisplayName.toLowerCase();
      const finalUsername = await generateUnique(rawName, "username", true);
      await setDoc(ref, {
        displayName: finalDisplayName,
        username: finalUsername,
        name: finalName,
        createdAt: new Date(),
        posts: 0,
        photoURL: "/image/default-avatar.jpg",
        banner: "/image/default-banner.png"
      });
      location.reload();
    } else {
      const updateData = {};
      if (!data.displayName) {
        updateData.displayName = user.displayName || "Anonymous";
        updateData.name = updateData.displayName.toLowerCase();
      }
      if (!data.username) {
        updateData.username = await generateUnique(user.displayName || "user", "username", true);
      }
      if (!data.name && data.displayName) {
        updateData.name = data.displayName.toLowerCase();
      }
      if (!data.createdAt) updateData.createdAt = new Date();
      if (!data.photoURL) updateData.photoURL = "/image/default-avatar.jpg";
      if (!data.banner) updateData.banner = "/image/default-banner.png";
      if (!("posts" in data)) updateData.posts = 0;
      if (Object.keys(updateData).length > 0) {
        await setDoc(ref, updateData, {
          merge: true
        });
      }
    }
    if (snap.exists()) {
      let lastSeen = data.lastSeen ? data.lastSeen.toDate() : null;
      let streak = data.streak || 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      let eligible = false;
      let newStreak = streak;
      if (!lastSeen) {
        log("green", "welcome to Wyntr.")
      }
      const lastSeenDay = new Date(lastSeen);
      lastSeenDay.setHours(0, 0, 0, 0);
      if (lastSeenDay.getTime() === yesterday.getTime()) {
        eligible = true;
        newStreak = streak + 1;
      } else if (lastSeenDay.getTime() < yesterday.getTime()) {
        eligible = true;
        newStreak = 1;
      } else if (lastSeenDay.getTime() === today.getTime()) {
        eligible = false;
      }
      const prizeBtn = document.getElementById("prize");
      const prizeBtn1 = document.getElementById("prizebox1");
      const unclaimed = document.getElementById("unclaimed");
      if (prizeBtn1) {
        if (eligible) {
          if (window.innerWidth > 700) {
            document.getElementById("prizebox").style.display = "block";
            prizeBtn1.style.display = "none";
            unclaimed.style.opacity = "0";
          } else {
            prizeBtn1.style.display = "block";
            unclaimed.style.opacity = "1";
            document.getElementById("prizebox").style.display = "none";
          }
          prizeBtn.onclick = async () => {
            prizeBtn.disabled = true;
            prizeBtn.classList.add("disabled");
            document.querySelector("#prizebox button").disabled = true;
            document.querySelector("#prizebox button").classList.add("disabled");
            if (!snap.exists()) return log("red", "Couldn't find your user data");
            const freshSnap = await getDoc(ref)
            const freshData = freshSnap.data();
            const lastSeenServer = freshData.lastSeen ? freshData.lastSeen.toDate() : null;
            const lastSeenDay = lastSeenServer ? new Date(lastSeenServer).setHours(0, 0, 0, 0) : 0;
            const todayStart = new Date().setHours(0, 0, 0, 0);
            if (lastSeenDay === todayStart) {
              log("red", "You already claimed your daily reward today")
              prizeBtn1.style.display = "none";
              unclaimed.style.opacity = "0";
              document.getElementById("prizebox").style.display = "none";
              return;
            }
            const reward = Math.min(10 + (newStreak - 1) * 1, 15);
            await updateDoc(ref, {
              balance: increment(reward),
              lastSeen: new Date(todayStart),
              streak: newStreak,
            });
            log("green", `you claimed ${reward}!`)
            prizeBtn1.style.display = "none";
            unclaimed.style.opacity = "0";
            document.getElementById("prizebox").style.display = "none";
          };
        } else {
          prizeBtn1.style.display = "none";
          unclaimed.style.opacity = "0";
          document.getElementById("prizebox").style.display = "none";
        }
      }
    }
  } else {
    window.location.href = "/user/login";
  }
});

window.addEventListener("appinstalled", async () => {
  const user = auth.currentUser;
  if (!user) return;
  const userRef = doc(db, "users", user.uid);
  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) return;
      const data = userSnap.data();

      if (!data.hasInstalled) {
        transaction.update(userRef, {
          hasInstalled: true,
          balance: increment(100),
        });
        info("check", "yay!", "Thanks for installing Wyntr! You've received 100 Wcoins");
      }
    });
  } catch (err) {
    console.error("Failed to process install reward:", err);
    log("red", "failed to process install reward");
  }
});

document.getElementById("post").addEventListener("click", async () => {
  document.getElementById('tweetOverlay').classList.remove('hidden');
  document.getElementById("commentViewer").classList.add("hidden");
  const {avatar: myAvatar2} = await getUserData(auth.currentUser.uid);
  document.getElementById('tweetAvatar').src = myAvatar2;
  dev("");
});

document.getElementById("postBtn").addEventListener("click", async () => {
  const btn = document.getElementById("postBtn");
  btn.disabled = true;
  btn.classList.add('disabled');

  function reset() {
    btn.disabled = false;
    btn.classList.remove("disabled");
  }

  const user = auth.currentUser;
  if (!user) {
    reset();
    log("red", "user is not logged in");
    return;
  }

  const userRef = doc(db, "users", user.uid);

  dev("reading auth");
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const data = userSnap.data();

    if (data.suspended === true && data.suspendedUntil > Timestamp.now()) {
      info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
      reset();
      return;
    }

    if (data.cooldown?.toDate) {
      const now = new Date();
      const cooldownTime = data.cooldown.toDate();
      if (now < cooldownTime) {
        const diffMs = cooldownTime - now;
        const diffMins = Math.ceil(diffMs / 60000);
        log("red", `Cooldown resets in ${diffMins} minute${diffMins> 1 ? 's' : ''}`);
        reset();
        return;
      }
    }
  }

  const text = document.getElementById("tweetInput").value.trim();

  dev("detecting language");
  const detectedLanguage = await detectLanguage(text);
  const title = document.getElementById("tweetTitle").value.trim().slice(0, 100) || null;
  const fileInput = document.getElementById("mediaInput");
  const files = Array.from(fileInput.files);

  if (text.length < 10) {
    log("red", "Text must be at least 10 characters long");
    reset();
    return;
  }

  let poll = null;
  if (document.getElementById("includePoll").checked) {
    const options = Array.from(document.querySelectorAll("#pollOptions .poll-option")).map(inp => inp.value.trim().slice(0, 50)).filter(Boolean);

    if (options.length >= 2) {
      const duration = document.getElementById("pollDuration")?.value || "8h";
      let expiresAt = null;
      const now = new Date();

      if (duration === "8h") now.setHours(now.getHours() + 8);
      if (duration === "24h") now.setDate(now.getDate() + 1);
      if (duration === "3d") now.setDate(now.getDate() + 3);
      if (duration === "1w") now.setDate(now.getDate() + 7);
      if (duration === "3w") now.setDate(now.getDate() + 21);

      expiresAt = now;
      poll = {
        options,
        votes: Array(options.length).fill(0),
        duration,
        expiresAt
      };
    }
  }

  let mediaURL = "";
  let mediaType = "";
  let mediaPath = "";

  try {
    if (files.length > 0) {
      const videos = files.filter(f => f && f.type && f.type.startsWith("video/"));
      const images = files.filter(f => f && f.type && f.type.startsWith("image/"));

      if (videos.length > 1) {
        log("red", "videos can't be inserted more than one");
        reset();
        return;
      }
      if (images.length > 4) {
        log("red", "maximum image inserted is 4");
        reset();
        return;
      }

      const data = userSnap.data();
      const premiumExpiry = data.premium ? data.premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;
      const maxSize = isPremium ? 5.5 * 1024 * 1024 : 3.5 * 1024 * 1024;

      if (videos.length === 1) {
        const file = videos[0];
        if (file.size > maxSize) {
          log("red", `Video exceeds ${(maxSize / (1024*1024)).toFixed(1)} MB`)
          reset();
          return;
        }

        dev("uploading video");
        const upload = await uploadToSupabase(file, user.uid, isPremium);
        mediaURL = upload.url;
        mediaType = "video";
        mediaPath = upload.path || "";
      } else if (images.length > 0) {
        let encodedBase91;

        if (images.length > 1) {
          const collage = await makeCollage(images);
          encodedBase91 = await compressImageTo480(collage);
        } else {
          encodedBase91 = await compressImageTo480(images[0]);
        }

        mediaURL = encodedBase91;
        mediaType = "image";
        mediaPath = "";
      }
    }

    const mentions = await extractMentions(text);

    let mentioned = null;
    if (!window.communityID) {
      mentioned = Object.values(mentions).filter(Boolean);
    }

    const searchTokens = tokenize(text);

    const mentionedSearchTokens = [];

    if (mentioned) {
      for (const uid of mentioned) {
        for (const token of searchTokens) {
          mentionedSearchTokens.push(`${uid}_${token}`);
        }
      }
    }

    let permission = "everyone";
    if (document.getElementById("replyPermissionMentioned").checked === true) {
      permission = "mentioned";
    }
    const editUntil = new Date(Date.now() + 15 * 60 * 1000);

    let tweetRef;

    const noPrivateReply = !document.getElementById("privateOK").checked;
    const shareToFollowers = document.getElementById("shareToFollowers").checked;
    const muteNotif = document.getElementById("mute").checked;
    const sensitiveMedia = document.getElementById("sensitive").checked;
    
    let tags = [];

    try {
      if (!window.communityID) {
        tags = await handleTags(text.toLowerCase());
      }

      const baseData = {
        archived: false,
        mentioned,
        text,
        originalText: text,
        originalTitle: title,
        title,
        media: mediaURL,
        mediaType,
        mediaPath,
        createdAt: new Date(),
        language: detectedLanguage,
        uid: user.uid,
        replyPermission: permission,
        poll,
        tags,
        mentions,
        likeCount: 0,
        commentCount: 0,
        viewsCount: 0,
        editUntil,
        searchTokens,
        noPrivateReply,
        mentionedSearchTokens,
        muteNotif,
        sensitiveMedia
      };

      dev("running a transaction");
      await runTransaction(db, async (tx) => {
        if (window.communityID) {
          const communityPostRef = doc(
            collection(db, "communities", window.communityID, "posts")
          );

          tx.set(communityPostRef, {
            ...baseData,
            communityId: window.communityID
          });
          tx.update(doc(db, "communities", window.communityID), {
            posts: increment(1),
            lastActivity: serverTimestamp()
          });
          tx.update(doc(db, "communities", window.communityID, "members", auth.currentUser.uid), {
            contributions: increment(3)
          });
          tweetRef = communityPostRef;

          if (shareToFollowers) {
            const publicTweetRef = doc(collection(db, "tweets"));
            tx.set(publicTweetRef, {
              ...baseData,
              retweetCount: 0,
              communityId: window.communityID,
              sharedFromCommunity: window.communityID,
              connectedWynt: null
            });
            tx.update(communityPostRef, {
              connectedWynt: publicTweetRef.id,
              postedInPublic: false
            });
            tx.update(publicTweetRef, {
              connectedWynt: communityPostRef.id,
              postedInPublic: true
            });
          }
        } else {
          const publicTweetRef = doc(collection(db, "tweets"));
          tx.set(publicTweetRef, {
            ...baseData,
            retweetCount: 0
          });
          tweetRef = publicTweetRef;
        }
      });

      let communitySnap;
      if (window.communityID) {
        dev("reading community");
        communitySnap = await getDoc(doc(db, "communities", window.communityID));
      }
      const communityName = communitySnap?.exists() ?
        communitySnap.data().name : null;

      await Promise.all(
        Object.values(mentions).filter(Boolean).map(async (uid) => {
          if (!window.communityID) {
            if (mediaType === "image") {
              sendMentionNotification(tweetRef.id, uid, text, mediaURL);
            } else {
              sendMentionNotification(tweetRef.id, uid, text);
            }
          }

          if (window.communityID && window.isOnPrivate === false) {
            if (mediaType === "image") {
              sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, text, mediaURL);
            } else {
              sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, text);
            }
            return;
          }

          if (window.isOnPrivate && window.communityID != null) {
            if (communitySnap.exists()) {
              if (communitySnap.data().members.includes(uid)) {
                if (mediaType === "image") {
                  sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, text, mediaURL);
                } else {
                  sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, text);
                }
              } else {
                info(
                  "x",
                  "insufficient permission",
                  "user is not notified due to this is a private community and the user doesn't have permission to view it."
                );
              }
            }
            return;
          }
        })
      );

      const data = userSnap.data();
      const premiumExpiry = data.premium ? data.premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;
      let cooldownDuration = isPremium ? 1 * 60 * 1000 : 5 * 60 * 1000;

      dev("updating documents");
      await runTransaction(db, async (tx) => {
        if ((window.communityID && shareToFollowers) || !window.communityID) {
          tx.update(userRef, {
            posts: increment(1),
            lastActivity: serverTimestamp()
          });
          tx.update(userRef, {
            cooldown: Timestamp.fromDate(new Date(Date.now() + cooldownDuration))
          });
        }
      });

      document.getElementById("tweetInput").value = "";
      document.getElementById("tweetTitle").value = "";
      document.getElementById("mediaInput").value = "";
      document.getElementById("tweetPreview").innerHTML = "";
      document.getElementById("privateOK").checked = true;
      document.getElementById("replyPermissionEveryone").checked = true;
      document.getElementById("replyPermissionMentioned").checked = false;
      document.getElementById("mute").checked = false;
      document.getElementById("sensitive").checked = false;
      log("green", "Wynt posted");
      dev("");
    } catch (error) {
      console.error("Tweet failed:", error);
      info("x", "Wynt failed:", error)
    }
  } catch (error) {
    console.error("Tweet failed:", error);
    info("x", "Wynt failed:", error)
  }
  reset();
  document.getElementById('tweetOverlay').classList.add('hidden');
  document.querySelectorAll(".poll-option").forEach(inp => {
    inp.value = "";
  });
  document.getElementById("includePoll").checked = false;
  document.getElementById("pollOptions").classList.add("hidden");
  document.getElementById("tweetInput").style.height = "auto";
  document.getElementById("shareToFollowers").checked = false;
  if (window.communityID) {
    openCommunity(window.communityID);
  }
});

export function renderPoll1(t, tweetId, commentid, myVoteIndex) { 
  const totalVotes = (t.poll.votes || []).reduce((a, b) => a + b, 0);
  let expiryText = "";
  const now = new Date();
  const end = t.poll.expiresAt?.toDate ? t.poll.expiresAt.toDate() : new Date(t.poll.expiresAt);
  const diff = end - now;
  if (diff <= 0) {
    expiryText = "final votes";
  } else {
    const mins = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) expiryText = `${days} day${days > 1 ? "s" : ""} left`;
    else if (hours > 0) expiryText = `${hours} hour${hours > 1 ? "s" : ""} left`;
    else expiryText = `${mins} min${mins > 1 ? "s" : ""} left`;
  }
  return `
  <div class="poll poll1" id="poll-${tweetId}-${commentid}">
    ${t.poll.options.map((opt, i) => {
      const count = t.poll.votes?.[i] || 0;
      const percent = totalVotes > 0
        ? Math.round((count / totalVotes) * 100)
        : 0;
      const isMine = myVoteIndex === i;

      return `
      <div class="vote-btn1 ${isMine ? "selected" : ""}"
           data-id="${tweetId}"
           data-commentid="${commentid}"
           data-index="${i}">

        ${myVoteIndex !== null || diff <= 0 ? `
          <div class="bar" style="width:${percent}%;"></div>
        ` : ``}

        <div class="content">
          <span class="opt-text">${opt}</span>

          ${myVoteIndex !== null || diff <= 0 ? `
            <span class="percent">${percent}%</span>
          ` : ``}
        </div>
      </div>
      `;
    }).join("")}

    <div style="color:grey;display:flex;align-items:center;gap:5px;margin-top:5px;">
      <span style="font-size:14px;margin:0;" class="poll-submits">
        ${totalVotes} submits
      </span>
      <span style="font-size:14px;" class="poll-expiry">• ${expiryText}</span>
    </div>
  </div>
  `;
}

function renderPoll(t, tweetId, myVoteIndex) {
  const totalVotes = (t.poll.votes || []).reduce((a, b) => a + b, 0);
  let expiryText = "";
  const now = new Date();
  const end = t.poll.expiresAt?.toDate ? t.poll.expiresAt.toDate() : new Date(t.poll.expiresAt);
  const diff = end - now;
  if (diff <= 0) {
    expiryText = "final votes";
  } else {
    const mins = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) expiryText = `${days} day${days > 1 ? "s" : ""} left`;
    else if (hours > 0) expiryText = `${hours} hour${hours > 1 ? "s" : ""} left`;
    else expiryText = `${mins} min${mins > 1 ? "s" : ""} left`;
  }
  return `
  <div class="poll" id="poll-${tweetId}">
    ${t.poll.options.map((opt, i) => {
      const count = t.poll.votes?.[i] || 0;
      const percent = totalVotes > 0
        ? Math.round((count / totalVotes) * 100)
        : 0;
      const isMine = myVoteIndex === i;

      return `
      <div class="vote-btn ${isMine ? "selected" : ""}"
           data-id="${tweetId}"
           data-index="${i}">

        ${myVoteIndex !== null || diff <= 0 ? `
          <div class="bar" style="width:${percent}%;"></div>
        ` : ``}

        <div class="content">
          <span class="opt-text">${opt}</span>

          ${myVoteIndex !== null || diff <= 0 ? `
            <span class="percent">${percent}%</span>
          ` : ``}
        </div>
      </div>
      `;
    }).join("")}

    <div style="color:grey;display:flex;align-items:center;gap:5px;margin-top:5px;">
      <span style="font-size:14px;margin:0;" class="poll-submits">
        ${totalVotes} submits
      </span>
      <span style="font-size:14px;" class="poll-expiry">• ${expiryText}</span>
    </div>
  </div>
  `;
}

// function to check if the user liked that post and update the container UI
export async function getSnap(path, container) {
  const ref = doc(db, ...path.split("/"));
  const snap = await getDoc(ref);

  if (snap.exists() && container) {
    container.innerHTML = `<img loading="lazy" src="/image/filled-heart.svg">`;
  }
  return snap;
}

async function renderTweet(t, tweetId, user, action = "prepend", container = document.getElementById("timeline"), communityId = null, isStored = false, isPrivate = false) {
  let editHTML2 = "";

  let tweetDocRef;
  if (window.communityID) {
    tweetDocRef = doc(db, "communities", window.communityID, "posts", tweetId);
  } else if (communityId) {
    tweetDocRef = doc(db, "communities", communityId, "posts", tweetId);
  } else {
    tweetDocRef = doc(db, "tweets", tweetId);
  }

  let path;
  if (window.communityID) {
    path = `communities/${window.communityID}/posts/${tweetId}/likes/${auth.currentUser.uid}`
  } else if (communityId) {
    path = `communities/${communityId}/posts/${tweetId}/likes/${auth.currentUser.uid}`
  } else {
    path = `tweets/${tweetId}/likes/${auth.currentUser.uid}`;
  }

  const likeId = randomString(14);

  const authorUID = t.uid;
  const { displayName, username, avatar, d: data } = await getUserData(authorUID);

  if (t.retweetOf) {
    const retweetDoc = await getDoc(doc(db, "tweets", t.retweetOf));
    if (retweetDoc.exists()) {
      const rt = retweetDoc.data();
      const rDate = rt.createdAt;
      try {
        const rtUserDoc = await getDoc(doc(db, "users", rt.uid));
        if (rtUserDoc.exists()) {
          const {
            displayName: rtDisplayName,
            username: rtUsername,
            avatar: rtAvatar,
          } = await getUserData(rt.uid);
        }
      } catch (err) {
        console.warn("Failed to fetch retweet user profile:", err);
      }
    }
  }

  const likeCount = t.likeCount || 0;
  const viewCount = t.viewsCount || 0;
  const commentCount = t.commentCount || 0;
  const retweetCount = t.retweetCount || 0;

  const dateStr = formatDate(t.createdAt);
  let mediaHTML = "";
  const containsSpoiler = t.sensitiveMedia === true;

  let vidId = null;
  let vidRtId = null;

  if (t.media && t.mediaType === "image") {
    const src = base91ToImageSrc(t.media);
    if (containsSpoiler) {
      mediaHTML = `
        <div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
          <div class="spoiler-overlay">
            <div class="spoilertxt">sensitive</div>
          </div>
          <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
        </div>`;
    } else {
      mediaHTML = `
        <div class="attachment">
          <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
        </div>`;
    }
  } else if (t.media && t.mediaType === "video") {
    if (containsSpoiler) {
      vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      mediaHTML = `
        <div class="attachment spoiler-media" onclick="
          getSupabaseVideo('${t.media}', '${vidId}');
          this.classList.add('revealed');
        ">
          <div class="spoiler-overlay">
            <div class="spoilertxt">sensitive</div>
          </div>
          <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
            Your browser does not support the video tag.
          </video>
        </div>`;
    } else {
      vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      mediaHTML = `
        <div class="attachment">
          <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
            Your browser does not support the video tag.
          </video>
        </div>`;
      if (!document.getElementById(vidId)) getSupabaseVideo(t.media, vidId);
    }
  }

  let retweetHTML = "";
  let quotedHTML = "";
  let likeId1 = "";
  let likeRef;
  let comment;

  let translateHTML5 = "";
  let translateHTML6 = "";
  let translateHTML = "";

  if (t.retweetOfComment) {
    const { tweetId: parentId, commentId } = t.retweetOfComment;

    let commentRef;
    if (t.sharedFromCommunity) {
      commentRef = doc(db, "communities", t.sharedFromCommunity, "posts", parentId, "comments", commentId);
      likeRef = `communities/${t.sharedFromCommunity}/posts/${parentId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    } else if (t.communityId) {
      commentRef = doc(db, "communities", t.communityId, "posts", parentId, "comments", commentId);
      likeRef = `communities/${t.communityId}/posts/${parentId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    } else {
      commentRef = doc(db, "tweets", parentId, "comments", commentId);
      likeRef = `tweets/${parentId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    }

    const commentSnap = await getDoc(commentRef);
    if (commentSnap.exists()) {
      comment = commentSnap.data();
      const commentLikeCount = comment.likeCount;

      likeId1 = randomString(14);

      let parsedCommentText;
      if (t.retweettext) {
        parsedCommentText = await parseMentionsToLinks(t.retweettext || "", comment.mentions || {});
      } else {
        parsedCommentText = await parseMentionsToLinks(comment.text || "", comment.mentions || {});
      }

      const hasImage = comment.media && comment.mediaType === "image";
      const hasVideo = comment.media && comment.mediaType === "video";

      let hasText;
      if (t.retweettext) {
        hasText = t.retweettext?.trim()?.length > 0;
      } else {
        hasText = comment.text?.trim()?.length > 0;
      }

      const { displayName, username, avatar, d } = await getUserData(comment.uid);

      if (comment.edited && comment.editAfterComment) {
        editHTML2 = `
        <img src="/image/editicon.svg" class="editedat editedatt" title="edited at ${formatTime(comment.edited)}. click me>`;
      }
      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();
      if (comment.language && comment.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML5 = `
          <div class="translate-wrapper tr1" style="margin-top:-10px;margin-bottom:10px;">
            <span
              class="translate-btn"
              data-id="${commentId}"
              data-random="${random}"
              data-from="${comment.language}"
              data-to="${defaultLanguage}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;"
            >
              Translate from ${comment.language}
            </span>
            <div
              id="translated-${commentId}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;margin-top:20px;">
            </div>
          </div>
        `;
      }

      let pollHTML = "";
      if (comment.poll && Array.isArray(comment.poll.options)) {
        const uid = auth.currentUser?.uid;
        let myVoteIndex = null;
        if (uid) {
          let voteRef;
          if (window.communityID != null) {
            voteRef = doc(db, "communities", window.communityID, "posts", parentId, "comments", commentId, "votes", uid);
          } else {
            voteRef = doc(db, "tweets", parentId, "comments", commentId, "votes", uid);
          }
          const voteSnap = await getDoc(voteRef);
          if (voteSnap.exists()) {
            myVoteIndex = voteSnap.data().optionIndex;
          }
        }
        pollHTML = renderPoll1(comment, parentId, commentId, myVoteIndex);
      }

      const random = randomString(12);

      const quotedinfo = `
        <div class="flex" style="margin:0;gap:25px;margin-top:10px;">
          ${comment.isHidden ? "" : `
            <span class="comment-like-btn" data-id="${commentId}" data-tweet="${parentId}" style="cursor:pointer;display:flex;align-items:center;gap:3px;">
              <div id="${likeId1}" class="clikeicon" style="height:20px">
                <img loading='lazy' src="/image/heart.svg">
              </div>
              <span style="color:#757779;" id="comment-like-count-${commentId}">${commentLikeCount > 0 ? commentLikeCount : ""}</span>
            </span>
            <span style="cursor:pointer;color:#757779" class="reply-btn" data-id="${commentId}" data-tweet="${parentId}">
              <img loading='lazy' src="/image/message.svg"> ${(comment.replyCount ?? 0) > 0 ? comment.replyCount : ""}
            </span>
            <span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${parentId}" data-comment-id="${commentId}">
              <img loading='lazy' src="/image/rewint.svg"> ${(comment.retweetCount ?? 0) > 0 ? comment.retweetCount : ""}
            </span>
            <span style="cursor:pointer;color:#757779;margin-left:auto;" class="view-btn">
              <img loading='lazy' src="/image/chart.svg"> ${(comment.viewsCount ?? 0) > 0 ? comment.viewsCount : ""}
            </span>
          `}
        </div>
      `;

      if (d.banned === true && currentUserRole != "admin") {
        quotedHTML = `
          <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}"  data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
              <img loading='lazy' class="avatar" src="/image/default-avatar.jpg" width="30">
              <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">Suspended user</strong>
              <span style="color:grey;font-size:12px;">
              ${formatDate(comment.createdAt)}
              </span>
            </div>
            <div class="quoted-body">
            <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;color:grey">This Reply is from a suspended user</p>
            </div>
          </div>`;
      } else {
        if (hasImage && hasText) {
          const containsSpoiler = comment.sensitiveMedia === true;
          const src = base91ToImageSrc(comment.media.url);
          const content = `
              <div class=post-body style="margin: 0;margin-bottom:10px;">${parsedCommentText}</div> 
              ${translateHTML5}
              ${containsSpoiler ?
                `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                  <div class="spoiler-overlay">
                    <div class="spoilertxt">sensitive</div>
                  </div>
                  <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                </div>` :
                `<div class="attachment" style="margin-bottom:5px">
                  <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                </div>`
              }
              ${pollHTML}
          `;

          quotedHTML = `
            <p style="color: grey;font-size: 14px; margin: 0;margin-bottom:10px;">↳  context available</p>
            <div class="quoted-comment retweet" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}" data-comment-id="${commentId}">
              <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
                <img loading='lazy' class="avatar" src="${avatar || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                  `${comment.likedByCreator === true ? 
                    `<img style="margin-right:-3px" src="/image/star.svg">` :
                    `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }`
                }
                <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
                <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> 
                ${formatDate(comment.createdAt)} ${editHTML2}</span>
                <div style="margin-left:auto">
                  <span class="cmenubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${commentId}" data-author="${comment.uid}" data-tweet="${parentId}">
                    <img loading='lazy' src="/image/three-dots.svg">
                  </span>
                </div>
              </div>
              <div class="quoted-body">
              ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
                ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                    </span>
                  </div> 
                </div>
                ` : `
                  ${content}
                `}
                ${quotedinfo}
              </div>
            </div>
          `;
        } else if (hasVideo && hasText) {
          vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          const containsSpoiler = comment.sensitiveMedia === true;
          const content = `
              <div class=post-body style="margin: 0;margin-bottom:10px;">${parsedCommentText}</div> 
              ${translateHTML5} 
              ${containsSpoiler ?
                `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                  <div class="spoiler-overlay">
                    <div class="spoilertxt">sensitive</div>
                  </div>
                  <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px;margin-bottom:10px;">
                    Your browser does not support the video tag.
                  </video>
                  </div>` :
                  `<div class="attachment" style="margin-bottom:5px">
                    <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px;border-radius:15px;margin-bottom:10px;">
                      Your browser does not support the video tag.
                    </video>
                  </div>`
              }
              ${pollHTML}
          `;

          quotedHTML = `
            <p style="color: grey;font-size: 14px; margin: 0;margin-bottom:10px;">↳  context available</p>
            <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}" data-comment-id="${commentId}">
              <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
                <img loading='lazy' class="avatar" src="${avatar || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                  `${comment.likedByCreator === true ? 
                    `<img style="margin-right:-3px" src="/image/star.svg">` :
                    `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }`
                }
                <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
                <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)} ${editHTML2}</span>
                <div style="margin-left:auto;">
                  <span class="cmenubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${commentId}" data-author="${comment.uid}" data-tweet="${parentId}">
                    <img loading='lazy' src="/image/three-dots.svg">
                  </span>
                </div>
              </div>
              <div class="quoted-body">
              ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
                ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                    </span>
                  </div> 
                </div>` : `
                ${content} 
                `}
                ${quotedinfo}
              </div>
            </div>
          `;
          getSupabaseVideo(comment.media.url, vidId);
        } else if (hasImage) {
          const src = base91ToImageSrc(comment.media.url);
          const content = `
            <div class="attachment">
              <img loading="lazy" src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';">
            </div>
            ${pollHTML}
          `;

          quotedHTML = `
            <p style="color: grey;font-size: 14px; margin: 0;margin-bottom:10px;">↳  context available</p>
            <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}" data-comment-id="${commentId}">
              <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
                <img loading='lazy' class="avatar"  src="${avatar || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
                ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                  `${comment.likedByCreator === true ? 
                    `<img style="margin-right:-3px" src="/image/star.svg">` :
                    `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }`
                }
                <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
                <span style="color:grey;font-size:12px;">
                  <span class="usernamee">@${username} •</span> 
                  ${formatDate(comment.createdAt)}
                </span>
                <div style="margin-left:auto">
                  <span class="cmenubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${commentId}" data-author="${comment.uid}" data-tweet="${parentId}">
                    <img loading='lazy' src="/image/three-dots.svg">
                  </span>
                </div>
              </div>
              <div class="quoted-body">
              ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
              ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                    </span>
                  </div> 
              </div>` : `
              ${content}
              `}
              ${quotedinfo}
            </div>
          </div>`;
        } else if (hasVideo) {
          vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          const content = `
            <div class="attachment" style="max-width: 100%; border-radius: 10px; max-height: 300px;">
              <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                Your browser does not support the video tag.
              </video>
            </div>
            ${pollHTML}
          `;

          quotedHTML = `
          <p style="color: grey;font-size: 14px; margin: 0;margin-bottom:10px;">↳  context available</p>
          <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}"  data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
              <img loading='lazy' class="avatar"  src="${avatar || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" : 
                `${comment.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
              </span>
              <div style="margin-left:auto">
                <span class="cmenubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${commentId}" data-author="${comment.uid}" data-tweet="${parentId}">
                  <img loading='lazy' src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
              ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
              ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                    </span>
                  </div> 
              </div>` : `
              ${content}
              `}
              ${quotedinfo}
            </div>
          </div>`;
          getSupabaseVideo(comment.media.url, vidId);
        } else {
          const content = `
              <div class=post-body style="margin: 6px 0px 12px;margin-top:6px;margin-left:3px;">${parsedCommentText}</div> 
              ${translateHTML5} 
          `;

          quotedHTML = `
          <p style="color: grey;font-size: 14px; margin: 0;margin-bottom:10px;">↳  context available</p>
          <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}"  data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
              <img loading='lazy' class="avatar"  src="${avatar || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${comment.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> 
                ${formatDate(comment.createdAt)} ${editHTML2}
              </span>
              <div style="margin-left:auto">
                <span data-community-id="${t.sharedFromCommunity || t.communityId || null}" class="cmenubtn" data-id="${commentId}" data-tweet="${parentId}" data-author="${comment.uid}">
                  <img loading='lazy' src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
              ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
              ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                    </span>
                  </div> 
              </div>` : `
              ${content}     
              `}
              ${quotedinfo}
            </div>
          </div>`;
        }
      }
    } else {
      quotedHTML = `
        <div class="quoted-comment">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
          <img loading='lazy' class="avatar" src="/image/default-avatar.jpg" width="30">
          <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
            <span style="color:grey;font-size:12px;">
              <img loading='lazy' src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
            </span>
          </div>
          <div class="quoted-body">
          <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this Wynt is unavailable</i></p>
          </div>
        </div>`;
    }
  }

  let rtlikepath = "";
  let editHTML1 = "";
  let rtlikeId;
  let rt

  if (t.retweetOf || t.originalId) {
    let retweetDoc = "";
    if (t.originalId) {
      retweetDoc = await getDoc(doc(db, "communities", t.sharedFromCommunity || t.communityId, "posts", t.originalId));
      rtlikepath = `communities/${t.sharedFromCommunity || t.communityId}/posts/${t.originalId}/likes/${auth.currentUser.uid}`;
    } else if (t.retweetOf) {
      retweetDoc = await getDoc(doc(db, "tweets", t.retweetOf));
      rtlikepath = `tweets/${t.retweetOf}/likes/${auth.currentUser.uid}`;
    }

    rtlikeId = randomString(14);

    if (retweetDoc.exists()) {
      rt = retweetDoc.data();
      const rDate = rt.createdAt;

      let hasText;
      if (t.retweettext) {
        hasText = t.retweettext?.trim()?.length > 0;
      } else {
        hasText = rt.text?.trim()?.length > 0;
      }

      const hasImage = rt.media && rt.mediaType === "image";
      const hasVideo = rt.media && rt.mediaType === "video";
      const {displayName: rtDisplayName, username: rtUsername, avatar: rtAvatar, d} = await getUserData(rt.uid);

      let titleHTML1 = "";

      if (rt.edited && rt.editAfterComment) {
        editHTML1 = `<img src="/image/editicon.svg" class="editedat1 editedatt" title="edited at ${formatTime(rt.edited)}. click me">`
      }
      if (rt.title) {
        titleHTML1 = `<p style="margin:0;margin-top:10px;font-size:18px;font-weight:bold;margin-bottom:10px;">${escapeHTML(rt.title)}</p>`
      }

      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();
      if (rt.language && rt.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML6 = `
          <div class="translate-wrapper tr2" style="margin-top:-10px;margin-bottom:10px;">
            <span
              class="translate-btn"
              data-id="${t.retweetOf}"
              data-random="${random}"
              data-from="${rt.language}"
              data-to="${defaultLanguage}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;">
              Translate from ${rt.language}
            </span>
            <div
              id="translated-${t.retweetOf}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;">
            </div>
          </div>
        `;
      }

      let pollHTML2 = "";
      if (rt.poll && Array.isArray(rt.poll.options)) {
        const uid = auth.currentUser?.uid;
        let myVoteIndex = null;
        if (uid) {
          let voteRef;
          if (window.communityID != null) {
            voteRef = doc(db, "communities", window.communityID, "posts", t.retweetOf || t.originalId, "votes", uid);
          } else {
            voteRef = doc(db, "tweets", t.retweetOf || t.originalId, "votes", uid);
          }
          const voteSnap = await getDoc(voteRef);
          if (voteSnap.exists()) {
            myVoteIndex = voteSnap.data().optionIndex;
          }
        }
        pollHTML2 = renderPoll(rt, t.retweetOf || t.originalId, myVoteIndex);
      }

      const retweetinfo = `
        <div class="flex">
          <span style="cursor:pointer;color:#757779" data-community-id="${t.sharedFromCommunity || t.communityId || null}" class="like-btn" id="likeBtn-${t.retweetOf || t.originalId}">
            <div id="${rtlikeId}" class="likeicon" style="height:20px">
              <img loading='lazy' src="/image/heart.svg">
            </div>
            ${rt.likeCount > 0 ? `<span id="likeCount-${t.retweetOf || t.originalId}">${rt.likeCount}</span>` : ""}
          </span>
          <span style="cursor:pointer;color:#757779" class="comment-btn" data-id="${t.retweetOf || t.originalId}">
            <img loading='lazy' src="/image/message.svg"> ${rt.commentCount > 0 ? rt.commentCount : ""}
          </span>
          <span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${t.retweetOf || t.originalId}">
            <img loading='lazy' src="/image/rewint.svg"> ${rt.retweetCount > 0 ? rt.retweetCount : ""}
          </span>
          <div style="margin-left:auto;">
            <span class="viewbtn" style="margin-left:10px;color:#757779"><img loading='lazy' src="/image/chart.svg"> ${rt.viewsCount > 0 ? rt.viewsCount : ""}</span>
          </div>
        </div>
      `

      if (rt.archived && rt.uid != auth.currentUser.uid && !rt.viewPermission?.includes(auth.currentUser.uid) && !rt.allowAnyoneWithLink && currentUserRole != "admin") {
        retweetHTML = `
          <div class="quoted-comment">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
            <img loading='lazy' class="avatar" src="/image/default-avatar.jpg" width="30">
            <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
              <span style="color:grey;font-size:12px;">
                <img loading='lazy' src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
              </span>
            </div>
            <div class="quoted-body">
            <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this Wynt is archived</i></p>
            </div>
          </div>
        `;
      } else {
        if (d.banned === true) {
          retweetHTML = `
            <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || null}">
              <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
                <img loading='lazy' class="avatar" src="/image/default-avatar.jpg" width="30">
                <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">Suspended user</strong>
                <span style="color:grey;font-size:12px;">
                ${formatDate(rt.createdAt)}
                </span>
              </div>
              <div class="quoted-body">
              <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;color:grey">This Wynt is from a user suspended for: ${d.bannedFor || "no reason stated"}</p>
              </div>
            </div>
          `;
        } else {
          if (hasImage && hasText) {
            let parsedText;
            if (t.retweettext) {
              parsedText = await parseMentionsToLinks(t.retweettext, rt.mentions || {});
            } else {
              parsedText = await parseMentionsToLinks(rt.text, rt.mentions || {});
            }

            const rtsrc = base91ToImageSrc(rt.media);
            const rtcontainsSpoiler = rt.sensitiveMedia === true;

            retweetHTML = `
              ${rt.retweetOf || rt.originalId || rt.retweetOfComment ? `<p style="
                color: grey;
                font-size: 14px;
                margin: 0;
                margin-bottom:10px;
                ">↳  context available</p>` : 
              ""}
              <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || null}">
                <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
                  <img loading='lazy' class="avatar" src="${rtAvatar || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                  ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                    `${(rt.mentions && Object.values(rt.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }
                  <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
                  <span style="color:grey;font-size:12px;"> <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} ${editHTML1}</span>
                  <div style="margin-left:auto">
                    <span class="menubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                      <img loading='lazy' src="/image/three-dots.svg">
                    </span>
                  </div>
                </div>
                <div class="quoted-body">
                  ${titleHTML1}
                    <div class=post-body style="margin: 0;margin-bottom:10px;">${parsedText}</div> 
                    ${translateHTML6} 
                    ${pollHTML2}
                    ${rtcontainsSpoiler ?
                      `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                        <div class="spoiler-overlay">
                          <div class="spoilertxt">sensitive</div>
                        </div>
                        <img loading='lazy' src="${rtsrc}" data-src="${rtsrc}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                      </div>` :
                      `<div class="attachment" style="margin-bottom:5px">
                        <img loading='lazy' src="${rtsrc}" data-src="${rtsrc}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                      </div>`
                    }
                  ${retweetinfo}
                </div>
              </div>
            `;
          } else if (hasVideo && hasText) {
            let parsedText;
            if (t.retweettext) {
              parsedText = await parseMentionsToLinks(t.retweettext, rt.mentions || {});
            } else {
              parsedText = await parseMentionsToLinks(rt.text, rt.mentions || {});
            }

            vidRtId = rt.id ? `vid-${rt.id}` : `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
            const rtcontainsSpoiler = rt.sensitiveMedia === true;

            retweetHTML = `
              ${rt.retweetOf || rt.originalId || rt.retweetOfComment ? `<p style="
                color: grey;
                font-size: 14px;
                margin: 0;
                margin-bottom: 10px;
                ">↳  context available</p>` : 
              ""}

              <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || null}">
                <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
                  <img loading='lazy' class="avatar" src="${rtAvatar || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                  ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                    `${(rt.mentions && Object.values(rt.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }
                  <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
                  <span style="color:grey;font-size:12px;"> <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} ${editHTML1}</span>
                  <div style="margin-left:auto">
                    <span class="menubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                      <img loading='lazy' src="/image/three-dots.svg">
                    </span>
                  </div>
                </div>
            
                <div class="quoted-body">
                  ${titleHTML1}
                    <div class=post-body style="margin: 0;margin-bottom:10px;">${parsedText}</div> 
                    ${translateHTML6} 
                    ${pollHTML2}
                    ${rtcontainsSpoiler ?
                      `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                        <div class="spoiler-overlay">
                          <div class="spoilertxt">sensitive</div>
                        </div>
                        <video id="${vidRtId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                          Your browser does not support the video tag.
                        </video>
                      </div>` :
                      `<div class="attachment" style="margin-bottom:5px">
                        <video id="${vidRtId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                          Your browser does not support the video tag.
                        </video>
                      </div>`
                    }
                  <div class="flex">
                    <span style="cursor:pointer;color:#757779" data-community-id="${t.sharedFromCommunity || t.communityId || null}" class="like-btn" id="likeBtn-${t.retweetOf || t.originalId}">
                      <div id="${rtlikeId}" class="likeicon" style="height:20px">
                        <img loading='lazy' src="/image/heart.svg">
                      </div>
                      ${rt.likeCount > 0 ? `<span id="likeCount-${t.retweetOf || t.originalId}">${rt.likeCount}</span>` : ""}
                    </span>
                    <span style="cursor:pointer;color:#757779" class="comment-btn" data-id="${t.retweetOf || t.originalId}">
                      <img loading='lazy' src="/image/message.svg"> ${rt.commentCount > 0 ? rt.commentCount : ""}
                    </span>
                    <span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${t.retweetOf || t.originalId}">
                      <img loading='lazy' src="/image/rewint.svg"> ${rt.retweetCount > 0 ? rt.retweetCount : ""}
                    </span>
                    <div style="margin-left:auto;">
                      <span class="viewbtn" style="margin-left:10px;color:#757779"><img loading='lazy' src="/image/chart.svg"> ${rt.viewsCount > 0 ? rt.viewsCount : ""}</span>
                    </div>
                  </div>
                </div>
              </div>   
            `;
            getSupabaseVideo(rt.media, vidRtId);
          } else {
          let parsedText;
          if (t.retweettext) {
            parsedText = await parseMentionsToLinks(t.retweettext, rt.mentions || {});
          } else {
            parsedText = await parseMentionsToLinks(rt.text, rt.mentions || {});
          }

          retweetHTML = `
            ${rt.retweetOf || rt.originalId || rt.retweetOfComment ? `<p style="
              color: grey;
              font-size: 14px;
              margin: 0;
              margin-bottom:10px;
              ">↳  context available</p>` : 
            ""}

            <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || null}">
              <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
                <img loading='lazy' class="avatar" src="${rtAvatar || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                  `${(rt.mentions && Object.values(rt.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }
                <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
                <span style="color:grey;font-size:12px;"> <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} ${editHTML1}</span>
                <div style="margin-left:auto">
                  <span class="menubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                    <img loading='lazy' src="/image/three-dots.svg">
                  </span>
                </div>
              </div>
              <div class="quoted-body">
                ${titleHTML1}
                <div class=post-body style="margin: 0;margin-bottom:10px;">${parsedText}</div> 
                ${translateHTML6} 
                ${pollHTML2}    
                <div class="flex">
                  <span style="cursor:pointer;color:#757779" data-community-id="${t.sharedFromCommunity || t.communityId || null}" class="like-btn" id="likeBtn-${t.retweetOf || t.originalId}">
                    <div id="${rtlikeId}" class="likeicon" style="height:20px">
                      <img loading='lazy' src="/image/heart.svg">
                    </div>
                    ${rt.likeCount > 0 ? `<span id="likeCount-${t.retweetOf || t.originalId}">${rt.likeCount}</span>` : ""}
                  </span>
                  <span style="cursor:pointer;color:#757779" class="comment-btn" data-id="${t.retweetOf || t.originalId}">
                    <img loading='lazy' src="/image/message.svg"> ${rt.commentCount > 0 ? rt.commentCount : ""}
                  </span>
                  <span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${t.retweetOf || t.originalId}">
                    <img loading='lazy' src="/image/rewint.svg"> ${rt.retweetCount > 0 ? rt.retweetCount : ""}
                  </span>
                  <div style="margin-left:auto;">
                    <span class="viewbtn" style="margin-left:10px;color:#757779"><img loading='lazy' src="/image/chart.svg"> ${rt.viewsCount > 0 ? rt.viewsCount : ""}</span>
                  </div>
                </div>
              </div>
            </div>
          `;
          }
        }
      }
    } else {
      retweetHTML = `
        <div class="quoted-comment">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;margin-top:0px;">
          <img loading='lazy' class="avatar" src="/image/default-avatar.jpg" width="30">
          <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
            <span style="color:grey;font-size:12px;">
              <img loading='lazy' src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
            </span>
          </div>
          <div class="quoted-body">
          <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this Wynt is unavailable</i></p>
          </div>
        </div>
      `;
    }
    
  }

  const parsedText = await parseMentionsToLinks(t.text, t.mentions || {});
  const defaultLanguage = getDefaultLanguage();
  const isTranslate = isTranslateEnabled();
  if (t.language && t.language !== defaultLanguage && isTranslate) {
    const random = Math.floor(Math.random() * 10000);
    translateHTML = `
      <div class="translate-wrapper tr3" style="margin-bottom:5px;
      ">
        <span
          class="translate-btn"
          data-id="${tweetId}"
          data-from="${t.language}"
          data-to="${defaultLanguage}"
          data-random="${random}"
          data-title="${t.title || null}"
          style="color:#B0C4DE;cursor:pointer;font-size:15px;"
        >
          Translate from ${t.language}
        </span>
        <div
          id="translated-${tweetId}-${random}"
          class="translated-text"
          style="display:none;color:grey;font-size:16px;"
        ></div>
      </div>
    `;
  }

  let communityHTML = "";
  let titleHTML = "";

  if (t.title) {
    titleHTML = `<h3 style="margin:10px 0;">${escapeHTML(t.title)}</h3>`
  }

  if (t.communityId && window.communityID == null) {
    const communityName = await getCommunityNameById(t.communityId);
    communityHTML = `
    <div style="cursor:pointer;display:flex;gap:5px;color:grey;margin:5px 0;align-items:center;margin-top:10px;">
      <img loading='lazy' height="17" src="/image/community-filled.svg">
      <span style="font-size:14px;" class="communityLink" ${t.postedInPublic ? `data-tweet=${t.connectedWynt}` : ""} data-id="${t.communityId}">posted in @${escapeHTML(communityName)}</span>
    </div>`;
  } else if (t.sharedFromCommunity && window.communityID == null) {
    const communityName = await getCommunityNameById(t.sharedFromCommunity);
    communityHTML = `
    <div style="cursor:pointer;display:flex;gap:5px;color:grey;margin:5px 0;align-items:center;margin-top:10px;">
      <img loading='lazy' height="17" src="/image/community-filled.svg">
      <span style="font-size:14px;" class="communityLink" ${t.postedInPublic ? `data-tweet=${t.connectedWynt}` : ""} data-id="${t.sharedFromCommunity}">posted in @${escapeHTML(communityName)}</span>
    </div>`;
  }

  let pollHTML = "";
  if (t.poll && Array.isArray(t.poll.options)) {
    const uid = auth.currentUser?.uid;
    let myVoteIndex = null;
    if (uid) {
      let voteRef;
      if (window.communityID != null) {
        voteRef = doc(db, "communities", window.communityID, "posts", tweetId, "votes", uid);
      } else {
        voteRef = doc(db, "tweets", tweetId, "votes", uid);
      }
      const voteSnap = await getDoc(voteRef);
      if (voteSnap.exists()) {
        myVoteIndex = voteSnap.data().optionIndex;
      }
    }
    pollHTML = renderPoll(t, tweetId, myVoteIndex);
  }

  let editHTML = "";
  if (t.edited && t.editAfterComment) {
    editHTML = `<img src="/image/editicon.svg" class="editedatt editedat2" title="edited at ${formatTime(t.edited)}. click me">`
  }

  let tweetHTML = "";

  if (data.banned === true && currentUserRole != "admin") {
    tweetHTML = `
      <div class="tweet" id="tweet-${tweetId}" data-id="${tweetId}">
        <div style="display:flex;gap:10px;">
          <img loading='lazy' class="avatar" src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30" />
          <div style="display:flex;flex-direction:column;width:100%;">
            <div class="flex" style="gap:10px;margin:0">
              <strong class="user-link" data-uid="${t.uid}" style="cursor:pointer;font-size:17px;">Suspended user</strong>
              <span style="color:#757779;font-size:12px">${dateStr}</span>
            </div>
            <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 6px;color:grey">This Wynt is from a suspended user</p>
          </div>
        </div>
      </div>
    `;
  } else {
    tweetHTML = `
      <div class="tweet" id="tweet-${tweetId}" data-id="${tweetId}" ${isStored ? `data-community-id="${communityId}"` : ""} ${isStored ? `data-stored="true"` : ""}>
        ${quotedHTML}
        ${retweetHTML}
        <div style="display:flex;gap:10px;">
          <img loading='lazy' class="avatar" src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30" />
          <div style="display:flex;flex-direction:column;width:100%;">
            <div class="flex" style="gap:10px;margin:0">
              ${data.suspended && data.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${(t.mentions && Object.values(t.mentions).includes(auth.currentUser.uid)) ?
                  `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                  ""
                }`
              }
              <strong class="user-link" data-uid="${t.uid}" style="cursor:pointer;font-size:17px;">${escapeHTML(displayName)}</strong>
              <span style="color:#757779;font-size:12px"><span class="usernamee">@${username} •</span> ${dateStr} ${editHTML}</span>
              ${t.archived ? `<img title="archived" src="/image/archive.svg">` : ""}
              <span style="cursor:pointer;margin-left:auto" data-shared="${t.sharedFromCommunity || null}" data-community-id="${communityId || t.communityId || null}" data-author="${t.uid}" data-stored=${isStored} data-id=${tweetId} class="menubtn" ${isPrivate ? "data-private=true" : ""}><img loading='lazy' src="/image/three-dots.svg"></span>
            </div>
            ${communityHTML}
            ${titleHTML}
            <div class="post-body" style="margin:5px 0">${parsedText}</div>
            ${translateHTML}
            <div class="tweet-media">
              ${mediaHTML}
            </div>
            ${pollHTML}
            ${t.isHidden ? "" : `
              <div class="flex">
                <span style="cursor:pointer;color:#757779" data-community-id="${window.communityId || null}" class="like-btn" id="likeBtn-${tweetId}">
                  <div id="${likeId}" class="likeicon" style="height:20px">
                    <img loading='lazy' src="/image/heart.svg">
                  </div>
                  ${likeCount > 0 ? `<span id="likeCount-${tweetId}">${likeCount}</span>` : ""}
                </span>
                <span style="cursor:pointer;color:#757779" class="comment-btn" data-id="${tweetId}">
                  <img loading='lazy' src="/image/message.svg"> ${commentCount > 0 ? commentCount : ""}
                </span>
                <span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${tweetId}">
                  <img loading='lazy' src="/image/rewint.svg"> ${retweetCount > 0 ? retweetCount : ""}
                </span>
                <div style="margin-left:auto;">
                  <span class="viewbtn" style="margin-left:10px;color:#757779"><img loading='lazy' src="/image/chart.svg"> ${viewCount > 0 ? viewCount : ""}</span>
                </div>
              </div>  
            `}
          </div>
        </div>
      </div>
    `;
  }

  const tweetIdSelector = `#tweet-${tweetId}`;
  const existingInContainer = container.querySelector(tweetIdSelector);
  if (action === "replace" && existingInContainer) {
    existingInContainer.outerHTML = tweetHTML;
    const updatedTweet = container.querySelector(tweetIdSelector);
    if (updatedTweet) {
      applyReadMoreLogic(updatedTweet);
    }
  } else if (!existingInContainer) {
    if (action === "skibidi") {
      container.insertAdjacentHTML("afterbegin", tweetHTML);
    } else {
      container.insertAdjacentHTML("beforeend", tweetHTML);
    }
    const newTweet = container.querySelector(tweetIdSelector);
    if (newTweet) {
      applyReadMoreLogic(newTweet);
    } else {
      console.warn("Tweet inserted but not found in DOM for:", tweetId);
    }
  }

  const tweetNode = container.querySelector(tweetIdSelector);

  if (translateHTML5 != "") {
    tweetNode.querySelector(".tr1 .translate-btn").dataset.text = comment.text
  }
  if (translateHTML6 != "") {
    tweetNode.querySelector(".tr2 .translate-btn").dataset.text = rt.text;
  }
  if (translateHTML != "") {
    tweetNode.querySelector(".tr3 .translate-btn").dataset.text = t.text;
  }

  if (editHTML2 != "") { if (comment.editAfterComment) {
    tweetNode.querySelector(".editedat").onclick = () => {
      showOriginal(comment.originalText, comment.mentions || {})
    };
  }}
  if (editHTML1 != "") { if (rt.editAfterComment) {
    tweetNode.querySelector(".editedat1").onclick = () => {
      showOriginal(rt.originalText, rt.mentions || {}, rt.originalTitle)
    };
  }}
  if (editHTML != "") { if (t.editAfterComment) {
    tweetNode.querySelector(".editedat2").onclick = () => {
      showOriginal(t.originalText, t.mentions || {}, t.originalTitle)
    };
  }}

  const likeEl = tweetNode?.querySelector(`#${likeId}`);
  getSnap(path, likeEl);

  if (t.retweetOfComment) {
    const likeEl1 = tweetNode?.querySelector(`#${likeId1}`);
    getSnap(likeRef, likeEl1);
  }

  if (t.retweetOf || t.originalId) {
    const likeEl1 = tweetNode?.querySelector(`#${rtlikeId}`);
    getSnap(rtlikepath, likeEl1);
  }
}

// get all doc paralelly
async function getAll(...docRefs) {
  return Promise.all(docRefs.map(ref => getDoc(ref)));
}

document.body.addEventListener("click", async (e) => {
  const reportTweetBtn = e.target.closest(".report-btn[data-id]");
  if (reportTweetBtn) {
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
    loading.classList.add("show");

    const tweetId = reportTweetBtn.dataset.id;
    const tweetEl = document.getElementById(`tweet-${tweetId}`);
    const communityId = reportTweetBtn.dataset.communityId || null;

    let hascom;
    if (communityId && communityId != null && communityId != "null") {
      hascom = communityId;
    }

    let tweetSnap;
    if (hascom) {
      tweetSnap = await getDoc(doc(db, "communities", hascom, "posts", tweetId));
    } else {
      tweetSnap = await getDoc(doc(db, "tweets", tweetId));
    }

    if (!tweetSnap.exists()) {
      log("red", "Wynt not found");
      loading.classList.remove("show");
      return;
    }

    const data = tweetSnap.data();
    const { username: posterUsername } = await getUserData(data.uid);
    const { username } = await getUserData(auth.currentUser.uid);

    let link;
    if (hascom) {
      link = `https://wyntr.netlify.app/community/${hascom}/wynt/${tweetId}`
    } else {
      link = `https://wyntr.netlify.app/wynt/${tweetId}`
    }

    document.getElementById("tweetMenuOverlay").classList.add("hidden");

    const reason = await inputDialog("report Wynt", "state why you're proceeding this action", null, "", true);
    if (!reason) return;
    
    discord("Wynt report", "red", {
      "text": data.text,
      "author": `${posterUsername} (${data.uid})`,
      "posted at": formatUTC8(data.createdAt),
      "offend": reason,
      "offender": `${username} (${auth.currentUser.uid})`,
      "source": link
    }, new Date(), [
      data.media || null
    ], "user");

    log("green", "Wynt reported");
    loading.classList.remove("show");
  }

  const reportCommentBtn = e.target.closest(".report-btn[data-tweet][data-comment]");
  if (reportCommentBtn) {
    document.getElementById("cMenuOverlay").classList.add("hidden");
    loading.classList.add("show");
    const tweetId = reportCommentBtn.dataset.tweet;
    const commentId = reportCommentBtn.dataset.comment;
    const communityId = reportCommentBtn.dataset.communityId || null;

    let hascom;
    if (communityId && communityId != null && communityId != "null") {
      hascom = communityId;
    }

    let commentSnap;
    if (hascom) {
      commentSnap = await getDoc(doc(db, "communities", hascom, "posts", tweetId, "comments", commentId));
    } else {
      commentSnap = await getDoc(doc(db, "tweets", tweetId, "comments", commentId));
    }

    if (!commentSnap.exists()) {
      log("red", "reply doesn't exist");
      loading.classList.remove("show");
      return;
    }

    const commentData = commentSnap.data();

    let link;
    if (hascom) {
      link = `https://wyntr.netlify.app/community/${hascom}/wynt/${tweetId}/reply/${commentId}`
    } else {
      link = `https://wyntr.netlify.app/wynt/${tweetId}/reply/${commentId}`
    }

    const { username: posterUsername } = await getUserData(commentData.uid);
    const { username } = await getUserData(auth.currentUser.uid);

    document.getElementById("cMenuOverlay").classList.add("hidden");
    const reason = await inputDialog("report reply", "state why you're proceeding this action", null, "", true);
    if (!reason) return;
    
    discord("reply report", "red", {
      "text": commentData.text || "(no text)",
      "author": `${posterUsername} (${commentData.uid})`,
      "posted at": formatUTC8(commentData.createdAt),
      "offend": reason,
      "offender": `${username} (${auth.currentUser.uid})`,
      "source": link
    }, new Date(), [
      commentData.media.url || null
    ], "user");
    
    loading.classList.remove("show");
    log("green", "reply reported");
  }

  const btn = e.target.closest(".menubtn");
  if (btn) {
    loading.classList.add("show");

    const tweetEl = btn.closest(".actuallyATweet") || btn.closest(".tweet");
    if (!tweetEl) {
      loading.classList.remove("show");
      return;
    }

    const tweetId = tweetEl.dataset.id;
    const communityId = btn.dataset.communityId;
    const shared = btn.dataset.shared;
    const author = btn.dataset.author;
    const isStored = btn.dataset.stored === "true";
    const isPrivate = btn.dataset.private === "true";

    const yes = shared === "true";
    const hascom = communityId && communityId !== "null" ? communityId : null;

    let tweetRef;

    if (window.communityID) {
      tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
    } else if (communityId && isStored) {
      tweetRef = doc(db, "communities", communityId, "posts", tweetId)
    } else {
      tweetRef = doc(db, "tweets", tweetId);
    }

    const userRef = doc(db, "users", auth.currentUser.uid);

    let comRef = null;
    if (window.communityID) {
      comRef = doc(db, "communities", window.communityID);
    }

    const firstBatch = [
      getDoc(tweetRef),
      getDoc(userRef),
    ];

    if (comRef) {
      firstBatch.push(getDoc(comRef));
    }

    const results = await Promise.all(firstBatch);

    const tweetSnap = results[0];
    const userSnap = results[1];
    const comSnap = comRef ? results[2] : null;

    if (!tweetSnap.exists()) {
      loading.classList.remove("show");
      log("red", "Wynt not found");
      return;
    }

    const data = tweetSnap.data();

    const tweetUserRef = doc(db, "users", data.uid);
    const tweetUserSnap = await getDoc(tweetUserRef);

    let ispinned = false;
    if (comSnap && comSnap.exists()) {
      const comData = comSnap.data();
      if (comData?.pinned === tweetId) {
        ispinned = true;
      }
    }

    const overlay = document.getElementById("tweetMenuOverlay");
    const box = overlay.querySelector(".menu-box");

    const isOwner = auth.currentUser.uid === data.uid;
    const isAdmin = currentUserRole === "admin";

    const hasMedia =
      data.media &&
      (data.mediaType === "image" || data.mediaType === "video");

    const tweetUserRole = tweetUserSnap.exists()
      ? tweetUserSnap.data().role
      : "user";

    const pinnedId = userSnap.exists()
      ? userSnap.data().pinned
      : null;

    const showDeleteBtn =
      isOwner || (isAdmin && tweetUserRole !== "admin");

    const now = new Date();
    const editUntil = data.editUntil?.toDate
      ? data.editUntil.toDate()
      : null;

    const canStillEdit = editUntil && now < editUntil;
    const showEditBtn = isOwner && canStillEdit;

    box.innerHTML = `
      <div class="flex" style="margin-bottom:5px;">
        <h3 style="margin:0;margin-left:5px;">Actions</h3>
        <div class="menu-item close-menu" style="margin-left:auto;"><img loading='lazy' src="/image/x.svg"></div>
      </div>

      ${window.communityID && window.canModerate ? `
      <div class="c-menu-item community-pin-btn" data-id="${tweetId}">
          ${ispinned ? `
            <img loading='lazy' src="/image/pinned.svg"> unpin Wynt from community` 
            : `<img loading='lazy' src="/image/pin.svg"> pin Wynt to community`}
        </div>
      ` : ""}

        ${showEditBtn && !data.postedInPublic ?
          `<div class="menu-item edit-btn" data-community-id="${hascom || null}" data-id="${tweetId}">
            <img loading='lazy' src="/image/edit1.svg"> Edit this Wynt
          </div>`
        : ""}

        ${showEditBtn && data.postedInPublic ? 
          `<div class="menu-item" style="color:grey">
          <svg style="color:grey" class="w-6 h-6 text-gray-800 dark:text-white aria-hidden=" true"="" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m6 6 12 12m3-6a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"></path></svg> can only be edited on original post
          </div>`
        : ""}

        <div class="menu-item share-btn" data-share="${yes}" ${!data.postedInPublic ? `data-community-id="${hascom || null}"` : ""} data-id="${tweetId}"><img loading='lazy' src="/image/share.svg">Share this Wynt</div>

        <div class="menu-item bookmark-btn" ${hascom ? `data-community="${communityId}"` : ""} id="bookmarkBtn-${tweetId}"><img loading='lazy' src="/image/bookmark.svg"> add/remove from bookmark folder</div>

        ${window.CURRENT_BOOKMARK_ID ? `
          <div class="menu-item unbookmark-btn" data-tweet="${tweetId}">
            <img src="/image/ban.svg"> remove from this bookmark folder  
          </div>
        ` : ""}

        ${(window.communityID && window.isOnPrivate) || isPrivate ? "" : 
          `<div class="menu-item highlight-btn" ${hascom ? `data-community="${communityId}"` : ""} id="highlightBtn-${tweetId}"><img loading='lazy' src="/image/bookmark.svg"> add/remove from highlight folder</div>`
        }

        ${window.CURRENT_HIGHLIGHT_ID ? `
          <div class="menu-item unhighlight-btn" data-tweet="${tweetId}">
            <img src="/image/ban.svg"> remove from this highlight folder  
          </div>
        ` : ""}

        ${window.communityID || isStored ? "" :
          `${isOwner
          ? `<div class="menu-item pin-btn" data-id="${tweetId}">
            ${pinnedId === tweetId
            ? `<img loading='lazy' src="/image/pinned.svg"> Unpin from profile`
            : `<img loading='lazy' src="/image/pin.svg"> Pin to profile`}
          </div>`
        : ""}`}

        ${isOwner ? `
          <div class="menu-item settings-btn" ${isStored ? `data-community-id=${communityId}` : ""} id="tweetOptionsEdit" data-id=${tweetId}>
            <img loading='lazy' src="/image/settings.svg">
            Change Wynt settings
          </div>  
        ` : ""}

        ${showDeleteBtn || (window.communityID && window.canModerate)
          ? `<div class="menu-item delete-btn" data-community-id="${hascom || null}" data-id="${tweetId}">
            <img loading='lazy' src="/image/trash.svg"> Delete this Wynt 
            ${isOwner ? "" : `
            ${(isAdmin && tweetUserRole !== "admin") ? "as global admin" : `
              ${window.communityID && window.canModerate ? "as community admin" : ""}  
            `}`}
          </div>`
        : ""}

        <h4 style="margin:5px 0;margin-left:5px;">Others</h4>

        ${hasMedia ? 
          `<div class="menu-item download-btn" data-community-id="${hascom ? communityId : null}" data-tweet="${tweetId}"><img loading='lazy' src="/image/download.svg"> Download attachment</div>`
        : ""}

        ${isOwner && isOlderThanBlankDays(data.createdAt, 30) ?
        `<div class="menu-item archive" data-archived="${data.archived}" data-id="${tweetId}" ${hascom ? `data-community="${communityId}"` : ""}>
          <img loading='lazy' src="/image/archive.svg"> ${data.archived ? "unarchive" : "archive"} Wynt
        </div>` : ""}

        ${isOwner && data.archived ?
        `<div class="menu-item archive-perm" data-id="${tweetId}" ${hascom ? `data-community="${communityId}"` : ""}>
          <img loading='lazy' src="/image/archive.svg"> view Wynt permission
        </div>` : ""}

        ${isOwner ? "" : `<div class="menu-item report-btn" data-community-id="${hascom || null}" data-id="${tweetId}"><img loading='lazy' src="/image/report.svg"> Report this Wynt</div>` }

        <div class="menu-item text-copy">
          <img loading='lazy' src="/image/copy.svg"> copy text
        </div>

        <div class="menu-item viewLikes" data-id="${tweetId}" ${hascom ? `data-community="${communityId}"` : ""}>
            <img loading="lazy" src="/image/heart.svg"> view who liked
        </div>

        ${isOwner ? `
        <div class="menu-item viewViews" data-id="${tweetId}" ${hascom ? `data-community="${communityId}"` : ""}>
            <img loading="lazy" src="/image/eye.svg"> view who interacted
        </div>
        ` : ""}
    `;

    overlay.classList.remove("hidden");
    loading.classList.remove("show");

    if (isOwner) {
      document.getElementById("tweetOptionsEdit").addEventListener("click", () => {
        document.getElementById("tweetOption").classList.remove("hidden");
        document.getElementById("permissionOnEdit").classList.add("hidden");
        document.getElementById("settings-save").classList.remove("hidden");
      });
    }

    box.querySelector(".text-copy").dataset.text = data.text;
  }

  if (e.target.id === "tweetMenuOverlay" || e.target.closest(".close-menu")) {
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
  }

  const viewViews = e.target.closest(".viewViews");
  if (viewViews) {
    initViews(
      viewViews.dataset.id, 
      viewViews.dataset.communityId || null, 
      null,
      "views",
      null
    );
  }

  const viewlikes = e.target.closest(".viewLikes");
  if (viewlikes) {
    initViews(
      viewlikes.dataset.id,
      viewlikes.dataset.communityId || null,
      null,
      "likes",
      null
    );
  }

  const archiveperm = e.target.closest(".archive-perm");
  if (archiveperm) {
    const tweetId = archiveperm.dataset.id;
    const communityId = archiveperm.dataset.community || null;
    
    window.permission_tweetId = tweetId;
    window.permission_communityId = communityId;

    document.getElementById("tweetMenuOverlay").classList.add("hidden");

    viewArchivePerm();
  }

  const archivebtn = e.target.closest(".archive");
  if (archivebtn) {
    const tweetId = archivebtn.dataset.id;
    const communityId = archivebtn.dataset.community || null;
    const archived = archivebtn.dataset.archived;

    if (archived == "true") {
      if (!(await confirmDialog("unarchive Wynt?", "this wynt will regain its public accessibility"))) return;
    } else {
      if (!(await confirmDialog("archive Wynt?", "this wynt will lose its public accessibility"))) return;
    }

    loading.classList.add("show");
    const ref = communityId ? 
      doc(db, "communities", communityId, "posts", tweetId) :
      doc(db, "tweets", tweetId);

    if (archived == "true") {
      await updateDoc(ref, {
        archived: false
      });
      log("green", "Wynt unarchived");
    } else {
      await updateDoc(ref, {
        archived: true
      });
      log("green", "Wynt archived");
    }
    loading.classList.remove("show");
    document.getElementById("tweetMenuOverlay").classList.add("hidden");

    if (archived == "true") {
      if (communityId) {
        document.getElementById("communityArchiveList").querySelector(`.tweet[data-id="${tweetId}"]`)?.remove();
      } else {
        document.getElementById("archiveList").querySelector(`.tweet[data-id="${tweetId}"]`)?.remove();
      }
    }
  }

  const unbookmarkbtn = e.target.closest(".unbookmark-btn");
  if (unbookmarkbtn) {
    const ref = doc(db, "users", auth.currentUser.uid, "bookmarks", window.CURRENT_BOOKMARK_ID, "items", unbookmarkbtn.dataset.tweet);
    const folderRef = doc(db, "users", auth.currentUser.uid, "bookmarks", window.CURRENT_BOOKMARK_ID);

    if (localStorage.getItem("disableConfirmation") != "true") {
      if (!(await confirmDialog("Remove from folder?", "are you sure you want to remove this Wynt from folder?", "red"))) return;
    }

    loading.classList.add("show");
    document.getElementById("tweetMenuOverlay").classList.add("hidden");

    await runTransaction(db, async (tx) => {
      tx.delete(ref);
      tx.update(folderRef, {
        tweetsCount: increment(-1),
        lastUpdated: serverTimestamp()
      })
    });

    log("green", "Wynt removed")
    loading.classList.remove("show");
    document.querySelector(`#bookmarkTweetOverlay .tweet[data-id="${unbookmarkbtn.dataset.tweet}"]`).remove();
  }

  const unhighlightbtn = e.target.closest(".unhighlight-btn");
  if (unhighlightbtn) {
    const ref = doc(db, "users", auth.currentUser.uid, "highlights", window.CURRENT_HIGHLIGHT_ID, "items", unhighlightbtn.dataset.tweet);
    const folderRef = doc(db, "users", auth.currentUser.uid, "highlights", window.CURRENT_HIGHLIGHT_ID);

    if (localStorage.getItem("disableConfirmation") != "true") {
      if (!(await confirmDialog("Remove from folder?", "are you sure you want to remove this Wynt from folder?", "red"))) return;
    }

    loading.classList.add("show");
    document.getElementById("tweetMenuOverlay").classList.add("hidden");

    await runTransaction(db, async (tx) => {
      tx.delete(ref);
      tx.update(folderRef, {
        tweetsCount: increment(-1),
        lastUpdated: serverTimestamp()
      })
    });

    log("green", "Wynt removed")
    loading.classList.remove("show");
    document.querySelector(`#highlightTweetOverlay .tweet[data-id="${unhighlightbtn.dataset.tweet}"]`).remove();
  }

  const hideBtn = e.target.closest(".comment-hide-btn");
  if (hideBtn) {
    document.getElementById("cMenuOverlay").classList.add("hidden");

    try {
      const tweetId = hideBtn.dataset.tweet;
      const commentId = hideBtn.dataset.id;
      const communityId = hideBtn.dataset.communityId;

      if (!tweetId || !commentId) {
        log("red", "invalid reply");
        return;
      }

      const fromCommunity =
        communityId && communityId !== "null" && communityId !== null;

      const commentRef = fromCommunity
        ? doc(db, "communities", communityId, "posts", tweetId, "comments", commentId)
        : doc(db, "tweets", tweetId, "comments", commentId);

      const tweetRef = fromCommunity 
        ? doc(db, "communities", communityId, "posts", tweetId)
        : doc(db, "tweets", tweetId)

      const [commentSnap, tweetSnap] = await getAll(commentRef, tweetRef)

      if (!commentSnap.exists()) {
        log("red", "This comment no longer exists");
        return;
      }

      const data = commentSnap.data();
      const d = tweetSnap.data()

      const isAuthority = currentUserRole === "admin";
      const isAdmin = window.communityID && window.canModerate && fromCommunity;
      const isOwner = d.uid === auth.currentUser.uid;

      const isHidden = !!data.isHidden;

      if (!isOwner && !isAdmin && !isAuthority) {
        log("red", "insufficient permission");
        return;
      }

      const link = fromCommunity
        ? `https://wyntr.netlify.app/community/${communityId}/wynt/${tweetId}/reply/${commentId}` 
        : `https://wyntr.netlify.app/wynt/${tweetId}/reply/${commentId}`;

      if (!isHidden) {
        const reason = await inputDialog("Hide reply", "state why you're proceeding this action", null, "", true);
        if (!reason) return;

        loading.classList.add("show");

        if (isAuthority) {
          await updateDoc(commentRef, {
            isHidden: true,
            hiddenByAuthority: true,
            hiddenReason: reason
          });

          try {
            const {username: posterName} = await getUserData(data.uid);
            const {username: offenderName} = await getUserData(auth.currentUser.uid);

            const susRef = doc(db, "susList", data.uid);
            const susSnap = await getDoc(susRef);
            const currentWarnings = susSnap.exists() ? susSnap.data().warnings || 0 : 0;

            discord("Reply hidden", "red", {
              "text": data.text,
              "author": `${posterName} (${data.uid})`,
              "posted at": formatUTC8(data.createdAt),
              "offend": reason,
              "offender": `${offenderName} (${auth.currentUser.uid})`,
              "user warnings": `${currentWarnings + 1}`,
              "source": link
            }, new Date(), [
              data.media.url || null
            ], "admin");

            await setDoc(doc(db, "susList", data.uid), {
              warnings: increment(1)
            }, { merge: true });
          } catch (e) {
            loading.classList.add("show");
            console.error(e);
            return;
          }

          if (data.mediaType === "image" || data.mediaType === "video") {
            const thumbnail = data.mediaType === "video" ?
              await extractVideoFrame(data.media.url, 0.1) :
              data.media.url;

            sendHideNotification(data.text, data.uid, reason, thumbnail);
          } else {
            sendHideNotification(data.text, data.uid, reason);
          }
        } else if (isAdmin) {
          await updateDoc(commentRef, {
            isHidden: true,
            hiddenByAdmin: true,
            hiddenReason: reason,
          });
        } else {
          await updateDoc(commentRef, {
            isHidden: true,
            hiddenReason: reason,
          });
        }
        loading.classList.remove("show");
        log("green", "Reply hidden");
        return;
      }

      if (localStorage.getItem("disableConfirmation") != "true") {
        const confirmUnhide = await confirmDialog("unhide reply?", "Are you sure you want to unhide this reply?");
        if (!confirmUnhide) return;
      }

      if (data.hiddenByAuthority && !isAuthority) {
        log("red", "cannot unhide (hidden by global admin)");
        return;
      }

      if (data.hiddenByAdmin && !isAuthority && !isAdmin) {
        log("red", "cannot unhide (hidden by community admin)");
        return;
      }

      if (isAuthority) {
        loading.classList.remove("show");
        const reason = await inputDialog("un-hide reply", "state why you're proceeding this action", null, "");
        if (!reason) return;  
        loading.classList.add("show")

        try {
          const {username: posterName} = await getUserData(data.uid);
          const {username: offenderName} = await getUserData(auth.currentUser.uid);

          discord("Reply un-hidden", "gray", {
            "text": data.text,
            "author": `${posterName} (${data.uid})`,
            "reason for unhiding": reason,
            "admin responsible": `${offenderName} (${auth.currentUser.uid})`,
            "source": link
          }, new Date(), [
            data.media.url || null
          ], "admin");
        } catch {}              
      }

      await updateDoc(commentRef, {
        isHidden: false,
        hiddenByAdmin: false,
        hiddenByAuthority: false,
        hiddenReason: null,
        tweetOwnerId: d.uid,
      });

      log("green", "Reply un-hidden");

    } finally {
      loading.classList.remove("show");
    }
  }

  const editBtn1 = e.target.closest(".comment-edit-btn");
  if (editBtn1) {
    document.getElementById("cMenuOverlay").classList.add("hidden");
    const tweetId = editBtn1.dataset.tweet;
    const commentId = editBtn1.dataset.id;
    const communityId = editBtn1.dataset.communityId;
    let hascom;
    if (communityId && communityId != null && communityId != "null") {
      hascom = communityId;
    }
    if (!tweetId || !commentId) {
      log("red", "invalid reply");
      return;
    }
    try {
      let commentRef;
      if (hascom) {
        commentRef = doc(db, "communities", hascom, "posts", tweetId, "comments", commentId);
      } else {
        commentRef = doc(db, "tweets", tweetId, "comments", commentId);
      }
      const commentSnap = await getDoc(commentRef);
      if (!commentSnap.exists()) {
        log("red", "This reply no longer exists")
        return;
      }
      const data = commentSnap.data();
      const userId = data.uid;
      const {displayName, username, avatar} = await getUserData(userId);
      const dateStr = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);

      const commentHTML = `
        <div class="tweet">
          <div style="display:flex;gap:10px;">
            <img loading='lazy' class="avatar" src="${avatar}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;>
            <div style="display:flex;flex-direction:column;width:100%;">
              <div style="display:flex;flex-direction:column;width:100%;">
                <div class="flex" style="gap:10px;margin:0;">
                  ${data.likedByCreator === true ? 
                    `<img style="margin-right:-3px" src="/image/star.svg">` :
                    `${(data.mentions && Object.values(data.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }
                  <strong class="user-link" data-uid="${userId}" style="cursor:pointer;font-size:17px;">${displayName}</strong>
                  <span style="color:#757779;font-size:12px">
                    <span class="usernamee">@${username} •</span> ${formatDate(dateStr)}
                  </span>
                </div>
                <textarea id="editTextArea" 
                  style="padding:0;border:none;margin:5px 0;border-radius:0;
                         background:transparent;font-size:16px;width:100%;resize:none;line-height:1.4;">${data.text || ""}</textarea>
                <div class="char-counter">0/1000</div>
              </div>
            </div>
          </div>
        </div>
      `;
      const user = auth.currentUser;
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        const data = snap.exists() ? snap.data() : {};
        const premiumExpiry = data.premium ? data.premium.toDate() : null;
        const isPremium = premiumExpiry && premiumExpiry > new Date();
        applyLimits(isPremium);
      }
      updateAllCounters();
      const overlay = document.getElementById("editOverlay");
      const appendEdit = document.getElementById("appendEdit");
      appendEdit.innerHTML = commentHTML;
      overlay.classList.remove("hidden");

      const saveBtn = document.getElementById("saveEdit");
      saveBtn.onclick = async () => {
        saveBtn.classList.add("disabled");
        saveBtn.disabled = true;
        const newText = document.getElementById("editTextArea").value.trim();
        const detectedLanguage = await detectLanguage(newText);
        if (newText.length < 3) {
          log("red", "Reply must be at least 3 characters long")
          saveBtn.classList.remove("disabled");
          saveBtn.disabled = false;
          return;
        }
        try {
          let editAfterComment = false;
          if (!data.editAfterComment) {
            try {
              let commentsRef, tweetsRef;

              if (window.communityID) {
                commentsRef = collection(db, "communities", window.communityID, "posts", tweetId, "comments");
                tweetsRef = collection(db, "communities", window.communityID, "posts");
              } else {
                commentsRef = collection(db, "tweets", tweetId, "comments");
                tweetsRef = collection(db, "tweets");
              }

              const tweetQuery = query(
                tweetsRef,
                where("retweetOfComment.commentId", "==", commentId),
                limit(1)
              );

              const commentQuery = query(
                commentsRef,
                where("uid", "!=", auth.currentUser.uid),
                where("parentId", "==", commentId),
                limit(1)
              );

              const [commentSnap, tweetSnap] = await Promise.all([
                getDocs(commentQuery),
                getDocs(tweetQuery)
              ]);

              editAfterComment = !commentSnap.empty || !tweetSnap.empty;

            } catch (err) {
              console.error("Error checking comments:", err);
            }
          } else {
            editAfterComment = true;
          }
          const muteNotif = mute.checked;
          const sensitiveMedia = sensitive.checked;

          await updateDoc(commentRef, {
            text: newText,
            edited: new Date(),
            language: detectedLanguage,
            editAfterComment,
            muteNotif,
            sensitiveMedia
          });

          log("green", "Reply updated");
          mute.checked = false;
          sensitive.checked = false;
          overlay.classList.add("hidden");
        } catch (err) {
          console.error("Error saving edited comment:", err);
          log("red", "Failed to save comment");
          saveBtn.classList.remove("disabled");
          saveBtn.disabled = false;
        }
        saveBtn.classList.remove("disabled");
        saveBtn.disabled = false;
      };
    } catch (err) {
      console.error("Error editing comment:", err);
      log("red", "Failed to open comment editor")
    }
  }
  const settingsBtn1 = e.target.closest(".settings-btn1");
  if (settingsBtn1) {
    const tweetId = settingsBtn1.dataset.id;
    const commentId = settingsBtn1.dataset.comment;

    let ref;
    if (window.communityID) {
      ref = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId);
    } else {
      ref = doc(db, "tweets", tweetId, "comments", commentId);
    }
    const snap = await getDoc(ref);
    const c = snap.data();

    const mute = document.getElementById("cmute");
    const sensitive = document.getElementById("csensitive");

    mute.checked = c.muteNotif;
    sensitive.checked = c.sensitiveMedia;

    const savebtn = document.getElementById("settings-save1");

    savebtn.onclick = async () => {
      if (c.uid != auth.currentUser.uid) return log("red", "insufficient permission");
      savebtn.disabled = true;
      savebtn.classList.add("disabled");

      await updateDoc(ref, {
        muteNotif: mute.checked,
        sensitiveMedia: sensitive.checked
      });
      document.getElementById("commentOption").classList.add("hidden");
      document.getElementById("cMenuOverlay").classList.add("hidden");

      savebtn.disabled = false;
      savebtn.classList.remove("disabled");

      mute.checked = false;
      sensitive.checked = false;

      log("green", "Reply updated");
    };
  }
  const settingsBtn = e.target.closest(".settings-btn");
  if (settingsBtn) {
    const tweetId = settingsBtn.dataset.id;

    let tweetRef;
    if (window.communityID) {
      tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
    } else if (settingsBtn.dataset.communityId) {
      tweetRef = doc(db, "communities", settingsBtn.dataset.communityId, "posts", tweetId);
    } else {
      tweetRef = doc(db, "tweets", tweetId);
    }
    const tweetSnap = await getDoc(tweetRef);
    const tweetData = tweetSnap.data();

    const privateOK = document.getElementById("privateOK");
    const mute = document.getElementById("mute");
    const sensitive = document.getElementById("sensitive");

    privateOK.checked = !tweetData.noPrivateReply;
    mute.checked = tweetData.muteNotif;
    sensitive.checked = tweetData.sensitiveMedia;

    const savebtn = document.getElementById("settings-save");

    savebtn.onclick = async () => {
      if (tweetData.uid != auth.currentUser.uid) return log("red", "insufficient permission");
      savebtn.disabled = true;
      savebtn.classList.add("disabled");

      await updateDoc(tweetRef, {
        noPrivateReply: !privateOK.checked,
        muteNotif: mute.checked,
        sensitiveMedia: sensitive.checked
      });
      document.getElementById("tweetOption").classList.add("hidden");
      document.getElementById("tweetMenuOverlay").classList.add("hidden");

      savebtn.disabled = false;
      savebtn.classList.remove("disabled");

      privateOK.checked = true;
      mute.checked = false;
      sensitive.checked = false;

      log("green", "Wynt updated");
    };
  }
  const editBtn = e.target.closest(".edit-btn");
  if (editBtn) {
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
    const tweetId = editBtn.dataset.id;
    if (!tweetId) {
      log("red", "wynt not found");
      return;
    }
    try {
      let tweetRef;
      if (window.communityID) {
        tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
      } else {
        tweetRef = doc(db, "tweets", tweetId);
      }
      const tweetSnap = await getDoc(tweetRef);
      if (!tweetSnap.exists()) {
        log("red", "This Wynt no longer exists");
        return;
      }

      const data = tweetSnap.data();
      const userId = data.uid;
      const {displayName, username, avatar} = await getUserData(userId);
      const dateStr = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      const tweetHTML = `
        <div class="tweet">
          <div style="display:flex;gap:10px;">
            <img loading='lazy' class="avatar" src="${avatar}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;">
            <div style="display:flex;flex-direction:column;width:100%;">
              <div class="flex" style="gap:10px;margin:0;">
                ${(data.mentions && Object.values(data.mentions).includes(auth.currentUser.uid)) ?
                  `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                  ""
                }
                <strong class="user-link" data-uid="${userId}" style="cursor:pointer;font-size:17px;">${displayName}</strong>
                <span style="color:#757779;font-size:12px">
                  <span class="usernamee">@${username} •</span> ${formatDate(dateStr)}
                </span>
              </div>
              <input type="text" id="editTitle"
                style="border-radius:0;padding:5px 0;font-weight:bold;border:none;font-size:20px;background:none;margin:5px 0;"
                placeholder="optional Wynt title"
              />
              <textarea id="editTextArea" 
                style="padding:0;border:none;margin:5px 0;border-radius:0;
                       background:transparent;font-size:16px;width:100%;resize:none;line-height:1.4;">${data.text || ""}</textarea>
              <div class="char-counter">0/1000</div>
            </div>
          </div>
        </div>
      `;
      const user = auth.currentUser;
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        const data = snap.exists() ? snap.data() : {};
        const premiumExpiry = data.premium ? data.premium.toDate() : null;
        const isPremium = premiumExpiry && premiumExpiry > new Date();
        applyLimits(isPremium);
      }
      updateAllCounters();
      const overlay = document.getElementById("editOverlay");
      const appendEdit = document.getElementById("appendEdit");
      appendEdit.innerHTML = tweetHTML;
      overlay.classList.remove("hidden");
      const editTitle = document.querySelector("#editTitle");
      editTitle.value = data.title || "";
      editTitle.addEventListener("input", () => {
        editTitle.value = editTitle.value.slice(0, 100);
      });

      const saveBtn = document.getElementById("saveEdit");
      saveBtn.onclick = async () => {
        saveBtn.classList.add("disabled");
        saveBtn.disabled = true;
        const newText = document.getElementById("editTextArea").value.trim();
        const newTitle = document.getElementById("editTitle").value.trim().slice(0, 100);
        const detectedLanguage = await detectLanguage(newText);
        if (newText.length < 10) {
          log("red", "Post must be at least 10 characters long");
          saveBtn.classList.remove("disabled");
          saveBtn.disabled = false;
          return;
        }
        try {
          let editAfterComment = false;
          if (!data.editAfterComment) {
            try {
              let commentsRef, tweetsRef;

              if (window.communityID) {
                commentsRef = collection(db, "communities", window.communityID, "posts", tweetId, "comments");
                tweetsRef = collection(db, "communities", window.communityID, "posts")
              } else {
                commentsRef = collection(db, "tweets", tweetId, "comments");
                tweetsRef = collection(db, "tweets");
              }

              const commentQuery = query(
                commentsRef,
                where("uid", "!=", auth.currentUser.uid),
                limit(1)
              );

              const tweetQuery = query(
                tweetsRef, 
                where("retweetOf", "==", tweetId)
              );

              const [commentSnap, tweetSnap] = await Promise.all([
                getDocs(commentQuery),
                getDocs(tweetQuery)
              ]);

              editAfterComment = !commentSnap.empty || !tweetSnap.empty;

            } catch (err) {
              console.error("Error checking comments:", err);
            }
          } else {
            editAfterComment = true;
          }

          await updateDoc(tweetRef, {
            text: newText,
            title: newTitle,
            edited: new Date(),
            language: detectedLanguage,
            editAfterComment,
          });
          if (data.connectedWynt && data.postedInPublic === false) {
            const connectedRef = doc(db, "tweets", data.connectedWynt);
            await updateDoc(connectedRef, {
              text: newText,
              title: newTitle,
              edited: new Date(),
              language: detectedLanguage,
              editAfterComment
            });    
          }

          log("green", "Post updated");
          overlay.classList.add("hidden");
          if (typeof renderTweet === "function") {
            const currentUser = auth.currentUser;
            const updatedSnap = await getDoc(tweetRef);
            if (updatedSnap.exists()) {
              if (window.communityID) {
                await renderTweet(updatedSnap.data(), tweetId, currentUser, "replace", document.getElementById("appendCommunityTweet"), window.communityID);
              } else {
                await renderTweet(updatedSnap.data(), tweetId, currentUser, "replace");
              }
              applyReadMoreLogic(document.querySelector(`.tweet[data-id='${tweetId}']`));
            }
          }
        } catch (err) {
          console.error("Error saving edited post:", err);
          log("red", "error saving edited post")
          saveBtn.classList.remove("disabled");
          saveBtn.disabled = false;
        }
        saveBtn.classList.remove("disabled");
        saveBtn.disabled = false;
      };
    } catch (err) {
      console.error("Error editing post:", err);
      log("red", "failed to open editor");
    }
  }
  const cmenubtn = e.target.closest(".cmenubtn");
  if (cmenubtn) {
    loading.classList.add("show");
    const overlay = document.getElementById("cMenuOverlay");
    const box = overlay.querySelector(".menu-box");
    const commentId = cmenubtn.dataset.id;
    const tweetId = cmenubtn.dataset.tweet;
    const communityId = cmenubtn.dataset.communityId;
    const isPrivate = cmenubtn.dataset.private;
    const author = cmenubtn.dataset.author;
    const text = cmenubtn.dataset.text;

    let hascom;
    let snap;
    let commentSnap;
    let tweetSnap;
    if (communityId && communityId != null && communityId != "null") {
      hascom = communityId;
    }
    if (!commentId || !tweetId) {
      log("red", "invalid reply");
      return;
    }
    if (hascom) {
      const tweetRef = doc(db, "communities", hascom, "posts", tweetId);
      const commentRef = doc(db, "communities", hascom, "posts", tweetId, "comments", commentId);

      const [tSnap, cSnap] = await getAll(tweetRef, commentRef);

      if (cSnap.exists()) {
        tweetSnap = tSnap;
        commentSnap = cSnap;
        snap = commentSnap;
      } else {
        console.warn(
          `db/communities/${hascom}/posts/${tweetId}/comments/${commentId} not found, trying /tweets`
        );

        const fallbackTweetRef = doc(db, "tweets", tweetId);
        const fallbackCommentRef = doc(db, "tweets", tweetId, "comments", commentId);

        const [ftSnap, fcSnap] = await getAll(fallbackTweetRef, fallbackCommentRef);

        tweetSnap = ftSnap;
        commentSnap = fcSnap;
        snap = commentSnap;
      }
    } else {
      const tweetRef = doc(db, "tweets", tweetId);
      const commentRef = doc(db, "tweets", tweetId, "comments", commentId);

      const [tSnap, cSnap] = await getAll(tweetRef, commentRef);

      tweetSnap = tSnap;
      commentSnap = cSnap;
      snap = commentSnap;
    }
    if (!commentSnap.exists()) {
      log("red", "reply doesn't exist");
      loading.classList.remove("show");
      return;
    }
    if (!tweetSnap.exists()) { 
      log("red", "Wynt doesn't exist");
      loading.classList.remove("show");
      return;
    }

    const commentData = commentSnap.data();
    const data = snap.data();
    const isOwner = auth.currentUser.uid === data.uid;
    const isAdmin = currentUserRole === "admin";
    const tweetData = tweetSnap.data();
    const isTweetOwner = auth.currentUser.uid === tweetData.uid;
    const commentUserRef = doc(db, "users", data.uid);
    const commentUserSnap = await getDoc(commentUserRef);
    const commentUserRole = commentUserSnap.exists() ? commentUserSnap.data().role : "user";
    const showDeleteBtn = isOwner || (isAdmin && commentUserRole !== "admin");

    const showHideBtn = (isTweetOwner || (window.communityID && window.canModerate) || currentUserRole == "admin") && !isOwner;
    const hasMedia = data.media && (data.mediaType === "image" || data.mediaType === "video");
    const isPinned = !!commentData.pinned;
    const canPinReply = commentData.parentId == null && isTweetOwner;
    const now = new Date();
    const editUntil = commentData.editUntil?.toDate ? commentData.editUntil.toDate() : null;
    const canStillEdit = editUntil && now < editUntil;
    const showEditBtn = isOwner && canStillEdit;
    const hastext = text && text != "null" && text != null && text != undefined && text != "undefined";

    box.innerHTML = `
      <div class="flex" style="margin-bottom:5px;">
        <h3 style="margin:0;margin-left:5px;">Actions</h3>
        <div class="c-menu-item close-cmenu" style="margin-left:auto;">
          <img loading='lazy' src="/image/x.svg">
        </div>
      </div>

      ${showEditBtn && !commentData.isHidden
        ? `<div class="c-menu-item comment-edit-btn" data-community-id="${hascom || null}" data-id="${commentId}" data-tweet="${tweetId}">
            <img loading='lazy' src="/image/edit1.svg"> Edit this reply
          </div>`
        : ""
      }

      ${isPrivate != true && isPrivate != 'true' && !commentData.isHidden && !commentData.isPrivateParent ?
        `<div class="c-menu-item reply-share" data-community-id="${hascom || null}" data-id="${commentId}" data-tweet="${tweetId}">
          <img loading='lazy' src="/image/share.svg"> Share this reply
        </div>` : ""
      }

      ${canPinReply && !commentData.isHidden && isPrivate != true && isPrivate != 'true'
        ? `<div class="c-menu-item pin-reply-btn" data-community-id="${hascom || null}" data-id="${commentId}" data-tweet="${tweetId}" data-pinned="${isPinned}">
             <img loading='lazy' src="${isPinned ? '/image/pinned.svg' : '/image/pin.svg'}"> ${isPinned ? 'Unpin this reply' : 'pin this reply'}
           </div>`
        : ""
      }

      ${isOwner ? `
        <div class="menu-item settings-btn1" id="commentOptionsEdit" data-id=${tweetId} data-comment=${commentId}>
          <img loading='lazy' src="/image/settings.svg">
          Change reply settings
        </div>  
      ` : ""
      }

      ${showHideBtn && isPrivate != true && isPrivate != 'true'
        ? `<div class="c-menu-item comment-hide-btn" data-community-id="${hascom || null}" data-id="${commentId}" data-tweet="${tweetId}">
            <img src="/image/eye.svg"> ${commentData.isHidden ? `Unhide this reply` : `Hide this reply`}
            ${currentUserRole == "admin" ? "as a global admin" : `${window.communityID && window.canModerate ? "as community admin" : "as Wynt author"}`}
          </div>`
        : ""
      }

      ${showDeleteBtn || (window.communityID && window.canModerate)
        ? `<div class="c-menu-item comment-delete-btn"  data-community-id="${hascom || null}" data-id="${commentId}" data-tweet="${tweetId}">
            <img loading='lazy' src="/image/trash.svg"> Delete this reply ${isOwner ?  "" : `${(isAdmin && commentUserRole !== "admin") ? "as global admin" : `
              ${window.communityID && window.canModerate ? "as community admin" : ""}
            `}`}
          </div>`
        : ""
      }

      <h4 style="margin:5px 0;margin-left:5px;">Others</h4>

      ${hasMedia && !commentData.isHidden && isPrivate != true && isPrivate != 'true'
        ? `<div class="c-menu-item download-btn" data-community-id="${hascom || null}" data-tweet="${tweetId}" data-comment="${commentId}">
            <img loading='lazy' src="/image/download.svg"> Download attachment
          </div>`
        : ""
      }

      ${isOwner ? "" : `
        <div class="c-menu-item report-btn" data-community-id="${hascom || null}"    data-tweet="${tweetId}" data-comment="${commentId}">
          <img loading='lazy' src="/image/report.svg"> Report this reply
        </div>`
      }

      ${commentData.text ? `
      <div class="c-menu-item text-copy">
        <img loading='lazy' src="/image/copy.svg"> copy text
      </div>` : ""}

      <div class="menu-item viewLikes1" data-tweet="${tweetId}" ${hascom ? `data-community="${hascom}"` : ""} data-comment="${commentId}">
          <img loading="lazy" src="/image/heart.svg"> view likes
      </div>

      ${isOwner ? `
      <div class="menu-item viewViews1" data-tweet="${tweetId}" ${hascom ? `data-community="${hascom}"` : ""} data-comment="${commentId}">
          <img loading="lazy" src="/image/eye.svg"> view who interacted
      </div>
      ` : ""}
    `;
    overlay.classList.remove("hidden");
    loading.classList.remove("show");

    if (isOwner) {
      document.getElementById("commentOptionsEdit").addEventListener("click", () => {
        document.getElementById("commentOption").classList.remove("hidden");
        document.getElementById("permissionOnEdit2").classList.add("hidden");
        document.getElementById("settings-save1").classList.remove("hidden");
      });
    }

    if (commentData.text) box.querySelector(".text-copy").dataset.text = commentData.text;
  }

  const viewViews1 = e.target.closest(".viewViews1");
  if (viewViews1) {
    initViews(
      viewViews1.dataset.tweet,
      viewViews1.dataset.communityId || null,
      viewViews1.dataset.comment,
      "views",
      null
    );
  }

  const viewlikes1 = e.target.closest(".viewLikes1");
  if (viewlikes1) {
    initViews(
      viewlikes1.dataset.tweet,
      viewlikes1.dataset.communityId || null,
      viewlikes1.dataset.comment,
      "likes",
      null
    );
  }

  const deleteBtn = e.target.closest(".delete-btn");
  if (deleteBtn) {
    loading.classList.add("show");

    const tweetId = deleteBtn.dataset.id;
    const offenderId = auth.currentUser.uid;

    document.getElementById("tweetMenuOverlay").classList.add("hidden");

    const isCommunityPost = !!window.communityID;
    const tweetRef = isCommunityPost
      ? doc(db, "communities", window.communityID, "posts", tweetId)
      : doc(db, "tweets", tweetId);

    const tweetSnap = await getDoc(tweetRef);
    if (!tweetSnap.exists()) {
      loading.classList.remove("show");
      return log("red", "Wynt doesn't exist");
    }

    const data = tweetSnap.data();
    const isOwner = offenderId === data.uid;
    const isAdmin = currentUserRole === "admin";
    const isCommunityMod = isCommunityPost && window.canModerate;

    if (!isOwner && !isAdmin && !isCommunityMod) {
      loading.classList.remove("show");
      return log("red", "insufficient permission");
    }

    let reason = null;
    if (!isOwner && (isAdmin || isCommunityMod)) {
      loading.classList.remove("show");
      reason = await inputDialog("delete Wynt as moderator", "state why you're proceeding this action", null, "", true);
      if (!reason) return;
      loading.classList.add("show");
    } else {
      if (!(await confirmDialog(
        "Delete Wynt?",
        "Are you sure you want to delete this Wynt? This action cannot be undone.",
        "red"
      ))) {
        loading.classList.remove("show");
        return;
      }
    }

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tweetRef);

        if (!snap.exists()) throw new Error("already deleted");

        const d = snap.data();

        const isOwnerTx = offenderId === d.uid;
        const isAdminTx = currentUserRole === "admin";
        const isCommunityModTx = isCommunityPost && window.canModerate;

        if (!isOwnerTx && !isAdminTx && !isCommunityModTx) {
          throw new Error("insufficient permission");
        }

        let originalRef = null;
        let connectedRef = null;
        let commentRef = null;

        if (d.retweetOf) {
          if (isCommunityPost) {
            originalRef = doc(db, "communities", window.communityID, "posts", d.retweetOf);
          } else if (d.sharedFromCommunity || d.communityId) {
            originalRef = doc(db, "communities", d.sharedFromCommunity || d.communityId, "posts", d.retweetOf);
          } else {
            originalRef = doc(db, "tweets", d.retweetOf);
          }
        }

        if (d.connectedWynt && d.postedInPublic === false) {
          connectedRef = doc(db, "tweets", d.connectedWynt);
        }

        if (d.retweetOfComment) {
          const { tweetId: parentId, commentId } = d.retweetOfComment;

          commentRef = isCommunityPost
            ? doc(db, "communities", window.communityID, "posts", parentId, "comments", commentId)
            : doc(db, "tweets", parentId, "comments", commentId);
        }

        const [originalSnap, connectedSnap, commentSnap] = await Promise.all([
          originalRef ? tx.get(originalRef) : Promise.resolve(null),
          connectedRef ? tx.get(connectedRef) : Promise.resolve(null),
          commentRef ? tx.get(commentRef) : Promise.resolve(null),
        ]);

        if (originalSnap?.exists()) {
          tx.update(originalRef, {
            retweetCount: increment(-1),
          });
        }

        if (connectedSnap?.exists()) {
          tx.delete(connectedRef);

          tx.update(doc(db, "users", d.uid), {
            posts: increment(-1),
          });

          tx.delete(doc(db, "users", d.uid, "posts", d.connectedWynt));
        }

        if (commentSnap?.exists()) {
          tx.update(commentRef, {
            retweetCount: increment(-1),
          });
        }

        if (isCommunityPost) {
          tx.update(doc(db, "communities", window.communityID), {
            posts: increment(-1),
          });
        } else {
          tx.update(doc(db, "users", d.uid), {
            posts: increment(-1),
          });

          tx.delete(doc(db, "users", d.uid, "posts", tweetId));
        }

        tx.delete(tweetRef);
      });
    } catch (err) {
      loading.classList.remove("show");
      return log("red", err.message || "delete failed");
    }

    if (data.mediaType === "video" && data.mediaPath) {
      supabase.storage.from("wints").remove([data.mediaPath]).catch(console.error);
    }

    if (!isOwner && isCommunityMod && !isAdmin) {
      const communityName = await getCommunityNameById(window.communityID)
      if (data.mediaType === "image" || data.mediaType === "video") {
        const thumbnail = data.mediaType === "video" ?
          await extractVideoFrame(data.media, 0.1) :
          data.media;

        sendCommunityTweetDeleteNotification(data.uid, data.originalText || data.text, reason, communityName, window.communityID, thumbnail);
      } else {
        sendCommunityTweetDeleteNotification(data.uid, data.originalText || data.text, reason, communityName, window.communityID);
      }
    }

    if (!isOwner && isAdmin) {
      const { username: posterName } = await getUserData(data.uid);
      const { username: offenderName } = await getUserData(offenderId);
      const suslistRef = doc(db, "susList", data.uid);
      const suslistSnap = await getDoc(suslistRef);
      let currentWarnings = 0;
      if (suslistSnap.exists()) {
        currentWarnings = suslistSnap.data().warnings;
      }

      discord("Wynt deleted", "red", {
        "text": data.text,
        "author": `${posterName} (${data.uid})`,
        "posted at": formatUTC8(data.createdAt),
        "offend": reason,
        "offender": `${offenderName} (${auth.currentUser.uid})`,
        "user warnings": `${currentWarnings + 1}`,
      }, new Date(), [
        data.media || null
      ], "admin");

      await setDoc(suslistRef,
        { warnings: increment(1) },
        { merge: true }
      );

      if (data.mediaType === "image" || data.mediaType === "video") {
        const thumbnail = data.mediaType === "video" ?
          await extractVideoFrame(data.media, 0.1) :
          data.media;

        sendTweetWarningNotification(data.uid, data.originalText || data.text, reason, thumbnail);
      } else {
        sendTweetWarningNotification(data.uid, data.originalText || data.text, reason);
      }
    }

    document.querySelectorAll(`#tweet-${tweetId}`).forEach(el => el.remove()); 

    const pl1 = document.querySelector(`.profilePinned-${tweetId}`);
    const pl2 = document.querySelector(`.userPinned-${tweetId}`); 
    const pl3 = document.querySelector(`.communityPinned-${tweetId}`); 

    if (pl1) pl1.style.opacity = "0"; 
    if (pl2) pl2.style.opacity = "0"; 
    if (pl3) pl3.style.opacity = "0";

    log("green", "Wynt deleted");
    loading.classList.remove("show");
  }

  const pinBtn = e.target.closest(".pin-btn");
  if (pinBtn) {
    const textContent = document.querySelector(".pin-btn").textContent;

    if (localStorage.getItem("disableConfirmation") != "true") {
      if (textContent.includes("Unpin")) {
        if (!(await confirmDialog("unpin from profile?", "you may re-pin it anytime."))) return log("var(--light)", "canceled");    
      } else {
        if (!(await confirmDialog("pin to profile?", "This will replace the current pinned Wynt on your profile."))) return log("var(--light)", "canceled");
      }
    }

    loading.classList.add("show");

    const tweetId = pinBtn.dataset.id;
    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);
    const pinnedId = userSnap.exists() ? userSnap.data().pinned : null;

    if (pinnedId === tweetId) {
      await updateDoc(userRef, {
        pinned: deleteField()
      });
    } else {
      await updateDoc(userRef, {
        pinned: tweetId
      });
    }

    document.getElementById("tweetMenuOverlay").classList.add("hidden");
    loading.classList.remove("show");

    if (textContent.includes("Unpin")) {
      log("green", "unpinned from profile");
    } else {
      log("green", "pinned to profile");
    }
  }
});

let removedCount = 0;
let topRemovedCount = 0;
let newestSnapshotMostLiked = null;
let newestSnapshotNewest = null;
let oldestSnapshotMostLiked = null;
let oldestSnapshotNewest = null;

function scoreTweet(t, currentUserFollowing) {
  const ageHours = (Date.now() - t.createdAt.toDate().getTime()) / (1000 * 60 * 60);
  let score = 0;
  // decay after some time
  const freshness = Math.exp(-ageHours / 48) * 30;
  score += freshness;
  // Engagement
  score += (t.likeCount || 0) * 3;
  score += (t.commentCount || 0) * 2;
  score += (t.donations || 0) * 0.001;
  // Boost followed users
  if (currentUserFollowing?.has(t.uid)) {
    score += 15;
  }
  // Boost based on text length
  if (t.text) {
    const lengthBoost = Math.min(t.text.length / 50, 10);
    // every 50 chars = +1 point, capped at +10
    score += lengthBoost;
  }
  // Tiny shuffle to break ties
  score += Math.random();
  return score;
}

const mainContainer = document.getElementById("timeline");
const newBanner = document.createElement("div");
newBanner.style.cssText = `display:none;margin-top:20px;background:none;pointer-events:none;z-index:3;`;
newBanner.className = "overlay1";
const banner = document.createElement("div");
banner.style.cssText = `position:absolute;top:0;right:auto;left:auto;width: fit-content; background: #04aa6d; color:white; padding: 8px 15px; border-radius: 50px;pointer-events:auto;cursor:pointer;`;
banner.textContent = `0 new Wynt posted`;
newBanner.appendChild(banner);
let unsubscribeMain = null;
let firstVisibleMain = null;
let newIncomingMain = [];

async function resetMainListener() {
  if (unsubscribeMain) unsubscribeMain();
  if (!firstVisibleMain) return;

  const listenQ = query(
    collection(db, "tweets"), 
    orderBy("createdAt", "desc"), 
    where("archived", "!=", true),
    where("createdAt", ">", firstVisibleMain.data().createdAt)
  );

  unsubscribeMain = onSnapshot(listenQ, async (snapshot) => {
    const docs = snapshot.docs.filter(d => !newIncomingMain.some(i => i.id === d.id) && !document.querySelector(`[data-id="${d.id}"]`));
    if (!docs.length) return;
    newIncomingMain.push(...docs);
    banner.textContent = `${newIncomingMain.length} new Wynt${newIncomingMain.length === 1 ? '' : 's'} posted`;
    newBanner.style.display = "flex";
    banner.classList.remove("disabled");
    banner.disabled = false;
  });
}
mainContainer.prepend(newBanner);

banner.onclick = async () => {
  if (!newIncomingMain.length) return;
  banner.classList.add("disabled");
  banner.disabled = true;
  newIncomingMain.sort((a, b) => b.data().createdAt - a.data().createdAt);

  newIncomingMain.forEach(async (docSnap) => {
    const tweet = docSnap.data();
    const userDoc = await getDoc(doc(db, "users", tweet.uid));
    const user = userDoc.exists() ? {
      ...userDoc.data(),
      uid: tweet.uid
    } : {
      uid: tweet.uid
    };
    const temp = document.createElement("div");
    await renderTweet(tweet, docSnap.id, user, "append", temp);
    const firstChild = temp.firstElementChild;
    if (firstChild) mainContainer.insertBefore(firstChild, mainContainer.firstChild);
  });
  
  firstVisibleMain = newIncomingMain[0] || firstVisibleMain;
  newIncomingMain = [];
  newBanner.style.display = "none";
  setTimeout(() => {
    if (!newIncomingMain.length) newBanner.style.display = "none";
  }, 300);
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
  await resetMainListener();
};

async function loadTweets(initial = false, direction = "down", count = 10) {
  const tweetsRef = collection(db, "tweets");

  const baseQuery =
    direction === "down"
      ? query(
          tweetsRef,
          orderBy("createdAt", "desc"),
          where("archived", "!=", true),
          ...(newestSnapshotNewest
            ? [startAfter(newestSnapshotNewest)]
            : []),
          limit(count)
        )
      : query(
          tweetsRef,
          orderBy("createdAt", "asc"),
          where("archived", "!=", true),
          ...(oldestSnapshotNewest
            ? [startAfter(oldestSnapshotNewest)]
            : []),
          limit(count)
        );

  const snap = await getDocs(baseQuery);

  let tweetObjs = snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      _score: scoreTweet(data, currentUserFollowing)
    };
  });

  tweetObjs.sort((a, b) => b._score - a._score);

  if (direction === "up") {
    tweetObjs.reverse();
  }

  let firstTweetRendered = false;

  tweetObjs.forEach(async (tweet) => {
    await renderTweet(
      tweet,
      tweet.id,
      auth.currentUser,
      direction === "down" ? "append" : "prepend"
    );

    if (!firstTweetRendered) {
      firstTweetRendered = true;
      document.getElementById("loading")?.remove();
    }
  });

  if (direction === "down") {
    newestSnapshotNewest =
      snap.docs.at(-1) || newestSnapshotNewest;
  } else {
    oldestSnapshotNewest =
      snap.docs.at(-1) || oldestSnapshotNewest;
  }

  loadingMore = false;

  if (!firstVisibleMain && snap.docs.length) {
    firstVisibleMain = snap.docs[0];
  }

  if (!unsubscribeMain && firstVisibleMain) {
    await resetMainListener();
  }
}

window.addEventListener("scroll", async () => {
  const tweets = document.querySelectorAll(".tweet");
  if (loadingMore) return;
  if (!tweets.length) return;

  const scrollTop = window.scrollY;
  const viewportHeight = window.innerHeight;
  const scrollHeight = document.documentElement.scrollHeight;
  const atBottom = scrollTop + viewportHeight >= scrollHeight - 150;

  if (atBottom) {
    await loadTweets(false, "down", 10);
  }
});

function setupPoll(checkboxId, containerId, addBtnId, pollDuration) {
  const cb = document.getElementById(checkboxId);
  const container = document.getElementById(containerId);
  const addBtn = document.getElementById(addBtnId);
  const polldur = document.getElementById(pollDuration);

  const applyMaxLength = () => {
    container.querySelectorAll(".poll-option").forEach(input => {
      input.maxLength = 50;
    });
  };

  applyMaxLength();

  cb.addEventListener("change", () => {
    if (cb.checked) {
      container.classList.remove("hidden");
    } else {
      container.classList.add("hidden");
      container.querySelectorAll(".poll-option-wrapper").forEach((opt, i) => {
        if (i > 1) opt.remove();
      });
      addBtn.style.display = "inline-block";

      applyMaxLength();
    }
  });

  addBtn.addEventListener("click", () => {
    const count = container.querySelectorAll(".poll-option-wrapper").length;
    if (count >= 4) return;

    const wrapper = document.createElement("div");
    wrapper.className = "poll-option-wrapper";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "5px";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "poll-option";
    input.placeholder = `Option`;

    input.maxLength = 50;

    const removeBtn = document.createElement("div");
    removeBtn.innerHTML = `<img loading='lazy' src="/image/x.svg">`;
    removeBtn.style.cursor = "pointer";

    removeBtn.addEventListener("click", () => {
      wrapper.remove();
      const optionCount = container.querySelectorAll(".poll-option-wrapper").length;
      if (optionCount < 2) {
        addBtn.style.display = "inline-block";
      }
    });

    wrapper.appendChild(input);
    wrapper.appendChild(removeBtn);
    container.insertBefore(wrapper, polldur);

    const newCount = container.querySelectorAll(".poll-option-wrapper").length;
    if (newCount >= 2) {
      addBtn.style.display = "none";
    }
  });
}
setupPoll("includePoll", "pollOptions", "addPollOption", "pollDuration");
setupPoll("includePollRetweet", "pollOptionsRetweet", "addPollOptionRetweet", "pollDurationRetweet");
setupPoll("includePollComment", "pollOptionsComment", "addPollOptionComment", "pollDurationComment");

const giftBtn = document.getElementById("giftBtn");
const giftOverlay = document.getElementById("giftOverlay");
const closeGift = document.getElementById("closeGift");
const confirmGift = document.getElementById("confirmGift");
const giftAmountInput = document.getElementById("giftAmount");
let currentTweetOwnerId = null;
let pendingDonation = 0;
if (giftBtn) {
  giftBtn.onclick = () => {
    if (!currentTweetOwnerId) {
      log("red", "you must select a Wynt to send gifts")
      return;
    }
    giftOverlay.classList.remove("hidden");
  };
}
if (closeGift) {
  closeGift.onclick = () => {
    giftOverlay.classList.add("hidden");
  };
}
if (confirmGift) {
  confirmGift.onclick = () => {
    const amount = parseInt(giftAmountInput.value);
    if (isNaN(amount) || amount <= 0) {
      log("red", "Enter a valid amount");
      return;
    }
    if (amount > 1000) {
      info("x", "Sorry...", "our policy only allow donations up to 1000 Wcoins.");
      return;
    }
    pendingDonation = amount;
    giftOverlay.classList.add("hidden");
    giftAmountInput.value = "";
    const commentStatus = document.getElementById("comment-status");
    commentStatus.innerHTML = `<div class="donation-preview" style="display:flex;align-items:center;gap:5px;color:#0485b7;font-size:15px;margin-bottom:10px;"><img loading='lazy' src="/image/gift.svg"> You will donate <span style="color:#f91880;font-size:15px;font-weight:bold;">${formatNumber(Math.floor(pendingDonation * 0.8))}</span> Wcoins with this reply</div>`;
  };
}
document.body.addEventListener("click", async (e) => {
  const voteBtn1 = e.target.closest(".vote-btn1");
  if (voteBtn1) {
    loading.classList.add("show");
    const tweetId = voteBtn1.dataset.id;
    const commentId = voteBtn1.dataset.commentid;
    const optionIndex = parseInt(voteBtn1.dataset.index, 10);
    const uid = auth.currentUser.uid;
    let voteRef;
    let tweetRef;
    if (window.communityID) {
      voteRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId, "votes", uid);
      tweetRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId)
    } else {
      voteRef = doc(db, "tweets", tweetId, "comments", commentId, "votes", uid);
      tweetRef = doc(db, "tweets", tweetId, "comments", commentId);
    }
    try {
      await runTransaction(db, async (transaction) => {
        const voteSnap = await transaction.get(voteRef);
        const tweetSnap = await transaction.get(tweetRef);
        if (!tweetSnap.exists()) {
          log("red", "Wynt doesn't exist");
          loading.classList.remove("show");
          return;
        }
        const poll = tweetSnap.data().poll;
        if (!poll || !Array.isArray(poll.options)) return log("red", "invalid poll");
        if (poll.expiresAt) {
          if (poll.expiresAt.toDate && poll.expiresAt.toDate() < new Date()) {
            log("red", "This poll has ended");
            return;
          }
        }
        if (voteSnap.exists()) {
          log("red", "You already voted on this poll");
          loading.classList.remove("show");
          return;
        }
        poll.votes[optionIndex] = (poll.votes[optionIndex] || 0) + 1;
        transaction.update(tweetRef, {
          poll
        });
        transaction.set(voteRef, {
          votedAt: new Date(),
          optionIndex
        });
      });
      const tweetSnap = await getDoc(tweetRef);
      const voteSnap = await getDoc(voteRef);
      const myVoteIndex = voteSnap.exists() ? voteSnap.data().optionIndex : null;
      document.querySelectorAll(`#poll-${tweetId}-${commentId}`).forEach(el => {
        el.outerHTML = renderPoll1(tweetSnap.data(), tweetId, commentId, myVoteIndex);
      });
    } catch (err) {
      console.error("Error submitting vote:", err);
      log("red", "error submitting vote");
    }
    loading.classList.remove("show");
  }

  const voteBtn = e.target.closest(".vote-btn");
  if (voteBtn) {
    loading.classList.add("show");
    const tweetId = voteBtn.dataset.id;
    const optionIndex = parseInt(voteBtn.dataset.index, 10);
    const uid = auth.currentUser.uid;
    let voteRef;
    let tweetRef;
    if (window.communityID) {
      voteRef = doc(db, "communities", window.communityID, "posts", tweetId, "votes", uid);
      tweetRef = doc(db, "communities", window.communityID, "posts", tweetId)
    } else {
      voteRef = doc(db, "tweets", tweetId, "votes", uid);
      tweetRef = doc(db, "tweets", tweetId);
    }
    try {
      await runTransaction(db, async (transaction) => {
        const voteSnap = await transaction.get(voteRef);
        const tweetSnap = await transaction.get(tweetRef);
        if (!tweetSnap.exists()) {
          log("red", "Wynt doesn't exist");
          loading.classList.remove("show");
          return;
        }
        const poll = tweetSnap.data().poll;
        if (!poll || !Array.isArray(poll.options)) return log("red", "invalid poll");
        if (poll.expiresAt) {
          if (poll.expiresAt.toDate && poll.expiresAt.toDate() < new Date()) {
            log("red", "This poll has ended");
            return;
          }
        }
        if (voteSnap.exists()) {
          log("red", "You already voted on this poll");
          loading.classList.remove("show");
          return;
        }
        poll.votes[optionIndex] = (poll.votes[optionIndex] || 0) + 1;
        transaction.update(tweetRef, {
          poll
        });
        transaction.set(voteRef, {
          votedAt: new Date(),
          optionIndex
        });
      });
      const tweetSnap = await getDoc(tweetRef);
      const voteSnap = await getDoc(voteRef);
      const myVoteIndex = voteSnap.exists() ? voteSnap.data().optionIndex : null;
      document.querySelectorAll(`#poll-${tweetId}`).forEach(el => {
        el.outerHTML = renderPoll(tweetSnap.data(), tweetId, myVoteIndex);
      });
    } catch (err) {
      console.error("Error submitting vote:", err);
      log("red", "error submitting vote");
    }
    loading.classList.remove("show");
  }
  let replyingToId = null;
  const commentBtn = e.target.closest(".comment-btn");
  if (commentBtn) {
    e.preventDefault();
    document.getElementById("commentTweet").innerHTML = `
      <div class="skeleton-card" style="margin:0;margin-bottom:40px">
        <div class="skeleton-header">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-header-lines">
            <div class="skeleton-line short"></div>
            <div class="skeleton-line medium"></div>
          </div>
        </div>
      </div>
    `;
    const tweetId = commentBtn.dataset.id;

    dev("");
    document.getElementById("commentOverlay").classList.remove("hidden");
    document.getElementById("commentInput").focus();
    pendingDonation = 0;
    let tweetRef;
    if (window.communityID && window.isJoined) {
      tweetRef = doc(db, "communities", window.communityID, "posts", tweetId)
    } else {
      tweetRef = doc(db, "tweets", tweetId);
    }
    const tweetSnap = await getDoc(tweetRef);
    if (!tweetSnap.exists()) {
      document.getElementById("commentTweet").innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:25px;">
        <div style="border-bottom:10px solid var(--dark);z-index:1;height:40px;">
          <img loading="lazy" src="/image/default-avatar.jpg" onerror="this.src='image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
        </div>
        <div>
          <div class="flex" style="display:Flex;gap:5px;">
            <strong>System</strong>
            <img loading='lazy' src="/image/icon.png" height="20" width="20" style="margin:0;">
          </div>
          <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
            <p style="margin-bottom:0px !important;color:grey;">Post is not available or you don't have permission to reply</p>
          </div>
        </div>
      </div>
      `;
      return;
    }
    const tweetData = tweetSnap.data();
    currentTweetOwnerId = tweetData.uid;
    if (tweetData.uid === auth.currentUser.uid) {
      document.getElementById("giftLabel").classList.add("hidden");
    } else {
      document.getElementById("giftLabel").classList.remove("hidden");
    }

    const {avatar} = await getUserData(auth.currentUser.uid);
    document.getElementById("commentAvatar").src = avatar;
    const createdAt = formatDate(tweetData.createdAt);
    const parsedText = await parseMentionsToLinks(tweetData.text, tweetData.mentions || {});
    const tweetOwnerId = tweetData.uid;
    let titleHTML = "";
    if (tweetData.title) {
      titleHTML = `<h3 style="margin:10px 0;">${escapeHTML(tweetData.title)}</h3>`;
    }
    let editHTML4 = "";
    if (tweetData.edited && tweetData.editAfterComment) {
      editHTML4 = `        
        <img src="/image/editicon.svg" class="editedatt" title="edited at ${formatTime(tweetData.edited)}. click me">`
    }
    const { username, avatar: avatar1, displayName } = await getUserData(tweetData.uid);

    let mediaHTML = "";
    const containsSpoiler = tweetData.sensitiveMedia === true;
    let vidId = null;
    let vidRtId = null;
    if (tweetData.media && tweetData.mediaType === "image") {
      const src = base91ToImageSrc(tweetData.media);
      if (containsSpoiler) {
        mediaHTML = `
            <div style="margin:10px 0;" class="attachment spoiler-media" onclick="this.classList.add('revealed')">
              <div class="spoiler-overlay">
                <div class="spoilertxt">sensitive</div>
              </div>
              <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';" />
            </div>`;
      } else {
        mediaHTML = `
            <div class="attachment" style="margin:10px 0;">
              <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';" />
            </div>`;
      }
    } else if (tweetData.media && tweetData.mediaType === "video") {
      if (containsSpoiler) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div style="margin-bottom:10px;" class="attachment spoiler-media" onclick="
              getSupabaseVideo('${tweetData.media}', '${vidId}');
              this.classList.add('revealed');
            ">
              <div class="spoiler-overlay">
                <div class="spoilertxt">sensitive</div>
              </div>
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
      } else {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment">
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;margin-bottom:10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
        if (!document.getElementById(vidId)) getSupabaseVideo(tweetData.media, vidId);
      }
    }

    await updateCommentUI(tweetData, document.getElementById("commentInput"), document.querySelectorAll(".skibidi"), document.getElementById("comment-status"), null);

    document.getElementById("commentTweet").innerHTML = `
                    <div style="display:flex;gap:10px;margin-bottom:-15px !important;">
                      <div style="border-bottom:10px solid var(--dark);z-index:1;height:40px;">
                        <img loading='lazy' src="${avatar1 || 'image/default-avatar.jpg'}" onerror="this.src='image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
                      </div>
                      <div>
                        <div class="flex" style="display:Flex;gap:5px;margin-bottom:10px;">
                         ${(tweetData.mentions && Object.values(tweetData.mentions).includes(auth.currentUser.uid)) ?
                            `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                            ""
                          }
                          <strong>${escapeHTML(displayName || "Unnamed")}</strong>
                          <span style="opacity:0.7;font-size:12px;"><span class="usernamee">@${escapeHTML(username)} •</span> ${createdAt} ${editHTML4}</span>
                        </div>
                        <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
                          ${titleHTML}
                          <div class=post-body style="margin-bottom:5px !important">${parsedText}</div> 
                          ${mediaHTML} 
                        </div>
                      </div>
                    </div>`;
    applyReadMoreLogic(document.getElementById("commentTweet"));

    if (editHTML4 != "") { if (tweetData.editAfterComment) {
      document.getElementById("commentTweet").querySelector(".editedatt").onclick = () => {
        showOriginal(tweetData.originalText, tweetData.mentions || {}, tweetData.originalTitle);
      };
    }}

    document.getElementById("sendComment").onclick = async () => {
      const sendBtn = document.getElementById("sendComment");
      sendBtn.disabled = true;
      sendBtn.classList.add("disabled");

      function reset() {
        sendBtn.disabled = false;
        sendBtn.classList.remove("disabled");
      }

      try {
        const commentInput = document.getElementById("commentInput");
        const commentText = commentInput.value.trim();
        const fileInput = document.querySelector(".comment-media-input");
        const files = fileInput.files;
        const videos = Array.from(files).filter(f => f.type.startsWith("video/"));
        const images = Array.from(files).filter(f => f.type.startsWith("image/"));

        if (!commentText && !images && !videos) {
          log("red", "please add anything before posting a reply");
          reset();
          return;
        }
        if (videos.length > 0 && images.length > 0) {
          log("red", "please don't upload videos and images together");
          reset();
          return;
        }
        if (videos.length > 1) {
          log("red", "please only insert one video at a time");
          reset();
          return;
        }
        if (images.length > 4) {
          log("red", "please insert images less than 5");
          reset();
          return;
        }

        const user = auth.currentUser;
        const userRef = doc(db, "users", user.uid);

        dev("reading your auth");
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();

        if (userData.suspended === true && userData.suspendedUntil > Timestamp.now()) {
          info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
          reset();
          return;
        }

        const premiumExpiry = userData.premium ? userData.premium.toDate() : null;
        const now = new Date();
        const isPremium = premiumExpiry && premiumExpiry > now;
        const maxSize = isPremium ? 5.5 * 1024 * 1024 : 3.5 * 1024 * 1024;

        let media = "";
        let mediaType = "";
        let mediaPath = "";

        if (videos.length === 1) {
          const cooldown = userData.commentVideoCooldown;
          if (cooldown && cooldown.toMillis() > Date.now()) {
            const remainingMs = cooldown.toMillis() - Date.now();
            const remainingMin = Math.ceil(remainingMs / 60000);
            log("red", `Comments with video cooldown resets in ${remainingMin} minute${remainingMin> 1 ? 's' : ''}`);
            reset();
            return;
          }

          const file = videos[0];
          if (file.size > maxSize) {
            log("red", `please insert only videos lower than ${isPremium ? "5.5MB" : "3.5MB"}`);
            reset();
            return;
          }

          mediaType = "video";

          dev("uploading video");
          media = await uploadToSupabase(file, user.uid, isPremium);
          if (!media.url) {
            log("red", "Video upload failed")
            return;
          }

          mediaPath = media.path;
          const cooldownDuration = isPremium ? 50 * 60 * 1000 : 2 * 60 * 60 * 1000;

          dev("updating your auth");
          await updateDoc(userRef, {
            commentVideoCooldown: Timestamp.fromDate(new Date(Date.now() + cooldownDuration)),
          });
        } else if (images.length > 0) {
          let encodedBase91;
          if (images.length > 1) {
            const collageBase64 = await makeCollage(images);
            encodedBase91 = await compressImageTo480(collageBase64);
          } else {
            encodedBase91 = await compressImageTo480(images[0]);
          }

          mediaType = "image";
          media = {
            url: encodedBase91,
            type: "image",
            path: null
          };
          mediaPath = null;
        }

        if (commentText || media) {
          const mentions = await extractMentions(commentText);
          let mentioned = null;
          if (!window.communityID) {
            mentioned = Object.values(mentions).filter(Boolean);
          }

          let donation = 0;
          let donationReceived = 0;
          let sentDonationNotification = false;

          const editUntil = new Date(Date.now() + 15 * 60 * 1000);

          let commentsRef, postRef;
          if (window.communityID) {
            postRef = doc(db, "communities", window.communityID, "posts", tweetId);
            commentsRef = collection(db, "communities", window.communityID, "posts", tweetId, "comments");
          } else {
            postRef = doc(db, "tweets", tweetId);
            commentsRef = collection(db, "tweets", tweetId, "comments");
          }

          const isPrivate1 = document.getElementById("isPrivateReply").checked;
          const muteNotif = document.getElementById("cmute").checked;
          const sensitiveMedia = document.getElementById("csensitive").checked;

          let isPrivate = false;
          let tweetSnap;

          dev("getting Wynt document");
          if (window.communityID) {
            tweetSnap = await getDoc(doc(db, "communities", window.communityID, "posts", tweetId));
          } else {
            tweetSnap = await getDoc(doc(db, "tweets", tweetId));
          }
          const tweetData = tweetSnap.data();

          let isBlocked = false;
          if (tweetData.uid != auth.currentUser.uid) {
            const blockRef = doc(db, "users", tweetOwnerId, "blocks", auth.currentUser.uid);

            dev("checking author's blocks");
            const blockSnap = await getDoc(blockRef);
            if (blockSnap.exists()) {
              const blockData = blockSnap.data();
              if (
                (blockData.blockUntil && blockData.blockUntil.toDate() > new Date()) 
                || blockData.permanent === true
              ) {
                isBlocked = true;
              } 
            }
          }

          if (isPrivate1 && tweetData.noPrivateReply != true && !isBlocked) {
            let privateQuery;

            if (window.communityID) {
              privateQuery = query(
                collection(db, "communities", window.communityID, "posts", tweetId, "comments"),
                where("uid", "==", auth.currentUser.uid),
                where("isPrivate", "==", true),
                limit(1)
              );
            } else {
              privateQuery = query(
                collection(db, "tweets", tweetId, "comments"),
                where("uid", "==", auth.currentUser.uid),
                where("isPrivate", "==", true),
                limit(1)
              );
            }

            dev("checking for private comment from auth");
            const privateSnap = await getDocs(privateQuery);

            if (privateSnap.empty) {
              isPrivate = true;
            } else {
              log("red", "you can't post private reply anymore");
              reset();
              document.getElementById("isPrivateReply").checked = false;
              document.getElementById("cmute").checked = false;
              document.getElementById("csensitive").checked = false;
              isPrivate = false;
              return;
            }
          }

          if (isPrivate1 && tweetData.noPrivateReply) {
            const confirm = await confirmDialog("cannot private reply", "The Wynt owner has chosen to not allow private replies. Send as public reply?");
            if (!confirm) {
              reset();
              document.getElementById("isPrivateReply").checked = false;
              document.getElementById("cmute").checked = false;
              document.getElementById("csensitive").checked = false;
              return;
            }
          }

          let poll = null;
          if (document.getElementById("includePollComment").checked) {
            const options = Array.from(document.querySelectorAll("#pollOptionsComment .poll-option")).map(inp => inp.value.trim().slice(0, 50)).filter(Boolean);
          
            if (options.length >= 2) {
              const duration = document.getElementById("pollDurationComment")?.value || "8h";
              let expiresAt = null;
              const now = new Date();
              if (duration === "8h") now.setHours(now.getHours() + 8);
              if (duration === "24h") now.setDate(now.getDate() + 1);
              if (duration === "3d") now.setDate(now.getDate() + 3);
              if (duration === "1w") now.setDate(now.getDate() + 7);
              if (duration === "3w") now.setDate(now.getDate() + 21);
              expiresAt = now;
              poll = {
                options,
                votes: Array(options.length).fill(0),
                duration,
                expiresAt
              };
            }
          }

          const text = commentText;

          dev("detecting language");
          const detectedLanguage = await detectLanguage(text);

          const commentRef = doc(commentsRef);

          let TWEETOWNERSUSPENDED = false;
          await runTransaction(db, async (tx) => {
            if (tweetData.uid != auth.currentUser.uid) {
              const tweetUserRef = doc(db, "users", tweetData.uid);

              dev("reading Wynt's author account");
              const tweetUserSnap = await tx.get(tweetUserRef);
              let tweetUserData;
              if (tweetUserSnap.exists()) tweetUserData = tweetUserSnap.data();

              if (tweetUserData.suspended === true && tweetUserData.suspendedUntil > Timestamp.now()) {
                TWEETOWNERSUSPENDED = true;
              }
            }

            if (TWEETOWNERSUSPENDED === false) {
              tx.set(commentRef, {
                text,
                mentioned,
                originalText: commentText,
                communityId: window.communityID || null,
                media,
                mediaType,
                mediaPath,
                language: detectedLanguage,
                uid: auth.currentUser.uid,
                donationReceived,
                searchTokens: tokenize(commentText),
                likeCount: 0,
                editUntil,
                createdAt: serverTimestamp(),
                mentions,
                poll,
                parentId: replyingToId || null,
                isPrivate,
                canReadPrivate: tweetOwnerId,
                muteNotif,
                sensitiveMedia
              });
            }
          });

          if (TWEETOWNERSUSPENDED === true) {
            info("x", "Insufficient permission", "This post author is temporarily suspended from using this platform. Please try again later");
          }

          if (TWEETOWNERSUSPENDED === false) {
            const commentId = commentRef.id;

            if (pendingDonation > 0) {
              const userRef1 = doc(db, "users", auth.currentUser.uid);
              const ownerRef = doc(db, "users", tweetOwnerId);

              let tweetRef = window.communityID ? doc(db, "communities", window.communityID, "posts", tweetId) : doc(db, "tweets", tweetId);
            
              donation = pendingDonation;
              donationReceived = Math.floor(pendingDonation * 0.8);

              try {
                await runTransaction(db, async (tx) => {

                  dev("reading auths");
                  const [userSnap, ownerSnap] = await Promise.all([
                    tx.get(userRef1),
                    tx.get(ownerRef)
                  ]);

                  if (!userSnap.exists()) {
                    throw new Error("user isn't logged in");
                  }
                  if (!ownerSnap.exists()) {
                    throw new Error("Wynt author doesn't exist");
                  }
                  const donorBalance = userSnap.data().balance || 0;
                  if (donorBalance < pendingDonation) {
                    throw new Error("Insufficient balance");
                  }

                  dev("updating documents");
                  tx.update(userRef1, {
                    balance: increment(-pendingDonation)
                  });
                  tx.update(ownerRef, {
                    balance: increment(donationReceived)
                  });
                  tx.update(tweetRef, {
                    donations: increment(donationReceived)
                  });
                  tx.update(commentRef, {
                    donationReceived
                  });
                });

                sentDonationNotification = true;
                pendingDonation = 0;
              } catch (err) {
                console.error(err);
                log("red", err.message);
                return;
              }
            }

            if (!isPrivate) {
              updateDoc(postRef, {
                commentCount: increment(1)
              });
            }

            if (window.communityID) {
              updateDoc(doc(db, "communities", window.communityID, "members", auth.currentUser.uid), {
                contributions: increment(1)
              });
            }

            const tweetText = tweetData.originalText || tweetData.text;

            const invalidMentions = Object.values(mentions).filter(
              (uid) => uid && uid !== auth.currentUser.uid && uid !== tweetData.uid
            );

            if (isPrivate && invalidMentions.length > 0) {
              info("x", "Error", "reply sent, but.. since you set it as private reply, users weren't mentioned.");
            }

            let communitySnap;
            if (window.communityID) {
              dev("reading community");
              communitySnap = await getDoc(doc(db, "communities", window.communityID));
            }
            const communityName = communitySnap?.exists() ?
              communitySnap.data() : null;

            if (!isPrivate) {
              dev("sending mention(s)");
              await Promise.all(
                Object.values(mentions).filter(Boolean).map(async (uid) => {
                  if (uid === tweetData.uid) return;

                  if (window.communityID && !window.isOnPrivate) {
                    if (mediaType === "image") {
                      sendCommunityCommentMentionNotification(tweetId, uid, text, window.communityID, commentId, communityName, tweetText, media.url);
                    } else {
                      sendCommunityCommentMentionNotification(tweetId, uid, text, window.communityID, commentId, communityName, tweetText);
                    }
                  } else if (window.isOnPrivate && window.communityID) {
                      if (communitySnap.exists()) {
                        if (communitySnap.data().members.includes(uid)) {
                          if (mediaType === "image") {
                              sendCommunityCommentMentionNotification(tweetId, uid, text, window.communityID, commentId, communityName, tweetText, media.url);
                          } else {
                              sendCommunityCommentMentionNotification(tweetId, uid, text, window.communityID, commentId, communityName, tweetText);
                          }
                        } else {
                          info(
                            "x",
                            "insufficient permission",
                            "user is not notified due to this is a private community and the user doesn't have permission to view it."
                          );
                        }
                      }
                  } else {
                    if (mediaType === "image") {
                      sendCommentMentionNotification(tweetId, uid, text, commentId, tweetText, media.url);
                    } else {
                      sendCommentMentionNotification(tweetId, uid, text, commentId, tweetText);
                    }
                  }
                })
              );
            }
            
            if (tweetData.muteNotif != true && !isBlocked) {
              if (!sentDonationNotification) {
                if (window.communityID) {
                  if (tweetData.mediaType === "image" || tweetData.mediaType === "video") {
                    const thumbnail = tweetData.mediaType === "video" ?
                      await extractVideoFrame(tweetData.media, 0.1) :
                      tweetData.media;

                    sendCommunityCommentNotification(tweetId, commentText, window.communityID, commentId, communityName, tweetText, tweetData.uid, thumbnail);
                  } else {
                    sendCommunityCommentNotification(tweetId, commentText, window.communityID, commentId, communityName, tweetText, tweetData.uid);
                  }
                } else {
                  if (tweetData.mediaType === "image" || tweetData.mediaType === "video") {
                    const thumbnail = tweetData.mediaType === "video" ?
                      await extractVideoFrame(tweetData.media, 0.1) :
                      tweetData.media;

                    sendCommentNotification(tweetId, commentText, commentId, tweetText, tweetData.uid, thumbnail);
                  } else {
                    sendCommentNotification(tweetId, commentText, commentId, tweetText, tweetData.uid);
                  }
                }
              } else if (sentDonationNotification) {
                if (window.communityID) {
                  if (tweetData.mediaType === "image" || tweetData.mediaType === "video") {
                    const thumbnail = tweetData.mediaType === "video" ?
                      await extractVideoFrame(tweetData.media, 0.1) :
                      tweetData.media;

                    sendCommunityDonationNotification(tweetId, donation, donationReceived, commentText, window.communityID, commentId, communityName, tweetText, thumbnail);
                  } else {
                    sendCommunityDonationNotification(tweetId, donation, donationReceived, commentText, window.communityID, commentId, communityName, tweetText);
                  }
                } else {
                  if (tweetData.mediaType === "image" || tweetData.mediaType === "video") {
                    const thumbnail = tweetData.mediaType === "video" ?
                      await extractVideoFrame(tweetData.media, 0.1) :
                      tweetData.media;

                    sendDonationNotification(tweetId, donation, donationReceived, commentText, commentId, tweetText, thumbnail);
                  } else {
                    sendDonationNotification(tweetId, donation, donationReceived, commentText, commentId, tweetText);
                  }
                }
              }
            }

            clearcomment();
            loadComments(tweetId);

            if (window.communityID) {
              incrementViews(tweetId, null, window.communityID);
            } else if (tweetData.communityId && tweetData.postedInPublic === false) {
              incrementViews(tweetId, null, comid)
            } else {
              incrementViews(tweetId, null, null);
            }
            log("green", "reply posted");
            dev("");
          }
        }
      } catch (err) {
        console.error("Error sending comment:", err);
        console.log(err.code, err.message);
        log("red", "error sending reply");
      } finally {
        replyingToId = null;
        reset();
        document.getElementById('commentOverlay').classList.add('hidden');
        document.querySelectorAll(".poll-option").forEach(inp => {
          inp.value = "";
        });
        document.getElementById("includePollComment").checked = false;
        document.getElementById("pollOptionsComment").classList.add("hidden");
        loading.classList.remove("show");
      }
    };
  }

  const bookmarkBtn = e.target.closest(".bookmark-btn");
  if (bookmarkBtn) {
    loading.classList.add("show");
    const btn = bookmarkBtn;
    const tweetId = btn.id.replace("bookmarkBtn-", "");
    const communityId = btn.dataset.community || null;
    document.getElementById("tweetMenuOverlay").classList.add("hidden");

    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);
    const data = userSnap.data();

    const premiumExpiry = data.premium ? data.premium.toDate() : null;
    const now = new Date();
    const isPremium = premiumExpiry && premiumExpiry > now;
    await openBookmarkOverlay(tweetId, isPremium, true, communityId);
    loading.classList.remove("show");
  }
  
  const highlightBtn = e.target.closest(".highlight-btn");
  if (highlightBtn) {
    loading.classList.add("show");
    const btn = highlightBtn;
    const tweetId = btn.id.replace("highlightBtn-", "");
    const communityId = btn.dataset.community || null;
    document.getElementById("tweetMenuOverlay").classList.add("hidden");

    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);
    const data = userSnap.data();

    const premiumExpiry = data.premium ? data.premium.toDate() : null;
    const now = new Date();
    const isPremium = premiumExpiry && premiumExpiry > now;
    await openHighlightOverlay(tweetId, isPremium, true, communityId);
    loading.classList.remove("show");
  }
});

document.body.addEventListener("click", async (e) => {
  const replyBtn = e.target.closest(".reply-btn");
  if (!replyBtn) return;
  e.preventDefault();
  document.getElementById("replyComment").innerHTML = `
<div class="skeleton-card" style="margin:0;margin-bottom:40px">
  <div class="skeleton-header">
    <div class="skeleton-avatar"></div>
    <div class="skeleton-header-lines">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line medium"></div>
    </div>
  </div>
</div>
  `
  dev("");
  document.getElementById("replyOverlay").classList.remove("hidden");
  document.getElementById("replyInput").focus();
  window.communityID_reply = null;
  const tweetId = replyBtn.dataset.tweet;
  const commentId = replyBtn.dataset.id;
  const meSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
  const {
    avatar
  } = await getUserData(auth.currentUser.uid);
  document.getElementById("replyAvatar").src = avatar;

  let commentRef, tweetRef;
  if (window.communityID && window.isJoined) {
    commentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId)
    tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
  } else {
    commentRef = doc(db, "tweets", tweetId, "comments", commentId);
    tweetRef = doc(db, "tweets", tweetId);
  }

  const [tweetSnap, commentSnap] = await getAll(tweetRef, commentRef);

  if (!commentSnap.exists()) {
    document.getElementById("replyComment").innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:25px;">
        <div style="border-bottom:10px solid var(--dark);z-index:1;height:40px;">
          <img loading="lazy" src="/image/default-avatar.jpg" onerror="this.src='image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
        </div>
        <div>
          <div class="flex" style="display:Flex;gap:5px;">
            <strong>System</strong>
            <img loading='lazy' src="/image/icon.png" height="20" width="20" style="margin:0;">
          </div>
          <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
            <p style="margin-bottom:0px !important;color:grey;">Post is not available or you don't have permission to reply</p>
          </div>
        </div>
      </div>
    `;
    return;
  }
  const commentData = commentSnap.data();
  const {avatar: avatar1, username, displayName} = await getUserData(commentData.uid);
  const parsedText = await parseMentionsToLinks(commentData.text || "", commentData.mentions || {});
  const createdAt = formatDate(commentData.createdAt);
  let editHTML6 = "";
  if (commentData.edited && commentData.editAfterComment) {
    editHTML6 = `
        <img src="/image/editicon.svg" class="editedatt" title="edited at ${formatTime(commentData.edited)}. click me"> 
      `
  }

    const containsSpoiler = commentData.sensitiveMedia === true;
    let mediaHTML = "";
    let vidId = "";

    if (commentData.media && commentData.mediaType === "image") {
      const src = base91ToImageSrc(commentData.media.url);
      if (containsSpoiler) {
        mediaHTML = `
            <div style="margin-bottom:10px;" class="attachment spoiler-media" onclick="this.classList.add('revealed')">
              <div class="spoiler-overlay">
                <div class="spoilertxt">sensitive</div>
              </div>
              <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';" />
            </div>`;
      } else {
        mediaHTML = `
            <div class="attachment" style="margin-bottom:10px;">
              <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';" />
            </div>`;
      }
    } else if (commentData.media && commentData.mediaType === "video") {
      if (containsSpoiler) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment spoiler-media" onclick="
              getSupabaseVideo('${commentData.media.url}', '${vidId}');
              this.classList.add('revealed');
            ">
              <div class="spoiler-overlay">
                <div class="spoilertxt">sensitive</div>
              </div>
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;margin-bottom:10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
      } else {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment">
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;margin-bottom:10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
        if (!document.getElementById(vidId)) getSupabaseVideo(commentData.media.url, vidId);
      }
    }

  const tweetDatax = tweetSnap.exists() ? tweetSnap.data() : null;

  await updateCommentUI(commentData, document.getElementById("replyInput"), document.querySelectorAll(".skibab"), document.getElementById("reply-status"), tweetDatax);

  document.getElementById("replyComment").innerHTML = `
                    <div style="display:flex;gap:10px;margin-bottom:25px;">
                      <div style="border-bottom:10px solid var(--dark);z-index:1;height:40px;">
                        <img loading='lazy' src="${avatar1 || 'image/default-avatar.jpg'}" onerror="this.src='image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
                      </div>
                      <div>
                        <div class=flex style="display:Flex;gap:5px;margin-bottom:10px">
                          ${commentData.likedByCreator === true ? 
                            `<img style="margin-right:-3px" src="/image/star.svg">` :
                            `${(commentData.mentions && Object.values(commentData.mentions).includes(auth.currentUser.uid)) ?
                              `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                              ""
                            }`
                          }
                          <strong>${escapeHTML(displayName || "Unnamed")}</strong>
                          <span style="opacity:0.7;font-size:12px;"><span class="usernamee">@${escapeHTML(username)} •</span> ${createdAt} ${editHTML6}</span>
                        </div>
                        <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
                          <div class=post-body style="margin-bottom:0px !important;">${parsedText}</div>
                          ${mediaHTML} 
                        </div>
                      </div>
                    </div>`;

  if (editHTML6 != "") {  if (commentData.editAfterComment) {
    document.getElementById("replyComment").querySelector(".editedatt").onclick = () => {
      showOriginal(commentData.originalText, commentData.mentions || {});
    };
  }}

  document.getElementById("sendReply").onclick = async () => {
    const btn = document.getElementById("sendReply");
    btn.disabled = true;
    btn.classList.add("disabled");

    function reset() {
      btn.disabled = false;
      btn.classList.remove("disabled");
    }

    try {
      const text = document.getElementById("replyInput").value.trim();
      const fileInput = document.getElementById("replyMediaInput");
      const files = Array.from(fileInput.files);
      const videos = files.filter(f => f.type.startsWith("video/"));
      const images = files.filter(f => f.type.startsWith("image/"));

      if (videos.length > 0 && images.length > 0) {
        log("red", "please don't upload videos and images together");
        reset();
        return;
      }
      if (videos.length > 1) {
        log("red", "please only insert one video at a time");
        reset();
        return;
      }
      if (images.length > 4) {
        log("red", "please insert images less than 5");
        reset();
        return;
      }

      const isCommunity = window.communityID != null;
      const basePath = isCommunity 
        ? ["communities", window.communityID, "posts", tweetId, "comments"] 
        : ["tweets", tweetId, "comments"];

      const userRef = doc(db, "users", auth.currentUser.uid);

      dev("reading auth");
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();

      if (userData.suspended === true && userData.suspendedUntil > Timestamp.now()) {
        info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
        reset();
        return;
      }

      const premiumExpiry = userData.premium ? userData.premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;
      const maxSize = isPremium ? 5.5 * 1024 * 1024 : 3.5 * 1024 * 1024;

      let media = null;
      let mediaType = "";
      let mediaPath = null;

      if (videos.length === 1) {
        const file = videos[0];
        if (file.size > maxSize) {
          log("red", `please insert only videos lower than ${isPremium ? "5.5MB" : "3.5MB"}`);
          return;
        }

        const lastVideoTime = userData.lastVideoReply?.toDate?.() || null;
        const cooldown = isPremium ? 50 * 60 * 1000 : 2 * 60 * 60 * 1000;
        if (lastVideoTime && now - lastVideoTime < cooldown) {
          const remaining = Math.ceil((cooldown - (now - lastVideoTime)) / 60000);
          log("red", `wait ${remaining} minutes before posting another video reply`)
          return;
        }

        dev("uploading video");
        const upload = await uploadToSupabase(file, auth.currentUser.uid, isPremium);
        media = {
          url: upload.url,
          type: "video"
        };

        mediaType = "video";
        mediaPath = upload.path;

        dev("updating auth");
        await updateDoc(userRef, {
          lastVideoReply: serverTimestamp()
        });
      } else if (images.length > 0) {
        let encodedBase91;

        if (images.length > 1) {
          const collageBase64 = await makeCollage(images);
          encodedBase91 = await compressImageTo480(collageBase64);
        } else {
          encodedBase91 = await compressImageTo480(images[0]);
        }

        mediaType = "image";
        media = {
          url: encodedBase91,
          type: "image",
          path: null
        };
        mediaPath = null;
      }

      if (!text && !media) {
        return;
      }

      const mentions = await extractMentions(text);
      let mentioned = null;
      if (!window.communityID) {
        mentioned = Object.values(mentions).filter(Boolean);
      }

      const editUntil = new Date(Date.now() + 15 * 60 * 1000);

      dev("detecting language");
      const detectedLanguage = await detectLanguage(text);

      const parentCommentRef = doc(db, ...basePath, commentId);

      dev("reading parent comment");
      const parentCommentSnap = await getDoc(parentCommentRef);

      const commentData = parentCommentSnap.data();
      const tweetText = commentData.text;

      let isPrivateParent = false;
      if (commentData.isPrivate || commentData.isPrivateParent || commentData.isHidden) {
        isPrivateParent = true;
      }

      const muteNotif = document.getElementById("rmute").checked;
      const sensitiveMedia = document.getElementById("rsensitive").checked;

      const payload = {
        mentioned,
        text,
        originalText: text,
        communityId: window.communityID || null,
        media,
        mediaType,
        mediaPath,
        language: detectedLanguage,
        uid: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        searchTokens: tokenize(text),
        editUntil,
        mentions: mentions || {},
        likeCount: 0,
        replyCount: 0,
        parentId: commentId,
        isPrivateParent,
        muteNotif,
        sensitiveMedia
      };

      const replyRef = doc(collection(db, ...basePath));
      const replyId = replyRef.id;

      let TWEETOWNERSUSPENDED = false;
      await runTransaction(db, async (tx) => {
        if (commentData.uid != auth.currentUser.uid) {
          const tweetUserRef = doc(db, "users", commentData.uid);

          dev("reading parent author");
          const tweetUserSnap = await tx.get(tweetUserRef);
          let tweetUserData;
          if (tweetUserSnap.exists()) tweetUserData = tweetUserSnap.data();

          if (tweetUserData.suspended === true && tweetUserData.suspendedUntil > Timestamp.now()) {
            TWEETOWNERSUSPENDED = true;
          }
        }

        dev("posting reply");
        if (TWEETOWNERSUSPENDED === false) {
          tx.set(replyRef, payload);
        }
      });

      if (TWEETOWNERSUSPENDED === true) {
        info("x", "Insufficient permission", "This post author is temporarily suspended from using this platform. Please try again later");
      }

      let cSnap;
      if (window.communityID){
        dev("reading community");
        cSnap = await getDoc(doc(db, "communities", window.communityID));
      }
      const communityName = cSnap?.exists() ?
        cSnap.data().name : null;

      if (commentData.muteNotif != true && TWEETOWNERSUSPENDED === false) {
        if (window.communityID) {
          if (commentData.mediaType === "image" || commentData.mediaType === "video") {
            const thumbnail = commentData.mediaType === "video" ?
              await extractVideoFrame(commentData.media.url, 0.1) :
              commentData.media.url;

            sendCommunityReplyNotification(tweetId, commentId, text, window.communityID, communityName, tweetText, replyId, thumbnail);
          } else {
            sendCommunityReplyNotification(tweetId, commentId, text, window.communityID, communityName, tweetText, replyId);
          }
        } else {
          if (commentData.mediaType === "image" || commentData.mediaType === "video") {
            const thumbnail = commentData.mediaType === "video" ?
              await extractVideoFrame(commentData.media.url, 0.1) :
              commentData.media.url;

            sendReplyNotification(tweetId, commentId, text, tweetText, replyId, thumbnail);
          } else {
            sendReplyNotification(tweetId, commentId, text, tweetText, replyId);
          }
        }
      }
  
      if (TWEETOWNERSUSPENDED === false) {
        let greatParentRef, greatParentData, greatParentSnap;
        if (commentData.parentId != null) {
          greatParentRef = doc(db, ...basePath, commentData.parentId);

          dev("reading parent's parent");
          greatParentSnap = await getDoc(greatParentRef);
          greatParentData = greatParentSnap.data();
        }
        let ownerUid;
        let tweetRef1, tweetSnap1, tweetData1;
        if (commentData.parentId === null) {
          if (window.communityID) {
            tweetRef1 = doc(db, "communities", window.communityID, "posts", tweetId);

            dev("reading Wynt");
            tweetSnap1 = await getDoc(tweetRef1);
            tweetData1 = tweetSnap1.data();
          } else {
            tweetRef1 = doc(db, "tweets", tweetId);

            dev("reading Wynt");
            tweetSnap1 = await getDoc(tweetRef1);
            tweetData1 = tweetSnap1.data();
          }
          ownerUid = tweetData1.uid;
        } else {
          ownerUid = greatParentData.uid;
        }

        if (auth.currentUser.uid === ownerUid && commentData.ownerReplied == null) {
          dev("updating reply and parent reply");
          await runTransaction(db, async (tx) => {
            tx.update(parentCommentRef, {
              replyCount: increment(1),
              ownerReplied: replyId
            });
            tx.update(replyRef, {
              ownerReplying: commentId
            })
          });
        } else {
          dev("updating parent reply");
          await updateDoc(parentCommentRef, {
            replyCount: increment(1)
          });
        }

        if (window.communityID) {
          updateDoc(doc(db, "communities", window.communityID, "members", auth.currentUser.uid), {
            contributions: increment(1)
          });
        }

        const invalidMentions = Object.values(mentions).filter(
          (uid) => uid && uid !== auth.currentUser.uid && uid !== commentData.uid
        );

        if (isPrivateParent && invalidMentions.length > 0) {
          info("x", "Error", "reply sent, but.. since the post you're replying to is a private reply, users weren't mentioned.");
        }

        if (!isPrivateParent) {
          await Promise.all(
            Object.values(mentions).filter(Boolean).map(async (uid) => {
              if (uid === commentData.uid) return;

              if (window.communityID && !window.isOnPrivate) {
                if (mediaType === "image") {
                  sendCommunityReplyMentionNotification(tweetId, commentId, uid, text, window.communityID, communityName, tweetText, replyId, media.url);
                } else {
                  sendCommunityReplyMentionNotification(tweetId, commentId, uid, text, window.communityID, communityName, tweetText, replyId);
                }
              } else if (window.isOnPrivate && window.communityID) {
                if (cSnap.exists()) {
                  if (cSnap.data().members.includes(uid)) {
                    if (mediaType === "image") {
                      sendCommunityReplyMentionNotification(tweetId, commentId, uid, text, window.communityID, communityName, tweetText, replyId, media.url);
                    } else {
                      sendCommunityReplyMentionNotification(tweetId, commentId, uid, text, window.communityID, communityName, tweetText, replyId);
                    }
                  }
                }
              } else {
                if (mediaType === "image") {
                  sendReplyMentionNotification(tweetId, commentId, uid, text, tweetText, replyId, media.url);
                } else {
                  sendReplyMentionNotification(tweetId, commentId, uid, text, tweetText, replyId);
                }
              }
            })
          );
        }
      }

      if (!document.getElementById('commentViewer').classList.contains("hidden")) {
        loadComments(tweetId, true, commentId, document.getElementById('replyList'), window.communityID || null);
      }
      document.getElementById("replyInput").value = "";
      fileInput.value = "";
      document.getElementById("replyPreview").innerHTML = "";
      document.getElementById("replyOverlay").classList.add("hidden");
      document.getElementById("rmute").checked = false;
      document.getElementById("rsensitive").checked = false;
      if (TWEETOWNERSUSPENDED === false) {
        log("green", "reply posted");
        dev("");
        if (window.communityID) {
          incrementViews(tweetId, commentId, window.communityID);
        } else {
          incrementViews(tweetId, commentId, null);
        }
      }
    } catch (err) {
      console.error("Error sending reply:", err);
      log("red", "error sending reply");
    } finally {
      reset();
    }
  };
});

document.body.addEventListener("click", async (e) => {
  const premiumbtn = e.target.closest("#buy-premium");
  if (premiumbtn) {
    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      const buyBtn = document.getElementById("buypremium");
      const premiumExpiry = data.premium ? data.premium.toDate() : null;
      const now = new Date();
      if (buyBtn) {
        if (premiumExpiry && premiumExpiry > now) {
          const msLeft = premiumExpiry - now;
          const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
          buyBtn.textContent = `Expires in ${daysLeft} day${daysLeft > 1 ? "s" : ""}.`;
          buyBtn.disabled = true;
          buyBtn.style.background = 'grey';
        }
      }
    }
    document.getElementById("premiumOverlay").classList.remove("hidden");
  }
});

let isOpen = false;
const smallbar1 = document.querySelector('.smallbar1');
const smallbar2 = document.querySelector('.smallbar2');

smallbar1.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!isOpen) {
    smallbar2.classList.remove('hidden');
    isOpen = true;
  } else {
    smallbar2.classList.add('hidden');
    isOpen = false;
  }
});

document.addEventListener('click', (e) => {
  if (isOpen && !smallbar1.contains(e.target) && !smallbar2.contains(e.target)) {
    smallbar2.classList.add('hidden');
    isOpen = false;
  }
});

let commentPagination = {};
let commentLoading = false;
const commentScrollListeners = {};

function resolveScrollBox(container) {
  if (!container) return null;
  if (container.id === "replyList") {
    return document.querySelector("#commentViewer .user-box");
  }
  if (container.id === "commentList") {
    return document.querySelector("#tweetViewer .user-box");
  }
  return null;
}

async function renderOwner(tweetId, ownerReplied, communityId, id, dcomid, ownerPrivate, postedInPublic) {
  const el = document.getElementById(id);

  let isCommentSearch = !!el?.closest("#appendCommentSearch");

  if (!el.querySelector(`#expandComment-${id}`)) {
    el.innerHTML = `
      <div id="${id}" class="ownerr">
        <button style="margin-top:10px;padding:5px 7px;background:var(--light);color:var(--color);display:flex;gap:5px;border:var(--border);font-size:12px;z-index:1;">
          <img style="height:17px;" src="/image/loader.svg">
          Wynt author replied
        </button>
      </div>
    `;
  }

  let ref, snap, data, likeref;
  if (dcomid && postedInPublic === "false") {
    ref = doc(db, "communities", dcomid, "posts", tweetId, "comments", ownerReplied);
    snap = await getDoc(ref);
    data = snap.data();
    likeref = `communities/${dcomid}/posts/${tweetId}/comments/${ownerReplied}/likes/${auth.currentUser.uid}`;
  } else if (communityId && communityId != "null" && communityId != null) {
    ref = doc(db, "communities", communityId, "posts", tweetId, "comments", ownerReplied);
    snap = await getDoc(ref);
    data = snap.data();
    likeref = `communities/${communityId}/posts/${tweetId}/comments/${ownerReplied}/likes/${auth.currentUser.uid}`;   
  } else {
    ref = doc(db, "tweets", tweetId, "comments", ownerReplied);
    snap = await getDoc(ref);
    data = snap.data();
    likeref = `tweets/${tweetId}/comments/${ownerReplied}/likes/${auth.currentUser.uid}`
  }

  const likeId = randomString(14);

  let ownerHTML1 = "";
  let mediaHTML1 = "";

  if (!snap.exists()) {
    ownerHTML1 = `
      <div class="comment-item" style="display:flex;gap:10px;border-bottom:none;padding:20px ${isCommentSearch ? "" : "0"} !important;padding-bottom:0 !important;background:none;">
        <img loading='lazy' src="/image/default-avatar.jpg" class="avatar comment-avatar" style="z-index:1">
        <div style="display:flex;flex-direction:column;width:100%;">
          <div class="flex comment-header" style="gap:10px;margin:0;">
            <div class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer;font-weight:bold;">System</div>
          </div>
          <div class="comment-body">
            <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this reply is unavailable</i></p>
          </div>
        </div>
      </div>
    `;
    el.innerHTML = ownerHTML1;
    return;
  }

  const { displayName: displayName3, username: username3, avatar: avatar3, d } = await getUserData(data.uid);
  const parsedText1 = await parseMentionsToLinks(data.text, data.mentions || {});
  const defaultLanguage = getDefaultLanguage();
  const isTranslate = isTranslateEnabled();

  let translateHTML1 = "";
  if (data.language && data.language !== defaultLanguage && isTranslate) {
    const random = Math.floor(Math.random() * 10000);
    translateHTML1 = `
      <div class="translate-wrapper tr4" style="margin-top:-5px;margin-bottom:5px;">
        <span
          class="translate-btn"
          data-id="${ownerReplied}"
          data-random="${random}"
          data-from="${data.language}"
          data-to="${defaultLanguage}"
          data-title="null"
          style="color:#B0C4DE;cursor:pointer;font-size:15px;"
        >
          Translate from ${data.language}
        </span>
        <div
          id="translated-${ownerReplied}-${random}"
          class="translated-text"
          style="display:none;color:grey;font-size:16px;"
        ></div>
      </div>
    `;
  }

  const containsSpoiler = data.sensitiveMedia === true;
  if (data.media && data.mediaType === "image") {
    const src = base91ToImageSrc(data.media.url);
    mediaHTML1 = `
      <div class="attachment${containsSpoiler ? " spoiler-media reveal-btn" : ""}">
        ${containsSpoiler ? `<div class="spoiler-overlay"><div class="spoilertxt">spoiler</div></div>` : ""}
        <div class="attachment">
          <img loading="lazy" src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';">
        </div>
      </div>`;
  } else if (data.media && data.mediaType === "video" && data.media.url) {
    mediaHTML1 = `
      <div class="attachment ${containsSpoiler ? " spoiler-media reveal-btn" : ""}" style="position: relative;">
        ${containsSpoiler ? `<div class="spoiler-overlay"><div class="spoilertxt">spoiler</div></div>` : ""}
        <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">Your browser does not support the video tag.</video>
      </div>`;
    getSupabaseVideo(data.media.url, vidId);
  }

  let editHTML4 = "";
  if (data.edited && data.editAfterComment) {
    editHTML4 = `
    <img src="/image/editicon.svg" class="editedatt" title="edited at ${formatTime(data.edited)}. click me"> 
        `
  }

  let ownerHTML = "";

  const commentBodyId = `comment-body-${randomString(16)}`;

  if (data.ownerReplied) {
    const id = randomString(32);
    ownerHTML = `
      <div id="${id}" class="ownerr">
        <button style="margin-top:10px;padding:5px 7px;background:var(--light);color:var(--color);display:flex;gap:5px;align-items:center;font-size:12px;border:var(--border);" onclick="
          renderOwner('${tweetId}', '${data.ownerReplied}', '${window.communityID}', '${id}', '${data.communityId}', ${data.isPrivateParent}, ${postedInPublic});
          document.getElementById('${commentBodyId}').style.cssText = 'margin-left: -28px; border-left: 2px solid rgba(255, 255, 255, 0.3); padding-left: 26px; margin-bottom: -30px; padding-bottom: 30px;';
        ">
          <img style="height:17px;transform:rotate(270deg)" src="/image/leftArrow.svg">
          Wynt author replied
        </button>
      </div>
    `
  }

  const content = `
    <div class="no-margin post-body" style="font-size:16px;margin-top:7px;">${parsedText1}</div> 
    ${translateHTML1}
    ${mediaHTML1}
  `;

  const random = randomString(14);

    if (d.banned === true && currentUserRole != "admin") {
      ownerHTML1 = `
        <div data-id="${ownerReplied}" data-community-id="${dcomid || null}" data-tweet="${tweetId}" class="comment-item" style="display:flex;gap:10px;border-bottom:none;padding:20px ${isCommentSearch ? "" : "0"} !important;padding-bottom:0 !important;background:none;">
          <img loading='lazy' src="${escapeHTML(avatar3)}" onerror="this.src='/image/default-avatar.jpg'" class="avatar comment-avatar" style="z-index:1">
          <div style="display:flex;flex-direction:column;width:100%">
            <div class="flex comment-header" style="gap:10px;margin:0;">
              <div class="user-link" data-uid="${data.uid}" style="cursor:pointer;font-weight:bold;">Suspended user</div>
              <span class="comment-date">
                ${formatDate(data.createdAt)} 
              </span>
            </div>
            <div class="comment-body" id="${commentBodyId}">
              <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 6px;color:grey">This Wynt is from a suspended user</p>
            </div>
          </div>
        </div>
        ${data.isHidden ? `
          <div id="commentOwner-${commentId}" class="hidden">
            ${ownerHTML}       
          </div>` 
        : `${ownerHTML}`}
      `;
    } else {
      ownerHTML1 = `
        <div data-id="${ownerReplied}" data-community-id="${dcomid || null}" data-tweet="${tweetId}" class="comment-item comment-owner" style="display:flex;gap:10px;border-bottom:none;padding:20px ${isCommentSearch ? "" : "0"} !important;padding-bottom:0 !important;background:none;">
          <img loading='lazy' src="${escapeHTML(avatar3)}" onerror="this.src='/image/default-avatar.jpg'" class="avatar comment-avatar" style="z-index:1">
          <div style="display:flex;flex-direction:column;width:100%">
            <div class="flex comment-header" style="gap:10px;margin:0;">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${data.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(data.mentions && Object.values(data.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <div class="user-link" data-uid="${data.uid}" style="cursor:pointer;font-weight:bold;">${escapeHTML(displayName3)}</div>
              <span class="comment-date">
                <span class="usernamee">@${escapeHTML(username3)} •</span> 
                ${formatDate(data.createdAt)} 
                ${editHTML4}
              </span>
              <span style="margin-left:auto" class="cmenubtn" data-private="${data.isPrivate || false}" data-community-id="${data.communityId || null}" data-id="${ownerReplied}" data-tweet="${tweetId}" data-author="${data.uid}">
                <img loading='lazy' src="/image/three-dots.svg">
              </span>
            </div>
            <div class="comment-body" id="${commentBodyId}">
              ${data.isHidden ? `
                <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentSubHidden-${ownerReplied}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentOwner-${ownerReplied}-${random}').classList.remove('hidden');
                  document.getElementById('commentSubItem-${ownerReplied}-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${data.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${data.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentSubItem-${ownerReplied}-${random}">
                  ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${data.hiddenByAuthority ? `by moderators ${data.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${data.hiddenReason ? `(hidden for: ${data.hiddenReason})` : ""}` : ""}` : `${data.hiddenByAdmin ? `by community admin ${data.hiddenReason ? `(hidden for: ${data.hiddenReason})` : ""}` : `by Wynt author ${data.hiddenReason ? `(hidden for: ${data.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
                </div>` : `
                ${content}
              `}
              <div class="flex" style="margin:0;gap:25px;">
                ${data.isHidden ? "" :`
                  <span style="cursor:pointer;color:#757779" data-community-id="${window.communityID || null}" class="comment-like-btn" data-id="${ownerReplied}" data-tweet="${tweetId}">
                    <div id="${likeId}" class="clikeicon" style="height:20px">
                        <img loading='lazy' src="/image/heart.svg">
                    </div>
                    ${data.likeCount > 0 ? `<span style="color:#757779;" id="comment-like-count-${ownerReplied}">${data.likeCount > 0 ? data.likeCount : ""}</span>` : ""}
                  </span>
                  <span style="cursor:pointer;color:#757779" class="reply-btn" data-id="${ownerReplied}" data-tweet="${tweetId}">
                    <img loading='lazy' src="/image/message.svg"> ${data.replyCount > 0 ? data.replyCount : ""}
                  </span>
                  ${ownerPrivate ? "" :
                  `<span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${tweetId}" data-comment-id="${ownerReplied}">
                    <img loading='lazy' src="/image/rewint.svg"> ${data.retweetCount > 0 ? data.retweetCount : ""}
                  </span>`}
                  <span class="viewbtn" style="margin-left:auto;color:#757779"><img loading="lazy" src="/image/chart.svg"> ${data.viewsCount > 0 ? data.viewsCount : ""}</span>
                `}
              </div>
            </div>
          </div>
        </div>
        ${data.isHidden ? `
          <div id="commentOwner-${commentId}-${random}" class="hidden">
            ${ownerHTML}       
          </div>` 
        : `${ownerHTML}`}
        `;
    }

  el.innerHTML = ownerHTML1;
  applyReadMoreLogic(el)
  const likeEl = el.querySelector(`#${likeId}`);
  getSnap(likeref, likeEl);

  if (translateHTML1 != "") {
    el.querySelector(".tr4 .translate-btn").dataset.text = data.text;
  }
  if (editHTML4 != "") { if (data.editAfterComment) {
    el.querySelector(".editedatt").onclick = () => {
      showOriginal(data.originalText, data.mentions || {});
    };
  }}
}

window.renderOwner = renderOwner;

async function loadComments(tweetId, reset = true, parentId = null, container = null, communityId = null, searchTerm = null) {
  if (reset) {
    commentLoading = false;
    const key = `${tweetId}:${parentId || "root"}`;
    commentPagination[key] = {
      lastVisible: null,
      end: false
    };
  }
  const key = `${tweetId}:${parentId || "root"}`;
  commentPagination[key] ||= {
    lastVisible: null,
    end: false
  };
  const state = commentPagination[key];
  if (state.end) return;
  if (commentLoading) return;
  commentLoading = true;
  const list = container || document.getElementById("commentList");
  const scrollBox = resolveScrollBox(list);
  const listenerKey = `${tweetId}:${parentId || "root"}:${list.id}`;
  if (scrollBox && !commentScrollListeners[listenerKey]) {
    commentScrollListeners[listenerKey] = true;
    scrollBox.addEventListener("scroll", async () => {
      const nearBottom = scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 150;
      if (!nearBottom) return;
      const currentState = commentPagination[key];
      if (commentLoading || currentState.end) return;
      await loadComments(tweetId, false, parentId, container, communityId);
    });
  }
  if (reset) {
    if (container) {
      list.innerHTML = "";
    } else {
      list.innerHTML = `<div class="comment-scrollbox" id="commentWrapper"></div>`;
    }
  }
  const hasSearch = searchTerm && searchTerm.trim().length >= 3;
  const words = hasSearch ? tokenize(searchTerm.toLowerCase()) : [];
  const searchList = words.slice(0, 10);
  let baseQ;
  const baseCollection = communityId || window.communityID ? collection(db, "communities", communityId || window.communityID, "posts", tweetId, "comments") : collection(db, "tweets", tweetId, "comments");

  const baseWhere = parentId === null ? where("parentId", "==", null) : where("parentId", "==", parentId);

  if (hasSearch) {
    baseQ = query(baseCollection, baseWhere, where("searchTokens", "array-contains-any", searchList), orderBy("createdAt", "desc"), limit(10));
  } else {
    baseQ = query(baseCollection, baseWhere, orderBy("likeCount", "desc"), orderBy("createdAt", "desc"), limit(10));
  }
  if (!reset && state.lastVisible) {
    baseQ = query(baseQ, startAfter(state.lastVisible));
  }
  let pinnedDoc = null;
  if (parentId === null) {
    try {
      let pinnedQ;
      if (communityId || window.communityID) {
        pinnedQ = query(collection(db, "communities", communityId || window.communityID, "posts", tweetId, "comments"), where("parentId", "==", null), where("pinned", "==", true), limit(1));
      } else {
        pinnedQ = query(collection(db, "tweets", tweetId, "comments"), where("parentId", "==", null), where("pinned", "==", true), limit(1));
      }
      const pinSnap = await getDocs(pinnedQ);
      if (!pinSnap.empty) pinnedDoc = pinSnap.docs[0];
    } catch (err) {
      console.warn(err);
    }
  }
  const snap = await getDocs(baseQ);
  if (snap.empty) {
    state.end = true;
    commentPagination[key] = state;
    commentLoading = false;
    return;
  }
  state.lastVisible = snap.docs[snap.docs.length - 1];
  if (snap.docs.length < 10) state.end = true;
  commentPagination[key] = state;
  const wrapper = container || document.getElementById("commentWrapper");
  let comid = communityId || window.communityID || "";
  let tweetDoc;
  if (comid) {
    tweetDoc = await getDoc(doc(db, "communities", comid, "posts", tweetId));
  } else {
    tweetDoc = await getDoc(doc(db, "tweets", tweetId));
  }
  const tweetData = tweetDoc.data();
  const tweetOwnerId = tweetData.uid;
  comid = tweetData.communityId || comid || "";
  const isOwner = auth.currentUser.uid === tweetOwnerId;

  async function renderCommentNode(docSnap, isPinned = false) {
    const commentId = docSnap.id;
    const d = docSnap.data();
    let translateHTML2 = "";
    if (d.isPrivate && d.uid != auth.currentUser.uid && d.canReadPrivate != auth.currentUser.uid) {
      return;
    }
    if (wrapper && wrapper.querySelector(`.comment-item[data-id="${commentId}"]`)) return;
    const { displayName, username, avatar, d: data } = await getUserData(d.uid);

    let path;
    if (window.communityID) {
      path = `communities/${window.communityID}/posts/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    } else if (communityId) {
      path = `communities/${communityId}/posts/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    } else {
      path = `tweets/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`;
    }

    const likeId = randomString(14);

    const commentLikeCount = d.likeCount || 0;
    const vidId = `vid-${commentId}-${Math.random().toString(36).slice(2,8)}`;
    const parsedText = await parseMentionsToLinks(d.text, d.mentions || {});
    let donationHTML = "";
    let ownerHTML = "";

    if (d.donationReceived) {
      donationHTML = `<span style="color:#0485b7;font-size:15px;padding-bottom:10px;display:block">
        <img draggable="false" class="emoji" alt="🎁" src="https://ox7jbzyn-13kwt53x-purp2e2u.netlify.app/twemoji/svg/1f381.svg"> Gifted <span style="color:#f91880;font-weight:bold;">${formatNumber(d.donationReceived)}</span> Wcoins
      </span>`;
    }

    const commentBodyId = `comment-body-${randomString(16)}`;

    const id = randomString(32);
    if (d.ownerReplied) {
      ownerHTML = `
        <div id="${id}" class="ownerr">
          <button style="display:none;" id="expandComment-${id}" onclick="
            renderOwner('${tweetId}', '${d.ownerReplied}', '${window.communityID || communityId}', '${id}', '${d.communityId}', ${d.isPrivate}, ${tweetData.postedInPublic});
            document.getElementById('${commentBodyId}').style.cssText = 'margin-left: -28px; border-left: 2px solid rgba(255, 255, 255, 0.3); padding-left: 26px; margin-bottom: -30px; padding-bottom: 30px;';
          ">
          </button>
        </div>
      `
    }

    let mediaHTML = "";
    const containsSpoiler = d.sensitiveMedia === true;
    if (d.media && d.mediaType === "image") {
      const src = base91ToImageSrc(d.media.url);
      mediaHTML = `
        <div class="attachment${containsSpoiler ? " spoiler-media reveal-btn" : ""}">
          ${containsSpoiler ? `<div class="spoiler-overlay"><div class="spoilertxt">spoiler</div></div>` : ""}
          <div class="attachment">
            <img loading="lazy" src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';">
          </div>
        </div>`;
    } else if (d.media && d.mediaType === "video" && d.media.url) {
      mediaHTML = `
        <div class="attachment ${containsSpoiler ? " spoiler-media reveal-btn" : ""}" style="position: relative;">
          ${containsSpoiler ? `<div class="spoiler-overlay"><div class="spoilertxt">spoiler</div></div>` : ""}
          <video id="${vidId}" controls style="max-width:100%;max-height:300px;border-radius:10px;">Your browser does not support the video tag.</video>
        </div>`;
      getSupabaseVideo(d.media.url, vidId);
    }
    let editHTML3 = "";
    if (d.edited && d.editAfterComment) {
      editHTML3 = `
        <img src="/image/editicon.svg" class="editedatt" title="edited at ${formatTime(d.edited)}. click me"> 
    `
    }
    const commentHTML = document.createElement("div");
    commentHTML.className = "comment-item";
    commentHTML.dataset.id = commentId;
    commentHTML.dataset.communityId = d.communityId || null;
    commentHTML.dataset.tweet = tweetId;
    commentHTML.dataset.uid = d.uid;
    commentHTML.dataset.text = d.text;

    let privateHTML = "";
    if (d.isPrivate) {
      commentHTML.style.borderLeft = "3px solid #5865f2";
      commentHTML.style.background = "#0b0c15";
      commentHTML.style.paddingLeft = "13px";
      if (auth.currentUser.uid === d.uid) {
        privateHTML = `
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
          <img src="/image/eye.svg">
          <span style="color: grey; font-size: 13px;">
            only you and Wynt owner can see this
          </span>
        </div>
        `;
      } else if (auth.currentUser.uid === d.canReadPrivate) {
        privateHTML = `
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
          <img src="/image/eye.svg">
          <span style="color: grey; font-size: 13px;">
            only you and reply sender can see this
          </span>
        </div>
        `;
      }
    }
    const pinnedBanner = isPinned ? `<div class="iq" style="background:var(--color);margin-bottom:17px;width:fit-content;font-size:12px;">pinned by Wynt author</div>` : "";

    const defaultLanguage = getDefaultLanguage();
    const isTranslate = isTranslateEnabled();
    if (d.language && d.language !== defaultLanguage && isTranslate) {
      const random = Math.floor(Math.random() * 10000);
      translateHTML2 = `
          <div class="translate-wrapper tr5" style="margin-top:-5px;margin-bottom:5px;
      ">
            <span
              class="translate-btn"
              data-id="${commentId}"
              data-random="${random}"
              data-from="${d.language}"
              data-to="${defaultLanguage}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;"
            >
              Translate from ${d.language}
            </span>
            <div
              id="translated-${commentId}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;"
            ></div>
          </div>
        `;
    }

      let pollHTML = "";
      if (d.poll && Array.isArray(d.poll.options)) {
        const uid = auth.currentUser?.uid;
        let myVoteIndex = null;
        if (uid) {
          let voteRef;
          if (window.communityID != null) {
            voteRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId, "votes", uid);
          } else {
            voteRef = doc(db, "tweets", tweetId, "comments", commentId, "votes", uid);
          }
          const voteSnap = await getDoc(voteRef);
          if (voteSnap.exists()) {
            myVoteIndex = voteSnap.data().optionIndex;
          }
        }
        pollHTML = renderPoll1(d, tweetId, commentId, myVoteIndex);
      }

    const content = `
      <div class="no-margin post-body" style="font-size:16px;margin-top:7px;">${parsedText}</div> 
      ${translateHTML2}
      ${mediaHTML}
      ${donationHTML}
      ${pollHTML}
      ${privateHTML}
    `;

    const random = randomString(14);

    if (data.banned === true && currentUserRole != "admin") {
      commentHTML.innerHTML = `
        <div style="display:flex;gap:10px;">
          <img loading='lazy' src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" class="avatar comment-avatar" style="z-index:1">
          <div style="display:flex;flex-direction:column;width:100%;">
            <div class="flex comment-header" style="gap:10px;margin:0;">
              <div class="user-link" data-uid="${d.uid}" style="cursor:pointer;font-weight:bold;">Suspended user</div>
              <span class="comment-date">${formatDate(d.createdAt)}</span>
            </div>
            <div class="comment-body">
              <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 6px;color:grey">This Wynt is from a suspended user</p>
            </div>
          </div>
        </div>
      `
    } else {
      commentHTML.innerHTML = `
        ${pinnedBanner}
        <div style="display:flex;gap:10px;">
          <img loading='lazy' src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" class="avatar comment-avatar" style="z-index:1">
          <div style="display:flex;flex-direction:column;width:100%;">
            <div class="flex comment-header" style="gap:10px;margin:0;">
              ${data.suspended && data.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${d.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(d.mentions && Object.values(d.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <div class="user-link" data-uid="${d.uid}" style="cursor:pointer;font-weight:bold;">${escapeHTML(displayName)}</div>
              <span class="comment-date"><span class="usernamee">@${escapeHTML(username)} •</span> ${formatDate(d.createdAt)} ${editHTML3}</span>
              <span style="margin-left:auto;" class="cmenubtn" data-private="${d.isPrivate || false}" data-community-id="${d.communityId || null}" data-id="${commentId}" data-tweet="${tweetId}"data-author="${d.uid}"><img loading='lazy' src="/image/three-dots.svg"></span>
            </div>
            <div class="comment-body" id="${commentBodyId}">
              ${d.isHidden ? `
                <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${commentId}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentOwner-${commentId}-${random}').classList.remove('hidden');
                  document.getElementById('commentItem-${commentId}-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${d.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`} click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${commentId}-${random}">
                  ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${d.hiddenByAuthority ? `by moderators ${d.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${d.hiddenReason ? `(hidden for: ${d.hiddenReason})` : ""}` : ""}` : `${d.hiddenByAdmin ? `by community admin ${d.hiddenReason ? `(hidden for: ${d.hiddenReason})` : ""}` : `by Wynt author ${d.hiddenReason ? `(hidden for: ${d.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
                </div>        
                ` : `
                ${content}
              `}
              <div class="flex" style="margin:0;gap:25px;">
                ${d.isHidden ? "" : `
                <span class="comment-like-btn" data-id="${commentId}" data-tweet="${tweetId}" style="cursor:pointer;display:flex;align-items:center;gap:3px;">
                  <div id="${likeId}" class="clikeicon" style="height:20px">
                    <img loading='lazy' src="/image/heart.svg">
                  </div>
                  <span style="color:#757779;" id="comment-like-count-${commentId}">${commentLikeCount > 0 ? commentLikeCount : ""}</span>
                </span>
                <span style="cursor:pointer;color:#757779" class="reply-btn" data-id="${commentId}" data-tweet="${tweetId}">
                  <img loading='lazy' src="/image/message.svg"> ${(d.replyCount ?? 0) > 0 ? d.replyCount : ""}
                </span>
                ${d.isPrivate || d.isPrivateParent ? "" :
                  `<span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${tweetId}" data-comment-id="${commentId}">
                    <img loading='lazy' src="/image/rewint.svg"> ${(d.retweetCount ?? 0) > 0 ? d.retweetCount : ""}
                  </span>`
                }
                <span class="viewbtn" style="margin-left:auto;color:#757779"><img loading="lazy" src="/image/chart.svg"> ${d.viewsCount > 0 ? d.viewsCount : ""}</span>
                `}
              </div>
            </div>
          </div>
        </div>
        ${d.isHidden ? `
          <div id="commentOwner-${commentId}-${random}" class="hidden">
            ${ownerHTML}
          </div>` 
        : `${ownerHTML}`}
      `;
    }

    applyReadMoreLogic(commentHTML);
    if (wrapper && !wrapper.querySelector(`.comment-item[data-id="${commentId}"]`)) {
      wrapper.appendChild(commentHTML);
      const likeEl = commentHTML.querySelector(`#${likeId}`);
      getSnap(path, likeEl);
    }

    if (d.ownerReplied) {
      document.getElementById(`expandComment-${id}`).click();
    }

    commentHTML.querySelectorAll(".reveal-btn").forEach(el => {
      el.addEventListener("click", () => el.classList.add("revealed"));
    });

    if (translateHTML2 != "") {
      commentHTML.querySelector(".tr5 .translate-btn").dataset.text = d.text
    }
    if (editHTML3 != "") { if (d.editAfterComment) {
      commentHTML.querySelector(".editedatt").onclick = () => {
        showOriginal(d.originalText, d.mentions || {});
      };
    }}
  }

  if (pinnedDoc && !hasSearch) {
    await renderCommentNode(pinnedDoc, true);
  }

  snap.docs.forEach(async (docSnap) => {
    if (pinnedDoc && docSnap.id === pinnedDoc.id) return;
    if (hasSearch) {
      const data = docSnap.data();
      const tokens = data.searchTokens || [];
      const mustHaveAll = true;
      if (mustHaveAll && !words.every(w => tokens.includes(w))) return;
    }
    await renderCommentNode(docSnap, false);
  });

  commentLoading = false;
}

function clearcomment() {
  const commentpreview = document.getElementById('commentPreview');
  commentpreview.innerHTML = '';
  const commentinput = document.getElementById('commentInput');
  commentinput.value = '';
  const commentMediaInput = document.getElementById('commentMediaInput');
  commentMediaInput.value = '';
  document.getElementById("isPrivateReply").checked = false;
  document.getElementById("cmute").checked = false;
  document.getElementById("csensitive").checked = false;
}

function clearretweet() {
  document.getElementById('retweetText').value = '';
  document.getElementById('retweetTitle').value = '';
  document.getElementById('retweetOverlay').classList.add('hidden');
  document.getElementById('retweetMedia-TWEETID').value = '';
  document.getElementById('retweetPreview-TWEETID').innerHTML = '';
  document.querySelectorAll(".poll-option").forEach(inp => {
    inp.value = "";
  });
  document.getElementById("includePollRetweet").checked = false;
  document.getElementById("pollOptionsRetweet").classList.add("hidden");
  document.getElementById("retweetText").style.height = "auto";
  document.getElementById("rtsensitive").checked = false;
}

function cleartweet() {
  document.getElementById('tweetInput').value = '';
  document.getElementById('tweetTitle').value = '';
  document.getElementById('tweetOverlay').classList.add('hidden');
  document.getElementById('mediaInput').value = '';
  document.getElementById('tweetPreview').innerHTML = '';
  document.querySelectorAll(".poll-option").forEach(inp => {
    inp.value = "";
  });
  document.getElementById("includePoll").checked = false;
  document.getElementById("pollOptions").classList.add("hidden");
  document.getElementById("tweetInput").style.height = "auto";
}

document.body.addEventListener("click", async (e) => {
  const closecomment = e.target.closest("#closeComment");
  if (closecomment) {
    const commentOverlay = document.getElementById('commentOverlay');
    commentOverlay.classList.add('hidden');
    clearcomment();
  }
  const cancelretweetbtn = e.target.closest("#cancelretweet");
  if (cancelretweetbtn) {
    clearretweet();
  }
  const canceltweetbtn = e.target.closest('#canceltweet');
  if (canceltweetbtn) {
    cleartweet();
  }
});
document.body.addEventListener("click", async (e) => {
  const commentLikeBtn = e.target.closest(".comment-like-btn");
  if (commentLikeBtn) {
    e.preventDefault();
    const tweetId = commentLikeBtn.dataset.tweet;
    const commentId = commentLikeBtn.dataset.id;
    const icon1 = commentLikeBtn.querySelector(".clikeicon");

    const countSpan = document.getElementById(`comment-like-count-${commentId}`);
    let commentRef, likeDocRef, tweetRef;
    if (window.communityID && window.isJoined) {
      tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
      commentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId);
      likeDocRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId, "likes", auth.currentUser.uid);
    } else {
      tweetRef = doc(db, "tweets", tweetId);
      commentRef = doc(db, "tweets", tweetId, "comments", commentId);
      likeDocRef = doc(db, "tweets", tweetId, "comments", commentId, "likes", auth.currentUser.uid);
    }
    const userRef = doc(db, "users", auth.currentUser.uid);

    commentLikeBtn.style.pointerEvents = "none";

    try {
      const [ userSnap, tweetSnap, likeSnap, commentSnap] = await Promise.all([
        getDoc(userRef),
        getDoc(tweetRef),
        getDoc(likeDocRef),
        getDoc(commentRef)
      ]);
      const userData = userSnap.data();

      if (userData.suspended === true && userData.suspendedUntil > Timestamp.now()) {
        info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
        return;
      }
      icon1.innerHTML = `<img loading='lazy' height="20" src="/image/loader.svg">`;

      await runTransaction(db, async (transaction) => {
        const tweetData = tweetSnap.data();
        if (tweetData.uid != auth.currentUser.uid) {
          const commentUserRef = doc(db, "users", tweetData.uid);
          const commentUserSnap = await transaction.get(commentUserRef);
          let commentUserData;
          if (commentUserSnap.exists()) commentUserData = commentUserSnap.data();

          if (commentUserData.suspended === true && commentUserData.suspendedUntil > Timestamp.now()) {
            info("x", "insufficient permission", "This post author is temporarily suspended from using this platform. Please try again later");
            icon1.innerHTML = `
              <div class="likeicon" style="height:20px">
                <img loading='lazy' height="20" src="/image/heart.svg">
              </div>
            `;
            return;
          }
        }

        const isCreator = tweetData.uid === auth.currentUser.uid;

        let currentCount = commentSnap.exists() ? (commentSnap.data().likeCount || 0) : 0;
        if (likeSnap.exists()) {
          transaction.delete(likeDocRef);
          transaction.update(commentRef, {
            likeCount: Math.max(currentCount - 1, 0),
          });
          if (isCreator) {
            transaction.update(commentRef, {
              likedByCreator: false,
            })
          }
          icon1.innerHTML = `
            <div class="likeicon" style="height:20px">
              <img loading='lazy' height="20" src="/image/heart.svg">
            </div>
          `;
          if (countSpan) countSpan.textContent = currentCount - 1 > 0 ? currentCount - 1 : "";
        } else {
          const name = userData.displayName ?
            userData.displayName.toLowerCase() :
            "Unknown";
          const status = userData.privateLikes && commentSnap.data().uid != auth.currentUser.uid ?
            "private" : "public";

          transaction.set(likeDocRef, {
            likedAt: new Date(),
            followers: userData.followers,
            photoURL: userData.photoURL || "/image/default-avatar.jpg",
            displayName: userData.displayName || "Unknown",
            username: userData.username || "Unknown",
            name, 
            status
          });
          transaction.update(commentRef, {
            likeCount: currentCount + 1,
          });
          if (isCreator) {
            transaction.update(commentRef, {
              likedByCreator: true,
            })
          }
          icon1.innerHTML = `
            <div class="likeicon" style="height:20px">
              <img loading='lazy' height="20" src="/image/filled-heart.svg">
            </div>
          `;
          if (countSpan) countSpan.textContent = currentCount + 1;
        }
      });
    } catch (err) {
      console.error("Transaction failed:", err);
      log("red", "error liking reply");
    } finally {
      commentLikeBtn.style.pointerEvents = "auto";
    }
  }
  if (e.target.closest(".like-btn")) {
    e.preventDefault();
    const btn = e.target.closest(".like-btn");
    const icon = e.target.closest(".likeicon");
    const tweetId = btn.id.replace("likeBtn-", "");
    const hascom = btn.dataset.communityId != "null";
    const communityId = btn.dataset.communityId;

    let postRef, likeRef;
    if (window.communityID && window.isJoined) {
      postRef = doc(db, "communities", window.communityID, "posts", tweetId);
      likeRef = doc(db, "communities", window.communityID, "posts", tweetId, "likes", auth.currentUser.uid);
    } else if (hascom) {
      postRef = doc(db, "communities", communityId, "posts", tweetId);
      likeRef = doc(db, "communities", communityId, "posts", tweetId, "likes", auth.currentUser.uid);
    } else {
      postRef = doc(db, "tweets", tweetId);
      likeRef = doc(db, "tweets", tweetId, "likes", auth.currentUser.uid);
    }

    const userRef = doc(db, "users", auth.currentUser.uid);
    btn.style.pointerEvents = "none";

    const [userSnap, postSnap, likeSnap] = await Promise.all([
      getDoc(userRef),
      getDoc(postRef),
      getDoc(likeRef)
    ]);
    const userData = userSnap.data();

    if (userData.suspended === true && userData.suspendedUntil > Timestamp.now()) {
      info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
      return;
    }

    if (userData.suspended === true && userData.suspended > Timestamp.now()) {
      info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
      btn.innerHTML = `
        <div class="likeicon" style="height:20px">
          <img loading='lazy' src="/image/heart.svg">
        </div>
      `;
      return;
    }

    try {
      icon.innerHTML = `<img loading='lazy' height="20" src="/image/loader.svg">`;
      await runTransaction(db, async (transaction) => {
        const postData = postSnap.data();
        if (postData.uid != auth.currentUser.uid) {
          const postUserRef = doc(db, "users", postData.uid);
          const postUserSnap = await transaction.get(postUserRef);
          let postUserData;
          if (postUserSnap.exists()) postUserData = postUserSnap.data();

          if (postUserData.suspended === true && postUserData.suspendedUntil > Timestamp.now()) {
            info("x", "insufficient permission", "This post author is temporarily suspended from using this platform. Please try again later");
            btn.innerHTML = `
              <div class="likeicon" style="height:20px">
                <img loading='lazy' src="/image/heart.svg">
              </div>
            `;
            return;
          }
        }

        let newCount = postSnap.exists() ? (postSnap.data().likeCount || 0) : 0;

        if (likeSnap.exists()) {
          transaction.delete(likeRef);
          transaction.update(postRef, {
            likeCount: Math.max(newCount - 1, 0)
          });
          btn.innerHTML = `
            <div class="likeicon" style="height:20px">
              <img loading='lazy' src="/image/heart.svg">
            </div>
            ${newCount - 1 > 0 ? `<span id="likeCount-${tweetId}">${newCount - 1}</span>` : ""}
          `;
        } else {
          const name = userData.displayName ?
            userData.displayName.toLowerCase() :
            "Unknown";
          const status = userData.privateLikes && postSnap.data().uid != auth.currentUser.uid ?
            "private" : "public";

          transaction.set(likeRef, {
            likedAt: new Date(),
            followers: userData.followers,
            photoURL: userData.photoURL || "/image/default-avatar.jpg",
            username: userData.username || "Unknown",
            displayName: userData.displayName || "Unknown",
            name,
            status
          });
          transaction.update(postRef, {
            likeCount: newCount + 1
          });
          btn.innerHTML = `
            <div class="likeicon" style="height:20px">
              <img loading='lazy' src="/image/filled-heart.svg">
            </div>
            <span id="likeCount-${tweetId}">${newCount + 1}</span>`;
        }
      });
    } catch (err) {
      log("red", "error liking Wynt");
    } finally {
      btn.style.pointerEvents = "auto";
    }
  }
  const pinBtn = e.target.closest(".pin-reply-btn");
  if (pinBtn) {
    const tweetId = pinBtn.dataset.tweet;
    const commentId = pinBtn.dataset.id;
    const communityId = pinBtn.dataset.communityId;
    const isPinned = pinBtn.dataset.pinned === "true";

    if (localStorage.getItem("disableConfirmation") != "true") {
      if (isPinned) {
        if (!(await confirmDialog("unpin reply?", "you will still be able to re-pin this reply later."))) return;
      } else {
        if (!(await confirmDialog("pin reply?", "This will replace the current pinned reply."))) return;
      }
    }
    
    loading.classList.add("show");
    let tweetRef, commentsRef;
    if (window.communityID) {
      tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
      commentsRef = collection(db, "communities", window.communityID, "posts", tweetId, "comments");
    } else {
      tweetRef = doc(db, "tweets", tweetId);
      commentsRef = collection(db, "tweets", tweetId, "comments");
    }
    const tweetSnap = await getDoc(tweetRef);
    if (!tweetSnap.exists()) return log("red", "no Wynt found");
    const tweetData = tweetSnap.data();
    if (tweetData.uid !== auth.currentUser.uid) {
      return log("red", "You can only pin replies on your own Wynt")
    }
    try {
      const batch = writeBatch(db);
      const pinnedQ = query(commentsRef, 
        where("pinned", "==", true)
      );

      let targetRef;
      if (window.communityID) {
        targetRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId);
      } else {
        targetRef = doc(db, "tweets", tweetId, "comments", commentId);
      }

      const [pinnedSnap, snap] = await Promise.all([
        getDocs(pinnedQ),
        getDoc(targetRef)
      ])

      const data = snap.data();

      pinnedSnap.docs.forEach(docSnap => {
        if (docSnap.id !== commentId) {
          batch.update(docSnap.ref, {
            pinned: false
          });
        }
      });

      batch.update(targetRef, {
        pinned: !isPinned,
        hasBeenPinned: true
      });
      await batch.commit();

      document.getElementById("cMenuOverlay").classList.add("hidden");
      if (!isPinned && !data.hasBeenPinned) {
        if (window.communityID) {
          const communityName = await getCommunityNameById(window.communityID);
          if (data.mediaType === "image" || data.mediaType === "video") {
            const thumbnail = data.mediaType === "video" ?
              await extractVideoFrame(data.media.url, 0.1) :
              data.media.url;

            sendCommunityPinNotification(data.uid, data.originalText || data.text || "...", tweetId, commentId, window.communityID, communityName, thumbnail);
          } else {
            sendCommunityPinNotification(data.uid, data.originalText || data.text || "...", tweetId, commentId, window.communityID, communityName);
          }
        } else {
          if (data.mediaType === "image" || data.mediaType === "video") {
            const thumbnail = data.mediaType === "video" ?
              await extractVideoFrame(data.media.url, 0.1) :
              data.media.url;

            sendPinNotification(data.uid, data.originalText || data.text || "...", tweetId, commentId, thumbnail);
          } else {
            sendPinNotification(data.uid, data.originalText || data.text || "...", tweetId, commentId);
          }
        }
      }
      if (isPinned) {
        log("green", "reply unpinned");
      } else {
        log("green", "reply pinned");
      }
      loading.classList.remove("show");
      await loadComments(tweetId, true, null, null, window.communityID);
    } catch (err) {
      console.error("Pin/unpin failed:", err);
      log("red", "Failed to change pin status")
      loading.classList.remove("show");
    }
  }
  const commentDeleteBtn = e.target.closest(".comment-delete-btn");
  if (commentDeleteBtn) {
    loading.classList.add("show");
    document.getElementById("cMenuOverlay").classList.add("hidden");
    const tweetId = commentDeleteBtn.dataset.tweet;
    const commentId = commentDeleteBtn.dataset.id;
    let commentRef;
    const isCommunity = !!window.communityID;
    if (isCommunity) {
      commentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId);
    } else {
      commentRef = doc(db, "tweets", tweetId, "comments", commentId);
    }
    const commentSnap = await getDoc(commentRef);
    if (!commentSnap.exists()) {
      log("reply doesn't exist");
      loading.classList.remove("show");
      return;
    }
    const data = commentSnap.data();
    const offenderId = auth.currentUser.uid;
    const isOwner = offenderId === data.uid;

    if (!isOwner && currentUserRole != "admin" && !(window.communityID && window.canModerate)) return log("red", "insufficient permission");

    let reason = "";

    if (!isOwner) { 
      reason = await inputDialog("delete Reply", "state why you're proceeding this action", null, "", true);
      if (!reason) return;
    }

    if (!isOwner && (window.communityID && window.canModerate) && currentUserRole != "admin") {
      const communityName = await getCommunityNameById(window.communityID);
      if (data.mediaType === "image" || data.mediaType === "video") {
        const thumbnail = data.mediaType === "video" ?
          await extractVideoFrame(data.media.url, 0.1) :
          data.media.url;

        sendCommunityReplyDeleteNotification(data.uid, data.originalText || data.text || "...", reason, communityName, window.communityID, thumbnail)
      } else {
        sendCommunityReplyDeleteNotification(data.uid, data.originalText || data.text || "...", reason, communityName, window.communityID)
      }
    }

    if (!isOwner && currentUserRole === "admin" && !(window.communityID && window.canModerate)) {
      loading.classList.remove("show");
      try {
        const {username: posterName, displayName} = await getUserData(data.uid);
        const {username: offenderName, displayName: d1} = await getUserData(offenderId);

        const susRef = doc(db, "susList", data.uid);
        const susSnap = await getDoc(susRef);
        const currentWarnings = susSnap.exists() ? susSnap.data().warnings || 0 : 0;

        discord("reply deleted", "red", {
          "text": data.text,
          "author": `${posterName} (${data.uid})`,
          "posted at": formatUTC8(data.createdAt),
          "offend": reason,
          "offender": `${offenderName} (${auth.currentUser.uid})`,
          "user warnings": `${currentWarnings + 1}`,
        }, new Date(), [
          data.media.url || null
        ], "admin");
        
        if (data.mediaType === "image" || data.mediaType === "video") {
          const thumbnail = data.mediaType === "video" ?
            await extractVideoFrame(data.media.url, 0.1) :
            data.media.url;

          sendCommentWarningNotification(data.uid, data.originalText || data.text || "...", reason, thumbnail);
        } else {
          sendCommentWarningNotification(data.uid, data.originalText || data.text || "...", reason);
        }

        setDoc(doc(db, "susList", data.uid), {
          warnings: increment(1)
        }, {
          merge: true
        });
      } catch (e) {
        console.error(e);
        return;
      }
      loading.classList.add("show");
    } else if (isOwner) {
      const confirmed = await confirmDialog("Delete reply?", "Are you sure you want to delete this reply? This action cannot be undone.", "red");
      if (!confirmed) {
        loading.classList.remove("show");
        return;
      }
    }
    
    if (data.mediaType === "video" && data.media?.path) {
      try {
        const {
          error
        } = await supabase.storage.from("wints").remove([data.media.path]);
        if (error) console.error("Supabase deletion error:", error);
      } catch (err) {
        console.error("Failed to delete video:", err);
      }
    }

    const postRef = isCommunity ? doc(db, "communities", window.communityID, "posts", tweetId) : doc(db, "tweets", tweetId);
    const parentCommentRef = data.parentId ? (isCommunity ? doc(db, "communities", window.communityID, "posts", tweetId, "comments", data.parentId) : doc(db, "tweets", tweetId, "comments", data.parentId)) : null;
    await runTransaction(db, async (tx) => {
      if (parentCommentRef) {
        const parentSnap = await tx.get(parentCommentRef);
        const parentData = parentSnap.data();
        if (parentData.ownerReplied === commentId) {
          tx.update(parentCommentRef, {
            ownerReplied: null
          });
        }
        tx.update(parentCommentRef, {
          replyCount: increment(-1)
        });
      }
      if (data.parentId === null) {
        const postSnap = await tx.get(postRef);
        if (postSnap.exists()) {
          tx.update(postRef, {
            commentCount: increment(-1)
          });
        }
      }
      tx.delete(commentRef);
    });
    document.querySelectorAll(`.comment-item[data-id="${commentId}"]`).forEach(el => el.remove());
    log("green", "reply deleted");
    loading.classList.remove("show");
  }
});

let selectedRetweet = null;
let selectedCommentRetweet = null;
let communityId = null;

document.body.addEventListener("click", async (e) => {
  const retweetBtn = e.target.closest(".retweet-btn");
  if (!retweetBtn) return;
  e.preventDefault();

  selectedRetweet = retweetBtn.dataset.id;
  selectedCommentRetweet = retweetBtn.dataset.commentId || null;
  communityId = retweetBtn.dataset.communityId || null;

  const uid = auth.currentUser?.uid;
  if (!uid) return log("red", "user isn't logged in");

  document.getElementById("retweetOverlay").classList.remove("hidden");
  let innerHTML = "";
  innerHTML = `
    <div class="tweet retweet" style="display:flex;gap:10px;padding:15px;border:none !important;padding-left:0 !important">
    <div class="skeleton-card" style="width:100%;margin:0;">
      <div class="skeleton-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-header-lines">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
        </div>
      </div>
    </div>
    </div>
`;

  dev("");
  document.getElementById("retweetOriginal").innerHTML = innerHTML;
  const { avatar } = await getUserData(auth.currentUser.uid);
  document.getElementById("retweetAvatar").src = avatar || "/image/default-avatar.jpg";

  let communityName = "";
  let inCommunity = false;

  if (window.communityID && window.isJoined) {
    communityName = await getCommunityNameById(window.communityID);
    inCommunity = true;
  }

  const postRef = window.communityID && window.isJoined ? doc(db, "communities", window.communityID, "posts", selectedRetweet) : doc(db, "tweets", selectedRetweet);
  const docSnap = await getDoc(postRef);
  if (!docSnap.exists()) {
    document.getElementById("retweetOriginal").innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <div style="border-bottom:10px solid var(--dark);z-index:1;height:40px;">
          <img loading="lazy" src="/image/default-avatar.jpg" onerror="this.src='image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
        </div>
        <div>
          <div class="flex" style="display:Flex;gap:5px;">
            <strong>System</strong>
            <img loading='lazy' src="/image/icon.png" height="20" width="20" style="margin:0;">
          </div>
          <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
            <p style="margin-bottom:0px !important;color:grey;">Post is not available or you don't have permission to reply</p>
          </div>
        </div>
      </div>
  `
    return;
  }

  const t = docSnap.data();
  let c;
  let authorUid = t.uid;
  let parsedText = "";

  let editHTML7 = "";
  let editHTML5 = "";

  if (selectedCommentRetweet) {
    const commentSnap = window.communityID && window.isJoined ? await getDoc(doc(db, "communities", window.communityID, "posts", selectedRetweet, "comments", selectedCommentRetweet)) : await getDoc(doc(db, "tweets", selectedRetweet, "comments", selectedCommentRetweet));

    if (commentSnap.exists()) {
      c = commentSnap.data();
      authorUid = c.uid;
      const parsedCommentText = await parseMentionsToLinks(c.text || "", c.mentions || {});
      let username1 = "unknown";
      let avatar1 = "/image/default-avatar.jpg";
      let displayName1 = "Unnamed";
      try {
        const u = await getUserData(c.uid);
        username1 = u.username || "unknown";
        avatar1 = u.avatar || "/image/default-avatar.jpg";
        displayName1 = u.displayName || "Unnamed";
      } catch (err) {
        console.warn("Couldn't fetch comment author:", err);
      }
      if (c.edited && c.editAfterComment) {
        editHTML7 = `
        <img src="/image/editicon.svg" class="editedatt edit1" title="edited at ${formatTime(c.edited)}. click me"> 
      `
      }

    let mediaHTML = "";
    const containsSpoiler = t.sensitiveMedia === true;

    let vidId = null;
    let vidRtId = null;

    if (c.media && c.mediaType === "image") {
      const src = base91ToImageSrc(c.media.url);
      if (containsSpoiler) {
        mediaHTML = `
            <div style="margin-bottom:10px;" class="attachment spoiler-media" onclick="this.classList.add('revealed')">
              <div class="spoiler-overlay">
                <div class="spoilertxt">sensitive</div>
              </div>
              <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';" />
            </div>`;
      } else {
        mediaHTML = `
            <div class="attachment" style="max-width: 100%; border-radius: 10px; max-height: 300px;margin-bottom:10px;">
              <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';" />
            </div>`;
      }
    } else if (c.media && c.mediaType === "video") {
      if (containsSpoiler) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment spoiler-media" style="max-width: 100%; border-radius: 10px; max-height: 300px;margin-bottom:10px;" onclick="
              getSupabaseVideo('${c.media.url}', '${vidId}');
              this.classList.add('revealed');
            ">
              <div class="spoiler-overlay">
                <div class="spoilertxt">sensitive</div>
              </div>
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
      } else {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment">
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;margin-bottom:10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
        if (!document.getElementById(vidId)) getSupabaseVideo(c.media.url, vidId);
      }
    }

    innerHTML = `
      <div style="display:flex;gap:10px;">
        <div style="border-bottom:10px solid var(--dark);z-index:1;height:40px;">
          <img loading='lazy' src="${escapeHTML(avatar1) || 'image/default-avatar.jpg'}" onerror="this.src='image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
          </div>
        <div>
        <div class=flex style="display:Flex;gap:5px;">
          ${c.likedByCreator === true ? 
            `<img style="margin-right:-3px" src="/image/star.svg">` :
            `${(c.mentions && Object.values(c.mentions).includes(auth.currentUser.uid)) ?
              `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
              ""
            }`
          }
          <strong class="user-link" data-uid="${authorUid}">${escapeHTML(displayName1 || "Unnamed")}</strong>
          <span style="opacity:0.7;font-size:12px;"><span class="usernamee">@${escapeHTML(username1)} •</span> ${formatDate(c.createdAt)} ${editHTML7}</span>
        </div>
        <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
          <div class=post-body style="margin-bottom:0px !important;font-family:natar;margin-top:10px;">${parsedCommentText}</div> 
          ${mediaHTML}
          ${inCommunity ? `<div style="display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0;"><img loading='lazy' src="/image/community-filled.svg" width="16">${escapeHTML(communityName)}</div>` : ""}
          <div style="display:flex;align-items:center"><small style="color:grey;margin-top:5px;">Rewynting a reply</small> 
          </div>
        </div>
      </div>
    </div>`;
    }
  } else {
    const { username, avatar, displayName } = await getUserData(t.uid);

    let titleHTML = "";
    if (t.title) {
      titleHTML = `<h3 style="margin:10px 0;margin-bottom:5px;">${escapeHTML(t.title)}</h3>`;
    }

    parsedText = await parseMentionsToLinks(t.text || "", t.mentions || {});
    if (t.edited && t.editAfterComment) {
      editHTML5 = `
        <img src="/image/editicon.svg" class="editedatt1 editedatt" title="edited at ${formatTime(t.edited)}. click me"> 
      `
    }

    let mediaHTML = "";
    const containsSpoiler = t.sensitiveMedia === true;

    let vidId = null;
    let vidRtId = null;

    if (t.media && t.mediaType === "image") {
      const src = base91ToImageSrc(t.media);
      if (containsSpoiler) {
        mediaHTML = `
            <div style="margin-bottom:10px;" class="attachment spoiler-media" onclick="this.classList.add('revealed')">
              <div class="spoiler-overlay">
                <div class="spoilertxt">sensitive</div>
              </div>
              <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';" />
            </div>`;
      } else {
        mediaHTML = `
            <div class="attachment" style="margin-bottom:10px;">
              <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';" />
            </div>`;
      }
    } else if (t.media && t.mediaType === "video") {
      if (containsSpoiler) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment spoiler-media" style="margin-bottom:10px;" onclick="
              getSupabaseVideo('${t.media}', '${vidId}');
              this.classList.add('revealed');
            ">
              <div class="spoiler-overlay">
                <div class="spoilertxt">sensitive</div>
              </div>
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
      } else {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment">
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;margin-bottom:10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
        if (!document.getElementById(vidId)) getSupabaseVideo(t.media, vidId);
      }
    }

    innerHTML = `
      <div style="display:flex;gap:10px;">
        <div style="border-bottom:10px solid var(--dark);z-index:1;height:40px;">
          <img loading='lazy' src="${escapeHTML(avatar) || 'image/default-avatar.jpg'}" onerror="this.src='image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
          </div>
        <div>
        <div class=flex style="display:Flex;gap:5px;">
          ${(t.mentions && Object.values(t.mentions).includes(auth.currentUser.uid)) ?
            `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
            ""
          }
          <strong class="user-link" data-uid="${authorUid}">${escapeHTML(displayName || "Unnamed")}</strong>
          <span style="opacity:0.7;font-size:12px;"><span class="usernamee">@${escapeHTML(username)} •</span> ${formatDate(t.createdAt)} ${editHTML5}</span>
        </div>
        <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
          ${titleHTML}
          <div class="post-body" style="margin-bottom:0px !important;font-family:natar;margin-top:10px;">${parsedText}</div> 
          ${mediaHTML}
          ${inCommunity ? `<div style="display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0;"><img loading='lazy' src="/image/community-filled.svg" width="16">${escapeHTML(communityName)}</div>` : ""}
        </div>
      </div>
    </div>`;
  }
  document.getElementById("retweetOriginal").innerHTML = innerHTML;
  applyReadMoreLogic(document.getElementById("retweetOriginal"));

  if (editHTML7 != "") { if (c.editAfterComment) {
    document.getElementById("retweetOriginal").querySelector(".edit1").onclick = () => {
      showOriginal(c.originalText, c.mentions || {})
    };
  }}
  if (editHTML5 != "") { if (t.editAfterComment) {
    document.getElementById("retweetOriginal").querySelector(".editedatt1").onclick = () => {
      showOriginal(t.originalText, t.mentions || {}, t.originalTitle);
    };
  }}
});

const sendRetweet = document.getElementById("sendRetweet");
sendRetweet.onclick = async () => {
  sendRetweet.disabled = true;
  sendRetweet.classList.add("disabled");

  function reset() {
    sendRetweet.disabled = false;
    sendRetweet.classList.remove("disabled");
  }

  const text = document.getElementById("retweetText").value.trim();
  const title = document.getElementById("retweetTitle").value.trim().slice(0, 100) || null;
  const originalId = selectedRetweet;

  if (text.length < 10) {
    log("red", "Text must be at least 10 characters long")
    reset();
    return;
  }

  const fileInput = document.getElementById(`retweetMedia-${originalId}`) || document.getElementById("retweetMedia-TWEETID");
  const files = fileInput ? Array.from(fileInput.files) : [];

  const user = auth.currentUser;
  const uid = user?.uid;
  if (!uid || !originalId) {
    if (!originalId) log("red", "no selected post");
    if (!uid) log("red", "user isn't logged in");
    reset;
    return;
  }

  let poll = null;
  if (document.getElementById("includePollRetweet").checked) {
    const options = Array.from(document.querySelectorAll("#pollOptionsRetweet .poll-option")).map(inp => inp.value.trim().slice(0, 50)).filter(Boolean);
    if (options.length >= 2) {
      const duration = document.getElementById("pollDurationRetweet")?.value || "8h";
      let expiresAt = null;
      const now = new Date();
      if (duration === "8h") now.setHours(now.getHours() + 8);
      if (duration === "24h") now.setDate(now.getDate() + 1);
      if (duration === "3d") now.setDate(now.getDate() + 3);
      if (duration === "1w") now.setDate(now.getDate() + 7);
      if (duration === "3w") now.setDate(now.getDate() + 21);
      expiresAt = now;
      poll = {
        options,
        votes: Array(options.length).fill(0),
        duration,
        expiresAt
      };
    }
  }

  const userRef = doc(db, "users", user.uid);

  dev("reading auth");
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const data = userSnap.data();

    if (data.suspended === true && data.suspendedUntil > Timestamp.now()) {
      info("x", "insufficient permission", "You are temporarily suspended from using this platform. Please try again later");
      reset();
      return;
    }

    if (data.cooldown?.toDate) {
      const now = new Date();
      const cooldownTime = data.cooldown.toDate();
      if (now < cooldownTime) {
        const diffMs = cooldownTime - now;
        const diffMins = Math.ceil(diffMs / 60000);
        log("red", `Cooldown resets in ${diffMins} minute${diffMins> 1 ? 's' : ''}`);
        reset();
        return;
      }
    }
  }

  let media = "";
  let mediaType = "";
  let mediaPath = "";

  try {
    if (files.length > 0) {
      const videos = files.filter(f => f && f.type && f.type.startsWith("video/"));
      const images = files.filter(f => f && f.type && f.type.startsWith("image/"));

      if (videos.length > 0 && images.length > 0) {
        log("red", "please don't upload videos and images together");
        reset();
        return;
      }
      if (videos.length > 1) {
        log("red", "please only insert one video at a time");
        reset();
        return;
      }
      if (images.length > 4) {
        log("red", "please insert images less than 5");
        reset();
        return;
      }

      const data = userSnap.data();
      const premiumExpiry = data.premium ? data.premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;
      const maxSize = isPremium ? 5.5 * 1024 * 1024 : 3.5 * 1024 * 1024;

      if (videos.length === 1) {
        const file = videos[0];
        if (file.size > maxSize) {
          log("red", `please insert only videos lower than ${(maxSize / (1024*1024)).toFixed(1)} MB`);
          reset();
          return;
        }

        dev("uploading video");
        const upload = await uploadToSupabase(file, uid, isPremium);
        media = upload.url;
        mediaType = "video";
        mediaPath = upload.path || "";
      } else if (images.length > 0) {
        let encodedBase91;

        if (images.length > 1) {
          const collageBase64 = await makeCollage(images);
          encodedBase91 = await compressImageTo480(collageBase64);
        } else {
          encodedBase91 = await compressImageTo480(images[0]);
        }

        media = encodedBase91;
        mediaType = "image";
        mediaPath = "";
      }
    }

    let permission = "everyone";
    if (document.getElementById("replyPermissionMentioned").checked === true) {
      permission = "mentioned";
    }

    const mentions = await extractMentions(text);
    let mentioned = null;
    if (!window.communityID) {
      mentioned = Object.values(mentions).filter(Boolean);
    }

    const searchTokens = tokenize(text);

    const mentionedSearchTokens = [];

    if (mentioned) {
      for (const uid of mentioned) {
        for (const token of searchTokens) {
          mentionedSearchTokens.push(`${uid}_${token}`);
        }
      }
    }

    const isCommentRetweet = !!selectedCommentRetweet;

    let originalId = selectedRetweet;
    let commentId = selectedCommentRetweet;

    const editUntil = new Date(Date.now() + 15 * 60 * 1000);

    dev("detecting language")
    const detectedLanguage = await detectLanguage(text);

    const muteNotif = document.getElementById("rtmute").checked;
    const noPrivateReply = !document.getElementById("rtprivateOK").checked;
    const sensitiveMedia = document.getElementById("sensitive").checked;
    const noNotify = document.getElementById("rtnonotify").checked;

    let retweetData = {
      mentioned,
      muteNotif,
      archived: false,
      sensitiveMedia,
      noPrivateReply,
      text,
      originalTitle: title,
      originalText: text,
      title,
      media,
      mediaType,
      replyPermission: permission,
      mediaPath,
      poll,
      likeCount: 0,
      language: detectedLanguage,
      editUntil,
      searchTokens,
      commentCount: 0,
      mentionedSearchTokens,
      viewsCount: 0,
      retweetCount: 0,
      createdAt: new Date(),
      uid,
      mentions
    };

    let postref, postsnap;

    dev("reading quoted post");
    if (isCommentRetweet) {
      if (window.communityID) {
        postref = doc(db, "communities", window.communityID, "posts", originalId, "comments", commentId);
      } else {
        postref = doc(db, "tweets", originalId, "comments", commentId);
      }

      postsnap = await getDoc(postref);
      retweetData.retweetOfComment = {
        tweetId: originalId,
        commentId
      };
      retweetData.retweettext = postsnap.data().text;
    } else {
      if (window.communityID) {
        postref = doc(db, "communities", window.communityID, "posts", originalId);
      } else {
        postref = doc(db, "tweets", originalId);
      }

      postsnap = await getDoc(postref);
      retweetData.retweetOf = originalId;
      retweetData.retweettext = postsnap.data().text;
    }
    const postdata = postsnap.data();

    let tweetRef;
    let communityPostRef = null;
    let postedToMain = false;
    let TWEETOWNERSUSPENDED = false;

    await runTransaction(db, async (tx) => {
      if (postdata.uid != auth.currentUser.uid) {
        const tweetUserRef = doc(db, "users", postdata.uid);

        dev("reading quoted post's author");
        const tweetUserSnap = await tx.get(tweetUserRef);
        let tweetUserData;
        if (tweetUserSnap.exists()) tweetUserData = tweetUserSnap.data();

        if (tweetUserData.suspended === true && tweetUserData.suspendedUntil > Timestamp.now()) {
          TWEETOWNERSUSPENDED = true;
        }
      }

      dev("posting quote");
      if (TWEETOWNERSUSPENDED === false) {
        if (window.communityID) {
          let communityPayload = {
            ...retweetData,
            communityId: window.communityID
          };
          if (!isCommentRetweet) {
            communityPayload.originalId = originalId;
          }
          communityPostRef = doc(collection(db, "communities", window.communityID, "posts"));
          tx.set(communityPostRef, communityPayload);

          const shareToFollowers = document.getElementById("shareToFollowers1")?.checked;
          if (shareToFollowers) {
            let mainPayload = {
              ...retweetData,
              sharedFromCommunity: window.communityID,
              connectedWynt: null
            };
            if (!isCommentRetweet) {
              mainPayload.originalId = originalId;
            }

            const mainRef = doc(collection(db, "tweets"));
            tx.set(mainRef, mainPayload);
            
            postedToMain = true;
            
            tx.update(communityPostRef, {
              connectedWynt: mainRef.id,
              postedInPublic: false
            });
            tx.update(mainRef, {
              connectedWynt: communityPostRef.id,
              postedInPublic: true
            });
            tweetRef = mainRef;
          } else {
            tweetRef = communityPostRef;
          }
          tx.update(doc(db, "communities", window.communityID), {
            posts: increment(1),
            lastActivity: serverTimestamp()
          });
          tx.update(doc(db, "communities", window.communityID, "members", auth.currentUser.uid), {
            contributions: increment(3)
          });
        } else {
          tweetRef = doc(collection(db, "tweets"));
          tx.set(tweetRef, retweetData);
          postedToMain = true;
        }
        if (postsnap.exists()) {
          tx.update(postref, {
            retweetCount: increment(1)
          });
        }
      }
    });

    if (TWEETOWNERSUSPENDED === true) {
      info("x", "Insufficient permission", "This post author is temporarily suspended from using this platform. Please try again later");
      reset();
    }

    const data1 = postsnap.data();
    if (TWEETOWNERSUSPENDED === false) {
      const tweetText = data1.originalText || data1.text;
      const notifyId = (window.communityID && !postedToMain) ? communityPostRef.id : tweetRef.id;

      let communitySnap;
      if (window.communityID) {
        dev("reading community");
        communitySnap = await getDoc(doc(db, "communities", window.communityID));
      }
      const communityName = communitySnap?.exists() ?
        communitySnap.data().name : null;

      if (data1.muteNotif != true && !noNotify) {
        if (isCommentRetweet) {
          if (window.communityID) {
            if (data1.mediaType === "image" || data1.mediaType === "video") {
              const thumbnail = data1.mediaType === "video" ?
                await extractVideoFrame(data1.media.url, 0.1) :
                data1.media.url;

              sendCommunityReplyRetweetNotification(originalId, commentId, text, notifyId, window.communityID, communityName, tweetText, data1.uid, thumbnail);
            } else {
              sendCommunityReplyRetweetNotification(originalId, commentId, text, notifyId, window.communityID, communityName, tweetText, data1.uid);
            }
          } else {
            if (data1.mediaType === "image" || data1.mediaType === "video") {
              const thumbnail = data1.mediaType === "video" ?
                await extractVideoFrame(data1.media.url, 0.1) :
                data1.media.url;

              sendReplyRetweetNotification(originalId, commentId, text, notifyId, tweetText, data1.uid, thumbnail);
            } else {
              sendReplyRetweetNotification(originalId, commentId, text, notifyId, tweetText, data1.uid);
            }
          }
        } else {
          if (window.communityID) {
            if (data1.mediaType === "image" || data1.mediaType === "video") {
              const thumbnail = data1.mediaType === "video" ?
                await extractVideoFrame(data1.media.url, 0.1) :
                data1.media.url;

              sendCommunityRetweetNotification(originalId, text, notifyId, window.communityID, communityName, tweetText, data1.uid, thumbnail);
            } else {
              sendCommunityRetweetNotification(originalId, text, notifyId, window.communityID, communityName, tweetText, data1.uid);
            }
          } else {
            if (data1.mediaType === "image" || data1.mediaType === "video") {
              const thumbnail = data1.mediaType === "video" ?
                await extractVideoFrame(data1.media.url, 0.1) :
                data1.media.url;

              sendRetweetNotification(originalId, text, notifyId, tweetText, data1.uid, thumbnail);
            } else {
              sendRetweetNotification(originalId, text, notifyId, tweetText, data1.uid);
            }
          }
        }
      }

      await Promise.all(
        Object.values(mentions).filter(Boolean).map(async (uid) => {
          if (!window.communityID) {
            if (data1.mediaType === "image" || data1.mediaType === "video") {
              const thumbnail = data1.mediaType === "video" ?
                await extractVideoFrame(data1.media, 0.1) :
                data1.media;

              return sendMentionNotification(tweetRef.id, uid, tweetText, tweetText, thumbnail);
            } else {
              return sendMentionNotification(tweetRef.id, uid, tweetText, tweetText);
            }
          }

          if (window.communityID && window.isOnPrivate === false) {
            if (data1.mediaType === "image" || data1.mediaType === "video") {
              const thumbnail = data1.mediaType === "video" ?
                await extractVideoFrame(data1.media, 0.1) :
                data1.media;

              return sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, tweetText, thumbnail);
            } else {
              return sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, tweetText);
            }
          }

          if (window.communityID && window.isOnPrivate) {
            if (communitySnap.exists()) {
              if (communitySnap.data().members.includes(uid)) {
                if (data1.mediaType === "image" || data1.mediaType === "video") {
                  const thumbnail = data1.mediaType === "video" ?
                    await extractVideoFrame(data1.media, 0.1) :
                    data1.media;

                  return sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, tweetText, thumbnail);
                } else {
                  return sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, tweetText);
                }
              } else {
                info(
                  "x",
                  "insufficient permission",
                  "user is not notified due to this is a private community and the user doesn't have permission to view it."
                );
                return;
              }
            }
          }
        })
      );

      if (!window.communityID) await handleTags(text.toLowerCase(), tweetRef.id);

      const data = userSnap.data();
      const premiumExpiry = data.premium ? data.premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;
      const cooldownDuration = isPremium ? 1 * 60 * 1000 : 5 * 60 * 1000;

      dev("updating documents")
      await runTransaction(db, async (tx) => {
        if ((window.communityID && postedToMain) || !window.communityID) {
          tx.update(userRef, {
            posts: increment(1),
            lastActivity: serverTimestamp()
          });
        }
        tx.update(userRef, {
          cooldown: Timestamp.fromDate(new Date(Date.now() + cooldownDuration))
        });
      });
    }

    if (TWEETOWNERSUSPENDED === false) {
      document.getElementById("retweetText").value = "";
      document.getElementById("retweetTitle").value = "";
      if (fileInput) fileInput.value = "";
      const preview = document.getElementById(`retweetPreview-${originalId}`) || document.getElementById("retweetPreview-TWEETID");
      if (preview) preview.innerHTML = "";
      document.getElementById("retweetOverlay").classList.add("hidden");
      log("green", "reWynt posted");

      if (window.communityID) {        
        isCommentRetweet ?
          incrementViews(originalId, commentId, window.communityID) :
          incrementViews(originalId, null, window.communityID);
      } else if (data1.communityId && data1.postedInPublic === false) {
        isCommentRetweet ?
          incrementViews(originalId, commentId, comid) :
          incrementViews(originalId, null, comid);
      } else {
        isCommentRetweet ?
          incrementViews(originalId, commentId, null) :
          incrementViews(originalId, null, null);
      }
    }
  } catch (error) {
    console.error("Retweet failed:", error);
    info("x", "ReWynt failed", error);
  } finally {
    reset();
    document.querySelectorAll(".poll-option").forEach(inp => {
      inp.value = "";
    });
    document.getElementById("includePollRetweet").checked = false;
    document.getElementById("pollOptionsRetweet").classList.add("hidden");
    document.getElementById("retweetText").style.height = "auto";
    document.getElementById("shareToFollowers1").checked = false;
    document.getElementById("rtmute").checked = false;
    document.getElementById("rtsensitive").checked = false;
    document.getElementById("rtnonotify").checked = false;
    document.getElementById("rtprivateOK").checked = true;
    document.getElementById("replyPermission1Everyone").checked = true;
    document.getElementById("replyPermission1Mentioned").checked = false;
    if (window.communityID) {
      openCommunity(window.communityID);
    }
  }
};

export async function waitForAuth() {
  if (auth.currentUser) return auth.currentUser;
  return new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      resolve(user);
      setTimeout(() => {
        document.getElementById("loadingO").classList.add("hidden");
      }, 1000);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  document.addEventListener("DOMContentLoaded", init);
  init();
}

async function init() {
  const user = await waitForAuth();
  if (!user) return info("x", "Unauthorized", "user is not logged in");
  const path = window.location.pathname;
  const communityMatch = path.match(/^\/community\/([^/]+)\/wynt\/([^/]+)$/);
  const normalMatch = path.match(/^\/wynt\/([^/]+)$/);
  if (communityMatch) {
    const communityId = communityMatch[1];
    const tweetId = communityMatch[2];
    const comRef = doc(db, "communities", communityId);
    const comSnap = await getDoc(comRef);
    if (!comSnap.exists()) return log("red", "community doesn't exist");

    const cData = comSnap.data();
    if (cData.private === true && !(cData.members || []).includes(auth.currentUser.uid)) {
      info("x", "No access", "The community this Wynt belongs to is a private community and you don't have permission to view it.")
      return;
    }
    viewTweet(tweetId, communityId);
    return;
  }
  if (normalMatch) {
    const tweetId = normalMatch[1];
    viewTweet(tweetId);
  }
}

document.body.addEventListener("click", async (e) => {
  const copytext = e.target.closest(".text-copy");
  if (copytext) {
    const text = copytext.dataset.text;
    try {
      await navigator.clipboard.writeText(text);
      log("green", "text copied");
      document.getElementById("tweetMenuOverlay").classList.add("hidden");
    } catch {
      info("i", "Copy this", text);
      document.getElementById("tweetMenuOverlay").classList.add("hidden");
    }
  }
  const shareBtn = e.target.closest(".share-btn");
  if (shareBtn) {
    const tweetId = shareBtn.dataset.id;
    const communityId = shareBtn.dataset.communityId;
    const shared = shareBtn.dataset.share;
    let yes = false;
    if (shared === "true") {
      yes = true;
    }
    let hascom;
    if (communityId && communityId != null && communityId != "null") {
      hascom = communityId;
    }
    let url;
    if (hascom && yes === false) {
      url = `https://wyntr.netlify.app/community/${hascom}/wynt/${tweetId}`;
    } else {
      url = `https://wyntr.netlify.app/wynt/${tweetId}`;
    }
    try {
      await navigator.clipboard.writeText(url);
      log("green", "Wynt link copied");
      document.getElementById("tweetMenuOverlay").classList.add("hidden");
    } catch {
      info("i", "Copy this link", url);
      document.getElementById("tweetMenuOverlay").classList.add("hidden");
    }
  }
  const pincom = e.target.closest(".community-pin-btn");
  if (pincom) {
    const user = auth.currentUser;
    if (!user) return log("red", "user isn't logged in");
    loading.classList.add("show");

    const comRef = doc(db, "communities", window.communityID);
    const tweetRef = doc(db, "communities", window.communityID, "posts", pincom.dataset.id);
   
    const [comSnap, tweetSnap] = await getAll(comRef, tweetRef);

    const cData = comSnap.data();
    const tweetData = tweetSnap.data();

    const isCreator = cData.creatorId === user.uid;
    const isAdmin = (cData.admin || []).includes(user.uid);

    if (!isCreator && !isAdmin) {
      log("red", "you don't have permission to pin this Wynt")
      loading.classList.remove("show");
      return;
    }

    const pinId = pincom.dataset.id;
    const alreadyPinned = cData.pinned === pinId;
    
    if (localStorage.getItem("disableConfirmation") != "true") {
      if (alreadyPinned) {
        if (!(await confirmDialog("unpin from community?", "This will unpin the current Wynt pinned in this community."))) return;
      } else {
        if (!(await confirmDialog("pin to community?", "This will replace the current Wynt pinned in this community."))) return;
      }
    }

    try {
      await updateDoc(comRef, {
        pinned: alreadyPinned ? "" : pinId
      });
      if (alreadyPinned) {
        log("green", "successfully unpinned Wynt from community");
      } else {
        if (tweetData.uid !== user.uid) {
          if (tweetData.mediaType === "image" || tweetData.mediaType === "video") {
            const thumbnail = tweetData.mediaType === "video" ?
              await extractVideoFrame(tweetData.media, 0.1) :
              tweetData.media;

            sendCommunityPinNotification1(window.communityID, cData.name, tweetData.uid, tweetData.text, thumbnail);
          } else {
            sendCommunityPinNotification1(window.communityID, cData.name, tweetData.uid, tweetData.text);
          }
        }
        log("green", "successfully pinned Wynt to community");
      }
    } catch (err) {
      console.error(err);
      log("failed to update pin status")
    }

    loading.classList.remove("show");
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
  }

  const replyShare = e.target.closest(".reply-share");
  if (replyShare) {
    const tweetId = replyShare.dataset.tweet;
    const commentId = replyShare.dataset.id;
    const communityId = replyShare.dataset.communityId;
    let hascom;
    if (communityId && communityId !== "null" && communityId != null) {
      hascom = communityId;
    }
    let url;
    if (hascom) {
      url = `https://wyntr.netlify.app/community/${hascom}/wynt/${tweetId}/reply/${commentId}`;
    } else {
      url = `https://wyntr.netlify.app/wynt/${tweetId}/reply/${commentId}`;
    }
    try {
      await navigator.clipboard.writeText(url);
      log("green", "link copied");
      document.getElementById("cMenuOverlay").classList.add("hidden");
    } catch {
      info("i", "Copy this link", url);
    }
  }
  const downloadBtn = e.target.closest(".download-btn");
  if (downloadBtn) {
    loading.classList.add("show");
    const tweetId = downloadBtn.dataset.tweet;
    const commentId = downloadBtn.dataset.comment;
    const communityId = downloadBtn.dataset.communityId;
    let hascom;
    if (communityId && communityId != null && communityId != "null") {
      hascom = communityId;
    }
    let data = null;
    let snap;
    if (commentId) {
      if (window.communityID) {
        const commentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId);
      } else {
        const commentRef = doc(db, "tweets", tweetId, "comments", commentId);
        snap = await getDoc(commentRef);
        if (!snap.exists() && communityId) {
          console.warn(`Comment not found in /tweets, trying community ${communityId}`);
          const fallbackRef = doc(db, "communities", communityId, "posts", tweetId, "comments", commentId);
          snap = await getDoc(fallbackRef);
        }
      }
      if (!snap.exists()) {
        log("red", "reply doesn't exist");
        loading.classList.remove("show");
        return;
      }
      data = snap.data();
    } else {
      let tweetRef;
      if (window.communityID) {
        tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
      } else if (hascom) {
        tweetRef = doc(db, "communities", hascom, "posts", tweetId);
      } else {
        tweetRef = doc(db, "tweets", tweetId);
      }
      
      snap = await getDoc(tweetRef);
      if (!snap.exists()) {
        log("red", "Wynt doesn't exist");
        loading.classList.remove("show");
        return;
      }
      data = snap.data();
    }
    let url = "";
    if (data.mediaType === "video") {
      url = data.media?.url || data.media;
    } else if (data.mediaType === "image") {
      url = data.media?.url || data.media;
    }
    if (!url) {
      loading.classList.remove("show");
      log("red", "invalid URL");
      return;
    }
    await downloadFile(base91ToImageSrc(url), randomString(14));
    document.getElementById("cMenuOverlay").classList.add("hidden");
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
    loading.classList.remove("show");
    log("green", "file downloaded");
  }
});

let quoteState = {
  lastDoc: null,
  loading: false,
  done: false,
  tweetId: null,
  communityId: null,
  commentId: null
};

document.body.addEventListener("click", async (e) => {
  const el = e.target.closest(".viewQuotes, .xviewQuotes");
  if (!el) return;

  e.preventDefault();

  quoteState = {
    lastDoc: null,
    loading: false,
    done: false,
    tweetId: el.dataset.tweet || null,
    communityId: el.dataset.community || null,
    commentId: el.dataset.comment || null
  };

  const overlay = document.getElementById("quoteViewer");
  const list = overlay.querySelector("#quoteList");

  overlay.classList.remove("hidden");
  list.innerHTML = TWEETS_SKELETON;

  await loadMoreQuotes();
});

async function loadMoreQuotes() {
  if (quoteState.loading || quoteState.done) return;

  quoteState.loading = true;

  const { tweetId, communityId, commentId, lastDoc } = quoteState;

  const overlay = document.getElementById("quoteViewer");
  const list = overlay.querySelector("#quoteList");

  const baseRef = communityId
    ? collection(db, "communities", communityId, "posts")
    : collection(db, "tweets");

  const whereField = commentId ? "retweetOfComment.commentId" : "retweetOf";

  let q = query(
    baseRef,
    where(whereField, "==", commentId || tweetId),
    where("archived", "!=", true),
    orderBy("likeCount", "desc"),
    ...(lastDoc ? [startAfter(lastDoc)] : []),
    limit(5)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    if (!lastDoc) {
      list.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:400px;text-align:left;">
            <h2 style="margin:0;">No Quotes found</h2>
            <p style="color:grey;margin:7px 0;">Be the first one to quote it</p>
          </div>
        </div>
      `;
    }
    quoteState.done = true;
    quoteState.loading = false;
    return;
  }

  quoteState.lastDoc = snap.docs[snap.docs.length - 1];

  if (!list.querySelector(".tweet")) {
    list.innerHTML = "";
  }

  const user = auth.currentUser;

  snap.docs.forEach(async (docSnap) => {
    await renderTweet(
      docSnap.data(),
      docSnap.id,
      user,
      "append",
      list,
      communityId || null
    );
  });

  quoteState.loading = false;
}

const quoteBox = document.querySelector("#quoteViewer .user-box");

quoteBox?.addEventListener("scroll", async () => {
  const nearBottom =
    quoteBox.scrollTop + quoteBox.clientHeight >=
    quoteBox.scrollHeight - 150;

  if (!nearBottom) return;

  await loadMoreQuotes();
});

export { renderTweet, scoreTweet, loadComments, renderPoll }