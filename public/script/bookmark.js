import { db, auth, deleteDoc, collection, doc, getDoc, getDocs, orderBy, limit, startAfter, query, setDoc, increment, updateDoc, addDoc, serverTimestamp, runTransaction, onSnapshot } from './firebase.js';
import { renderTweet } from './index.js';
import { formatDate, inputDialog, log, confirmDialog } from "./texts.js";
import { TWEETS_SKELETON, BOOKMARKS_SKELETON } from './element.js';

const loading1 = document.getElementById("loadingOverlay");

const userOverlay = document.getElementById('bookmarkOverlay');
const bookmarkList = document.getElementById("bookmarkList");
const folderLoadMore = document.getElementById("folderLoadMore");
const BOOKMARK_PAGE_SIZE = 10;

let lastDoc = null;
let loading = false;
let noMore = false;
let folderLastDoc = null;
let folderNoMore = false;
let currentFolderId = null;
let boCurrentTweetId = null;
let bookmarksLoaded = false;
const renderedFolderIds = new Set();

function createFolderItem(folderDoc) {
  const folderData = folderDoc.data();
  const count = folderData.tweetsCount || 0;
  const displayName = folderData.name || folderDoc.id;

  const folderItem = document.createElement('div');
  folderItem.className = 'folder-item';
  folderItem.id = `folder-${folderDoc.id}`;
  folderItem.style.cssText = 'padding:10px;cursor:pointer;border-bottom:1px solid var(--border);';
  folderItem.innerHTML = `<div style="display:flex;align-items:center;gap:10px;">${folderData.icon === "📁" || !folderData.icon ? `<img src="/image/folder.svg">` : `${folderData.icon}`} <div class="user-link">${displayName}</div> ${count > 0 ? `<span style="color:grey;margin-left:auto;">${count} Wynts</span>` : ""}</div><div><span style="color:grey;">last updated ${formatDate(folderData.lastUpdated) || `[missing value]`} ago</span></div>`;
  folderItem.onclick = () => loadFolderTweets(folderDoc.id);
  return folderItem;
}

function setupFolderSnapshot(uid) {
  const foldersRef = collection(db, 'users', uid, 'bookmarks');
  const q = query(foldersRef, orderBy('lastUpdated', 'desc'), limit(10));

  let isFirst = true;
  onSnapshot(q, (snap) => {
    if (isFirst) {
      isFirst = false;
      return;
    }

    snap.docChanges().forEach((change) => {
      if (change.type === 'removed') {
        renderedFolderIds.delete(change.doc.id);
        document.getElementById(`folder-${change.doc.id}`)?.remove();
        return;
      }

      if (change.type === 'modified') {
        const existing = document.getElementById(`folder-${change.doc.id}`);
        if (!existing) return;
        const updated = createFolderItem(change.doc);
        existing.replaceWith(updated);
        return;
      }

      if (change.type === 'added') {
        if (renderedFolderIds.has(change.doc.id)) return;
        renderedFolderIds.add(change.doc.id);
        if (!bookmarkList.querySelector('.folder-item')) bookmarkList.innerHTML = '';
        bookmarkList.prepend(createFolderItem(change.doc));
      }
    });
  });
}

// LOAD FOLDERS
async function loadBookmarks(initial = false) {

  if (!auth.currentUser || loading || noMore) return;

  loading = true;
  if (initial) {
    bookmarkList.innerHTML = BOOKMARKS_SKELETON;
    lastDoc = null;
    noMore = false;
  }

  const uid = auth.currentUser.uid;
  const foldersRef = collection(db, 'users', uid, 'bookmarks');

  let q = query(foldersRef, limit(BOOKMARK_PAGE_SIZE));
  if (lastDoc) q = query(foldersRef, startAfter(lastDoc), limit(BOOKMARK_PAGE_SIZE));

  const folderSnap = await getDocs(q);

  if (folderSnap.empty) {
    if (!lastDoc) {
      bookmarkList.querySelectorAll(`.skeleton-skibidi`).forEach(el => el.remove()); 
      bookmarkList.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;">
          <div style="max-width:400px;text-align:left;margin-top:20px;">
            <h2 style="margin:0;">Save Wynts for later</h2>
            <p style="color:grey;margin:7px 0;">when you bookmark a Wynt, you'll see it here.</p>
          </div>
        </div>
      `;
    }
    noMore = true;
    loading = false;
    return;
  }

  let hasIndex = false;

  for (const folderDoc of folderSnap.docs) {
    if (folderDoc.id === 'index') hasIndex = true;

    if (!bookmarkList.querySelector(`#folder-${folderDoc.id}`)) {
      bookmarkList.querySelectorAll(`.skeleton-skibidi`).forEach(el => el.remove()); 
      renderedFolderIds.add(folderDoc.id);
      bookmarkList.appendChild(createFolderItem(folderDoc));
    }
  }

  lastDoc = folderSnap.docs[folderSnap.docs.length - 1];

  if (folderSnap.docs.length < BOOKMARK_PAGE_SIZE) {
    noMore = true;
  } else {
  }

  loading = false;
}

