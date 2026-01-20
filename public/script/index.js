import { initializeFirestore, app, auth, db, storage, initializeApp, getAuth, increment, onAuthStateChanged, getFirestore, collection, addDoc, query, orderBy, limit, startAfter, where, onSnapshot, runTransaction, doc, setDoc, deleteDoc, getDoc, getDocs, getCountFromServer, getStorage, ref, uploadBytes, getDownloadURL, updateDoc, serverTimestamp, deleteField, Timestamp } from "./firebase.js";
import { extractMentions } from './mention.js';
import { handleTags } from './tags.js';
import { listenForSystemNotifications, sendPinNotification, sendCommunityPinNotification, sendCommentNotification, sendCommunityCommentNotification, listenForUnreadNotifications, loadNotifications, sendMentionNotification, sendCommunityMentionNotification, sendRetweetNotification, sendCommunityRetweetNotification, sendDonationNotification, sendCommunityDonationNotification,sendReplyMentionNotification, sendCommunityReplyMentionNotification, sendReplyNotification, sendReplyRetweetNotification, sendCommentMentionNotification, sendCommunityCommentMentionNotification, sendTweetWarningNotification, sendCommunityReplyNotification, sendCommunityReplyRetweetNotification, sendCommentWarningNotification } from './notification.js';
import { createClient, SUPABASE_URL, SUPABASE_ANON_KEY, MAX_FILE_BYTES, supabase,  writeBatch } from "./firebase.js";
import { uploadToSupabase, compressImageTo480, readFileAsBase64, downloadFile, makeCollage, getSupabaseVideo, base91ToImageSrc } from "./attachments.js";
import { bookmark, profile, profilesub, user, usersub, tag, viewer, tweet, retweet, notification, comment, bookmarksvg, homesvg, usersvg, searchsvg, settingssvg, notifsvg, bookmarkfilled, homefilled, userfilled, searchfilled, settingsfilled, notiffilled } from "./nonsense.js"
import { viewTweet } from "./tweetViewer.js";
import { tokenize, formatDate, linkify, applyReadMoreLogic, parseMentionsToLinks, escapeHTML, formatNumber, formatTime, info, log, confirmDialog, getDefaultLanguage, detectLanguage, isTranslateEnabled, randomString } from "./texts.js";
import { askDeleteReason, updateCommentUI } from "./moderation.js";
import { selectFolder, openBookmarkOverlay } from "./bookmark.js";
import { sendToDiscord, reportToDiscord } from "./discord.js";
import { scoreIQ } from "./IQ.js";
import { updateAllCounters, applyLimits } from "./main.js";
import { openCommunity } from "./community.js";
import { loadWhatsHappening, loadWhoToFollow } from "./recommendations.js";
import { loadFollowingFromCache, saveFollowingToCache, startFollowingListener } from "./followingCache.js";
import { bumpCommunityOrder } from "./community.js"; 

