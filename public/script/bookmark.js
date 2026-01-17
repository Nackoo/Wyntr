import { db, auth, deleteDoc, collection, doc, getDoc, getDocs, orderBy, limit, startAfter, query, onSnapshot, setDoc, increment, updateDoc, addDoc, serverTimestamp } from './firebase.js';
import { renderTweet } from './index.js';
import { formatDate, inputDialog, log, confirmDialog } from "./texts.js";

const loading1 = document.getElementById("loadingOverlay");

const userOverlay = document.getElementById('bookmarkOverlay');
const bookmarkList = document.getElementById("bookmarkList");
const loadMoreBtn = document.getElementById('bookmarkLoadMore');
const folderLoadMore = document.getElementById("folderLoadMore");
const BOOKMARK_PAGE_SIZE = 5;

let lastDoc = null;
let loading = false;
let noMore = false;
let bookmarksLoadedOnce = false;
let folderLastDoc = null;
let folderNoMore = false;
let currentFolderId = null;
let boCurrentTweetId = null;

function setBtnVisible(btn, visible) {
  if (!btn) return;
  btn.style.display = visible ? 'block' : 'none';
}

// LOAD FOLDERS
async function loadBookmarks(initial = false) {
  setBtnVisible(loadMoreBtn, true);
  setBtnVisible(folderLoadMore, false);

  if (!auth.currentUser || loading || noMore) return;

  loading = true;
  if (initial) {
    bookmarkList.innerHTML = `
<div class="skeleton-skibidi">
  <div class="skeleton-card" style="width:100%;margin-right:0;margin-left:0"><div class="skeleton-header"><div class="skeleton-header-lines" style="margin:0;"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div></div></div>
</div>
<div class="skeleton-skibidi">
  <div class="skeleton-card" style="width:100%;margin-right:0;margin-left:0"><div class="skeleton-header"><div class="skeleton-header-lines" style="margin:0;"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div></div></div>
</div>
<div class="skeleton-skibidi">
  <div class="skeleton-card" style="width:100%;margin-right:0;margin-left:0"><div class="skeleton-header"><div class="skeleton-header-lines" style="margin:0;"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div></div></div>
</div>
    `;
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
      bookmarkList.innerHTML = "";
      bookmarkList.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;">
<div style="max-width:400px;text-align:left;margin-top:20px;">
            <h2 style="margin:0;">Save Wynts for later</h2>
            <p style="color:grey;margin:7px 0;">when you bookmark a Wynt, you'll see it here.</p>
          </div>
        </div>`;
    }
    setBtnVisible(loadMoreBtn, false);
    noMore = true;
    loading = false;
    return;
  }

  let hasIndex = false;

  for (const folderDoc of folderSnap.docs) {
    if (folderDoc.id === 'index') hasIndex = true;

    const data = folderDoc.data();
    const count = data.tweetsCount || 0;

    const folderItem = document.createElement('div');
    folderItem.className = 'folder-item';
    folderItem.id = `folder-${folderDoc.id}`;

    const folderRef = doc(db, 'users', auth.currentUser.uid, 'bookmarks', folderDoc.id);
    const folderSnap = await getDoc(folderRef);
    const folderData = folderSnap.exists() ? folderSnap.data() : {};
    const displayName = folderData.name || folderDoc.id;
    folderItem.style.cssText = 'padding:10px;cursor:pointer;border-bottom:1px solid var(--border);';
    folderItem.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><img src="/image/folder.svg">  <div class="user-link">${displayName}</div> ${count > 0 ? `<span style="color:grey;margin-left:auto;">${count} Wynts</span>` : ""}</div><div><span style="color:grey;">last updated ${formatDate(folderData.lastUpdated) || `[missing value]`} ago</span></div>`;
    folderItem.onclick = () => loadFolderTweets(folderDoc.id);
    
    if (!bookmarkList.querySelector(`#folder-${folderDoc.id}`)) {
      if (!bookmarkList.querySelector(".folder-item")) bookmarkList.innerHTML = "";
      bookmarkList.appendChild(folderItem);
    }
  }

  lastDoc = folderSnap.docs[folderSnap.docs.length - 1];

  if (folderSnap.docs.length < BOOKMARK_PAGE_SIZE) {
    setBtnVisible(loadMoreBtn, false);
    noMore = true;
  } else {
    setBtnVisible(loadMoreBtn, true);
  }

  loading = false;
}

const skeleton = `
  <div class="skeleton-card" style="margin-right:0;margin-left:0">
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
  <div class="skeleton-card" style="margin-right:0;margin-left:0">
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
  <div class="skeleton-card" style="margin-right:0;margin-left:0">
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
`