let lastFolderId = null;

// tweets inside folder
async function loadFolderTweets(folderId, initial = true) {
  if (!auth.currentUser) return;

  const tweetOverlay = document.getElementById('bookmarkTweetOverlay');
  const tweetList = document.getElementById('TweetList');
  const folderName = document.getElementById('folderName');

  window.CURRENT_BOOKMARK_ID = folderId;

  if (initial && lastFolderId == folderId) {
    tweetOverlay.classList.remove('hidden');
  } else {
    if (initial) {
      tweetList.innerHTML = TWEETS_SKELETON;
      folderLastDoc = null;
      folderNoMore = false;
      currentFolderId = folderId;
      const folderRef = doc(db, 'users', auth.currentUser.uid, 'bookmarks', folderId);
      const folderSnap = await getDoc(folderRef);
      const folderData = folderSnap.exists() ? folderSnap.data() : {};
      const displayName = folderData.name || folderId;
      folderName.innerHTML = `
        <h3 style="margin:0;" class="user-link">${displayName}</h3> 
        <h3 style="margin:0;color:grey;">folder</h3>`;
      tweetOverlay.classList.remove('hidden');
    }
    lastFolderId = folderId;

    if (folderNoMore) {
      return;
    }

    const uid = auth.currentUser.uid;
    const itemsRef = collection(db, 'users', uid, 'bookmarks', folderId, 'items');

    let q = query(itemsRef, orderBy('bookmarkedAt', 'desc'), limit(BOOKMARK_PAGE_SIZE));
    if (folderLastDoc) q = query(itemsRef, orderBy('bookmarkedAt', 'desc'), startAfter(folderLastDoc), limit(BOOKMARK_PAGE_SIZE));

    const snap = await getDocs(q);

    if (snap.empty) {
      if (initial) {
        const emptyMsg = document.createElement('div');
        tweetList.querySelectorAll(`.skeleton-card`).forEach(el => el.remove()); 
        emptyMsg.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:50px;">
            <div style="max-width:400px;text-align:left;">
              <h2 style="margin:0;">No Wynts for this folder</h2>
              <p style="color:grey;margin:7px 0;">when you bookmark a Wynt to this folder, you'll see it here.</p>
            </div>
          </div>`;
        tweetList.appendChild(emptyMsg);
      }
      folderNoMore = true;
      return;
    }

    snap.docs.forEach(async (docSnap) => {
      const tweetId = docSnap.id;
      const data = docSnap.data();

      const tweetRef = data.communityId
        ? doc(db, "communities", data.communityId, "posts", tweetId)
        : doc(db, "tweets", tweetId);

      const tweetSnap = await getDoc(tweetRef);

      if (tweetSnap.exists()) {
        tweetList.querySelectorAll(`.skeleton-card`).forEach(el => el.remove()); 

        if (data.communityId) {
          await renderTweet(tweetSnap.data(), tweetId, auth.currentUser, "append", tweetList, data.communityId, true, data.private);
        } else {
          await renderTweet(tweetSnap.data(), tweetId, auth.currentUser, "append", tweetList, data.communityId, false, data.private);
        }
        return;
      } else {
        tweetList.querySelectorAll(`.skeleton-card`).forEach(el => el.remove()); 

        const box = document.createElement("div");
        box.className = "unavailable";

        box.innerHTML = `
          <div class="flex" id="delete-${folderId}-${tweetId}">
            <p>
              This Wynt is unavailable
            </p>
            <button class="close-btn delete-unavailable">
              <img src="/image/trash.svg">
            </button>
          </div>
        `;

        box.querySelector(".delete-unavailable").onclick = async () => {
          loading1.classList.add("show");

          try {
            const uid = auth.currentUser.uid;
            const ref = doc(db, "users", uid, "bookmarks", folderId, "items", tweetId);
            const folderRef = doc(db, "users", uid, "bookmarks", folderId);

            await runTransaction(db, async (tx) => {
              tx.delete(ref);
              tx.update(folderRef, {
                tweetsCount: increment(-1),
                lastUpdated: serverTimestamp()
              });
            });

            box.remove();
          } finally {
            loading1.classList.remove("show");
          }
        };

        if (!document.querySelector(`#delete-${folderId}-${tweetId}`)) {
          tweetList.appendChild(box);
        }
      }
    });

    folderLastDoc = snap.docs[snap.docs.length - 1];
  }
}