export const editicon = `<svg style="color:grey" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M15.514 3.293a1 1 0 0 0-1.415 0L12.151 5.24a.93.93 0 0 1 .056.052l6.5 6.5a.97.97 0 0 1 .052.056L20.707 9.9a1 1 0 0 0 0-1.415l-5.193-5.193ZM7.004 8.27l3.892-1.46 6.293 6.293-1.46 3.893a1 1 0 0 1-.603.591l-9.494 3.355a1 1 0 0 1-.98-.18l6.452-6.453a1 1 0 0 0-1.414-1.414l-6.453 6.452a1 1 0 0 1-.18-.98l3.355-9.494a1 1 0 0 1 .591-.603Z" clip-rule="evenodd"/></svg>`
const loading = document.getElementById("loadingOverlay");
const communityNameCache = new Map();
export async function getCommunityNameById(communityId) {
  if (!communityId) return "unknown";
  if (communityNameCache.has(communityId)) {
    return communityNameCache.get(communityId);
  }
  try {
    const comRef = doc(db, "communities", communityId);
    const comSnap = await getDoc(comRef);
    let name = "unknown";
    if (comSnap.exists()) {
      name = comSnap.data().name || "unknown";
    }
    communityNameCache.set(communityId, name);
    return name;
  } catch (err) {
    console.error("Error fetching community name:", err);
    return "unknown";
  }
}
export async function loadFollowing(uid) {
  const cached = await loadFollowingFromCache();
  if (cached) {
    window.currentUserFollowing = cached.followingSet;
    window.followingUserCache = cached.profileMap;
    startFollowingListener(uid);
    document.dispatchEvent(new Event("following-cache-ready"));
    return;
  }
  const q = query(collection(db, "users", uid, "following"), orderBy("followedAt", "desc"), limit(100));
  const snap = await getDocs(q);
  const followingSet = new Set();
  const profileMap = new Map();
  const fetchPromises = snap.docs.map(async docSnap => {
    const followedUid = docSnap.id;
    followingSet.add(followedUid);
    const profile = await getUserData(followedUid);
    profileMap.set(followedUid, {
      uid: followedUid,
      ...profile
    });
  });
  await Promise.all(fetchPromises);
  window.currentUserFollowing = followingSet;
  window.followingUserCache = profileMap;
  await saveFollowingToCache(followingSet, profileMap);
  startFollowingListener(uid);
  document.dispatchEvent(new Event("following-cache-ready"));
}
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
    const cached = window.avatarBlobCache.get(uid);
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
    const userData = {
      displayName: data.displayName || "deleted user",
      username: data.username || "",
      avatar: avatarBlobURL,
      IQ,
      premium: data.premium || null,
    };
    userCache[uid] = userData;
    delete userFetches[uid];
    return userData;
  })();
  return userFetches[uid];
}
let lastTweet = null;
let loadingMore = false;
let noMoreTweets = false;
let isOnline = navigator.onLine;
window.addEventListener("offline", () => {
  isOnline = false;
});
window.addEventListener("online", async () => {
  isOnline = true;
});
window.currentUserFollowing = new Set();
let currentUserRole = "user";
async function initMainFeatures(user) {
  loadTweets(true);
  loadNotifications(true);
  if (window.innerWidth > 700) {
    loadWhatsHappening();
    await loadFollowing(user.uid);
    loadWhoToFollow();
  } else {
    loadFollowing(user.uid);
  }
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
let screenLoaded = false;

function monitorUrlChanges(user) {
  let lastPath = window.location.pathname;
  setInterval(() => {
    const current = window.location.pathname;
    if (current !== lastPath) {
      lastPath = current;
      if (shouldRunFeatures(current)) {
        initMainFeatures(user);
        screenLoaded = true;
      }
    }
  }, 500);
}
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const bannedRef = doc(db, "banned", user.uid);
    const bannedSnap = await getDoc(bannedRef);
    if (bannedSnap.exists()) {
      const banData = bannedSnap.data();
      const banReason = banData.reason || "Violation of Wyntr community guidelines.";
      document.body.innerHTML = `
        <h2 style='text-align:center;margin-top:100px;'>This account is suspended.</h2>
        <p style="text-align:center;margin:0 20px;">Our team has detected activity from this account that goes against the Wyntr guidelines:</p>
        <p style="text-align:center;margin:10px 20px;font-weight:bold;">"${banReason}"</p>
        <p style="text-align:center"><a href="/user/login">Logout</a></p>
        <p style="text-align:center;color:grey;">If you think we made a mistake, please contact us on <a target="_blank" href="https://discord.gg/9SsDWAjfVV">Discord</a></p>
      `;
      return;
    }
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const path = window.location.pathname;
    if (shouldRunFeatures(path)) {
      initMainFeatures(user);
    }
    monitorUrlChanges(user);
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    const avatarEl = document.querySelector(".account-avatar");
    const nameEl = document.querySelector(".account-name");
    const usernameEl = document.querySelector(".account-username");
    let displayName = user.displayName || "Anonymous";
    let photoURL = "/image/default-avatar.jpg";
    let username = user.username || "unknown";
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.IQ === undefined) {
        await updateDoc(userRef, {
          IQ: 0.00
        });
      }
      if (data.premium instanceof Timestamp) {
        const premiumDate = data.premium.toDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const premiumMid = new Date(premiumDate);
        premiumMid.setHours(0, 0, 0, 0);
        if (premiumMid.getTime() === yesterday.getTime()) {
          log("grey", "Your premium ended yesterday. But, you still smell like fancy features.")
        }
      }
      currentUserRole = data.role || "user";
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
        const qSnap = await getDocs(query(collection(db, "users"), where(field, "==", candidate)));
        if (qSnap.empty) break;
        candidate = `${base}${suffix}`;
        suffix++;
      }
      return candidate;
    }
    if (!snap.exists()) {
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
        banner: "/image/default-banner.png",
        IQ: 0,
      });
      location.reload();
    } else {
      const data = snap.data();
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
    if (userSnap.exists()) {
      const data = userSnap.data();
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
      const unclaimed = document.getElementById("unclaimed");
      if (prizeBtn) {
        if (eligible) {
          if (window.innerWidth > 700) {
            document.getElementById("prizebox").style.display = "block";
            prizeBtn.style.display = "none";
            unclaimed.style.opacity = "0";
          } else {
            prizeBtn.style.display = "flex";
            unclaimed.style.opacity = "1";
            document.getElementById("prizebox").style.display = "none";
          }
          prizeBtn.onclick = async () => {
            prizeBtn.disabled = true;
            prizeBtn.classList.add("disabled");
            document.querySelector("#prizebox button").disabled = true;
            document.querySelector("#prizebox button").classList.add("disabled");
            const freshSnap = await getDoc(userRef);
            if (!freshSnap.exists()) return log("red", "Couldn't find your user data");
            const freshData = freshSnap.data();
            const lastSeenServer = freshData.lastSeen ? freshData.lastSeen.toDate() : null;
            const lastSeenDay = lastSeenServer ? new Date(lastSeenServer).setHours(0, 0, 0, 0) : 0;
            const todayStart = new Date().setHours(0, 0, 0, 0);
            if (lastSeenDay === todayStart) {
              log("red", "You already claimed your daily reward today")
              prizeBtn.style.display = "none";
              unclaimed.style.opacity = "0";
              document.getElementById("prizebox").style.display = "none";
              return;
            }
            const reward = Math.min(10 + (newStreak - 1) * 1, 15);
            await updateDoc(userRef, {
              balance: increment(reward),
              lastSeen: new Date(todayStart),
              streak: newStreak,
            });
            log("green", `you claimed ${reward}!`)
            prizeBtn.style.display = "none";
            unclaimed.style.opacity = "0";
            document.getElementById("prizebox").style.display = "none";
          };
        } else {
          prizeBtn.style.display = "none";
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
      if (data.hasInstalled) return;
      transaction.update(userRef, {
        hasInstalled: true,
        balance: increment(100),
      });
    });
    info("check", "yay!", "Thanks for installing Wyntr! You’ve received 100 Wcoins")
  } catch (err) {
    console.error("Failed to process install reward:", err);
    log("red", "failed to process install reward");
  }
});
document.getElementById("post").addEventListener("click", async () => {
  document.getElementById('tweetOverlay').classList.remove('hidden');
  document.getElementById("commentViewer").classList.add("hidden");
  const {
    avatar: myAvatar2
  } = await getUserData(auth.currentUser.uid);
  document.getElementById('tweetAvatar').src = myAvatar2;
});
document.getElementById("postBtn").addEventListener("click", async () => {
  const btn = document.getElementById("postBtn");
  btn.disabled = true;
  btn.classList.add('disabled');
  const user = auth.currentUser;
  if (!user) {
    btn.disabled = false;
    btn.classList.remove('disabled');
    log("red", "user is not logged in");
    return;
  }
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const data = userSnap.data();
    if (data.cooldown?.toDate) {
      const now = new Date();
      const cooldownTime = data.cooldown.toDate();
      if (now < cooldownTime) {
        const diffMs = cooldownTime - now;
        const diffMins = Math.ceil(diffMs / 60000);
        log("red", `Cooldown resets in ${diffMins} minute${diffMins> 1 ? 's' : ''}`);
        btn.disabled = false;
        btn.classList.remove('disabled');
        return;
      }
    }
  }
  const text = document.getElementById("tweetInput").value.trim();
  const detectedLanguage = await detectLanguage(text);
  const title = document.getElementById("tweetTitle").value.trim().slice(0, 100) || null;
  const fileInput = document.getElementById("mediaInput");
  const files = Array.from(fileInput.files);
  if (text.length < 10) {
    log("red", "Text must be at least 10 characters long");
    btn.disabled = false;
    btn.classList.remove("disabled");
    return;
  }
  let poll = null;
  if (document.getElementById("includePoll").checked) {
    const options = Array.from(document.querySelectorAll("#pollOptions .poll-option")).map(inp => inp.value.trim()).filter(Boolean);
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
        return;
      }
      if (images.length > 4) {
        log("red", "maximum image inserted is 4")
        return;
      }
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      let maxSize = 3.5 * 1024 * 1024;
      if (userSnap.exists()) {
        const data = userSnap.data();
        const premiumExpiry = data.premium ? data.premium.toDate() : null;
        const now = new Date();
        const isPremium = premiumExpiry && premiumExpiry > now;
        maxSize = isPremium ? 5.5 * 1024 * 1024 : 3.5 * 1024 * 1024;
      }
      if (videos.length === 1) {
        const file = videos[0];
        if (file.size > maxSize) {
          log("red", `Video exceeds ${(maxSize / (1024*1024)).toFixed(1)} MB`)
          btn.disabled = false;
          btn.classList.remove('disabled');
          return;
        }
        const upload = await uploadToSupabase(file, user.uid);
        mediaURL = upload.url;
        mediaType = "video";
        mediaPath = upload.path || "";
      } else if (images.length > 0) {
        for (const img of images) {
          if (img.size > maxSize) {
            log("red", "image exceeds 1MB");
            btn.disabled = false;
            btn.classList.remove("disabled");
            return;
          }
        }
        const compressedBase64s = await Promise.all(images.map(f => compressImageTo480(f)));
        let finalFile;
        if (images.length > 1) {
          const collageBase64 = await makeCollage(compressedBase64s);
          const res = await fetch(collageBase64);
          finalFile = await res.blob();
          finalFile = new File([finalFile], "collage.jpg", {
            type: "image/jpeg"
          });
        } else {
          const res = await fetch(compressedBase64s[0]);
          finalFile = await res.blob();
          finalFile = new File([finalFile], "image.jpg", {
            type: "image/jpeg"
          });
        }
        const arrayBuffer = await finalFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const encodedBase91 = base91.encode(bytes);
        mediaURL = encodedBase91;
        mediaType = "image";
        mediaPath = "";
      }
    }
    const mentionsRaw = await extractMentions(text);
    let processedText = text;
    mentionsRaw.sort((a, b) => (b.username?.length || 0) - (a.username?.length || 0));
    const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const {
        username,
        uid
      }
      of mentionsRaw) {
      if (!username || !uid) continue;
      const regex = new RegExp(`@${escapeRegExp(username)}(?=\\s|$)`, "gi");
      processedText = processedText.replace(regex, `@${uid}`);
    }
    const mentions = [...new Set(mentionsRaw.map(m => m.uid).filter(Boolean))];
    const tagMatches = text.match(/#(\w+)/g) || [];
    const tags = [...new Set(tagMatches.map(tag => tag.slice(1).toLowerCase().slice(0, 30)))];
    const permission = document.getElementById("replyPermission").value;
    const editUntil = new Date(Date.now() + 10 * 60 * 1000);
    let tweetRef;
    let isSharedPublicly = false;
    const shareToFollowers = document.getElementById("shareToFollowers")?.checked;
    let newIQ = null;
    if (window.isOnPrivate === false) {
      newIQ = await scoreIQ(user.uid, text);
    }
    if (window.communityID) {
      bumpCommunityOrder(window.communityID);
    }
    if (window.communityID) {
      const communityPostRef = doc(collection(db, "communities", window.communityID, "posts"));
      await setDoc(communityPostRef, {
        text: processedText,
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
        editUntil,
        commentCount: 0,
        viewsCount: 0,
        communityId: window.communityID,
        searchTokens: tokenize(text),
        WS: newIQ
      });
      await updateDoc(doc(db, "communities", window.communityID), {
        posts: increment(1)
      });
      tweetRef = communityPostRef;
      if (shareToFollowers) {
        isSharedPublicly = true;
        const publicTweetRef = await addDoc(collection(db, "tweets"), {
          text: processedText,
          media: mediaURL,
          title,
          mediaType,
          mediaPath,
          createdAt: new Date(),
          language: detectedLanguage,
          uid: user.uid,
          replyPermission: permission,
          poll,
          editUntil,
          tags,
          mentions,
          likeCount: 0,
          commentCount: 0,
          retweetCount: 0,
          viewsCount: 0,
          communityId: window.communityID,
          sharedFromCommunity: window.communityID,
          connectedWynt: null,
          searchTokens: tokenize(text),
          WS: newIQ
        });
        await updateDoc(communityPostRef, {
          connectedWynt: publicTweetRef.id
        });
        await updateDoc(publicTweetRef, {
          connectedWynt: communityPostRef.id
        });
      }
    } else {
      tweetRef = await addDoc(collection(db, "tweets"), {
        text: processedText,
        media: mediaURL,
        mediaType,
        title,
        mediaPath,
        createdAt: new Date(),
        uid: user.uid,
        replyPermission: permission,
        poll,
        tags,
        language: detectedLanguage,
        mentions,
        editUntil,
        likeCount: 0,
        commentCount: 0,
        retweetCount: 0,
        viewsCount: 0,
        searchTokens: tokenize(text),
        WS: newIQ
      });
    }
    for (const tagId of tags) {
      const tagRef = doc(db, "tags", tagId);
      await setDoc(tagRef, {
        name: tagId,
        tweetCount: increment(1)
      }, {
        merge: true
      });
      await setDoc(doc(tagRef, "tweets", tweetRef.id), {
        createdAt: new Date()
      });
    }
    await Promise.all(mentions.map(async uid => {
      const ops = [];
      if (!window.communityID) {
        ops.push(setDoc(doc(db, "users", uid, "mentioned", tweetRef.id), {
          mentionedAt: new Date()
        }));
      }
      if (window.communityID && window.isOnPrivate === false) {
        const communityName = await getCommunityNameById(window.communityID);
        ops.push(sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, text));
      } else if (window.isOnPrivate && window.communityID != null) {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
          const userCommunities = userDoc.data().communities || [];
          if (userCommunities.includes(window.communityID)) {
            const communityName = await getCommunityNameById(window.communityID);
            ops.push(sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, text));
          } else {
            info("x", "insufficient permission", "user is not notified due to this is a private community and the user doesn't have permission to view it.")
          }
        }
      } else {
        ops.push(sendMentionNotification(tweetRef.id, uid, text));
      }
      return Promise.all(ops);
    }));
    if (!window.communityID) await handleTags(text.toLowerCase(), tweetRef.id);
    await setDoc(doc(db, "users", user.uid, "posts", tweetRef.id), {
      exists: true
    });
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const data = snap.data();
    const premiumExpiry = data.premium ? data.premium.toDate() : null;
    const now = new Date();
    const isPremium = premiumExpiry && premiumExpiry > now;
    let cooldownDuration = isPremium ? 1 * 60 * 1000 : 10 * 60 * 1000;
    await updateDoc(userRef, {
      posts: increment(1),
      cooldown: Timestamp.fromDate(new Date(Date.now() + cooldownDuration))
    });
    document.getElementById("tweetInput").value = "";
    document.getElementById("tweetTitle").value = "";
    document.getElementById("mediaInput").value = "";
    document.getElementById("tweetPreview").innerHTML = "";
    log("green", "Wynt posted");
  } catch (error) {
    console.error("Tweet failed:", error);
    info("x", "Wynt failed:", error)
  }
  btn.disabled = false;
  btn.classList.remove('disabled');
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
async function getMyVoteIndex(tweetId, uid) {
  const voteRef = doc(db, "tweets", tweetId, "votes", uid);
  const snap = await getDoc(voteRef);
  if (snap.exists()) {
    return snap.data().optionIndex;
  }
  return null;
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

export async function getSnap(path, container) {
  const ref = doc(db, ...path.split("/"));
  const snap = await getDoc(ref);

  if (snap.exists() && container) {
    container.innerHTML = `<img loading="lazy" src="/image/filled-heart.svg">`;
  }
  return snap;
}

async function renderTweet(t, tweetId, user, action = "prepend", container = document.getElementById("timeline"), communityId = null) {
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

  const likeId = `like-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  const authorUID = t.uid;
  const {
    displayName,
    username,
    avatar,
    IQ,
    premium
  } = await getUserData(authorUID);
  if (t.retweetOf) {
    const retweetDoc = await getDoc(doc(db, "tweets", t.retweetOf));
    if (retweetDoc.exists()) {
      const rt = retweetDoc.data();
      const rDate = formatDate(rt.createdAt);
      try {
        const rtUserDoc = await getDoc(doc(db, "users", rt.uid));
        if (rtUserDoc.exists()) {
          const {
            displayName: rtDisplayName,
            username: rtUsername,
            avatar: rtAvatar,
            IQ,
            premium
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
  const donationCount = t.donations || 0;
  const dateStr = formatDate(t.createdAt);
  let mediaHTML = "";
  const containsSpoiler = /\|\|.+?\|\|/.test(t.text);
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
            <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;">
              Your browser does not support the video tag.
            </video>
          </div>`;
    } else {
      vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      mediaHTML = `
          <div class="attachment">
            <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;">
              Your browser does not support the video tag.
            </video>
          </div>`;
      if (!document.getElementById(vidId)) getSupabaseVideo(t.media, vidId);
    }
  }

  let retweetHTML = "";
  let quotedHTML = "";

  if (t.retweetOfComment) {
    const { tweetId: parentId, commentId } = t.retweetOfComment;

    let commentRef
    if (t.sharedFromCommunity) {
      commentRef = doc(db, "communities", t.sharedFromCommunity, "posts", parentId, "comments", commentId);
    } else if (t.communityId) {
      commentRef = doc(db, "communities", t.communityId, "posts", parentId, "comments", commentId);
    } else {
      commentRef = doc(db, "tweets", parentId, "comments", commentId);
    }

    const commentSnap = await getDoc(commentRef);
    if (commentSnap.exists()) {
      const comment = commentSnap.data();
      const commentUserSnap = await getDoc(doc(db, "users", comment.uid));
      const commentUser = commentUserSnap.exists() ? commentUserSnap.data() : {};

      let parsedCommentText;
      if (t.retweettext) {
        parsedCommentText = await parseMentionsToLinks(t.retweettext || "", comment.mentions || []);
      } else {
        parsedCommentText = await parseMentionsToLinks(comment.text || "", comment.mentions || []);
      }

      const hasImage = comment.media && comment.mediaType === "image";
      const hasVideo = comment.media && comment.mediaType === "video";

      let hasText;
      if (t.retweettext) {
        hasText = t.retweettext?.trim()?.length > 0;
      } else {
        hasText = comment.text?.trim()?.length > 0;
      }

      const { displayName, username, avatar, IQ: cIQ, premium } = await getUserData(comment.uid);
      const userSnap = await getDoc(doc(db, "users", comment.uid));
      const premiumExpiry = premium ? premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;

      let donationHTML = "";
      if (comment.donationReceived) {
        donationHTML = `
        <div style="border-radius:7px;background: var(--dark);display:flex;align-items:center;width:150px;padding:7px 10px;margin-bottom:10px;gap:7px;font-size:15px;color:var(--color);border:1px solid var(--color)">
            🎁 Gifted ${formatNumber(comment.donationReceived)} Wcoins
        </div>`;
      }

      let editHTML2 = "";
      if (comment.edited) {
        editHTML2 = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(comment.edited)}
        </span>`
      }
      let communityHTML2 = "";
      let communityName = "";
      if (t.sharedFromCommunity && window.communityID == null) {
        communityName = await getCommunityNameById(t.sharedFromCommunity);
        communityHTML2 = `
          <div class="communityLink" data-id="${t.sharedFromCommunity}" style="cursor:pointer;display:flex;gap:5px;font-size:18px;color:grey;margin:5px 0">
            <img loading='lazy' height="20" src="/image/community-filled.svg">
            ${escapeHTML(communityName)}
          </div>`;
      } else if (t.communityId && window.communityID == null) {
        communityName = await getCommunityNameById(t.communityId);
        communityHTML2 = `
          <div class="communityLink" data-id="${t.communityId}" style="cursor:pointer;display:flex;gap:5px;font-size:18px;color:grey;margin:5px 0">
            <img loading='lazy' height="20" src="/image/community-filled.svg">
            ${escapeHTML(communityName)}
          </div>`;
      }
      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();
      let translateHTML5 = "";
      if (comment.language && comment.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML5 = `
          <div class="translate-wrapper" style="margin-top:-10px;margin-bottom:10px;">
            <span
              class="translate-btn"
              data-id="${commentId}"
              data-random="${random}"
              data-from="${comment.language}"
              data-to="${defaultLanguage}"
              data-text="${comment.text}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;"
            >
              Translate from ${comment.language}
            </span>
            <div
              id="translated-${commentId}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;">
            </div>
          </div>
        `;
      }
      if (hasImage && hasText) {
        const containsSpoiler = /\|\|.+?\|\|/.test(comment.text);
        const src = base91ToImageSrc(comment.media.url);

        quotedHTML = `
          <div class="quoted-comment retweet" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}" data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img loading='lazy' class="avatar" src="${avatar || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="margin:0">@</div>` :
                `<div class=iq style="margin:0">${cIQ}</div>` 
              }
              <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img loading='lazy' src="/image/check.svg" style="margin:0;margin-left:-5px">` : ""} <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)} </span>
              <div style="margin-left:auto">
                <span class="cmenubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${commentId}" data-author="${comment.uid}" data-tweet="${parentId}">
                  <img loading='lazy' src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
              ${communityHTML2}
              <p style="margin: 0;margin-bottom:10px;">${parsedCommentText}</p> ${translateHTML5} ${editHTML2} ${donationHTML} 
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
            </div>
          </div>
          `;
      } else if (hasVideo && hasText) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const containsSpoiler = /\|\|.+?\|\|/.test(comment.text);

        quotedHTML = `
          <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}" data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img loading='lazy' class="avatar" src="${avatar || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${cIQ}</div>` 
              }
              <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img loading='lazy' src="/image/check.svg" style="margin:0;margin-left:-5px">` : ""} <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)} </span>
              <div style="margin-left:auto;">
                <span class="cmenubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${commentId}" data-author="${comment.uid}" data-tweet="${parentId}">
                  <img loading='lazy' src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
              ${communityHTML2}
              <p style="margin: 0;margin-bottom:10px;">${parsedCommentText}</p> 
              ${translateHTML5} 
              ${editHTML2} 
              ${donationHTML} 
              ${containsSpoiler ?
                `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                  <div class="spoiler-overlay">
                    <div class="spoilertxt">sensitive</div>
                  </div>
                  <video id="${vidId}" controls style="width: auto !important; height: 250px; object-fit: cover; border-radius:15px;margin-bottom:10px;">
                    Your browser does not support the video tag.
                  </video>
                  </div>` :
                  `<div class="attachment" style="margin-bottom:5px">
                    <video id="${vidId}" controls style="width:auto !important; height: 250px; object-fit: cover; border-radius:15px;margin-bottom:10px;">
                      Your browser does not support the video tag.
                    </video>
                  </div>`
              }
            </div>
          </div>
          `;
        getSupabaseVideo(comment.media.url, vidId);
      } else if (hasImage) {
        quotedHTML = `
          <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}" data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img loading='lazy' class="avatar"  src="${avatar || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${cIQ}</div>` 
              }
              <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                ${isPremium ? `<img loading='lazy' src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
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
            ${communityHTML2}
            <div class="attachment">
              <img loading="lazy" src="${comment.media.url}" data-src="${comment.media.url}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';">
            </div>
            ${donationHTML}
          </div>
        </div>`;
      } else if (hasVideo) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        quotedHTML = `
        <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}"  data-comment-id="${commentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img loading='lazy' class="avatar"  src="${avatar || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
              `<div class=iq style="margin:0">${cIQ}</div>` 
            }
            <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img loading='lazy' src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span>
            <div style="margin-left:auto">
              <span class="cmenubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${commentId}" data-author="${comment.uid}" data-tweet="${parentId}">
                <img loading='lazy' src="/image/three-dots.svg">
              </span>
            </div>
          </div>
          <div class="quoted-body">
            ${communityHTML2}
            <div class="attachment" style="position: relative; max-width: 100%; max-height: 300px;">
              <video id="${vidId}" controls style="max-width: 100%; max-height: 300px; border-radius: 10px;">
              Your browser does not support the video tag.
              </video>
            </div>
            ${donationHTML}
          </div>
        </div>`;
        getSupabaseVideo(comment.media.url, vidId);
      } else {
        quotedHTML = `
        <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}"  data-comment-id="${commentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img loading='lazy' class="avatar"  src="${avatar || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
              `<div class=iq style="margin:0">${cIQ}</div>` 
            }
            <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img loading='lazy' src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> 
              ${formatDate(comment.createdAt)}
            </span>
            <div style="margin-left:auto">
              <span data-community-id="${t.sharedFromCommunity || t.communityId || null}" class="cmenubtn" data-id="${commentId}" data-tweet="${parentId}" data-author="${comment.uid}">
                <img loading='lazy' src="/image/three-dots.svg">
              </span>
            </div>
          </div>
          <div class="quoted-body">
            ${communityHTML2}
            <p style="margin: 6px 0px 12px;margin-top:6px;margin-left:3px;">${parsedCommentText}</p> 
            ${translateHTML5} 
            ${editHTML2}
            ${donationHTML}
          </div>
        </div>`;
      }
    } else {
      quotedHTML = `
        <div class="quoted-comment">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
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
  if (t.retweetOf || t.originalId) {
    let retweetDoc = "";
    if (t.originalId) {
      retweetDoc = await getDoc(doc(db, "communities", t.sharedFromCommunity || t.communityId, "posts", t.originalId));
    } else if (t.retweetOf) {
      retweetDoc = await getDoc(doc(db, "tweets", t.retweetOf));
    }
    if (retweetDoc.exists()) {
      const rt = retweetDoc.data();
      const rDate = formatDate(rt.createdAt);
      let hasText;
      if (t.retweettext) {
        hasText = t.retweettext?.trim()?.length > 0;
      } else {
        hasText = rt.text?.trim()?.length > 0;
      }
      const hasImage = rt.media && rt.mediaType === "image";
      const hasVideo = rt.media && rt.mediaType === "video";
      const {
        displayName: rtDisplayName,
        username: rtUsername,
        avatar: rtAvatar,
        IQ: rIQ,
        premium
      } = await getUserData(rt.uid);
      const userSnap = await getDoc(doc(db, "users", rt.uid));
      const premiumExpiry = premium ? premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;
      let communityHTML1 = "";
      let communityName = "";
      let titleHTML1 = "";
      let editHTML1 = "";
      if (rt.edited) {
        editHTML1 = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;margin-bottom:5px;">
          ${editicon} 
          ${formatTime(rt.edited)}
        </span>
        `
      }
      if (rt.title) {
        titleHTML1 = `<p style="margin:0;margin-top:10px;font-size:18px;font-weight:bold;margin-bottom:10px;">${escapeHTML(rt.title)}</p>`
      }
      if (rt.communityId && window.communityID == null) {
        communityName = await getCommunityNameById(rt.communityId);
        communityHTML1 = `
          <div class="communityLink" data-id="${rt.communityId}" style="cursor:pointer;display:flex;gap:5px;font-size:15px;color:grey;margin:10px 0">
            <img loading='lazy' height="20" src="/image/community-filled.svg">
            ${escapeHTML(communityName)}
          </div>`;
      } else if (rt.sharedFromCommunity && window.communityID == null) {
        communityName = await getCommunityNameById(rt.sharedFromCommunity);
        communityHTML1 = `
          <div class="communityLink" data-id="${rt.sharedFromCommunity}" style="cursor:pointer;display:flex;gap:5px;font-size:15px;color:grey;margin:10px 0">
            <img loading='lazy' height="20" src="/image/community-filled.svg">
            ${escapeHTML(communityName)}
          </div>`;
      }
      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();
      let translateHTML6 = "";
      if (rt.language && rt.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML6 = `
          <div class="translate-wrapper" style="margin-top:-10px;margin-bottom:10px;">
            <span
              class="translate-btn"
              data-id="${t.retweetOf}"
              data-random="${random}"
              data-from="${rt.language}"
              data-to="${defaultLanguage}"
              data-text="${rt.text}"
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
      if (hasImage && hasText) {
        let parsedText;
        if (t.retweettext) {
          parsedText = await parseMentionsToLinks(t.retweettext, rt.mentions || []);
        } else {
          parsedText = await parseMentionsToLinks(rt.text, rt.mentions || []);
        }
        const rtsrc = base91ToImageSrc(rt.media);
        const rtcontainsSpoiler = /\|\|.+?\|\|/.test(rt.text);
        retweetHTML = `
          <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || null}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img loading='lazy' class="avatar" src="${rtAvatar || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(rt.mentions && rt.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${rIQ}</div>` 
              }
              <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img loading='lazy' src="/image/check.svg" style="margin:0;margin-left:-5px">` : ""} <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} </span>
              <div style="margin-left:auto">
                <span class="menubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                  <img loading='lazy' src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
              ${communityHTML1}
              ${titleHTML1}
              <p style="margin: 0;margin-bottom:10px;">${parsedText}</p> 
              ${translateHTML6} 
              ${editHTML1}
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
            </div>
          </div>
          `;
      } else if (hasVideo && hasText) {
        let parsedText;
        if (t.retweettext) {
          parsedText = await parseMentionsToLinks(t.retweettext, rt.mentions || []);
        } else {
          parsedText = await parseMentionsToLinks(rt.text, rt.mentions || []);
        }
        vidRtId = rt.id ? `vid-${rt.id}` : `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const rtcontainsSpoiler = /\|\|.+?\|\|/.test(rt.text);
        retweetHTML = `
          <div class="quoted-comment" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || null}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img loading='lazy' class="avatar" src="${rtAvatar || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(rt.mentions && rt.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${rIQ}</div>` 
              }
              <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img loading='lazy' src="/image/check.svg" style="margin:0;margin-left:-5px">` : ""} <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} </span>
              <div style="margin-left:auto">
                <span class="menubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                  <img loading='lazy' src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
              ${communityHTML1}
              ${titleHTML1}
              <p style="margin: 0;margin-bottom:10px;">${parsedText}</p> 
              ${translateHTML6} 
              ${editHTML1}
              ${rtcontainsSpoiler ?
                `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                  <div class="spoiler-overlay">
                    <div class="spoilertxt">sensitive</div>
                  </div>
                  <video id="${vidRtId}" controls style="width: auto !important; height: 250px; object-fit: cover; border-radius:15px;margin-bottom:10px;">
                    Your browser does not support the video tag.
                  </video>
                </div>` :
                `<div class="attachment" style="margin-bottom:5px">
                  <video id="${vidRtId}" controls style="width:auto !important; height: 250px; object-fit: cover; border-radius:15px;margin-bottom:10px;">
                    Your browser does not support the video tag.
                  </video>
                </div>`
              }
            </div>
          </div>
            
          `;
        getSupabaseVideo(rt.media, vidRtId);
      } else {
        let parsedText;
        if (t.retweettext) {
          parsedText = await parseMentionsToLinks(t.retweettext, rt.mentions || []);
        } else {
          parsedText = await parseMentionsToLinks(rt.text, rt.mentions || []);
        }
        retweetHTML = `
          <div class="quoted-comment" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || null}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img loading='lazy' class="avatar" src="${rtAvatar || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(rt.mentions && rt.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${rIQ}</div>` 
              }
              <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img loading='lazy' src="/image/check.svg" style="margin:0;margin-left:-5px">` : ""} <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} </span>
              <div style="margin-left:auto">
                <span class="menubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                  <img loading='lazy' src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
              ${communityHTML1}
              ${titleHTML1}
              <p style="margin: 0;margin-bottom:10px;">${parsedText}</p> 
              ${translateHTML6} 
              ${editHTML1}
            </div>
          </div>
          `;
      }
    } else {
      retweetHTML = `
        <div class="quoted-comment">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
          <img loading='lazy' class="avatar" src="/image/default-avatar.jpg" width="30">
          <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
            <span style="color:grey;font-size:12px;">
              <img loading='lazy' src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
            </span>
          </div>
          <div class="quoted-body">
          <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this reply is unavailable</i></p>
          </div>
        </div>`;
    }
  }
  const parsedText = await parseMentionsToLinks(t.text, t.mentions || []);
  const defaultLanguage = getDefaultLanguage();
  const isTranslate = isTranslateEnabled();
  let translateHTML = "";
  if (t.language && t.language !== defaultLanguage && isTranslate) {
    const random = Math.floor(Math.random() * 10000);
    translateHTML = `
      <div class="translate-wrapper" style="margin-bottom:5px;
  ">
        <span
          class="translate-btn"
          data-id="${tweetId}"
          data-from="${t.language}"
          data-to="${defaultLanguage}"
          data-random="${random}"
          data-text="${t.text}"
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
  const premiumExpiry = premium ? premium.toDate() : null;
  const now = new Date();
  const isPremium = premiumExpiry && premiumExpiry > now;
  let communityHTML = "";
  let titleHTML = "";
  if (t.title) {
    titleHTML = `<h3 style="margin:10px 0;">${escapeHTML(t.title)}</h3>`
  }
  if (t.communityId && window.communityID == null) {
    const communityName = await getCommunityNameById(t.communityId);
    communityHTML = `
    <div class="communityLink" data-id="${t.communityId}" style="cursor:pointer;display:flex;gap:5px;font-size:15px;color:grey;margin:5px 0">
      <img loading='lazy' height="17" src="/image/community-filled.svg">
      ${escapeHTML(communityName)}
    </div>`;
  } else if (t.sharedFromCommunity && window.communityID == null) {
    const communityName = await getCommunityNameById(t.sharedFromCommunity);
    communityHTML = `
    <div class="communityLink" data-id="${t.sharedFromCommunity}" style="cursor:pointer;display:flex;gap:5px;font-size:15px;color:grey;margin:5px 0">
      <img loading='lazy' height="17" src="/image/community-filled.svg">
      ${escapeHTML(communityName)}
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
  if (t.edited) {
    editHTML = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(t.edited)}
        </span>
    `
  }
  const tweetHTML = `
          <div class="tweet" id="tweet-${tweetId}" data-id="${tweetId}">
          ${quotedHTML}
          ${retweetHTML}
          <div style="display:flex;gap:10px;">
            <img loading='lazy' class="avatar" src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30" />
            <div style="display:flex;flex-direction:column;width:100%;">
              <div class="flex" style="gap:10px;margin:0">
                ${(t.mentions && t.mentions.includes(auth.currentUser.uid)) ?
                  `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                  `<div class=iq style="margin:0">${IQ}</div>` 
                }
                <strong class="user-link" data-uid="${t.uid}" style="cursor:pointer;font-size:17px;">${escapeHTML(displayName)}</strong>
                ${isPremium ? `<img loading='lazy' src="/image/check.svg" style="margin:0 -5px;">` : ""}
                <span style="color:#757779;font-size:12px"><span class="usernamee">@${username} •</span> ${dateStr}</span>
                <span style="cursor:pointer;margin-left:auto" data-shared="${t.sharedFromCommunity || null}" data-community-id="${t.communityId || null}" data-author="${t.uid}" class="menubtn"><img loading='lazy' src="/image/three-dots.svg"></span>
              </div>
              ${communityHTML}
              ${titleHTML}
              <p style="margin:5px 0">${parsedText}</p>
              ${translateHTML}
              ${editHTML}
              <div class="tweet-media">
                ${mediaHTML}
              </div>
              ${pollHTML}
              <div class="flex">
                <span style="cursor:pointer;color:#757779" data-community-id="${window.communityID || null}" class="like-btn" id="likeBtn-${tweetId}">
                  <div id="${likeId}" style="height:20px">
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
                <span style="cursor:pointer;color:#757779;font-size:14px;" class="donate-btn" data-id="${tweetId}">
                  <svg style="color:#757779;margin-top:-3px;" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 21v-9m3-4H7.5a2.5 2.5 0 1 1 0-5c1.5 0 2.875 1.25 3.875 2.5M14 21v-9m-9 0h14v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8ZM4 8h16a1 1 0 0 1 1 1v3H3V9a1 1 0 0 1 1-1Zm12.155-5c-3 0-5.5 5-5.5 5h5.5a2.5 2.5 0 0 0 0-5Z" />
                  </svg>
                  ${donationCount > 0 ? `${formatNumber(donationCount)}` : ""}
                </span>
                <div style="margin-left:auto;">
                  <span class="viewbtn" style="margin-left:10px;color:#757779"><img loading='lazy' src="/image/chart.svg"> ${viewCount > 0 ? viewCount : ""}</span>
                </div>
              </div>
            </div>
          </div>
          </div>`;

  const existing = document.getElementById("tweet-" + tweetId);
  const tweetEl = document.getElementById("tweet-" + tweetId);
  const newTweet = document.getElementById("tweet-" + tweetId);
  const tweetIdSelector = `#tweet-${tweetId}`;
  const existingInContainer = container.querySelector(tweetIdSelector);
  if (action === "replace" && existingInContainer) {
    existingInContainer.outerHTML = tweetHTML;
    const updatedTweet = container.querySelector(tweetIdSelector);
    if (updatedTweet) {
      applyReadMoreLogic(updatedTweet);
      observeTweet(updatedTweet);
    }
  } else if (!existingInContainer) {
    container.insertAdjacentHTML("beforeend", tweetHTML);
    const newTweet = container.querySelector(tweetIdSelector);
    if (newTweet) {
      applyReadMoreLogic(newTweet);
      observeTweet(newTweet);
    } else {
      console.warn("Tweet inserted but not found in DOM for:", tweetId);
    }
  }
  const tweetNode = container.querySelector(tweetIdSelector);
  const likeEl = tweetNode?.querySelector(`#${likeId}`);
  getSnap(path, likeEl);
}

let currentReportTarget = null;
const deleteReasonSubmit = document.getElementById("deleteReasonSubmit");
deleteReasonSubmit.addEventListener("click", async () => {
  if (!currentReportTarget) return;
  const reason = document.getElementById("deleteReasonInput").value.trim();
  if (!reason) return log("red", "please provide a reason");
  if (reason.length < 20) return log("red", "add minimum 20 characters");
  deleteReasonSubmit.classList.add("disabled");
  deleteReasonSubmit.disabled = true;
  loading.classList.add("show");
  const {
    username
  } = await getUserData(auth.currentUser.uid);
  const embed = {
    title: currentReportTarget.type,
    color: 8421504,
    fields: [{
      name: "Text",
      value: currentReportTarget.text || "(no text)"
    }, {
      name: "Poster",
      value: currentReportTarget.username
    }, {
      name: "Reporter",
      value: username
    }, {
      name: "Reason",
      value: reason
    }, {
      name: "Redirect Link",
      value: currentReportTarget.link
    }, ],
    timestamp: new Date(),
  };
  if (currentReportTarget.screenshot) {
    embed.image = {
      url: "attachment://screenshot.png"
    };
  }
  await reportToDiscord(null, {
    embeds: [embed]
  }, currentReportTarget.screenshot);
  closeReportOverlay();
  document.getElementById("tweetMenuOverlay").classList.add("hidden");
  document.getElementById("cMenuOverlay").classList.add("hidden");
  deleteReasonSubmit.classList.remove("disabled");
  deleteReasonSubmit.disabled = false;
  loading.classList.remove("show");
});
export function openReportOverlay(targetData) {
  currentReportTarget = targetData;
  const overlay = document.getElementById("deleteReasonOverlay");
  overlay.classList.remove("hidden");
  document.getElementById("deleteReasonInput").value = "";
}

function closeReportOverlay() {
  const overlay = document.getElementById("deleteReasonOverlay");
  overlay.classList.add("hidden");
  document.getElementById("deleteReasonInput").value = "";
  currentReportTarget = null;
}
document.getElementById("deleteReasonCancel").addEventListener("click", () => {
  closeReportOverlay();
});
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
    let screenshotBase64 = null;
    if (tweetEl) {
      try {
        const canvas = await html2canvas(tweetEl, {
          backgroundColor: null
        });
        screenshotBase64 = canvas.toDataURL("image/png");
      } catch (err) {
        console.error("Screenshot failed:", err);
      }
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
    const {
      username: posterUsername
    } = await getUserData(data.uid);
    let link;
    if (hascom) {
      link = `https://wyntr.netlify.app/community/${hascom}/wynt/${tweetId}`
    } else {
      link = `https://wyntr.netlify.app/wynt/${tweetId}`
    }
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
    openReportOverlay({
      type: "wynt",
      id: tweetId,
      link: link,
      text: data.text || "",
      username: posterUsername,
      screenshot: screenshotBase64,
    });
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
    const commentEl = document.querySelector(`.comment-item[data-id="${commentId}"]`);
    let screenshotBase64 = null;
    if (commentEl) {
      try {
        const canvas = await html2canvas(commentEl, {
          backgroundColor: null
        });
        screenshotBase64 = canvas.toDataURL("image/png");
      } catch (err) {
        console.error("Screenshot failed:", err);
      }
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
    const tweetSnap = await getDoc(doc(db, "tweets", tweetId));
    const parentText = tweetSnap.exists() ? tweetSnap.data().text : "";
    let link;
    if (hascom) {
      link = `https://wyntr.netlify.app/community/${hascom}/wynt/${tweetId}/reply/${commentId}`
    } else {
      link = `https://wyntr.netlify.app/wynt/${tweetId}/reply/${commentId}`
    }
    const {
      username: posterUsername
    } = await getUserData(commentData.uid);
    document.getElementById("cMenuOverlay").classList.add("hidden");
    openReportOverlay({
      type: "reply",
      id: commentId,
      link: link,
      text: commentData.text || "",
      parentText: parentText || "",
      username: posterUsername,
      screenshot: screenshotBase64,
    });
    loading.classList.remove("show");
  }
  const btn = e.target.closest(".menubtn");
  if (btn) {
    loading.classList.add("show");
    let tweetSnap;
    const tweetEl = btn.closest(".tweet") || btn.closest(".actuallyATweet");
    const tweetId = tweetEl.dataset.id;
    const communityId = btn.dataset.communityId;
    const shared = btn.dataset.shared;
    const author = btn.dataset.author;
    const yes = shared === "true";
    let hascom;
    if (communityId && communityId != null && communityId != "null") {
      hascom = communityId;
    }
    let ispinned = false;
    let communityRef, comRef, comSnap, comData;
    if (window.communityID) {
      communityRef = doc(db, "communities", window.communityID, "posts", tweetId);
      comRef = doc(db, "communities", window.communityID);
      comSnap = await getDoc(comRef);
      comData = comSnap.data();
      if (comData.pinned === tweetId) {
        ispinned = true;
      }
      tweetSnap = await getDoc(communityRef);
    } else {
      tweetSnap = await getDoc(doc(db, "tweets", tweetId));
    }
    if (!tweetSnap.exists()) {
      loading.classList.remove("show");
      log("red", "Wynt not found");
      return;
    }
    const overlay = document.getElementById("tweetMenuOverlay");
    const box = overlay.querySelector(".menu-box");
    const data = tweetSnap.data();
    const isOwner = auth.currentUser.uid === data.uid;
    const isAdmin = currentUserRole === "admin";
    const hasMedia = data.media && (data.mediaType === "image" || data.mediaType === "video");
    const highlightRef = doc(db, "users", auth.currentUser.uid, "highlights", tweetId);
    const highlightedSnap = await getDoc(highlightRef);
    const isHighlighted = highlightedSnap.exists();
    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);
    const tweetUserRef = doc(db, "users", data.uid);
    const tweetUserSnap = await getDoc(tweetUserRef);
    const tweetUserRole = tweetUserSnap.exists() ? tweetUserSnap.data().role : "user";
    const pinnedId = userSnap.exists() ? userSnap.data().pinned : null;
    const showDeleteBtn = isOwner || (isAdmin && tweetUserRole !== "admin");
    const now = new Date();
    const editUntil = data.editUntil?.toDate ? data.editUntil.toDate() : null;
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
                <img loading='lazy' src="/image/pinned.svg"> unpin Wynt from community` : 
               `<img loading='lazy' src="/image/pin.svg"> pin Wynt to community`}
            </div>
          ` : ""}

          <div class="menu-item share-btn" data-share="${yes}" data-community-id="${hascom || null}" data-id="${tweetId}"><img loading='lazy' src="/image/share.svg"> Share this Wynt</div>

          ${window.communityID ? "" :
          `<div class="menu-item bookmark-btn" id="bookmarkBtn-${tweetId}"><img loading='lazy' src="/image/bookmark.svg"> add to bookmark folder</div>`}

          ${window.communityID ? "" :
          `${isOwner
          ? `<div class="menu-item pin-btn" data-id="${tweetId}">
            ${pinnedId === tweetId
            ? `<img loading='lazy' src="/image/pinned.svg"> Unpin from profile`
            : `<img loading='lazy' src="/image/pin.svg"> Pin to profile`}
          </div>`
          : ""}`}

          ${showDeleteBtn
          ? `<div class="menu-item delete-btn" data-community-id="${hascom || null}" data-id="${tweetId}">
            <img loading='lazy' src="/image/trash.svg"> Delete this Wynt
            </div>`
          : ""}

          ${showEditBtn
          ? `<div class="menu-item edit-btn" data-community-id="${hascom || null}" data-id="${tweetId}">
            <img loading='lazy' src="/image/edit.svg"> Edit this Wynt
            </div>`
          : ""}

          ${hasMedia
          ? `<div class="menu-item download-btn" data-community-id="${hascom || null}" data-tweet="${tweetId}"><img loading='lazy' src="/image/download.svg"> Download attachment</div>`
          : ""}

          ${isOwner ? "" : `<div class="menu-item report-btn" data-community-id="${hascom || null}" data-id="${tweetId}"><img loading='lazy' src="/image/report.svg"> Report this Wynt</div>` }

          ${window.communityID ?
          ""
          : 
          `<div class="menu-item highlight-btn" id="highlightBtn-${tweetId}">
            ${isHighlighted
            ? `<img loading='lazy' src="/image/highlighted.svg"> Unhighlight from your profile`
            : `<img loading='lazy' src="/image/highlight.svg"> highlight to your profile`}
          </div>`}

          <div class="menu-item author-share" data-author="${author}">
            <img loading='lazy' src="/image/copy.svg"> copy user ID
          </div>
          `;
    overlay.classList.remove("hidden");
    loading.classList.remove("show");
  }
  if (e.target.id === "tweetMenuOverlay" || e.target.closest(".close-menu")) {
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
  }
  const hideBtn = e.target.closest(".comment-hide-btn");
  if (hideBtn) {
    loading.classList.add("show");
    document.getElementById("cMenuOverlay").classList.add("hidden");
    const tweetId = hideBtn.dataset.tweet;
    const commentId = hideBtn.dataset.id;
    const communityId = hideBtn.dataset.communityId;
    let hascom;
    if (communityId && communityId != null && communityId != "null") {
      hascom = communityId;
    }
    if (!tweetId || !commentId) {
      loading.classList.remove("show");
      log("red", "invalid reply");
      return;
    }
    let commentRef;
    if (hascom) {
      commentRef = doc(db, "communities", hascom, "posts", tweetId, "comments", commentId);
    } else {
      commentRef = doc(db, "tweets", tweetId, "comments", commentId);
    }
    const commentSnap = await getDoc(commentRef);
    if (!commentSnap.exists()) {
      log("red", "This comment no longer exists");
      return;
    }
    const data = commentSnap.data();
    if (data.isHidden == null || data.isHidden == false) {
      if (!(await confirmDialog("hide reply?", "are you sure you want to hide this reply? This will make this reply limited."))) return;
    } else {
      if (!(await confirmDialog("unhide reply?", "are you sure you want to unhide this reply?"))) return;
    }
    if (data.isHidden == null || data.isHidden == false) {
      await updateDoc(commentRef, {
        isHidden: true
      });
      log("green", "Reply hidden");
    } else {
      await updateDoc(commentRef, {
        isHidden: false
      });
      log("green", "reply unhidden");
    }
    loading.classList.remove("show");
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
      const {
        displayName,
        username,
        avatar,
        IQ,
        premium
      } = await getUserData(userId);
      const dateStr = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      const commentHTML = `
        <div class="tweet">
          <div style="display:flex;gap:10px;">
            <img loading='lazy' class="avatar" src="${avatar}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;>
            <div style="display:flex;flex-direction:column">
              <div style="display:flex;flex-direction:column;width:100%;">
                <div class="flex" style="gap:10px;margin:0;">
                  ${(data.mentions && data.mentions.includes(auth.currentUser.uid)) ?
                    `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                    `<div class=iq style="margin:0">${IQ}</div>` 
                  }
                  <strong class="user-link" data-uid="${userId}" style="cursor:pointer;font-size:17px;">${displayName}</strong>
                  ${premium ? `<img loading='lazy' src="/image/check.svg" style="margin:0 -5px;">` : ""}
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
          await updateDoc(commentRef, {
            text: newText,
            edited: new Date(),
            language: detectedLanguage
          });
          log("green", "Reply updated");
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
      const {
        displayName,
        username,
        avatar,
        IQ,
        premium
      } = await getUserData(userId);
      const dateStr = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      const tweetHTML = `
        <div class="tweet">
          <div style="display:flex;gap:10px;">
            <img loading='lazy' class="avatar" src="${avatar}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;">
            <div style="display:flex;flex-direction:column;width:100%;">
              <div class="flex" style="gap:10px;margin:0;">
                ${(data.mentions && data.mentions.includes(auth.currentUser.uid)) ?
                  `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                  `<div class=iq style="margin:0">${IQ}</div>` 
                }
                <strong class="user-link" data-uid="${userId}" style="cursor:pointer;font-size:17px;">${displayName}</strong>
                ${premium ? `<img loading='lazy' src="/image/check.svg" style="margin:0 -5px;">` : ""}
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
          await updateDoc(tweetRef, {
            text: newText,
            title: newTitle,
            edited: new Date(),
            language: detectedLanguage
          });
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
      const commentRef = doc(db, "communities", hascom, "posts", tweetId, "comments", commentId);
      tweetSnap = await getDoc(doc(db, "communities", hascom, "posts", tweetId));
      snap = await getDoc(commentRef);
      commentSnap = snap;
      if (!snap.exists()) {
        console.warn(`db/communities/${hascom}/posts/${tweetId}/comments/${commentId} not found, trying /tweets`);
        const fallbackRef = doc(db, "tweets", tweetId, "comments", commentId);
        tweetSnap = await getDoc(doc(db, "tweets", tweetId));
        snap = await getDoc(fallbackRef);
        commentSnap = snap;
      }
    } else {
      const commentRef = doc(db, "tweets", tweetId, "comments", commentId);
      tweetSnap = await getDoc(doc(db, "tweets", tweetId));
      snap = await getDoc(commentRef);
      commentSnap = snap;
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
    const showHideBtn = isTweetOwner && !isOwner;
    const hasMedia = data.media && (data.mediaType === "image" || data.mediaType === "video");
    const isPinned = !!commentData.pinned;
    const canPinReply = commentData.parentId == null && isTweetOwner;
    const now = new Date();
    const editUntil = commentData.editUntil?.toDate ? commentData.editUntil.toDate() : null;
    const canStillEdit = editUntil && now < editUntil;
    const showEditBtn = isOwner && canStillEdit;
    box.innerHTML = `
      <div class="flex" style="margin-bottom:5px;">
        <h3 style="margin:0;margin-left:5px;">Actions</h3>
        <div class="c-menu-item close-cmenu" style="margin-left:auto;">
          <img loading='lazy' src="/image/x.svg">
        </div>
      </div>

      ${isPrivate != true && isPrivate != 'true' && !commentData.isHidden && !commentData.isPrivateParent ?
        `<div class="c-menu-item reply-share" data-community-id="${hascom || null}" data-id="${commentId}" data-tweet="${tweetId}">
          <img loading='lazy' src="/image/share.svg"> Share this reply
        </div>` : ""
      }

      ${showDeleteBtn
        ? `<div class="c-menu-item comment-delete-btn"  data-community-id="${hascom || null}" data-id="${commentId}" data-tweet="${tweetId}">
            <img loading='lazy' src="/image/trash.svg"> Delete this reply
          </div>`
        : ""}

      ${showHideBtn && isPrivate != true && isPrivate != 'true' && !isPinned
        ? `<div class="c-menu-item comment-hide-btn" data-community-id="${hascom || null}" data-id="${commentId}" data-tweet="${tweetId}">
            <img src="/image/eye.svg"> ${commentData.isHidden ? `Unhide this reply` : `Hide this reply`}
          </div>`
        : ""}

      ${showEditBtn && !commentData.isHidden
        ? `<div class="c-menu-item comment-edit-btn" data-community-id="${hascom || null}" data-id="${commentId}" data-tweet="${tweetId}">
            <img loading='lazy' src="/image/edit.svg"> Edit this reply
          </div>`
        : ""}

      ${canPinReply && !commentData.isHidden && isPrivate != true && isPrivate != 'true'
        ? `<div class="c-menu-item pin-reply-btn" data-community-id="${hascom || null}" data-id="${commentId}" data-tweet="${tweetId}" data-pinned="${isPinned}">
             <img loading='lazy' src="${isPinned ? '/image/pinned.svg' : '/image/pin.svg'}"> ${isPinned ? 'Unhighlight this reply' : 'Highlight this reply'}
           </div>`
        : ""}

      ${hasMedia && !commentData.isHidden && isPrivate != true && isPrivate != 'true'
        ? `<div class="c-menu-item download-btn" data-community-id="${hascom || null}" data-tweet="${tweetId}" data-comment="${commentId}">
            <img loading='lazy' src="/image/download.svg"> Download attachment
          </div>`
        : ""}

      ${isOwner
        ? ""
        : `<div class="c-menu-item report-btn" data-community-id="${hascom || null}" data-tweet="${tweetId}" data-comment="${commentId}">
            <img loading='lazy' src="/image/report.svg"> Report this reply
          </div>`}

      <div class="c-menu-item author-share" data-author="${author}">
        <img loading='lazy' src="/image/copy.svg"> copy user ID
      </div>
    `;
    overlay.classList.remove("hidden");
    loading.classList.remove("show");
  }
  const deleteBtn = e.target.closest(".delete-btn");
  if (deleteBtn) {
    loading.classList.add("show");
    const tweetId = deleteBtn.dataset.id;
    const offenderId = auth.currentUser.uid;
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
    let tweetRef;
    if (window.communityID) {
      tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
    } else {
      tweetRef = doc(db, "tweets", tweetId);
    }
    const tweetSnap = await getDoc(tweetRef);
    if (!tweetSnap.exists()) {
      log("red", "Wynt doesn't exist");
      loading.classList.remove("show");
      return;
    }
    const data = tweetSnap.data();
    const isOwner = offenderId === data.uid;
    let screenshotBase64 = null;
    if (!isOwner && currentUserRole != "admin") return log("red", "insufficient permission");
    if (!isOwner) {
      const tweetEl = document.getElementById(`tweet-${tweetId}`);
      if (tweetEl) {
        try {
          const canvas = await html2canvas(tweetEl, {
            backgroundColor: null
          });
          screenshotBase64 = canvas.toDataURL("image/png");
        } catch (err) {
          console.error("Tweet screenshot failed:", err);
        }
      }
    }
    let reason = null;
    if (!isOwner && currentUserRole === "admin") {
      loading.classList.remove("show");
      try {
        reason = await askDeleteReason();
        const {
          username: posterName
        } = await getUserData(data.uid);
        const {
          username: offenderName
        } = await getUserData(auth.currentUser.uid);
        const susRef = doc(db, "susList", data.uid);
        const susSnap = await getDoc(susRef);
        const currentWarnings = susSnap.exists() ? susSnap.data().warnings || 0 : 0;
        const embed = {
          title: "Wynt Deleted",
          color: 15105570,
          fields: [{
            name: "Text",
            value: data.text || "(no text)"
          }, {
            name: "Poster",
            value: posterName
          }, {
            name: "Offender",
            value: offenderName
          }, {
            name: "Reason",
            value: reason || "No reason given"
          }, {
            name: "user warnings",
            value: `${currentWarnings + 1}`
          }, ],
          timestamp: new Date(),
        };
        if (screenshotBase64) embed.image = {
          url: "attachment://screenshot.png"
        };
        await sendToDiscord(null, {
          embeds: [embed]
        }, screenshotBase64);
        await sendTweetWarningNotification(data.uid, data.text, reason);
        await setDoc(doc(db, "susList", data.uid), {
          warnings: increment(1)
        }, {
          merge: true
        });
      } catch {
        return;
      }
      loading.classList.add("show");
    } else {
      if (!(await confirmDialog("Delete Wynt?", "Are you sure you want to delete this Wynt? This action cannot be undone.", "red"))) {
        loading.classList.remove("show");
        return;
      }
    }
    if (data.retweetOf) {
      let originalRef;
      if (window.communityID) {
        originalRef = doc(db, "communities", window.communityID, "posts", data.retweetOf);
      } else if (data.sharedFromCommunity) {
        originalRef = doc(db, "communities", data.sharedFromCommunity, "posts", data.retweetOf);
      } else {
        originalRef = doc(db, "tweets", data.retweetOf);
      }
      const originalSnap = await getDoc(originalRef);
      if (originalSnap.exists()) {
        await updateDoc(originalRef, {
          retweetCount: increment(-1)
        });
      } else {
        console.warn("Original tweet already deleted, skipping retweetCount decrement");
      }
    }
    if (data.connectedWynt) {
      let wsref, wssnap;
      if (data.sharedFromCommunity) {
        wsref = doc(db, "communities", data.sharedFromCommunity, "posts", data.connectedWynt);
        wssnap = await getDoc(wsref);
        if (wssnap.exists()) {
          await updateDoc(wsref, {
            WS: 0,
          });
        }
      }
    }
    if (data.retweetOfComment) {
      const {
        tweetId: parentId,
        commentId
      } = data.retweetOfComment;
      try {
        let commentRef;
        if (window.communityID) {
          commentRef = doc(db, "communities", window.communityID, "posts", parentId, "comments", commentId);
        } else {
          commentRef = doc(db, "tweets", parentId, "comments", commentId);
        }
        const commentSnap = await getDoc(commentRef);
        if (commentSnap.exists()) {
          await updateDoc(commentRef, {
            retweetCount: increment(-1)
          });
        }
      } catch (err) {
        console.warn("Failed to decrement retweet count for comment:", err);
      }
    }
    if (data.mediaType === "video" && data.mediaPath) {
      try {
        const {
          error
        } = await supabase.storage.from("wints").remove([data.mediaPath]);
        if (error) console.error("Error deleting video from Supabase:", error);
        else console.log("Video deleted from Supabase:", data.mediaPath);
      } catch (err) {
        console.error("Failed to delete video:", err);
      }
    }
    if (Array.isArray(data.mentions) && data.mentions.length > 0) {
      if (!window.communityID) {
        for (const uid of data.mentions) {
          await deleteDoc(doc(db, "users", uid, "mentioned", tweetId));
        }
      }
    }
    if (Array.isArray(data.tags)) {
      for (const tagId of data.tags) {
        const tagRef = doc(db, "tags", tagId);
        const tagSnap = await getDoc(tagRef);
        if (tagSnap.exists()) {
          try {
            await updateDoc(tagRef, {
              tweetCount: increment(-1)
            });
          } catch (err) {
            console.warn(`Failed to decrement tweetCount for tag #${tagId}:`, err);
          }
        } else {
          console.warn(`Tag #${tagId} does not exist, skipping update`);
        }
        try {
          await deleteDoc(doc(tagRef, "tweets", tweetId));
        } catch (err) {
          console.warn(`Failed to delete tweet reference from tag #${tagId}:`, err);
        }
      }
    }
    const ownerId = data.uid;
    await deleteDoc(doc(db, "users", ownerId, "posts", tweetId));
    await updateDoc(doc(db, "users", ownerId), {
      posts: increment(-1)
    });
    if (data.WS && data.WS > 0) {
      const userRef = doc(db, "users", ownerId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const historyTexts = Array.isArray(userData.historyTexts) ? [...userData.historyTexts] : [];
        const historySigs = Array.isArray(userData.historySigs) ? [...userData.historySigs] : [];
        const idx = historyTexts.findIndex(t => t === data.text);
        if (idx !== -1) {
          historyTexts.splice(idx, 1);
          historySigs.splice(idx, 1);
        }
        await updateDoc(userRef, {
          IQ: increment(-data.WS),
          historyTexts,
          historySigs
        });
      }
    }
    await deleteDoc(tweetRef);
    if (window.communityID) {
      try {
        await updateDoc(doc(db, "communities", window.communityID), {
          posts: increment(-1)
        });
        console.log(`Decremented community ${window.communityID} post count`);
      } catch (err) {
        console.warn(`Failed to decrement post count for community ${window.communityID}:`, err);
      }
    }
    document.querySelectorAll(`#tweet-${tweetId}`).forEach(el => el.remove());
    log("green", "Wynt deleted");
    loading.classList.remove("show");
  }
  const pinBtn = e.target.closest(".pin-btn");
  if (pinBtn) {
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
  }
});
const _viewObservers = new Map();

