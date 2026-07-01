import { db, auth, deleteDoc, collection, doc, getDoc, getDocs, orderBy, limit, startAfter, query, setDoc, increment, updateDoc, addDoc, serverTimestamp, runTransaction } from './firebase.js';
import { renderTweet } from './index.js';
import { formatDate, inputDialog, log, confirmDialog } from "./texts.js";
import { base91ToImageSrc, uploadMedia } from './attachments.js';

const loading1 = document.getElementById("loadingOverlay");

const userOverlay = document.getElementById('highlightOverlay');
const folderLoadMore = document.getElementById("folderLoadMore");
const HIGHLIGHT_PAGE_SIZE = 10;

let lastDoc = null;
let loading = false;
let noMore = false;
let folderLastDoc = null;
let folderNoMore = false;
let currentFolderId = null;
let boCurrentTweetId = null;

function setBtnVisible(btn, visible) {
  if (!btn) return;
  btn.style.display = visible ? 'block' : 'none';
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

let lastFolderId = null;

// tweets inside folder
export async function loadFolderTweets(folderId, initial = true, userID) {

  if (userID != auth.currentUser.uid) {
    document.getElementById("hchangeFolderName").classList.add("hidden");
  } else {
    document.getElementById("hchangeFolderName").classList.remove("hidden");
  }

  const tweetOverlay = document.getElementById('highlightTweetOverlay');
  const tweetList = document.getElementById('hTweetList');
  const folderName = document.getElementById('hfolderName');

  if (userID === auth.currentUser.uid) {
    window.CURRENT_HIGHLIGHT_ID = folderId;
  } else {
    window.CURRENT_HIGHLIGHT_ID = null;
  }

  if (initial && lastFolderId == folderId) {
    tweetOverlay.classList.remove('hidden');
  } else {
    if (initial && lastFolderId != folderId) {
      tweetList.innerHTML = skeleton;
      folderLastDoc = null;
      folderNoMore = false;
      currentFolderId = folderId;
      const folderRef = doc(db, 'users', userID, 'highlights', folderId);
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
      setBtnVisible(folderLoadMore, false);
      return;
    }

    const itemsRef = collection(db, 'users', userID, 'highlights', folderId, 'items');

    let q = query(itemsRef, 
      orderBy('highlightedAt', 'desc'), 
      limit(HIGHLIGHT_PAGE_SIZE)
    );

    if (folderLastDoc) q = query(itemsRef, 
      orderBy('highlightedAt', 'desc'),
      startAfter(folderLastDoc), 
      limit(HIGHLIGHT_PAGE_SIZE)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      if (initial) {
        const emptyMsg = document.createElement('div');
        tweetList.querySelectorAll(`.skeleton-card`).forEach(el => el.remove()); 
        emptyMsg.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:50px;">
            <div style="max-width:400px;text-align:left;">
              <h2 style="margin:0;">No Wynts for this folder</h2>
              <p style="color:grey;margin:7px 0;">when you highlight a Wynt to this folder, you'll see it here.</p>
            </div>
          </div>`;
        tweetList.appendChild(emptyMsg);
      }
      setBtnVisible(folderLoadMore, false);
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
            const ref = doc(db, "users", uid, "highlights", folderId, "items", tweetId);
            const folderRef = doc( db, "users", uid, "highlights", folderId);

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

const highlightFolderScrollBox =
  document.querySelector("#highlightFolderOverlay .user-box");

highlightFolderScrollBox.addEventListener("scroll", async () => {
  const nearBottom =
    highlightFolderScrollBox.scrollTop +
    highlightFolderScrollBox.clientHeight >=
    highlightFolderScrollBox.scrollHeight - 150;

  if (!nearBottom) return;
  if (boNoMore || !boCurrentTweetId) return;

  await openHighlightOverlay(boCurrentTweetId, true, false);
});

let boLastDoc = null;
let boNoMore = false;

// folder list when adding/removing a tweet to a folder
async function openHighlightOverlay(tweetId, isPremium, initial = true, communityId) {
  const overlay = document.getElementById('highlightFolderOverlay');
  const folderList = document.getElementById('hfolderList');
  boCurrentTweetId = tweetId;
  const addBtn = document.getElementById('haddFolder');

  setBtnVisible(document.getElementById('hboLoadMore'), true);

  if (initial) {
    folderList.innerHTML = '';
    boLastDoc = null;
    boNoMore = false;
  }

  if (isPremium) {
    const foldersRef = collection(db, 'users', auth.currentUser.uid, 'highlights');
    let q = query(foldersRef, limit(HIGHLIGHT_PAGE_SIZE));
    if (boLastDoc) {
      q = query(foldersRef, startAfter(boLastDoc), limit(HIGHLIGHT_PAGE_SIZE));
    }

    const folderSnap = await getDocs(q);

    folderSnap.docs.forEach(async (f) => {
      const data = f.data();
      const name = data.name || f.id;

      const div = document.createElement('div');
      div.className = 'folder-item';
      div.id = `folder-item-${f.id}`;
      div.style.cssText = 'padding:10px;cursor:pointer;border-bottom:1px solid var(--border);';

      div.innerHTML = `
          <div style="display:flex;align-items:center;gap:15px;">
            <div>
            ${
              data.icon
                ? `<img class="highlight-icon" src="${base91ToImageSrc(data.icon)}" onerror="this.onerror=null;this.src='/image/folder.svg';">`
                : `<img class="highlight-icon" src="/image/folder.svg">`
            }
            </div>
            <div style="align-self:flex-start;display:flex;flex-direction:column;width:100%;">
              <div style="display:flex;align-items:center;width:100%;">
                <div class="user-link">${name}</div>
                <span style="color:grey;margin-left:auto;">loading...</span>
              </div>
              <span style="color:grey;margin-top:5px;">last updated ${formatDate(data.lastUpdated) || '[missing value]'} ago</span>
            </div>
          </div>
      `;

      div.onclick = () => selectFolder(f.id, tweetId, true, communityId);
      if (!document.querySelector(`#hfolderList #folder-item-${f.id}`)) folderList.appendChild(div);

      const ref = doc(db, 'users', auth.currentUser.uid, 'highlights', f.id, 'items', tweetId);

      const snap = await getDoc(ref);

      if (snap.exists()) {
        div.innerHTML = `
          <div style="display:flex;align-items:center;gap:15px;">
            <div>
            ${
              data.icon
                ? `<img class="highlight-icon" src="${base91ToImageSrc(data.icon)}" onerror="this.onerror=null;this.src='/image/folder.svg';">`
                : `<img class="highlight-icon" src="/image/folder.svg">`
            }
            </div>
            <div style="align-self:flex-start;display:flex;flex-direction:column;width:100%;">
              <div style="display:flex;align-items:center;width:100%;">
                <div class="user-link">${name}</div>
                <span style="color:#04aa6d;margin-left:auto;">exists here</span>
              </div>
              <span style="color:grey;margin-top:5px;">last updated ${formatDate(data.lastUpdated) || '[missing value]'} ago</span>
            </div>
          </div>
        `;
      } else {
        div.innerHTML = `
          <div style="display:flex;align-items:center;gap:15px;">
            <div>
            ${
              data.icon
                ? `<img class="highlight-icon" src="${base91ToImageSrc(data.icon)}" onerror="this.onerror=null;this.src='/image/folder.svg';">`
                : `<img class="highlight-icon" src="/image/folder.svg">`
            }
            </div>
            <div style="align-self:flex-start;display:flex;flex-direction:column;width:100%;">
              <div style="display:flex;align-items:center;width:100%;">
                <div class="user-link">${name}</div>
                <span style="color:grey;margin-left:auto;"><b>${data.tweetsCount}</b> Wynts</span>
              </div>
              <span style="color:grey;margin-top:5px;">last updated ${formatDate(data.lastUpdated) || '[missing value]'} ago</span>
            </div>
          </div>
        `;
      }
    });

    if (!folderSnap.empty) {
      boLastDoc = folderSnap.docs[folderSnap.docs.length - 1];
    }

    if (initial) {
      addBtn.onclick = async () => {
        const name = await inputDialog("New folder", "type your new folder name");
        if (!name) return;

        await addDoc(collection(db, "users", auth.currentUser.uid, "highlights"), {
          name,
          tweetsCount: 0,
          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp()
        });
        openHighlightOverlay(tweetId, true, true);
        log("green", `folder "${name}" created`);
      };
    }

    if (folderSnap.docs.length < HIGHLIGHT_PAGE_SIZE) {
      setBtnVisible(document.getElementById('hboLoadMore'), false);
      boNoMore = true;
    } else {
      setBtnVisible(document.getElementById('hboLoadMore'), true);
      boNoMore = false;
    }

  } else {
    if (addBtn) addBtn.style.display = 'none';
    if (document.getElementById("hhh")) document.getElementById("hhh").style.display = "block";

    folderList.innerHTML = '';
    const ref = doc(db, 'users', auth.currentUser.uid, 'highlights', 'index', 'items', tweetId);

    const indexFolderRef = doc(db, 'users', auth.currentUser.uid, 'highlights', 'index');
    let indexSnap = await getDoc(indexFolderRef);

    if (!indexSnap.exists()) {
      await setDoc(indexFolderRef, { 
        name: 'index', 
        tweetsCount: 0,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      indexSnap = await getDoc(indexFolderRef);
    }

    const data = indexSnap.data();
    const snap = await getDoc(ref);

    const div = document.createElement('div');
    div.className = 'folder-item';
    div.innerHTML = snap.exists() ? `
      <div style="display:flex;align-items:center;gap:15px;">
        <div>
          ${
            data.icon
              ? `<img class="highlight-icon" src="${base91ToImageSrc(data.icon)}" onerror="this.onerror=null;this.src='/image/folder.svg';">`
              : `<img class="highlight-icon" src="/image/folder.svg">`
          }
          </div>
          <div style="align-self:flex-start;display:flex;flex-direction:column;width:100%;">
          <div style="display:flex;align-items:center;width:100%;">
            <div class="user-link">Index</div>
            <span style="color:#04aa6d;margin-left:auto;">Exists here</span>
          </div>
          <span style="color:grey;margin-top:5px;">last updated ${formatDate(data.lastUpdated) || '[missing value]'} ago</span>
        </div>
      </div>` 
    : 
    `
      <div style="display:flex;align-items:center;gap:15px;">
        <div>
          ${
            data.icon
              ? `<img class="highlight-icon" src="${base91ToImageSrc(data.icon)}" onerror="this.onerror=null;this.src='/image/folder.svg';">`
              : `<img class="highlight-icon" src="/image/folder.svg">`
          }
          </div>
          <div style="align-self:flex-start;display:flex;flex-direction:column;width:100%;">
          <div style="display:flex;align-items:center;width:100%;">
            <div class="user-link">Index</div>
            <span style="color:grey;margin-left:auto;"><b>${data.tweetsCount}</b> Wynts</span>
          </div>
          <span style="color:grey;margin-top:5px;">last updated ${formatDate(data.lastUpdated) || '[missing value]'} ago</span>
        </div>
      </div>
    `;
    div.onclick = () => selectFolder('index', tweetId, false, communityId);
    folderList.appendChild(div);

    setBtnVisible(document.getElementById('hboLoadMore'), false);
  }
  overlay.classList.remove('hidden');
}

async function selectFolder(folderId, tweetId, isPremium = true, communityId) {

  loading1.classList.add("show");
  const uid = auth.currentUser.uid;
  const targetFolder = isPremium ? folderId : "index";

  const ref = doc(db, "users", uid, "highlights", targetFolder, "items", tweetId);
  const folderRef = doc(db, "users", uid, "highlights", targetFolder);

  const folderSnap = await getDoc(folderRef);
  const folderData = folderSnap.data();
  const displayName = folderData?.name || targetFolder;

  if (!isPremium && targetFolder === "index") {
    const folderSnap = await getDoc(folderRef);
    if (!folderSnap.exists()) {
      await setDoc(folderRef, {
        tweetsCount: 0,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp()
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
    document.querySelector(`#highlightTweetOverlay .tweet[data-id="${tweetId}"]`).remove();
    log("green", `Removed from "${displayName}"`);
  } else {
    await runTransaction(db, async (tx) => {
      if (communityId) {
        if (window.isOnPrivate) {
          tx.set(ref, {
            highlightedAt: new Date(),
            communityId,
            private: true
          });
        } else {
          tx.set(ref, {
            highlightedAt: new Date(),
            communityId
          });
        }
      } else {
        tx.set(ref, {
          highlightedAt: new Date(),
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

document.getElementById("hchangeFolderName").addEventListener("click", async () => {
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

  document.getElementById("hfolderActionOverlay").classList.remove("hidden");
});

document.getElementById("hcloseFolderAction").addEventListener("click", () => {
  document.getElementById("hfolderActionOverlay").classList.add("hidden");
});

document.getElementById("changefoldericon").addEventListener("click", async () => {
  if (!currentFolderId) {
    log("red", "No folder selected");
    return;
  }
  document.getElementById("hfolderActionOverlay").classList.add("hidden");

  const base91 = await uploadMedia({
    allowImage: true,
    allowGif: false
  });
  loading1.classList.add("show");

  await updateDoc(doc(db, "users", auth.currentUser.uid, "highlights", currentFolderId), {
    icon: base91
  });

  log("green", "folder updated");
  loading1.classList.remove("show");
});

document.getElementById('heditFolder').addEventListener('click', async () => {
  document.getElementById('hfolderActionOverlay').classList.add('hidden');

  if (!currentFolderId) {
    log("red", "No folder selected");
    return;
  }

  const foldername = document.querySelector(`#hfolderName .user-link`);
  let inputvalue = null;

  if (foldername) {
    inputvalue = document.querySelector(`#hfolderName .user-link`).textContent;
  }

  const newName = await inputDialog("folder Name", "Enter new folder name", null, inputvalue);
  if (!newName) return;
  loading1.classList.add("show");

  const uid = auth.currentUser.uid;
  const folderRef = doc(db, 'users', uid, 'highlights', currentFolderId);
  const folderSnap = await getDoc(folderRef);
  if (!folderSnap.exists()) {
    log("red", "Folder does not exist");
    loading1.classList.remove("show");
    return;
  }
  await updateDoc(folderRef, { 
    name: newName,
  });

  loading1.classList.remove("show");
  log("green", `Folder renamed to ${newName}`);
  document.querySelector("#hfolderName .user-link").textContent = newName;
  document.querySelector(`#folder-item-#${currentFolderId} .user-link`).textContent = newName;
});

document.getElementById("hdeleteFolder").addEventListener("click", async () => {
  document.getElementById("hfolderActionOverlay").classList.add("hidden");
  const foldername = document.querySelector('#hfolderName .user-link').textContent;

  if (!currentFolderId) {
    log("red", "No folder selected");
    return;
  }

  const confirmed = await confirmDialog("Delete folder?", `Are you sure you want to delete "${foldername}"? This cannot be undone.`, "red");
  if (!confirmed) return;

  loading1.classList.add("show");
  const uid = auth.currentUser.uid;
  const folderRef = doc(db, "users", uid, "highlights", currentFolderId);

  await deleteDoc(folderRef);

  loading1.classList.remove("show");
  log("green", `Folder "${foldername}" deleted.`);

  document.getElementById("highlightTweetOverlay").classList.add("hidden");
  document.querySelector(`#highlight-item-${currentFolderId}`).remove();
  currentFolderId = null;
});

const folderScrollBox = document.querySelector("#highlightTweetOverlay .user-box");

folderScrollBox.addEventListener("scroll", async () => {
  const nearBottom =
    folderScrollBox.scrollTop + folderScrollBox.clientHeight >=
    folderScrollBox.scrollHeight - 150;

  if (!nearBottom) return;
  if (folderNoMore || loading) return;

  loading = true;
  await loadFolderTweets(currentFolderId, false, auth.currentUser.uid);
  loading = false;
});

export { selectFolder, openHighlightOverlay }