document.getElementById('bookmarksvg').addEventListener('click', async () => {
  userOverlay.classList.remove('hidden');
  if (bookmarksLoaded) return;
  bookmarksLoaded = true;
  lastDoc = null;
  noMore = false;
  await loadBookmarks(true);
  setupFolderSnapshot(auth.currentUser.uid);
});

document.getElementById('bookmarkBtn').addEventListener('click', async () => {
  userOverlay.classList.remove('hidden');
  if (bookmarksLoaded) return;
  bookmarksLoaded = true;
  lastDoc = null;
  noMore = false;
  await loadBookmarks(true);
  setupFolderSnapshot(auth.currentUser.uid);
});

const bookmarkScrollBox =
  document.querySelector("#bookmarkOverlay .user-box");

bookmarkScrollBox.addEventListener("scroll", async () => {
  const nearBottom =
    bookmarkScrollBox.scrollTop +
    bookmarkScrollBox.clientHeight >=
    bookmarkScrollBox.scrollHeight - 150;

  if (!nearBottom) return;

  await loadBookmarks(false);
});

const bookmarkFolderScrollBox =
  document.querySelector("#bookmarkFolderOverlay .user-box");

bookmarkFolderScrollBox.addEventListener("scroll", async () => {
  const nearBottom =
    bookmarkFolderScrollBox.scrollTop +
      bookmarkFolderScrollBox.clientHeight >=
    bookmarkFolderScrollBox.scrollHeight - 150;

  if (!nearBottom) return;
  if (boNoMore || !boCurrentTweetId) return;

  await openBookmarkOverlay(boCurrentTweetId, true, false);
});

let boLastDoc = null;
let boNoMore = false;