function _getObserverForRoot(root) {
  const key = root === window ? null : root;
  if (_viewObservers.has(key)) return _viewObservers.get(key);
  const observer = new IntersectionObserver(async (entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      const tweetId = el.dataset.id;
      const user = auth.currentUser;
      if (!user) {
        obs.unobserve(el);
        continue;
      }
      try {
        if (window.communityID) {
          const viewRef = doc(db, "communities", window.communityID, "posts", tweetId, "views", user.uid);
          const postRef = doc(db, "communities", window.communityID, "posts", tweetId);
          const viewSnap = await getDoc(viewRef);
          if (!viewSnap.exists()) {
            await setDoc(viewRef, {
              viewedAt: new Date()
            });
            await updateDoc(postRef, {
              viewsCount: increment(1)
            });
          }
        } else {
          const viewRef = doc(db, "tweets", tweetId, "views", user.uid);
          const postRef = doc(db, "tweets", tweetId);
          const viewSnap = await getDoc(viewRef);
          if (!viewSnap.exists()) {
            await setDoc(viewRef, {
              viewedAt: new Date()
            });
            await updateDoc(postRef, {
              viewsCount: increment(1)
            });
          }
        }
      } catch (err) {
        console.error("View observer error:", err);
      } finally {
        obs.unobserve(el);
      }
    }
  }, {
    threshold: 1.0,
    root: null
  });
  const wrapper = {
    observer,
    root
  };
  _viewObservers.set(key, wrapper);
  return wrapper;
}