// tweets inside folder
async function loadFolderTweets(folderId, initial = true) {
  if (!auth.currentUser) return;

  const tweetOverlay = document.getElementById('bookmarkTweetOverlay');
  const tweetList = document.getElementById('TweetList');
  const folderName = document.getElementById('folderName');

  if (initial) {
    tweetList.innerHTML = skeleton;
    folderLastDoc = null;
    folderNoMore = false;
    currentFolderId = folderId;
    const folderRef = doc(db, 'users', auth.currentUser.uid, 'bookmarks', folderId);
    const folderSnap = await getDoc(folderRef);
    const folderData = folderSnap.exists() ? folderSnap.data() : {};
    const displayName = folderData.name || folderId;
    folderName.innerHTML = `<h3 style="margin:0;" class="user-link">${displayName}</h3> <h3 style="margin:0;color:grey;">folder</h3>`;
    tweetOverlay.classList.remove('hidden');
  }

  if (folderNoMore) {
    setBtnVisible(folderLoadMore, false);
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
      tweetList.innerHTML = "";
      emptyMsg.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:400px;text-align:left;">
            <h2 style="margin:0;">No Wynts for this folder</h2>
            <p style="color:grey;margin:7px 0;">when you bookmark a Wynt to this folder, you'll see it here.</p>
          </div>
        </div>`;
      tweetList.appendChild(emptyMsg);
    }
    setBtnVisible(folderLoadMore, false);
    folderNoMore = true;
    return;
  }

  for (const docSnap of snap.docs) {
    const tweetId = docSnap.id;
    const tweetRef = doc(db, 'tweets', tweetId);
    const tweetSnap = await getDoc(tweetRef);

    if (tweetSnap.exists()) {
      if (!tweetList.querySelector(".tweet")) {
        tweetList.innerHTML = "";
      }
      await renderTweet(tweetSnap.data(), tweetId, auth.currentUser, 'append', tweetList);
    } else {
      const box = document.createElement('div');
      box.className = 'unavailable';
      box.style.cssText = 'padding: 10px; border-bottom: var(--border);';
      box.innerHTML = `
        <div class="flex" style="margin:0"><p style="margin:0;color:grey;font-style:italic">This Wynt is unavailable</p><button style="margin-left:auto" class="close-btn delete-unavailable"><img src="/image/trash.svg"></button></div><div></div>
      `;
      const deleteBtn = box.querySelector('.delete-unavailable');
      deleteBtn.onclick = async () => {
        const uid = auth.currentUser.uid;
        const ref = doc(db, 'users', uid, 'bookmarks', folderId, 'items', tweetId);
        await deleteDoc(ref);

        const folderRef = doc(db, 'users', uid, 'bookmarks', folderId);
        await updateDoc(folderRef, { 
          tweetsCount: increment(-1),
          lastUpdated: serverTimestamp()
        });

        box.remove();
      };
      tweetList.appendChild(box);
    }
  }

  folderLastDoc = snap.docs[snap.docs.length - 1];
}

document.getElementById('bookmarksvg').addEventListener('click', async () => {
  userOverlay.classList.remove('hidden');
  lastDoc = null;
  noMore = false;
  await loadBookmarks(true);
});

document.getElementById('bookmarkBtn').addEventListener('click', async () => {
  userOverlay.classList.remove('hidden');
  lastDoc = null;
  noMore = false;
  await loadBookmarks(true);
});

loadMoreBtn.addEventListener('click', () => loadBookmarks());

document.getElementById("boLoadMore").addEventListener("click", () => {
  if (!boNoMore && boCurrentTweetId) {
    openBookmarkOverlay(boCurrentTweetId, true, false);
  }
});

let boLastDoc = null;
let boNoMore = false;

// folder list when adding/removing a tweet to a folder
async function openBookmarkOverlay(tweetId, isPremium, initial = true) {
  const overlay = document.getElementById('bookmarkFolderOverlay');
  const folderList = document.getElementById('folderList');
  boCurrentTweetId = tweetId;
  const addBtn = document.getElementById('addFolder');

  setBtnVisible(document.getElementById('boLoadMore'), true);

  if (initial) {
    folderList.innerHTML = '';
    boLastDoc = null;
    boNoMore = false;
  }

  if (isPremium) {
    const foldersRef = collection(db, 'users', auth.currentUser.uid, 'bookmarks');
    let q = query(foldersRef, limit(BOOKMARK_PAGE_SIZE));
    if (boLastDoc) q = query(foldersRef, startAfter(boLastDoc), limit(BOOKMARK_PAGE_SIZE));

    const folderSnap = await getDocs(q);

    for (const f of folderSnap.docs) {
      const data = f.data();
      const name = data.name || f.id;
      const div = document.createElement('div');
      div.className = 'folder-item';

      const ref = doc(db, 'users', auth.currentUser.uid, 'bookmarks', f.id, 'items', tweetId);
      const snap = await getDoc(ref);
      div.style.cssText = 'padding:10px;cursor:pointer;border-bottom:1px solid var(--border);';

      if (snap.exists()) {
        div.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><img src="/image/folder.svg">  <div class="user-link">${name}</div> <span style="color:#00b377;margin-left:auto;">exists here</span></div><div><span style="color:grey;">last updated ${formatDate(data.lastUpdated) || `[missing value]`} ago</span></div>`;
      } else {
        div.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><img src="/image/folder.svg">  <div class="user-link">${name}</div> ${data.tweetsCount > 0 ? `<span style="color:grey;margin-left:auto;">${data.tweetsCount} Wynts</span>` : ""}</div><div><span style="color:grey;">last updated ${formatDate(data.lastUpdated) || `[missing value]`} ago</span></div>`;
      }

      div.onclick = () => selectFolder(f.id, tweetId);
      folderList.appendChild(div);
    }

    if (!folderSnap.empty) {
      boLastDoc = folderSnap.docs[folderSnap.docs.length - 1];
    }

    if (initial) {
      addBtn.onclick = async () => {
        const name = await inputDialog("New folder", "type your new folder name");
        if (!name) return;

        await addDoc(collection(db, "users", auth.currentUser.uid, "bookmarks"), {
          name,
          tweetsCount: 0,
          lastUpdated: serverTimestamp()
        });
        openBookmarkOverlay(tweetId, true, true);
        log("green", `folder ${name} created`);
      };
    }

    if (folderSnap.docs.length < BOOKMARK_PAGE_SIZE) {
      setBtnVisible(document.getElementById('boLoadMore'), false);
      boNoMore = true;
    } else {
      setBtnVisible(document.getElementById('boLoadMore'), true);
      boNoMore = false;
    }

  } else {
    if (addBtn) addBtn.style.display = 'none';
    if (document.getElementById("hh")) document.getElementById("hh").style.display = "inline";

    folderList.innerHTML = '';
    const ref = doc(db, 'users', auth.currentUser.uid, 'bookmarks', 'index', 'items', tweetId);

    const indexFolderRef = doc(db, 'users', auth.currentUser.uid, 'bookmarks', 'index');
    let indexSnap = await getDoc(indexFolderRef);

    if (!indexSnap.exists()) {
      await setDoc(indexFolderRef, { 
        name: 'index', 
        tweetsCount: 0,
        lastUpdated: serverTimestamp()
      });
      indexSnap = await getDoc(indexFolderRef);
    }

    const data = indexSnap.data();
    const snap = await getDoc(ref);

    const div = document.createElement('div');
    div.className = 'folder-item';
    div.innerHTML = snap.exists() ? 
    `<div style="display:flex;align-items:center;gap:10px;"><img src="/image/folder.svg">  <div class="user-link">Index</div> <span style="color:#00b377;margin-left:auto;">exists here</span></div><div><span style="color:grey;">last updated ${formatDate(data.lastUpdated) || `[missing value]`} ago</span></div>` 
    : 
    `<div style="display:flex;align-items:center;gap:10px;"><img src="/image/folder.svg">  <div class="user-link">Index</div> ${data.tweetsCount > 0 ? `<span style="color:grey;margin-left:auto;">${data.tweetsCount} Wynts</span>` : ""}</div><div><span style="color:grey;">last updated ${formatDate(data.lastUpdated) || `[missing value]`} ago</span></div>`;
    div.onclick = () => selectFolder('index', tweetId, false);
    folderList.appendChild(div);

    setBtnVisible(document.getElementById('boLoadMore'), false);
  }
  overlay.classList.remove('hidden');
}

async function selectFolder(folderId, tweetId, isPremium = true) {
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
    await deleteDoc(ref);
    await updateDoc(folderRef, {
      tweetsCount: increment(-1),
      lastUpdated: serverTimestamp()
    });
    log("green", `Removed from ${displayName}`);
  } else {
    await setDoc(ref, {
      bookmarkedAt: new Date()
    });
    await updateDoc(folderRef, {
      tweetsCount: increment(1),
      lastUpdated: serverTimestamp()
    });
    log("green", `Saved to ${displayName}`);
  }

  loading1.classList.remove("show");
}

document.getElementById("changeFolderName").addEventListener("click", async () => {
  if (!currentFolderId) {
    log("red", "No folder selected");
    return;
  }

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

  const newName = await inputDialog("folder Name", "Enter new folder name");
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

  /*
  const itemsSnap = await getDocs(collection(folderRef, "items"));
  for (const item of itemsSnap.docs) {
    await deleteDoc(doc(folderRef, "items", item.id));
  }
  */
  await deleteDoc(folderRef);

  loading1.classList.remove("show");
  log("green", `Folder "${foldername}" deleted.`);

  // await loadBookmarks(true);
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

//loadbookmarks,, loadfolder