// folder list when adding/removing a tweet to a folder
async function openBookmarkOverlay(tweetId, isPremium, initial = true, communityId) {
  const overlay = document.getElementById('bookmarkFolderOverlay');
  const folderList = document.getElementById('folderList');
  boCurrentTweetId = tweetId;
  const addBtn = document.getElementById('addFolder');

  if (initial) {
    folderList.innerHTML = '';
    boLastDoc = null;
    boNoMore = false;
  }

  if (isPremium) {
    const foldersRef = collection(db, 'users', auth.currentUser.uid, 'bookmarks');
    let q = query(foldersRef, limit(BOOKMARK_PAGE_SIZE));
    if (boLastDoc) {
      q = query(foldersRef, startAfter(boLastDoc), limit(BOOKMARK_PAGE_SIZE));
    }

    const folderSnap = await getDocs(q);

    folderSnap.docs.forEach(async (f) => {
      const data = f.data();
      const name = data.name || f.id;

      const div = document.createElement('div');
      div.className = 'folder-item';
      div.id = `folder-${f.id}`;
      div.style.cssText = 'padding:10px;cursor:pointer;border-bottom:1px solid var(--border);';

      div.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          ${data.icon === "📁" || !data.icon
            ? `<img src="/image/folder.svg">`
            : data.icon}
          <div class="user-link">${name}</div>
          <span style="color:grey;margin-left:auto;">Loading...</span>
        </div>
        <div>
          <span style="color:grey;">
            last updated ${formatDate(data.lastUpdated) || '[missing value]'} ago
          </span>
        </div>
      `;

      div.onclick = () => selectFolder(f.id, tweetId, true, communityId);

      if (!document.querySelector(`#bookmarkFolderOverlay #folder-${f.id}`)) folderList.appendChild(div);

      const ref = doc(db, 'users', auth.currentUser.uid, 'bookmarks', f.id, 'items', tweetId);

      const snap = await getDoc(ref);

      if (snap.exists()) {
        div.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;">
            ${data.icon === "📁" || !data.icon
              ? `<img src="/image/folder.svg">`
              : data.icon}
            <div class="user-link">${name}</div>
            <span style="color:#00b377;margin-left:auto;">exists here</span>
          </div>
          <div>
            <span style="color:grey;">
              last updated ${formatDate(data.lastUpdated) || '[missing value]'} ago
            </span>
          </div>
        `;
      } else {
        div.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;">
            ${data.icon === "📁" || !data.icon
              ? `<img src="/image/folder.svg">`
              : data.icon}
            <div class="user-link">${name}</div>
            ${data.tweetsCount > 0
              ? `<span style="color:grey;margin-left:auto;">${data.tweetsCount} Wynts</span>`
              : ''}
          </div>
          <div>
            <span style="color:grey;">
              last updated ${formatDate(data.lastUpdated) || '[missing value]'} ago
            </span>
          </div>
        `;
      }
    });

    if (!folderSnap.empty) {
      boLastDoc = folderSnap.docs[folderSnap.docs.length - 1];
    }

    if (initial) {
      addBtn.onclick = async () => {
        const extra = `<button id="chooseEmoji">📁</button>`;

        const name = await inputDialog("New folder", "type your new folder name", extra);
        if (!name) return;

        await addDoc(collection(db, "users", auth.currentUser.uid, "bookmarks"), {
          name,
          tweetsCount: 0,
          lastUpdated: serverTimestamp(),
          icon: document.getElementById("chooseEmoji").textContent || "📁",
        });
        openBookmarkOverlay(tweetId, true, true);
        log("green", `folder ${name} created`);
      };
    }

    if (folderSnap.docs.length < BOOKMARK_PAGE_SIZE) {
      boNoMore = true;
    } else {
      boNoMore = false;
    }

  } else {
    if (addBtn) addBtn.style.display = 'none';
    if (document.getElementById("hh")) document.getElementById("hh").style.display = "block";

    folderList.innerHTML = '';
    const ref = doc(db, 'users', auth.currentUser.uid, 'bookmarks', 'index', 'items', tweetId);

    const indexFolderRef = doc(db, 'users', auth.currentUser.uid, 'bookmarks', 'index');
    let indexSnap = await getDoc(indexFolderRef);

    if (!indexSnap.exists()) {
      await setDoc(indexFolderRef, { 
        name: 'index', 
        tweetsCount: 0,
        lastUpdated: serverTimestamp(),
        icon: "📁"
      });
      indexSnap = await getDoc(indexFolderRef);
    }

    const data = indexSnap.data();
    const snap = await getDoc(ref);

    const div = document.createElement('div');
    div.className = 'folder-item';
    div.innerHTML = snap.exists() ? 
    `<div style="display:flex;align-items:center;gap:10px;">${data.icon === "📁" || !data.icon ? `<img src="/image/folder.svg">` : `${data.icon}`} <div class="user-link">Index</div> <span style="color:#00b377;margin-left:auto;">exists here</span></div><div><span style="color:grey;">last updated ${formatDate(data.lastUpdated) || `[missing value]`} ago</span></div>` 
    : 
    `<div style="display:flex;align-items:center;gap:10px;">${data.icon === "📁" || !data.icon ? `<img src="/image/folder.svg">` : `${data.icon}`} <div class="user-link">Index</div> ${data.tweetsCount > 0 ? `<span style="color:grey;margin-left:auto;">${data.tweetsCount} Wynts</span>` : ""}</div><div><span style="color:grey;">last updated ${formatDate(data.lastUpdated) || `[missing value]`} ago</span></div>`;
    div.onclick = () => selectFolder('index', tweetId, false, communityId);
    folderList.appendChild(div);
  }
  overlay.classList.remove('hidden');
}

async function selectFolder(folderId, tweetId, isPremium = true, communityId) {

  loading1.classList.add("show");
  const uid = auth.currentUser.uid;
  const targetFolder = isPremium ? folderId : "index";

  const ref = doc(db, "users", uid, "bookmarks", targetFolder, "items", tweetId);
  const folderRef = doc(db, "users", uid, "bookmarks", targetFolder);

  const folderSnap = await getDoc(folderRef);
  const folderData = folderSnap.data();
  const displayName = folderData?.name || targetFolder;

  if (!isPremium && targetFolder === "index") {
    const folderSnap = await getDoc(folderRef);
    if (!folderSnap.exists()) {
      await setDoc(folderRef, {
        tweetsCount: 0,
        lastUpdated: serverTimestamp()
      });
    }
  }

  const snap = await getDoc(ref);
  if (snap.exists()) {
    await runTransaction(db, async (tx) => {
      tx.delete(ref);
      tx.update(folderRef, {
        tweetsCount: increment(-1),
        lastUpdated: serverTimestamp()
      })
    });
    document.querySelector(`#bookmarkTweetOverlay .tweet[data-id="${tweetId}"]`).remove();
    log("green", `Removed from "${displayName}"`);
  } else {
    await runTransaction(db, async (tx) => {
      if (communityId) {
        if (window.isOnPrivate) {
          tx.set(ref, {
            bookmarkedAt: new Date(),
            communityId,
            private: true
          });
        } else {
          tx.set(ref, {
            bookmarkedAt: new Date(),
            communityId
          });
        }
      } else {
        tx.set(ref, {
          bookmarkedAt: new Date(),
        });  
      }
      tx.update(folderRef, {
        tweetsCount: increment(1),
        lastUpdated: serverTimestamp()
      });
    });
    log("green", `Saved to "${displayName}"`);
  }

  loading1.classList.remove("show");
}