function observeTweet(el) {
  if (!el) return;
  const scrollContainer = el.closest('.useroverlay .user-box') || null;
  const key = scrollContainer || null;
  let wrapper = _viewObservers.get(key);
  if (!wrapper) {
    const observer = new IntersectionObserver(async (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const tweetId = el.dataset.id;
        const user = auth.currentUser;
        if (!user) {
          obs.unobserve(el);
          continue;
        }
        try {
          if (window.communityID) {
            const viewRef = doc(db, "communities", window.communityID, "posts", tweetId, "views", user.uid);
            const postRef = doc(db, "communities", window.communityID, "posts", tweetId);
            const viewSnap = await getDoc(viewRef);
            if (!viewSnap.exists()) {
              await setDoc(viewRef, {
                viewedAt: new Date()
              });
              await updateDoc(postRef, {
                viewsCount: increment(1)
              });
            }
          } else {
            const viewRef = doc(db, "tweets", tweetId, "views", user.uid);
            const postRef = doc(db, "tweets", tweetId);
            const viewSnap = await getDoc(viewRef);
            if (!viewSnap.exists()) {
              await setDoc(viewRef, {
                viewedAt: new Date()
              });
              await updateDoc(postRef, {
                viewsCount: increment(1)
              });
            }
          }
        } catch (err) {
          console.error("View observer error:", err);
        } finally {
          obs.unobserve(el);
        }
      }
    }, {
      threshold: 1.0,
      root: scrollContainer
    });
    wrapper = {
      observer,
      root: scrollContainer
    };
    _viewObservers.set(key, wrapper);
  }
  try {
    wrapper.observer.observe(el);
  } catch (err) {
    console.warn("Failed to observe element:", err);
  }
}

