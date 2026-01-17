import { openDB } from "../lib/script/idb.js";
import { db, collection, query, onSnapshot, getDocs, orderBy, limit } from "./firebase.js";
import { getUserData } from "./index.js";

function startFollowingListener(uid) {
  const ref = collection(db, "users", uid, "following");

  onSnapshot(ref, async (snap) => {
    const newSet = new Set();
    const oldSet = window.currentUserFollowing;

    snap.docs.forEach(d => newSet.add(d.id));

    const added = [...newSet].filter(x => !oldSet.has(x));
    const removed = [...oldSet].filter(x => !newSet.has(x));

    for (const addedUid of added) {
      const profile = await getUserData(addedUid);
      window.followingUserCache.set(addedUid, profile);
    }
    for (const removedUid of removed) {
      window.followingUserCache.delete(removedUid);
    }

    window.currentUserFollowing = newSet;
    saveFollowingToCache(newSet, window.followingUserCache);
  });
}

async function loadFollowingFromCache() {
  const db = await dbPromise;
  const list = await db.get("following", "list");
  
  if (!list) return null;

  const followingSet = new Set(list);
  const profileMap = new Map();

  for (const uid of list) {
    const data = await db.get("profiles", uid);
    if (data) profileMap.set(uid, data);
  }
  return { followingSet, profileMap };
}

async function saveFollowingToCache(followingSet, profileMap) {
  const db = await dbPromise;

  await db.put("following", Array.from(followingSet), "list");

  for (const [uid, data] of profileMap) {
    await db.put("profiles", data, uid);
  }
}

const dbPromise = openDB("followingDB", 1, {
  upgrade(db) {
    db.createObjectStore("following");
    db.createObjectStore("profiles");
  }
});

function getFollowingIdsFromCache() {
  if (window.currentUserFollowing && window.currentUserFollowing.size) {
    return Array.from(window.currentUserFollowing);
  }
  return null;
}

export { loadFollowingFromCache, saveFollowingToCache, startFollowingListener, getFollowingIdsFromCache }
