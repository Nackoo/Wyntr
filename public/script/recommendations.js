import { db, auth, doc, getDoc, collection, query, getDocs, limit, orderBy, where, Timestamp } from "./firebase.js";
import { loadFollowing, getUserData } from "./index.js";
import { escapeHTML, formatDate } from "./texts.js";
import { base91ToImageSrc } from "./attachments.js";

function getFollowingFromIDB(uid) {
  return new Promise((resolve) => {
    if (window.followingUserCache instanceof Map) {
      return resolve(window.followingUserCache);
    }

    document.addEventListener("following-cache-ready", () => {
      resolve(window.followingUserCache);
    }, { once: true });

    if (!window.followingUserCacheRequested) {
      window.followingUserCacheRequested = true;
      loadFollowing(uid); 
    }
  });
}