function unobserveTweet(el) {
  if (!el) return;
  const scrollContainer = el.closest('.useroverlay .user-box') || null;
  const key = scrollContainer || null;
  const wrapper = _viewObservers.get(key);
  if (!wrapper) return;
  try {
    wrapper.observer.unobserve(el);
  } catch (e) {}
}
window.observeTweet = observeTweet;
window.unobserveTweet = unobserveTweet;
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
banner.style.cssText = `position:absolute;top:0;right:auto;left:auto;width: fit-content; background: #00ba7c; color:white; padding: 8px 15px; border-radius: 50px;pointer-events:auto;cursor:pointer`;
banner.textContent = `0 new Wynt posted`;
newBanner.appendChild(banner);
let unsubscribeMain = null;
let firstVisibleMain = null;
let newIncomingMain = [];
async function resetMainListener() {
  if (unsubscribeMain) unsubscribeMain();
  if (!firstVisibleMain) return;
  const listenQ = query(collection(db, "tweets"), orderBy("createdAt", "desc"), where("createdAt", ">", firstVisibleMain.data().createdAt));
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
  for (const docSnap of newIncomingMain) {
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
  }
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
  let baseQuery;
  if (direction === "down") {
    baseQuery = newestSnapshotNewest ? query(tweetsRef, orderBy("createdAt", "desc"), startAfter(newestSnapshotNewest), limit(count)) : query(tweetsRef, orderBy("createdAt", "desc"), limit(count));
  } else {
    baseQuery = oldestSnapshotNewest ? query(tweetsRef, orderBy("createdAt", "asc"), startAfter(oldestSnapshotNewest), limit(count)) : query(tweetsRef, orderBy("createdAt", "asc"), limit(count));
  }
  const snap = await getDocs(baseQuery);
  const tweetObjs = snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      _score: scoreTweet(data, currentUserFollowing),
    };
  });
  tweetObjs.sort((a, b) => b._score - a._score);
  if (direction === "down") {
    let firstTweetRendered = false;
    for (const t of tweetObjs) {
      await renderTweet(t, t.id, auth.currentUser, "append");
      if (!firstTweetRendered) {
        const loadingEl = document.getElementById("loading");
        if (loadingEl) loadingEl.remove();
        firstTweetRendered = true;
      }
    }
    newestSnapshotNewest = snap.docs[snap.docs.length - 1] || newestSnapshotNewest;
  } else {
    let firstTweetRendered = false;
    for (const t of tweetObjs.reverse()) {
      await renderTweet(t, t.id, auth.currentUser, "prepend");
      if (!firstTweetRendered) {
        const loadingEl = document.getElementById("loading");
        if (loadingEl) loadingEl.remove();
        firstTweetRendered = true;
      }
    }
    oldestSnapshotNewest = snap.docs[snap.docs.length - 1] || oldestSnapshotNewest;
  }
  loadingMore = false;
  if (!firstVisibleMain && snap.docs && snap.docs.length) {
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

function setupPoll(checkboxId, containerId, addBtnId) {
  const cb = document.getElementById(checkboxId);
  const container = document.getElementById(containerId);
  const addBtn = document.getElementById(addBtnId);
  cb.addEventListener("change", () => {
    if (cb.checked) {
      container.classList.remove("hidden");
    } else {
      container.classList.add("hidden");
      container.querySelectorAll(".poll-option-wrapper").forEach((opt, i) => {
        if (i > 1) opt.remove();
      });
      addBtn.style.display = "inline-block";
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
    container.insertBefore(wrapper, addBtn);
    const newCount = container.querySelectorAll(".poll-option-wrapper").length;
    if (newCount >= 2) {
      addBtn.style.display = "none";
    }
  });
}
setupPoll("includePoll", "pollOptions", "addPollOption");
setupPoll("includePollRetweet", "pollOptionsRetweet", "addPollOptionRetweet");
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
    commentStatus.innerHTML = `<div class="donation-preview" style="display:flex;align-items:center;gap:5px;color:#0485b7;font-size:15px;"><img loading='lazy' src="/image/gift.svg"> You will donate <span style="color:#f91880;font-size:16px;">${formatNumber(pendingDonation * 0.8)}</span> Wcoins with this reply</div>`;
  };
}
document.body.addEventListener("click", async (e) => {
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
    document.getElementById("commentOverlay").classList.remove("hidden");
    document.getElementById("commentInput").focus();
    pendingDonation = 0;
    let tweetRef;
    if (window.communityID) {
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
            <span style="opacity:0.7;font-size:12px;">
              <span class="usernamee">@system •</span> 
              0s
            </span>
          </div>
          <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
            <p style="margin-bottom:15px !important;color:grey;">Post is not available or you don't have permission to reply</p>
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
    const uid1 = auth.currentUser.uid;
    const userDoc1 = await getDoc(doc(db, "users", uid1));
    const userData1 = userDoc1.exists() ? userDoc1.data() : {};
    const {
      avatar
    } = await getUserData(auth.currentUser.uid);
    document.getElementById("commentAvatar").src = avatar;
    const userRef = doc(db, "users", tweetData.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : {};
    const tweetEl = document.querySelector(`#tweet-${tweetId}`);
    const tweetText = tweetData.text || "";
    const createdAt = formatDate(tweetData.createdAt);
    const parsedText = await parseMentionsToLinks(tweetData.text, tweetData.mentions || []);
    const tweetOwnerId = tweetData.uid;
    const isOwner = auth.currentUser.uid === tweetOwnerId;
    let titleHTML = "";
    if (tweetData.title) {
      titleHTML = `<h3 style="margin:10px 0;">${escapeHTML(tweetData.title)}</h3>`;
    }
    let editHTML4 = "";
    if (tweetData.edited) {
      editHTML4 = `        
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(tweetData.edited)}
        </span>`
    }
    const { username, avatar: avatar1, displayName, IQ: sIQ, premium } = await getUserData(tweetData.uid);
    const premiumExpiry = premium ? premium.toDate() : null;
    const now = new Date();
    const isPremium = premiumExpiry && premiumExpiry > now;

    let mediaHTML = "";
    const containsSpoiler = /\|\|.+?\|\|/.test(tweetData.text);
    let vidId = null;
    let vidRtId = null;
    if (tweetData.media && tweetData.mediaType === "image") {
      const src = base91ToImageSrc(tweetData.media);
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
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
      } else {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment">
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;margin-bottom:10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
        if (!document.getElementById(vidId)) getSupabaseVideo(tweetData.media, vidId);
      }
    }

    await updateCommentUI(tweetData, isOwner, tweetOwnerId);
    document.getElementById("commentTweet").innerHTML = `
                    <div style="display:flex;gap:10px;margin-bottom:-15px !important;">
                      <div style="border-bottom:10px solid var(--dark);z-index:1;height:40px;">
                        <img loading='lazy' src="${avatar1 || 'image/default-avatar.jpg'}" onerror="this.src='image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
                      </div>
                      <div>
                        <div class=flex style="display:Flex;gap:5px;">
                          ${(tweetData.mentions && tweetData.mentions.includes(auth.currentUser.uid)) ?
                            `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                            `<div class=iq style="margin:0">${sIQ}</div>` 
                          }
                          <strong>${escapeHTML(displayName || "Unnamed")}</strong>
                          ${isPremium ? `<img loading='lazy' src="/image/check.svg" style="margin:0;">` : ""}
                          <span style="opacity:0.7;font-size:12px;"><span class="usernamee">@${escapeHTML(username)} •</span> ${createdAt}</span>
                        </div>
                        <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
                          ${titleHTML}
                          <p style="margin-bottom:15px !important">${parsedText}</p> 
                          ${mediaHTML}
                          ${editHTML4}
                        </div>
                      </div>
                    </div>`;
    applyReadMoreLogic(document.getElementById("commentTweet"));
    document.getElementById("sendComment").onclick = async () => {

      let tweetDoc;
      if (window.communityID) {
        tweetDoc = await getDoc(doc(db, "communities", window.communityID, "posts", tweetId))
      } else {
        tweetDoc = await getDoc(doc(db, "tweets", tweetId));
      }
      const sendBtn = document.getElementById("sendComment");
      sendBtn.disabled = true;
      sendBtn.classList.add("disabled");
      try {
        const commentInput = document.getElementById("commentInput");
        const commentText = commentInput.value.trim();
        const fileInput = document.querySelector(".comment-media-input");
        const files = fileInput.files;
        const videos = Array.from(files).filter(f => f.type.startsWith("video/"));
        const images = Array.from(files).filter(f => f.type.startsWith("image/"));
        if (!commentText && !images && !videos) {
          log("red", "please add anything before posting a reply");
          return;
        }
        if (videos.length > 0 && images.length > 0) {
          log("red", "please don't upload videos and images together");
          return;
        }
        if (videos.length > 1) {
          log("red", "please only insert one video at a time");
          return;
        }
        if (images.length > 4) {
          log("red", "please insert images less than 5.");
          return;
        }
        const user = auth.currentUser;
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        const premiumExpiry = userData.premium ? userData.premium.toDate() : null;
        const now = new Date();
        const isPremium = premiumExpiry && premiumExpiry > now;
        const maxSize = isPremium ? 5.11 * 1024 * 1024 : 3.5 * 1024 * 1024;
        let media = "";
        let mediaType = "";
        let mediaPath = "";
        if (videos.length === 1) {
          const cooldown = userData.commentVideoCooldown;
          if (cooldown && cooldown.toMillis() > Date.now()) {
            const remainingMs = cooldown.toMillis() - Date.now();
            const remainingMin = Math.ceil(remainingMs / 60000);
            log("red", `Comments with video cooldown resets in ${remainingMin} minute${remainingMin> 1 ? 's' : ''}`);
            sendBtn.disabled = false;
            sendBtn.classList.remove("disabled");
            return;
          }
          const file = videos[0];
          if (file.size > maxSize) {
            log("red", `please insert only videos lower than ${isPremium ? "5.1MB" : "3.5MB"}`);
            sendBtn.disabled = false;
            sendBtn.classList.remove("disabled");
            return;
          }
          mediaType = "video";
          media = await uploadToSupabase(file, "videos");
          if (!media.url) {
            log("red", "Video upload failed")
            return;
          }
          mediaPath = media.path;
          const cooldownDuration = isPremium ? 50 * 60 * 1000 : 2 * 60 * 60 * 1000;
          await updateDoc(userRef, {
            commentVideoCooldown: Timestamp.fromDate(new Date(Date.now() + cooldownDuration)),
          });
        } else if (images.length > 0) {
          for (const img of images) {
            if (img.size > maxSize) {
              log("red", "image exceeds 1MB");
              btn.disabled = false;
              btn.classList.remove("disabled");
              return;
            }
          }
          const compressedBase64s = await Promise.all(images.map(f => compressImageTo480(f)));
          let finalFile;
          if (images.length > 1) {
            const collageBase64 = await makeCollage(compressedBase64s);
            const res = await fetch(collageBase64);
            finalFile = await res.blob();
            finalFile = new File([finalFile], "collage.jpg", {
              type: "image/jpeg"
            });
          } else {
            const res = await fetch(compressedBase64s[0]);
            finalFile = await res.blob();
            finalFile = new File([finalFile], "image.jpg", {
              type: "image/jpeg"
            });
          }
          const arrayBuffer = await finalFile.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const encodedBase91 = base91.encode(bytes);
          mediaType = "image";
          media = {
            url: encodedBase91,
            type: "image",
            path: null
          };
          mediaPath = null;
        }
        if (commentText || media) {
          const mentionsRaw = await extractMentions(commentText);
          let processedText = commentText;
          mentionsRaw.sort((a, b) => (b.username?.length || 0) - (a.username?.length || 0));
          const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          for (const {
              username,
              uid
            }
            of mentionsRaw) {
            if (!username || !uid) continue;
            const regex = new RegExp(`@${escapeRegExp(username)}(?=\\s|$)`, "gi");
            processedText = processedText.replace(regex, `@${uid}`);
          }
          const mentions = [...new Set(mentionsRaw.map(m => m.uid).filter(Boolean))];
          const tagMatches = commentText.match(/#(\w+)/g) || [];
          const tags = [...new Set(tagMatches.map(tag => tag.slice(1).toLowerCase().slice(0, 30)))];
          let donation = 0;
          let donationReceived = 0;
          let sentDonationNotification = false;
          const editUntil = new Date(Date.now() + 10 * 60 * 1000);
          let commentsRef, postRef, postSnap;
          if (window.communityID) {
            postRef = doc(db, "communities", window.communityID, "posts", tweetId);
            commentsRef = collection(db, "communities", window.communityID, "posts", tweetId, "comments");
            postSnap = await getDoc(postRef);
          } else {
            postRef = doc(db, "tweets", tweetId);
            commentsRef = collection(db, "tweets", tweetId, "comments");
            postSnap = await getDoc(postRef);
          }
          let hasCommentedBefore = false;
          if (postSnap.data().uid != auth.currentUser.uid) {
            if (window.communityID) {
              const q = query(collection(db, "communities", window.communityID, "posts", tweetId, "comments"), where("uid", "==", auth.currentUser.uid), limit(1));
              const snap = await getDocs(q);
              hasCommentedBefore = !snap.empty;
            } else {
              const q = query(collection(db, "tweets", tweetId, "comments"), where("uid", "==", auth.currentUser.uid), limit(1));
              const snap = await getDocs(q);
              hasCommentedBefore = !snap.empty;
            }
          }
          if (window.communityID) {
            bumpCommunityOrder(window.communityID);
          }
          const previouslyMentioned = new Set();
          for (const uid of mentions) {
            let q;
            if (window.communityID) {
              q = query(collection(db, "communities", window.communityID, "posts", tweetId, "comments"), where("uid", "==", auth.currentUser.uid), where("mentions", "array-contains", uid), limit(1));
            } else {
              q = query(collection(db, "tweets", tweetId, "comments"), where("uid", "==", auth.currentUser.uid), where("mentions", "array-contains", uid), limit(1));
            }
            const snap = await getDocs(q);
            if (!snap.empty) {
              previouslyMentioned.add(uid);
            }
          }
          const value = processedText;
          const match = value.match(/^\/private +/i);
          let REALTEXT;
          let isPrivate = false;
          if (match) {
            const cleaned = value.slice(match[0].length);
            REALTEXT = cleaned;
            isPrivate = true;
          } else {
            REALTEXT = processedText;
          }
          const detectedLanguage = await detectLanguage(REALTEXT);
          const commentRef = await addDoc(commentsRef, {
            text: REALTEXT,
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
            parentId: replyingToId || null,
            isPrivate,
            canReadPrivate: tweetOwnerId,
          });
          const commentId = commentRef.id;
          if (pendingDonation > 0) {
            const userRef1 = doc(db, "users", auth.currentUser.uid);
            const ownerRef = doc(db, "users", tweetOwnerId);
            let tweetRef = window.communityID ? doc(db, "communities", window.communityID, "posts", tweetId) : doc(db, "tweets", tweetId);
            const userSnap = await getDoc(userRef1);
            if (userSnap.exists()) {
              const donorBalance = userSnap.data().balance || 0;
              if (donorBalance >= pendingDonation) {
                donation = pendingDonation;
                donationReceived = Math.floor(pendingDonation * 0.8);
                await updateDoc(userRef1, {
                  balance: increment(-pendingDonation)
                });
                await updateDoc(ownerRef, {
                  balance: increment(donationReceived)
                });
                await updateDoc(tweetRef, {
                  donations: increment(donationReceived)
                });
                await updateDoc(commentRef, {
                  donationReceived
                });
                sentDonationNotification = true;
              }
            }
            pendingDonation = 0;
          }
          await updateDoc(postRef, {
            commentCount: increment(1)
          });
          let tweetSnap;
          if (window.communityID) {
            tweetSnap = await getDoc(doc(db, "communities", window.communityID, "posts", tweetId));
          } else {
            tweetSnap = await getDoc(doc(db, "tweets", tweetId));
          }
          const tweetData = tweetSnap.data();
          const tweetText = tweetData.text;
          for (const uid of mentions) {
            if (uid === tweetData.uid && !hasCommentedBefore) continue;
            if (previouslyMentioned.has(uid)) continue;
            if (window.communityID && !window.isOnPrivate) {
              const communityName = await getCommunityNameById(window.communityID);
              await sendCommunityCommentMentionNotification(tweetId, uid, processedText, window.communityID, commentId, communityName, tweetText);
            } else if (window.isOnPrivate && window.communityID) {
              const userDoc = await getDoc(doc(db, "users", uid));
              const userCommunities = userDoc.data().communities || [];
              if (userCommunities.includes(window.communityID)) {
                const communityName = await getCommunityNameById(window.communityID);
                await sendCommunityCommentMentionNotification(tweetId, uid, processedText, window.communityID, commentId, communityName, tweetText);
              } else {
                info("x", "insufficient permission", "user is not notified due to this is a private community and the user doesn't have permission to view it.")
              }
            } else {
              await sendCommentMentionNotification(tweetId, uid, processedText, commentId, tweetText);
            }
          }
          if (!sentDonationNotification && !hasCommentedBefore) {
            if (window.communityID) {
              const communityName = await getCommunityNameById(window.communityID);
              await sendCommunityCommentNotification(tweetId, REALTEXT, window.communityID, commentId, communityName, tweetText);
            } else {
              await sendCommentNotification(tweetId, REALTEXT, commentId, tweetText);
            }
          } else if (sentDonationNotification) {
            if (window.communityID) {
              const communityName = await getCommunityNameById(window.communityID);
              await sendCommunityDonationNotification(tweetId, donation, donationReceived, REALTEXT, window.communityID, commentId, communityName, tweetText);
            } else {
              await sendDonationNotification(tweetId, donation, donationReceived, REALTEXT, commentId, tweetText);
            }
          }
          clearcomment();
          await loadComments(tweetId);
        }
        log("green", "reply posted");
      } catch (err) {
        console.error("Error sending comment:", err);
        log("red", "error sending reply");
      } finally {
        replyingToId = null;
        sendBtn.disabled = false;
        sendBtn.classList.remove("disabled");
        document.getElementById('commentOverlay').classList.add('hidden');
      }
    };
  }
  const bookmarkBtn = e.target.closest(".bookmark-btn");
  if (bookmarkBtn) {
    loading.classList.add("show");
    const btn = bookmarkBtn;
    const tweetId = btn.id.replace("bookmarkBtn-", "");
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);
    const data = userSnap.data();
    const premiumExpiry = data.premium ? data.premium.toDate() : null;
    const now = new Date();
    const isPremium = premiumExpiry && premiumExpiry > now;
    await openBookmarkOverlay(tweetId, isPremium);
    loading.classList.remove("show");
  }
  const highlightBtn = e.target.closest(".highlight-btn");
  if (highlightBtn) {
    loading.classList.add("show");
    const btn = highlightBtn;
    const tweetId = btn.dataset.id || btn.id.replace("highlightBtn-", "");
    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return log("red", "user isn't logged in");
    const data = userSnap.data();
    const premiumExpiry = data.premium ? data.premium.toDate() : null;
    const now = new Date();
    const isPremium = premiumExpiry && premiumExpiry > now;
    if (!isPremium) {
      document.getElementById("premiumOverlay").classList.remove("hidden");
      loading.classList.remove("show");
      return;
    }
    const highlightRef = doc(db, "users", auth.currentUser.uid, "highlights", tweetId);
    const snap = await getDoc(highlightRef);
    if (snap.exists()) {
      await deleteDoc(highlightRef);
      btn.innerHTML = `<img loading='lazy' src="/image/highlight.svg"> Highlight to your profile`;
    } else {
      await setDoc(highlightRef, {
        highlightedAt: new Date()
      });
      btn.innerHTML = `<img loading='lazy' src="/image/highlighted.svg"> Unhighlight from your profile`;
    }
    loading.classList.remove("show");
  }
});
document.body.addEventListener("click", async (e) => {
  const replyBtn = e.target.closest(".reply-btn");
  if (!replyBtn) return;
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
  let commentSnap;
  if (window.communityID) {
    commentSnap = await getDoc(doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId));
  } else {
    commentSnap = await getDoc(doc(db, "tweets", tweetId, "comments", commentId));
  }
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
            <span style="opacity:0.7;font-size:12px;">
              <span class="usernamee">@system •</span> 
              0s
            </span>
          </div>
          <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
            <p style="margin-bottom:15px !important;color:grey;">Post is not available or you don't have permission to reply</p>
          </div>
        </div>
      </div>
    `;
    return;
  }
  const commentData = commentSnap.data();
  const commentUserSnap = await getDoc(doc(db, "users", commentData.uid));
  const commentUser = commentUserSnap.exists() ? commentUserSnap.data() : {};
  const {
    premium,
    avatar: avatar1,
    username,
    IQ: wIQ,
    displayName
  } = await getUserData(commentData.uid);
  const premiumExpiry = premium ? premium.toDate() : null;
  const now = new Date();
  const isPremium = premiumExpiry && premiumExpiry > now;
  const parsedText = await parseMentionsToLinks(commentData.text || "", commentData.mentions || []);
  const createdAt = formatDate(commentData.createdAt);
  let editHTML6 = "";
  if (commentData.edited) {
    editHTML6 = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(commentData.edited)}
        </span>
      `
  }

    const containsSpoiler = /\|\|.+?\|\|/.test(commentData.text);
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
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;margin-bottom:10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
      } else {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment">
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;margin-bottom:10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
        if (!document.getElementById(vidId)) getSupabaseVideo(commentData.media.url, vidId);
      }
    }

  document.getElementById("replyComment").innerHTML = `
                    <div style="display:flex;gap:10px;margin-bottom:25px;">
                      <div style="border-bottom:10px solid var(--dark);z-index:1;height:40px;">
                        <img loading='lazy' src="${avatar1 || 'image/default-avatar.jpg'}" onerror="this.src='image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:10px;object-fit:cover;">
                      </div>
                      <div>
                        <div class=flex style="display:Flex;gap:5px;">
                          ${(commentData.mentions && commentData.mentions.includes(auth.currentUser.uid)) ?
                            `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                            `<div class=iq style="margin:0">${wIQ}</div>` 
                          }
                          <strong>${escapeHTML(displayName || "Unnamed")}</strong>
                          ${isPremium ? `<img loading='lazy' src="/image/check.svg" style="margin:0;">` : ""}
                          <span style="opacity:0.7;font-size:12px;"><span class="usernamee">@${escapeHTML(username)} •</span> ${createdAt}</span>
                        </div>
                        <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
                          <p style="margin-bottom:15px !important;">${parsedText}</p>
                          ${mediaHTML} 
                          ${editHTML6}
                        </div>
                      </div>
                    </div>`;
  document.getElementById("sendReply").onclick = async () => {
    const btn = document.getElementById("sendReply");
    btn.disabled = true;
    btn.classList.add("disabled");
    try {
      const text = document.getElementById("replyInput").value.trim();
      const fileInput = document.getElementById("replyMediaInput");
      const files = Array.from(fileInput.files);
      const videos = files.filter(f => f.type.startsWith("video/"));
      const images = files.filter(f => f.type.startsWith("image/"));
      if (videos.length > 0 && images.length > 0) {
        log("red", "please don't upload videos and images together");
        return;
      }
      if (videos.length > 1) {
        log("red", "please only insert one video at a time");
        return;
      }
      if (images.length > 4) {
        log("red", "please insert images less than 5");
        return;
      }
      const isCommunity = window.communityID != null;
      const basePath = isCommunity ? ["communities", window.communityID, "posts", tweetId, "comments"] : ["tweets", tweetId, "comments"];
      const userRef = doc(db, "users", auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};
      const premiumExpiry = userData.premium ? userData.premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;
      const maxSize = isPremium ? 5.1 * 1024 * 1024 : 3.5 * 1024 * 1024;
      let media = null;
      let mediaType = "";
      let mediaPath = null;
      if (videos.length === 1) {
        const file = videos[0];
        if (file.size > maxSize) {
          log("red", `please insert only videos lower than ${isPremium ? "5.1MB" : "3.5MB"}`);
          return;
        }
        const lastVideoTime = userData.lastVideoReply?.toDate?.() || null;
        const cooldown = isPremium ? 50 * 60 * 1000 : 2 * 60 * 60 * 1000;
        if (lastVideoTime && now - lastVideoTime < cooldown) {
          const remaining = Math.ceil((cooldown - (now - lastVideoTime)) / 60000);
          log("red", `wait ${remaining} minutes before posting another video reply`)
          return;
        }
        const upload = await uploadToSupabase(file, "videos");
        media = {
          url: upload.url,
          type: "video"
        };
        mediaType = "video";
        mediaPath = upload.path;
        await updateDoc(userRef, {
          lastVideoReply: serverTimestamp()
        });
      } else if (images.length > 0) {
        for (const img of images) {
          if (img.size > maxSize) {
            log("red", "please insert only images lower than 1MB");
            return;
          }
        }
        const compressed = await Promise.all(images.map(f => compressImageTo480(f)));
        let finalFile;
        if (images.length > 0) {
          for (const img of images) {
            if (img.size > maxSize) {
              log("red", "image exceeds 1MB");
              btn.disabled = false;
              btn.classList.remove("disabled");
              return;
            }
          }
          const compressedBase64s = await Promise.all(images.map(f => compressImageTo480(f)));
          let finalFile;
          if (images.length > 1) {
            const collageBase64 = await makeCollage(compressedBase64s);
            const res = await fetch(collageBase64);
            finalFile = await res.blob();
            finalFile = new File([finalFile], "collage.jpg", {
              type: "image/jpeg"
            });
          } else {
            const res = await fetch(compressedBase64s[0]);
            finalFile = await res.blob();
            finalFile = new File([finalFile], "image.jpg", {
              type: "image/jpeg"
            });
          }
          const arrayBuffer = await finalFile.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const encodedBase91 = base91.encode(bytes);
          mediaType = "image";
          media = {
            url: encodedBase91,
            type: "image",
            path: null
          };
          mediaPath = null;
        }
      }
      if (!text && !media) {
        return;
      }
      const mentionsRaw = await extractMentions(text);
      let processedText = text;
      mentionsRaw.sort((a, b) => (b.username?.length || 0) - (a.username?.length || 0));
      const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const {
          username,
          uid
        }
        of mentionsRaw) {
        if (!username || !uid) continue;
        const regex = new RegExp(`@${escapeRegExp(username)}(?=\\s|$)`, "gi");
        processedText = processedText.replace(regex, `@${uid}`);
      }
      const mentions = [...new Set(mentionsRaw.map(m => m.uid).filter(Boolean))];
      const editUntil = new Date(Date.now() + 10 * 60 * 1000);
      if (window.communityID) {
        bumpCommunityOrder(window.communityID);
      }

      let hasCommentedBefore = false;

      const detectedLanguage = await detectLanguage(processedText);
      const parentCommentRef = doc(db, ...basePath, commentId);
      const parentCommentSnap = await getDoc(parentCommentRef);
      const commentData = parentCommentSnap.data();
      const tweetText = commentData.text;

      let isPrivateParent = false;
      if (commentData.isPrivate || commentData.isPrivateParent) {
        isPrivateParent = true;
      }

      const payload = {
        text: processedText,
        communityId: window.communityID || null,
        media,
        mediaType,
        mediaPath,
        language: detectedLanguage,
        uid: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        searchTokens: tokenize(text),
        editUntil,
        mentions: mentions || [],
        likeCount: 0,
        replyCount: 0,
        parentId: commentId,
        isPrivateParent
      };

      if (commentData.uid != auth.currentUser.uid) {
        if (window.communityID) {
          const q = query(collection(db, "communities", window.communityID, "posts", tweetId, "comments"), where("uid", "==", auth.currentUser.uid), where("parentId", "==", commentId), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            hasCommentedBefore = true;
          }
        } else {
          const q = query(collection(db, "tweets", tweetId, "comments"), where("uid", "==", auth.currentUser.uid), where("parentId", "==", commentId), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            hasCommentedBefore = true;
          }
        }
      }
      const previouslyMentioned = new Set();
      for (const uid of mentions) {
        let q;
        if (window.communityID) {
          q = query(collection(db, "communities", window.communityID, "posts", tweetId, "comments"), where("uid", "==", auth.currentUser.uid), where("parentId", "==", commentId), where("mentions", "array-contains", uid), limit(1));
        } else {
          q = query(collection(db, "tweets", tweetId, "comments"), where("uid", "==", auth.currentUser.uid), where("parentId", "==", commentId), where("mentions", "array-contains", uid), limit(1));
        }
        const snap = await getDocs(q);
        if (!snap.empty) {
          previouslyMentioned.add(uid);
        }
      }
      const replyRef = await addDoc(collection(db, ...basePath), payload);
      const replyId = replyRef.id;

      if (hasCommentedBefore === false) {
        if (window.communityID) {
          const communityName = await getCommunityNameById(window.communityID);
          await sendCommunityReplyNotification(tweetId, commentId, text, window.communityID, communityName, tweetText);
        } else {
          await sendReplyNotification(tweetId, commentId, text, tweetText, replyId);
        }
      }
      let greatParentRef, greatParentData, greatParentSnap;
      if (commentData.parentId != null) {
        greatParentRef = doc(db, ...basePath, commentData.parentId);
        greatParentSnap = await getDoc(greatParentRef);
        greatParentData = greatParentSnap.data();
      }
      let ownerUid;
      let tweetRef1, tweetSnap1, tweetData1;
      if (commentData.parentId === null) {
        if (window.communityID) {
          tweetRef1 = doc(db, "communities", window.communityID, "posts", tweetId);
          tweetSnap1 = await getDoc(tweetRef1);
          tweetData1 = tweetSnap1.data();
        } else {
          tweetRef1 = doc(db, "tweets", tweetId);
          tweetSnap1 = await getDoc(tweetRef1);
          tweetData1 = tweetSnap1.data();
        }
        ownerUid = tweetData1.uid;
      } else {
        ownerUid = greatParentData.uid;
      }
      if (auth.currentUser.uid === ownerUid && commentData.uid != auth.currentUser.uid && commentData.ownerReplied == null) {
        await updateDoc(parentCommentRef, {
          replyCount: increment(1),
          ownerReplied: replyId
        });
        await updateDoc(replyRef, {
          ownerReplying: commentId
        });
      } else {
        await updateDoc(parentCommentRef, {
          replyCount: increment(1)
        });
      }
      for (const uid of mentions) {
        if (uid === commentData.uid && !hasCommentedBefore) continue;
        if (previouslyMentioned.has(uid)) continue;
        if (window.communityID && !window.isOnPrivate) {
          const communityName = await getCommunityNameById(window.communityID);
          await sendCommunityReplyMentionNotification(tweetId, commentId, uid, text, window.communityID, communityName, tweetText, replyId);
        } else if (window.isOnPrivate && window.communityID) {
          const userDoc = await getDoc(doc(db, "users", uid));
          const userCommunities = userDoc.data().communities || [];
          if (userCommunities.includes(window.communityID)) {
            const communityName = await getCommunityNameById(window.communityID);
            await sendCommunityReplyMentionNotification(tweetId, commentId, uid, text, window.communityID, communityName, tweetText, replyId);
          }
        } else {
          await sendReplyMentionNotification(tweetId, commentId, uid, text, tweetText, replyId);
        }
      }
      if (!document.getElementById('commentViewer').classList.contains("hidden")) {
        loadComments(tweetId, true, commentId, document.getElementById('replyList'), window.communityID || null);
      }
      document.getElementById("replyInput").value = "";
      fileInput.value = "";
      document.getElementById("replyPreview").innerHTML = "";
      document.getElementById("replyOverlay").classList.add("hidden");
      log("green", "replied sent")
    } catch (err) {
      console.error("Error sending reply:", err);
      log("red", "error sending reply");
    } finally {
      btn.disabled = false;
      btn.classList.remove("disabled");
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

async function renderOwner(tweetId, ownerReplied, communityId, id, dcomid, ownerPrivate) {
  const el = document.getElementById(`${id}`);
  el.innerHTML = `
    <div id="${id}" class="ownerr">
      <button style="margin-top:10px;padding:5px 7px;background:var(--light);color:var(--color);display:flex;gap:5px;border:var(--border);font-size:12px">
        <img style="height:17px;" src="/image/loader.svg">
        Wynt author replied
      </button>
    </div>
  `;

  let ref, snap, data, likeref;
  if (communityId && communityId != "null" && communityId != null) {
    ref = doc(db, "communities", communityId, "posts", tweetId, "comments", ownerReplied);
    snap = await getDoc(ref);
    data = snap.data() || null;
    likeref = `communities/${communityId}/posts/${tweetId}/comments/${ownerReplied}/likes/${auth.currentUser.uid}`
  } else {
    ref = doc(db, "tweets", tweetId, "comments", ownerReplied);
    snap = await getDoc(ref);
    data = snap.data() || null;
    likeref = `tweets/${tweetId}/comments/${ownerReplied}/likes/${auth.currentUser.uid}`
  }

  const likeId = `like-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  let ownerHTML1 = "";
  let mediaHTML1 = "";

  const containsSpoiler = /\|\|.+?\|\|/.test(data.text);
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
        <video id="${vidId}" controls style="max-width:100%;max-height:300px;border-radius:10px;">Your browser does not support the video tag.</video>
      </div>`;
    getSupabaseVideo(data.media.url, vidId);
  }

  let editHTML4 = "";
  if (data.edited) {
    editHTML4 = `
    <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
      ${editicon} 
      ${formatTime(data.edited)}
    </span>
        `
  }

  if (!snap.exists()) {
    ownerHTML1 = ``
  }

  const { displayName: displayName3, username: username3, avatar: avatar3, IQ: sIQ, premium: premium3 } = await getUserData(data.uid);
  const premiumExpiry1 = premium3 ? premium3.toDate() : null;
  const now1 = new Date();
  const isPremium3 = premiumExpiry1 && premiumExpiry1 > now1;
  const parsedText1 = await parseMentionsToLinks(data.text, data.mentions || []);
  const defaultLanguage = getDefaultLanguage();
  const isTranslate = isTranslateEnabled();

  let translateHTML1 = "";
  if (data.language && data.language !== defaultLanguage && isTranslate) {
    const random = Math.floor(Math.random() * 10000);
    translateHTML1 = `
      <div class="translate-wrapper" style="margin-top:-5px;margin-bottom:5px;">
        <span
          class="translate-btn"
          data-id="${ownerReplied}"
          data-random="${random}"
          data-from="${data.language}"
          data-to="${defaultLanguage}"
          data-text="${data.text}"
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

  ownerHTML1 = `
  <div data-id="${ownerReplied}" data-community-id="${dcomid || null}" data-tweet="${tweetId}" class="comment-item owner-comment" style="display:flex;gap:10px;border-bottom:none;padding:20px 0 !important;padding-bottom:0 !important;background:none;">
    <img loading='lazy' src="${escapeHTML(avatar3)}" onerror="this.src='/image/default-avatar.jpg'" class="avatar comment-avatar">
    <div style="display:flex;flex-direction:column">
      <div class="flex comment-header" style="gap:10px;margin:0;">
       ${(data.mentions && data.mentions.includes(auth.currentUser.uid)) ?
          `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
          `<div class=iq style="margin:0">${sIQ}</div>` 
        }
        <div class="user-link" data-uid="${data.uid}" style="cursor:pointer;font-weight:bold;">${escapeHTML(displayName3)}</div>
        ${isPremium3 ? `<img loading='lazy' src="/image/check.svg" style="margin:0 -5px;">` : ""}
        <span class="comment-date">
          <span class="usernamee">@${escapeHTML(username3)} •</span> 
          ${formatDate(data.createdAt)}
        </span>
      </div>
      <div class="comment-body">
        ${data.isHidden ? `
          <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentSubHidden-${ownerReplied}" onclick="
            this.classList.add('hidden');
            document.getElementById('commentSubItem-${ownerReplied}').classList.remove('hidden');">
            <p style="margin:0;font-size:15px;">This reply is hidden by the Wynt author. Click here to view the content</p>
          </button>
          <div class="hidden" id="commentSubItem-${ownerReplied}">
            <p class="no-margin" style="font-size:16px;margin-top:7px;">${parsedText1}</p> 
            ${translateHTML1}
            ${editHTML4}
            ${mediaHTML1}
          </div>` : `
          <p class="no-margin" style="font-size:16px;margin-top:7px;">${parsedText1}</p> 
          ${translateHTML1}
          ${editHTML4}
          ${mediaHTML1}
        `}
        <div class="flex" style="margin:0;gap:13px;">
          ${data.isHidden ? "" :`
            <span style="cursor:pointer;color:#757779" data-community-id="${window.communityID || null}" class="comment-like-btn" data-id="${ownerReplied}" data-tweet="${tweetId}">
              <div id="${likeId}" style="height:20px">
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
          `}
          <span class="cmenubtn" data-private="${data.isPrivate || false}" data-community-id="${data.communityId || null}" data-id="${ownerReplied}" data-tweet="${tweetId}" data-author="${data.uid}">
            <img loading='lazy' src="/image/three-dots.svg">
          </span>
        </div>
      </div>
    </div>
  </div>
  `;

  el.innerHTML = ownerHTML1;
  const likeEl = el.querySelector(`#${likeId}`);
  getSnap(likeref, likeEl);
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
  const hasSearch = searchTerm && searchTerm.trim().length >= 2;
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
    if (d.isPrivate && d.uid != auth.currentUser.uid && d.canReadPrivate != auth.currentUser.uid) {
      return;
    }
    if (wrapper && wrapper.querySelector(`.comment-item[data-id="${commentId}"]`)) return;
    const { displayName, username, avatar, IQ: eIQ, premium } = await getUserData(d.uid);
    const premiumExpiry = premium ? premium.toDate() : null;
    const now = new Date();
    const isPremium = premiumExpiry && premiumExpiry > now;

    let path;
    if (window.communityID) {
      path = `communities/${window.communityID}/posts/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    } else if (communityId) {
      path = `communities/${communityId}/posts/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    } else {
      path = `tweets/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`;
    }

    const likeId = `like-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

    const commentLikeCount = d.likeCount || 0;
    const vidId = `vid-${commentId}-${Math.random().toString(36).slice(2,8)}`;
    const parsedText = await parseMentionsToLinks(d.text, d.mentions || []);
    let donationHTML = "";
    let ownerHTML = "";
    if (d.donationReceived) {
      donationHTML = `<div style="border-radius:7px;
        background: linear-gradient(135deg, #ff9d6c, #ff6cab);display:flex;align-items:center;width:150px;padding:7px 10px;margin-bottom:10px;gap:7px;font-size:15px;color:black;">
        🎁 Gifted ${d.donationReceived} Wcoins
      </div>`;
    }

    if (d.ownerReplied) {
      const id = randomString(32);
      ownerHTML = `
        <div id="${id}" class="ownerr">
          <button style="margin-top:10px;padding:5px 7px;background:var(--light);color:var(--color);display:flex;gap:5px;align-items:center;font-size:12px;border:var(--border)" onclick="
            renderOwner('${tweetId}', '${d.ownerReplied}', '${window.communityID}', '${id}', '${d.communityId}', ${d.isPrivateParent})
          ">
            <img style="height:17px;transform:rotate(270deg)" src="/image/leftArrow.svg">
            Wynt author replied
          </button>
        </div>
      `
    }

    let mediaHTML = "";
    const containsSpoiler = /\|\|.+?\|\|/.test(d.text);
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
    if (d.edited) {
      editHTML3 = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(d.edited)}
        </span>
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
    const pinnedBanner = isPinned ? `<div class="iq" style="background:var(--color);margin-bottom:17px;width:fit-content;font-size:12px;">highlighted</div>` : "";

    const defaultLanguage = getDefaultLanguage();
    const isTranslate = isTranslateEnabled();
    let translateHTML2 = "";
    if (d.language && d.language !== defaultLanguage && isTranslate) {
      const random = Math.floor(Math.random() * 10000);
      translateHTML2 = `
          <div class="translate-wrapper" style="margin-top:-5px;margin-bottom:5px;
      ">
            <span
              class="translate-btn"
              data-id="${commentId}"
              data-random="${random}"
              data-from="${d.language}"
              data-to="${defaultLanguage}"
              data-text="${d.text}"
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
    commentHTML.innerHTML = `
      ${pinnedBanner}
      <div style="display:flex;gap:10px;">
        <img loading='lazy' src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" class="avatar comment-avatar">
        <div style="display:flex;flex-direction:column">
          <div class="flex comment-header" style="gap:10px;margin:0;">
            ${(d.mentions && d.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;">mention</div>` :
              `<div class=iq>${eIQ}</div>` 
            }
            <div class="user-link" data-uid="${d.uid}" style="cursor:pointer;font-weight:bold;">${escapeHTML(displayName)}</div>
            ${isPremium ? `<img loading='lazy' src="/image/check.svg" style="margin:0 -5px;">` : ""}
            <span class="comment-date"><span class="usernamee">@${escapeHTML(username)} •</span> ${formatDate(d.createdAt)}</span>
          </div>
          <div class="comment-body">
            ${d.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${commentId}" onclick="
                this.classList.add('hidden');
                document.getElementById('commentOwner-${commentId}').classList.remove('hidden');
                document.getElementById('commentItem-${commentId}').classList.remove('hidden');">
                <p style="margin:0;font-size:15px;">This reply is hidden by the Wynt author. Click here to view the content</p>
              </button>
              <div class="hidden" id="commentItem-${commentId}">
                <p class="no-margin" style="font-size:16px;margin-top:7px;">${parsedText}</p> 
                ${translateHTML2}
                ${editHTML3}
                ${mediaHTML}
                ${donationHTML}
                ${privateHTML}
              </div>        
              ` : `
              <p class="no-margin" style="font-size:16px;margin-top:7px;">${parsedText}</p> 
              ${translateHTML2}
              ${editHTML3}
              ${mediaHTML}
              ${donationHTML}
              ${privateHTML}
            `}
            <div class="flex" style="margin:0;gap:13px;">
              ${d.isHidden ? "" : `
              <span class="comment-like-btn" data-id="${commentId}" data-tweet="${tweetId}" style="cursor:pointer;display:flex;align-items:center;gap:3px;">
                <div id="${likeId}" style="height:20px">
                  <img loading='lazy' src="/image/heart.svg" style="width:16px;height:16px;">
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
              `}
              <span class="cmenubtn" data-private="${d.isPrivate || false}" data-community-id="${d.communityId || null}" data-id="${commentId}" data-tweet="${tweetId}"
                data-author="${d.uid}">
                <img loading='lazy' src="/image/three-dots.svg">
              </span>
            </div>
            ${d.isHidden ? `
            <div id="commentOwner-${commentId}" class="hidden">
              ${ownerHTML}
            </div>` 
            : `${ownerHTML}`}
          </div>
        </div>
      </div>
    `;
    applyReadMoreLogic(commentHTML);
    if (wrapper && !wrapper.querySelector(`.comment-item[data-id="${commentId}"]`)) {
      wrapper.appendChild(commentHTML);
      const likeEl = commentHTML.querySelector(`#${likeId}`);
      getSnap(path, likeEl);
    }
    commentHTML.querySelectorAll(".reveal-btn").forEach(el => {
      el.addEventListener("click", () => el.classList.add("revealed"));
    });
  }
  if (pinnedDoc) {
    await renderCommentNode(pinnedDoc, true);
  }
  for (const docSnap of snap.docs) {
    if (pinnedDoc && docSnap.id === pinnedDoc.id) continue;
    if (hasSearch) {
      const data = docSnap.data();
      const tokens = data.searchTokens || [];
      const mustHaveAll = true;
      if (mustHaveAll && !words.every(w => tokens.includes(w))) {
        continue;
      }
    }
    await renderCommentNode(docSnap, false);
  }
  commentLoading = false;
}
let activeTweetId = null;

function clearcomment() {
  const commentpreview = document.getElementById('commentPreview');
  commentpreview.innerHTML = '';
  const commentinput = document.getElementById('commentInput');
  commentinput.value = '';
  const commentMediaInput = document.getElementById('commentMediaInput');
  commentMediaInput.value = '';
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
    const tweetId = commentLikeBtn.dataset.tweet;
    const commentId = commentLikeBtn.dataset.id;
    const icon = commentLikeBtn.querySelector("img");
    const countSpan = document.getElementById(`comment-like-count-${commentId}`);
    let commentRef;
    let likeDocRef;
    if (window.communityID) {
      commentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId);
      likeDocRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId, "likes", auth.currentUser.uid);
    } else {
      commentRef = doc(db, "tweets", tweetId, "comments", commentId);
      likeDocRef = doc(db, "tweets", tweetId, "comments", commentId, "likes", auth.currentUser.uid);
    }
    commentLikeBtn.style.pointerEvents = "none";
    try {
      await runTransaction(db, async (transaction) => {
        const likeSnap = await transaction.get(likeDocRef);
        const commentSnap = await transaction.get(commentRef);
        let currentCount = commentSnap.exists() ? (commentSnap.data().likeCount || 0) : 0;
        if (likeSnap.exists()) {
          transaction.delete(likeDocRef);
          transaction.update(commentRef, {
            likeCount: Math.max(currentCount - 1, 0)
          });
          if (icon) icon.src = "/image/heart.svg";
          if (countSpan) countSpan.textContent = currentCount - 1 > 0 ? currentCount - 1 : "";
        } else {
          transaction.set(likeDocRef, {
            likedAt: new Date()
          });
          transaction.update(commentRef, {
            likeCount: currentCount + 1
          });
          if (icon) icon.src = "/image/filled-heart.svg";
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
    const btn = e.target.closest(".like-btn");
    const tweetId = btn.id.replace("likeBtn-", "");
    const communityId = btn.dataset.communityId;
    const user = auth.currentUser;
    if (!user) return log("red", "user isn't logged in");
    let postRef, likeRef;
    if (window.communityID) {
      postRef = doc(db, "communities", window.communityID, "posts", tweetId);
      likeRef = doc(db, "communities", window.communityID, "posts", tweetId, "likes", user.uid);
    } else {
      postRef = doc(db, "tweets", tweetId);
      likeRef = doc(db, "tweets", tweetId, "likes", user.uid);
    }
    btn.style.pointerEvents = "none";
    try {
      await runTransaction(db, async (transaction) => {
        const postSnap = await transaction.get(postRef);
        const likeSnap = await transaction.get(likeRef);
        let newCount = postSnap.exists() ? (postSnap.data().likeCount || 0) : 0;
        if (likeSnap.exists()) {
          transaction.delete(likeRef);
          transaction.update(postRef, {
            likeCount: Math.max(newCount - 1, 0)
          });
          btn.innerHTML = `<img loading='lazy' src="/image/heart.svg">${
            newCount - 1 > 0 ? `<span id="likeCount-${tweetId}">${newCount - 1}</span>` : ""
          }`;
        } else {
          transaction.set(likeRef, {
            likedAt: new Date()
          });
          transaction.update(postRef, {
            likeCount: newCount + 1
          });
          btn.innerHTML = `<img loading='lazy' src="/image/filled-heart.svg"><span id="likeCount-${tweetId}">${newCount + 1}</span>`;
        }
      });
    } catch (err) {
      console.error("Error liking post:", err);
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
    if (isPinned) {
      if (!(await confirmDialog("un-highlight reply?", "you will still be able to re-highlight this reply later."))) return;
    } else {
      if (!(await confirmDialog("highlight reply?", "This will replace the current highlighted reply."))) return;
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
      const pinnedQ = query(commentsRef, where("pinned", "==", true));
      const pinnedSnap = await getDocs(pinnedQ);
      pinnedSnap.docs.forEach(docSnap => {
        if (docSnap.id !== commentId) {
          batch.update(docSnap.ref, {
            pinned: false
          });
        }
      });
      let targetRef;
      if (window.communityID) {
        targetRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId);
      } else {
        targetRef = doc(db, "tweets", tweetId, "comments", commentId);
      }
      const snap = await getDoc(targetRef);
      const data = snap.data();
      batch.update(targetRef, {
        pinned: !isPinned,
        hasBeenPinned: true
      });
      await batch.commit();
      document.getElementById("cMenuOverlay").classList.add("hidden");
      if (!isPinned && !data.hasBeenPinned) {
        const commentSnap = await getDoc(targetRef);
        if (commentSnap.exists()) {
          const commentData = commentSnap.data();
          if (window.communityID) {
            const communityName = await getCommunityNameById(window.communityID);
            await sendCommunityPinNotification(commentData.uid, commentData.text || "", tweetId, commentId, window.communityID, communityName);
          } else {
            await sendPinNotification(commentData.uid, commentData.text || "", tweetId, commentId);
          }
        }
      }
      if (isPinned) {
        log("green", "reply un-highlighted");
      } else {
        log("green", "reply highlighted");
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
    let screenshotBase64 = null;
    if (!isOwner && currentUserRole != "admin") return log("red", "insufficient permission");
    if (!isOwner) {
      const commentEl = document.querySelector(`.comment-item[data-id="${commentId}"]`);
      if (commentEl) {
        try {
          const canvas = await html2canvas(commentEl, {
            backgroundColor: null
          });
          screenshotBase64 = canvas.toDataURL("image/png");
        } catch (err) {
          console.error("Comment screenshot failed:", err);
        }
      }
    }
    let reason = null;
    if (!isOwner && currentUserRole === "admin") {
      loading.classList.remove("show");
      try {
        reason = await askDeleteReason();
        const {
          username: posterName
        } = await getUserData(data.uid);
        const {
          username: offenderName
        } = await getUserData(offenderId);
        const susRef = doc(db, "susList", data.uid);
        const susSnap = await getDoc(susRef);
        const currentWarnings = susSnap.exists() ? susSnap.data().warnings || 0 : 0;
        const embed = {
          title: "Reply Deleted",
          color: 15105570,
          fields: [{
            name: "Text",
            value: data.text || "(no text)"
          }, {
            name: "Poster",
            value: posterName
          }, {
            name: "Offender",
            value: offenderName
          }, {
            name: "Reason",
            value: reason || "No reason given"
          }, {
            name: "user warnings",
            value: `${currentWarnings + 1}`
          }, ],
          timestamp: new Date(),
        };
        if (screenshotBase64) embed.image = {
          url: "attachment://screenshot.png"
        };
        await sendToDiscord(null, {
          embeds: [embed]
        }, screenshotBase64);
        await sendCommentWarningNotification(data.uid, data.text, reason);
        await setDoc(doc(db, "susList", data.uid), {
          warnings: increment(1)
        }, {
          merge: true
        });
      } catch {
        return;
      }
      loading.classList.add("show");
    } else {
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
`
  document.getElementById("retweetOriginal").innerHTML = innerHTML;
  const {
    avatar
  } = await getUserData(auth.currentUser.uid);
  document.getElementById("retweetAvatar").src = avatar || "/image/default-avatar.jpg";
  let communityName = "";
  let inCommunity = false;
  if (window.communityID) {
    communityName = await getCommunityNameById(window.communityID);
    inCommunity = true;
  }

  const postRef = window.communityID ? doc(db, "communities", window.communityID, "posts", selectedRetweet) : doc(db, "tweets", selectedRetweet);
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
            <span style="opacity:0.7;font-size:12px;">
              <span class="usernamee">@system •</span> 
              0s
            </span>
          </div>
          <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
            <p style="margin-bottom:15px !important;color:grey;">Post is not available or you don't have permission to reply</p>
          </div>
        </div>
      </div>
  `
    return;
  }

  const t = docSnap.data();
  let authorUid = t.uid;
  let parsedText = "";

  if (selectedCommentRetweet) {
    const commentSnap = window.communityID ? await getDoc(doc(db, "communities", window.communityID, "posts", selectedRetweet, "comments", selectedCommentRetweet)) : await getDoc(doc(db, "tweets", selectedRetweet, "comments", selectedCommentRetweet));

    if (commentSnap.exists()) {
      const c = commentSnap.data();
      authorUid = c.uid;
      const parsedCommentText = await parseMentionsToLinks(c.text || "", c.mentions || []);
      let username1 = "unknown";
      let avatar1 = "/image/default-avatar.jpg";
      let displayName1 = "Unnamed";
      let commIQ = 0;
      let premium1 = null;
      try {
        const u = await getUserData(c.uid);
        username1 = u.username || "unknown";
        avatar1 = u.avatar || "/image/default-avatar.jpg";
        displayName1 = u.displayName || "Unnamed";
        commIQ = u.IQ || 0;
        premium1 = u.premium;
      } catch (err) {
        console.warn("Couldn't fetch comment author:", err);
      }
      const premiumExpiry = premium1 ? premium1.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;
      let editHTML7 = "";
      if (c.edited) {
        editHTML7 = `
        <span style="margin-left:auto;margin-top:5px;color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(comment.edited)}
        </span>
      `
      }

    let mediaHTML = "";
    const containsSpoiler = /\|\|.+?\|\|/.test(t.text);

    let vidId = null;
    let vidRtId = null;

    if (c.media && c.mediaType === "image") {
      const src = base91ToImageSrc(c.media);
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
    } else if (c.media && c.mediaType === "video") {
      if (containsSpoiler) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment spoiler-media" style="margin-bottom:10px;" onclick="
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
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;margin-bottom:10px;">
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
          ${(c.mentions && c.mentions.includes(auth.currentUser.uid)) ?
            `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
            `<div class=iq style="margin:0">${commIQ}</div>` 
          }
          <strong class="user-link" data-uid="${authorUid}">${escapeHTML(displayName1 || "Unnamed")}</strong>
          ${isPremium ? `<img loading='lazy' src="/image/check.svg" style="margin:0;">` : ""}
          <span style="opacity:0.7;font-size:12px;"><span class="usernamee">@${escapeHTML(username1)} •</span> ${formatDate(c.createdAt)}</span>
        </div>
        <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
          <p style="margin-bottom:15px !important;font-family:natar;margin-top:10px;">${parsedCommentText}</p> 
          ${mediaHTML}
          ${inCommunity ? `<div style="display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0;"><img loading='lazy' src="/image/community-filled.svg" width="16">${escapeHTML(communityName)}</div>` : ""}
          <div style="display:flex;align-items:center"><small style="color:grey;margin-top:5px;">Rewynting a reply</small> 
            ${editHTML7} 
          </div>
        </div>
      </div>
    </div>`;
    }
  } else {
    const { username, avatar, displayName, IQ, premium } = await getUserData(t.uid);
    const premiumExpiry = premium ? premium.toDate() : null;
    const now = new Date();
    const isPremium = premiumExpiry && premiumExpiry > now;

    let titleHTML = "";
    if (t.title) {
      titleHTML = `<h3 style="margin:10px 0;margin-bottom:5px;">${escapeHTML(t.title)}</h3>`;
    }

    parsedText = await parseMentionsToLinks(t.text || "", t.mentions || []);
    let editHTML5 = "";
    if (t.edited) {
      editHTML5 = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(t.edited)}
        </span>
      `
    }

    let mediaHTML = "";
    const containsSpoiler = /\|\|.+?\|\|/.test(t.text);

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
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;">
                Your browser does not support the video tag.
              </video>
            </div>`;
      } else {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        mediaHTML = `
            <div class="attachment">
              <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;margin-bottom:10px;">
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
          ${(t.mentions && t.mentions.includes(auth.currentUser.uid)) ?
            `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
            `<div class=iq style="margin:0">${IQ}</div>`
          }
          <strong class="user-link" data-uid="${authorUid}">${escapeHTML(displayName || "Unnamed")}</strong>
          ${isPremium ? `<img loading='lazy' src="/image/check.svg" style="margin:0;">` : ""}
          <span style="opacity:0.7;font-size:12px;"><span class="usernamee">@${escapeHTML(username)} •</span> ${formatDate(t.createdAt)}</span>
        </div>
        <div style="min-height:50px;border-left:2px solid rgba(255, 255, 255, 0.3);padding-left:29px;margin-left:-31px;">
          ${titleHTML}
          <p style="margin-bottom:15px !important;font-family:natar;margin-top:10px;">${parsedText}</p> 
          ${mediaHTML}
          ${editHTML5}
          ${inCommunity ? `<div style="display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0;"><img loading='lazy' src="/image/community-filled.svg" width="16">${escapeHTML(communityName)}</div>` : ""}
        </div>
      </div>
    </div>`;
  }
  document.getElementById("retweetOriginal").innerHTML = innerHTML;
  applyReadMoreLogic(document.getElementById("retweetOriginal"));
});

const sendRetweet = document.getElementById("sendRetweet");
sendRetweet.onclick = async () => {
  sendRetweet.disabled = true;
  sendRetweet.classList.add('disabled');
  const text = document.getElementById("retweetText").value.trim();
  const title = document.getElementById("retweetTitle").value.trim().slice(0, 100) || null;
  const originalId = selectedRetweet;
  if (text.length < 10) {
    log("red", "Text must be at least 10 characters long")
    sendRetweet.disabled = false;
    sendRetweet.classList.remove('disabled');
    return;
  }
  const fileInput = document.getElementById(`retweetMedia-${originalId}`) || document.getElementById("retweetMedia-TWEETID");
  const files = fileInput ? Array.from(fileInput.files) : [];
  const user = auth.currentUser;
  const uid = user?.uid;
  if (!uid || !originalId) {
    if (!originalId) log("red", "no selected post");
    if (!uid) log("red", "user isn't logged in");
    sendRetweet.disabled = false;
    sendRetweet.classList.remove('disabled');
    return;
  }
  let poll = null;
  if (document.getElementById("includePollRetweet").checked) {
    const options = Array.from(document.querySelectorAll("#pollOptionsRetweet .poll-option")).map(inp => inp.value.trim()).filter(Boolean);
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
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const data = userSnap.data();
    if (data.cooldown?.toDate) {
      const now = new Date();
      const cooldownTime = data.cooldown.toDate();
      if (now < cooldownTime) {
        const diffMs = cooldownTime - now;
        const diffMins = Math.ceil(diffMs / 60000);
        log("red", `Cooldown resets in ${diffMins} minute${diffMins> 1 ? 's' : ''}`);
        sendRetweet.disabled = false;
        sendRetweet.classList.remove('disabled');
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
        return;
      }
      if (videos.length > 1) {
        log("red", "please only insert one video at a time")
        return;
      }
      if (images.length > 4) {
        log("red", "please insert images less than 5");
        return;
      }
      let maxSize = 3.5 * 1024 * 1024;
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        const premiumExpiry = data.premium ? data.premium.toDate() : null;
        const now = new Date();
        const isPremium = premiumExpiry && premiumExpiry > now;
        maxSize = isPremium ? 5.5 * 1024 * 1024 : 3.5 * 1024 * 1024;
      }
      if (videos.length === 1) {
        const file = videos[0];
        if (file.size > maxSize) {
          log("red", `please insert only videos lower than ${(maxSize / (1024*1024)).toFixed(1)} MB`);
          sendRetweet.disabled = false;
          sendRetweet.classList.remove('disabled');
          return;
        }
        const upload = await uploadToSupabase(file, uid);
        media = upload.url;
        mediaType = "video";
        mediaPath = upload.path || "";
      } else if (images.length > 0) {
        for (const img of images) {
          if (img.size > maxSize) {
            log("red", "please insert only images lower than 1MB");
            sendRetweet.disabled = false;
            sendRetweet.classList.remove('disabled');
            return;
          }
        }
        const compressedBase64s = await Promise.all(images.map(f => compressImageTo480(f)));
        let finalFile;
        if (images.length > 1) {
          const collageBase64 = await makeCollage(compressedBase64s);
          const res = await fetch(collageBase64);
          finalFile = await res.blob();
          finalFile = new File([finalFile], "collage.jpg", {
            type: "image/jpeg"
          });
        } else {
          const res = await fetch(compressedBase64s[0]);
          finalFile = await res.blob();
          finalFile = new File([finalFile], "image.jpg", {
            type: "image/jpeg"
          });
        }
        const arrayBuffer = await finalFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const encodedBase91 = base91.encode(bytes);
        media = encodedBase91;
        mediaType = "image";
        mediaPath = "";
      }
    }
    const permission = document.getElementById("replyPermission1").value;
    const mentionsRaw = await extractMentions(text);
    let processedText = text;
    mentionsRaw.sort((a, b) => (b.username?.length || 0) - (a.username?.length || 0));
    const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const {
        username,
        uid
      }
      of mentionsRaw) {
      if (!username || !uid) continue;
      const regex = new RegExp(`@${escapeRegExp(username)}(?=\\s|$)`, "gi");
      processedText = processedText.replace(regex, `@${uid}`);
    }
    const mentions = [...new Set(mentionsRaw.map(m => m.uid).filter(Boolean))];
    const tagMatches = text.match(/#(\w+)/g) || [];
    const tags = [...new Set(tagMatches.map(tag => tag.slice(1).toLowerCase().slice(0, 30)))];
    const isCommentRetweet = !!selectedCommentRetweet;
    let originalId = selectedRetweet;
    let commentId = selectedCommentRetweet;
    const editUntil = new Date(Date.now() + 10 * 60 * 1000);
    let newIQ = null;
    if (window.isOnPrivate === false) {
      newIQ = await scoreIQ(auth.currentUser.uid, text);
    }
    if (window.communityID) {
      bumpCommunityOrder(window.communityID);
    }
    const detectedLanguage = await detectLanguage(processedText);
    let retweetData = {
      text: processedText,
      title,
      media,
      mediaType,
      replyPermission: permission,
      mediaPath,
      poll,
      likeCount: 0,
      language: detectedLanguage,
      editUntil,
      searchTokens: tokenize(text),
      commentCount: 0,
      viewsCount: 0,
      retweetCount: 0,
      createdAt: new Date(),
      uid,
      WS: newIQ,
      ...(mentions.length > 0 && {
        mentions
      })
    };
    let postref, postsnap;
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
    let hasRewyntedBefore = false;
    if (postsnap.data().uid != auth.currentUser.uid) {
      if (isCommentRetweet) {
        if (window.communityID) {
          const q = query(collection(db, "communities", window.communityID, "posts"), where("retweetOfComment.commentId", "==", commentId), where("retweetOfComment.tweetId", "==", originalId), where("uid", "==", auth.currentUser.uid), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            hasRewyntedBefore = true;
          }
        } else {
          const q = query(collection(db, "tweets"), where("retweetOfComment.commentId", "==", commentId), where("retweetOfComment.tweetId", "==", originalId), where("uid", "==", auth.currentUser.uid), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            hasRewyntedBefore = true;
          }
        }
      } else {
        if (window.communityID) {
          const q = query(collection(db, "communities", window.communityID, "posts"), where("retweetOf", "==", originalId), where("uid", "==", auth.currentUser.uid), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            hasRewyntedBefore = true;
          }
        } else {
          const q = query(collection(db, "tweets"), where("retweetOf", "==", originalId), where("uid", "==", auth.currentUser.uid), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            hasRewyntedBefore = true;
          }
        }
      }
    }
    let tweetRef;
    let communityPostRef = null;
    let postedToMain = false;
    if (window.communityID) {
      let communityPayload = {
        ...retweetData,
        communityId: window.communityID
      };
      if (!isCommentRetweet) {
        communityPayload.originalId = originalId;
      }
      communityPostRef = doc(collection(db, "communities", window.communityID, "posts"));
      await setDoc(communityPostRef, communityPayload);
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
        const mainRef = await addDoc(collection(db, "tweets"), mainPayload);
        postedToMain = true;
        await updateDoc(communityPostRef, {
          connectedWynt: mainRef.id
        });
        await updateDoc(mainRef, {
          connectedWynt: communityPostRef.id
        });
        tweetRef = mainRef;
      } else {
        tweetRef = communityPostRef;
      }
      await updateDoc(doc(db, "communities", window.communityID), {
        posts: increment(1)
      });
    } else {
      tweetRef = await addDoc(collection(db, "tweets"), retweetData);
      postedToMain = true;
    }
    let target;
    if (isCommentRetweet) {
      target = window.communityID ? doc(db, "communities", window.communityID, "posts", originalId, "comments", commentId) : doc(db, "tweets", originalId, "comments", commentId);
      await updateDoc(target, {
        retweetCount: increment(1)
      });
    } else {
      target = window.communityID ? doc(db, "communities", window.communityID, "posts", originalId) : doc(db, "tweets", originalId);
      await updateDoc(target, {
        retweetCount: increment(1)
      });
    }
    const dataSnap = await getDoc(target)
    const data1 = dataSnap.data();
    const tweetText = data1.text;
    const notifyId = (window.communityID && !postedToMain) ? communityPostRef.id : tweetRef.id;
    if (hasRewyntedBefore === false) {
      if (isCommentRetweet) {
        if (window.communityID) {
          const communityName = await getCommunityNameById(window.communityID);
          await sendCommunityReplyRetweetNotification(originalId, commentId, text, notifyId, window.communityID, communityName, tweetText);
        } else {
          await sendReplyRetweetNotification(originalId, commentId, text, notifyId, tweetText);
        }
      } else {
        if (window.communityID) {
          const communityName = await getCommunityNameById(window.communityID);
          await sendCommunityRetweetNotification(originalId, text, notifyId, window.communityID, communityName, tweetText);
        } else {
          await sendRetweetNotification(originalId, text, notifyId, tweetText);
        }
      }
    }
    await Promise.all(mentions.map(async uid => {
      const ops = [];
      if (!window.communityID) {
        ops.push(setDoc(doc(db, "users", uid, "mentioned", tweetRef.id), {
          mentionedAt: new Date()
        }));
      }
      if (window.communityID && window.isOnPrivate === false) {
        const communityName = await getCommunityNameById(window.communityID);
        ops.push(sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, tweetText));
      } else if (window.isOnPrivate && window.communityID != null) {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
          const userCommunities = userDoc.data().communities || [];
          if (userCommunities.includes(window.communityID)) {
            const communityName = await getCommunityNameById(window.communityID);
            ops.push(sendCommunityMentionNotification(tweetRef.id, uid, window.communityID, communityName, tweetText));
          } else {
            info("x", "insufficient permission", "user is not notified due to this is a private community and the user doesn't have permission to view it.")
          }
        }
      } else {
        ops.push(sendMentionNotification(tweetRef.id, uid, tweetText, tweetText));
      }
      return Promise.all(ops);
    }));
    if (!window.communityID) {
      await handleTags(text.toLowerCase(), tweetRef.id);
      await setDoc(doc(db, "users", uid, "replies", tweetRef.id), {
        exists: true,
        repliedAt: serverTimestamp()
      });
    }
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const data = snap.data();
    const premiumExpiry = data.premium ? data.premium.toDate() : null;
    const now = new Date();
    const isPremium = premiumExpiry && premiumExpiry > now;
    const cooldownDuration = isPremium ? 1 * 60 * 1000 : 10 * 60 * 1000;
    await updateDoc(userRef, {
      posts: increment(1),
      cooldown: Timestamp.fromDate(new Date(Date.now() + cooldownDuration)),
    });
    document.getElementById("retweetText").value = "";
    document.getElementById("retweetTitle").value = "";
    if (fileInput) fileInput.value = "";
    const preview = document.getElementById(`retweetPreview-${originalId}`) || document.getElementById("retweetPreview-TWEETID");
    if (preview) preview.innerHTML = "";
    document.getElementById("retweetOverlay").classList.add("hidden");
    log("green", "reWynt posted");
  } catch (error) {
      console.error("Retweet failed:", error);
      info("x", "ReWynt failed", error);
  } finally {
    sendRetweet.disabled = false;
    sendRetweet.classList.remove('disabled');
    document.querySelectorAll(".poll-option").forEach(inp => {
      inp.value = "";
    });
    document.getElementById("includePollRetweet").checked = false;
    document.getElementById("pollOptionsRetweet").classList.add("hidden");
    document.getElementById("retweetText").style.height = "auto";
    document.getElementById("shareToFollowers1").checked = false;
    if (window.communityID) {
      openCommunity(window.communityID);
    }
  }
};
async function waitForAuth() {
  if (auth.currentUser) return auth.currentUser;
  return new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      resolve(user);
    });
  });
}
window.addEventListener("DOMContentLoaded", async () => {
  const user = await waitForAuth();
  if (!user) return log("red", "user isn't logged in");
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
    if (cData.private === true) {
      const memberRef = doc(db, "communities", communityId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      const isMember = memberSnap.exists();
      if (!isMember) {
        info("x", "No access", "The community this Wynt belongs to is a private community and you don't have permission to view it.")
        return;
      }
    }
    viewTweet(tweetId, communityId);
    return;
  }
  if (normalMatch) {
    const tweetId = normalMatch[1];
    viewTweet(tweetId);
  }
});
document.body.addEventListener("click", async (e) => {
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
    const comSnap = await getDoc(comRef);
    const cData = comSnap.data();
    const isCreator = cData.creatorId === user.uid;
    const isAdmin = (cData.admin || []).includes(user.uid);
    if (!isCreator && !isAdmin) {
      log("red", "you don't have permission to pin this Wynt")
      loading.classList.remove("show");
      return;
    }
    const pinId = pincom.dataset.id;
    const alreadyPinned = cData.pinned === pinId;
    if (!(await confirmDialog("pin to community?", "This will replace the current Wynt pinned in this community."))) return;
    try {
      await updateDoc(comRef, {
        pinned: alreadyPinned ? "" : pinId
      });
      if (alreadyPinned) {
        log("green", "successfully unpinned Wynt from community");
      } else {
        log("green", "successfully pinned Wynt to community")
      }
    } catch (err) {
      console.error(err);
      log("failed to update pin status")
    }
    loading.classList.remove("show");
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
  }
  const copyUid = e.target.closest(".author-share");
  if (copyUid) {
    const author = copyUid.dataset.author;
    try {
      await navigator.clipboard.writeText(author);
      log("green", "user ID copied");
      document.getElementById("tweetMenuOverlay").classList.add("hidden");
    } catch {
      info("i", "copy this user ID:", author);
      document.getElementById("tweetMenuOverlay").classList.add("hidden");
    }
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
        tweetRef = doc(db, "communities", hascom, "posts", tweetId);
        snap = await getDoc(tweetRef);
      } else {
        tweetRef = doc(db, "tweets", tweetId);
        snap = await getDoc(tweetRef);
      }
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

export { renderTweet, scoreTweet, loadComments, renderPoll }