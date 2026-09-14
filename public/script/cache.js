import { db, doc, getDoc, getDocs, collection, setDoc, updateDoc, arrayUnion, auth, arrayRemove } from "./firebase.js";
import { randomString } from "./texts.js";

const CACHE_DB_NAME = "wyntrCache";
const CACHE_STORE_NAME = "cache";
const CACHE_DB_VERSION = 1;

function openCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
                db.createObjectStore(CACHE_STORE_NAME);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function cacheSet(key, value) {
    const db = await openCacheDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
        const store = tx.objectStore(CACHE_STORE_NAME);

        store.put(value, key);

        tx.oncomplete = () => {
            db.close();
            resolve();
        };

        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

export async function cacheGet(key) {
    const db = await openCacheDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE_NAME, "readonly");
        const store = tx.objectStore(CACHE_STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
            db.close();
            resolve(request.result);
        };

        request.onerror = () => {
            db.close();
            reject(request.error);
        };
    });
}

export async function initializeUserCache(user, userData) {
    if (!user) return;

    const uid = user.uid;

    const cacheRef = doc(db, "users", uid, "cache", "followings");
    const userRef = doc(db, "users", uid);

    let foll;
    let token = userData?.token;

    const cacheSnap = await getDoc(cacheRef);

    if (!cacheSnap.exists()) {
        const followingSnap = await getDocs(
            collection(db, "users", uid, "following")
        );

        foll = followingSnap.docs.map(doc => doc.id);
        token = randomString(14);

        const a = setDoc(cacheRef, {
            users: foll
        });      
        const b = updateDoc(userRef, {
            token: token
        });
        await Promise.all([a, b]);

        await cacheSet(`followings_${uid}`, foll);
        await cacheSet(`token_${uid}`, token);

        return {
            followings: foll,
            token
        };
    }

    const cachedFoll = await cacheGet(`followings_${uid}`);
    const cachedToken = await cacheGet(`token_${uid}`);

    if (
        !cachedFoll ||
        !cachedToken ||
        cachedToken !== userData?.token
    ) {
        const cacheData = cacheSnap.data();

        foll = cacheData?.users || [];
        token = userData?.token;

        await cacheSet(`followings_${uid}`, foll);
        await cacheSet(`token_${uid}`, token);

        return {
            followings: foll,
            token
        };
    }
    return {
        followings: cachedFoll,
        token: cachedToken
    };
}

async function updateCache({
    uid,
    action,
    targetUid = null,
    token = null
}) {
    const followingKey = `followings_${uid}`;
    const tokenKey = `token_${uid}`;

    let followings = await cacheGet(followingKey) || [];


    if (action === "add" && targetUid) {
        if (!followings.includes(targetUid)) {
            followings.push(targetUid);
        }

        await cacheSet(followingKey, followings);
    }
    if (action === "remove" && targetUid) {
        followings = followings.filter(id => id !== targetUid);

        await cacheSet(followingKey, followings);
    }
    if (action === "token" && token) {
        await cacheSet(tokenKey, token);
    }

    return {
        followings: await cacheGet(followingKey) || [],
        token: await cacheGet(tokenKey)
    };
}

export function upd(type, target) {
    updateCache({
        uid: auth.currentUser.uid,
        action: type,
        targetUid: target
    });
    const token = randomString(14);
    updateCache({
        uid: auth.currentUser.uid,
        action: "token",
        token: token
    });
    updateDoc(doc(db, "users", auth.currentUser.uid), {
        token
    })
    if (type == "add") {
        updateDoc(doc(db, "users", auth.currentUser.uid, "cache", "followings"), {
            users: arrayUnion(target)
        })
    } else {
        updateDoc(doc(db, "users", auth.currentUser.uid, "cache", "followings"), {
            users: arrayRemove(target)
        })
    }
}