document.getElementById("changeFolderName").addEventListener("click", async () => {
  if (!currentFolderId) {
    log("red", "No folder selected");
    return;
  }

  /*
  const userRef = doc(db, "users", auth.currentUser.uid);
  const userSnap = await getDoc(userRef);
  const data = userSnap.data();
  const premiumExpiry = data.premium ? data.premium.toDate() : null;
  const now = new Date();
  const isPremium = premiumExpiry && premiumExpiry > now;

  if (!isPremium) {
    log("red", "Folder actions are only available for premium users");
    return;
  }
  */

  document.getElementById("folderActionOverlay").classList.remove("hidden");
});

document.getElementById("closeFolderAction").addEventListener("click", () => {
  document.getElementById("folderActionOverlay").classList.add("hidden");
});

document.getElementById('editFolder').addEventListener('click', async () => {
  document.getElementById('folderActionOverlay').classList.add('hidden');

  if (!currentFolderId) {
    log("red", "No folder selected");
    return;
  }

  const emojiElement = document.querySelector(`#folder-${currentFolderId} .emoji`);
  const foldername = document.querySelector(`#folder-${currentFolderId} .user-link`);

  let extra = `<button id="chooseEmoji">📁</button>`;
  let inputvalue = null;

  if (emojiElement) {
    extra = `<button id="chooseEmoji">${emojiElement.alt}</button>`
  }

  if (foldername) {
    inputvalue = document.querySelector(`#folder-${currentFolderId} .user-link`).textContent;
  }

  const newName = await inputDialog("folder Name", "Enter new folder name", extra, inputvalue);
  if (!newName) return;
  loading1.classList.add("show");

  const uid = auth.currentUser.uid;
  const folderRef = doc(db, 'users', uid, 'bookmarks', currentFolderId);
  const folderSnap = await getDoc(folderRef);
  if (!folderSnap.exists()) {
    log("red", "Folder does not exist");
    loading1.classList.remove("show");
    return;
  }
  await updateDoc(folderRef, { 
    name: newName,
    icon: document.getElementById("chooseEmoji").textContent || "📁",
    lastUpdated: serverTimestamp()
  });

  loading1.classList.remove("show");
  log("green", `Folder renamed to ${newName}`);
  document.querySelector("#folderName .user-link").textContent = newName;
  document.querySelector(`#bookmarkList #folder-${currentFolderId} .user-link`).textContent = newName;
});

document.getElementById("deleteFolder").addEventListener("click", async () => {
  document.getElementById("folderActionOverlay").classList.add("hidden");
  const foldername = document.querySelector('#folderName .user-link').textContent;

  if (!currentFolderId) {
    log("red", "No folder selected");
    return;
  }

  const confirmed = await confirmDialog("Delete folder?", `Are you sure you want to delete "${foldername}"? This cannot be undone.`, "red");
  if (!confirmed) return;

  loading1.classList.add("show");
  const uid = auth.currentUser.uid;
  const folderRef = doc(db, "users", uid, "bookmarks", currentFolderId);

  await deleteDoc(folderRef);

  loading1.classList.remove("show");
  log("green", `Folder "${foldername}" deleted.`);

  document.getElementById("bookmarkTweetOverlay").classList.add("hidden");
  document.querySelector(`#folder-${currentFolderId}`).remove();
  currentFolderId = null;
});

const folderScrollBox = document.querySelector("#bookmarkTweetOverlay .user-box");

folderScrollBox.addEventListener("scroll", async () => {
  const nearBottom =
    folderScrollBox.scrollTop + folderScrollBox.clientHeight >=
    folderScrollBox.scrollHeight - 150;

  if (!nearBottom) return;
  if (folderNoMore || loading) return;

  loading = true;
  await loadFolderTweets(currentFolderId, false);
  loading = false;
});

export { selectFolder, openBookmarkOverlay }