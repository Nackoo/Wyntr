import { toDate, escapeHTML, confirmDialog } from "./texts.js";
import { auth, query, collection, getDocs, limit, db, doc, deleteDoc, where, startAfter } from "./firebase.js";
import { base91ToImageSrc } from "./attachments.js";
import { openUserSubProfile } from "./user.js";

const notfound = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No blocked users found</h2><p style="color:grey;margin:7px 0;">when a user is blocked, they won't be able to send you notifications.</p></div></div>`;

const loading = document.getElementById("loadingOverlay");
const list = document.getElementById("blockList");
const openblock = document.getElementById("openBlocks");
const searchInput = document.querySelector("#blockOverlay input");
const scrollBox = document.querySelector("#blockOverlay .user-box");

let lastDoc = null;
let isLoading = false;
let currentTerm = "";
let hasMore = true;

function resetPagination() {
    lastDoc = null;
    hasMore = true;
    isLoading = false;
    currentTerm = "";
}

openblock.addEventListener("click", function () {
    document.getElementById("blockOverlay").classList.remove("hidden");
    resetPagination();
    loadBlocks();
});

searchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const term = searchInput.value.trim().toLowerCase();
    resetPagination();          
    currentTerm = term;         
    loadBlocks(term);   
  }
});

async function loadBlocks(term = currentTerm) {
    if (isLoading || !hasMore) return;

    isLoading = true;
    list.innerHTML = `
        <div class="skeleton-card" style="margin-left:0;margin-right:0;margin-top:15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div>
        <div class="skeleton-card" style="margin-left:0;margin-right:0;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div>
        <div class="skeleton-card" style="margin-left:0;margin-right:0;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div>
    `;

    let q;

    if (term) {
        q = query(
            collection(db, "users", auth.currentUser.uid, "blocks"),
            where("name", ">=", term),
            where("name", "<=", term + "\uf8ff"),
            ...(lastDoc ? [startAfter(lastDoc)] : []),
            limit(10)
        );
    } else {
        q = query(
            collection(db, "users", auth.currentUser.uid, "blocks"),
            ...(lastDoc ? [startAfter(lastDoc)] : []),
            limit(10)
        );
    }
    const snap = await getDocs(q);

    if (snap.docs.length < 10) {
        hasMore = false;
    }

    if (!lastDoc) {
        list.innerHTML = "";
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    if (snap.empty) {
        list.innerHTML = notfound;
        return;
    }

    if (!list.querySelector(".user-search-item")) {
        list.innerHTML = "";
    }

    for (const docSnap of snap.docs) {
        const data = docSnap.data(); 
        const item = document.createElement("div");

        if (data.blockUntil && data.blockUntil.toDate() < new Date()) continue;

        item.className = "user-search-item";
        item.id = `user-${docSnap.id}`;
        item.style.cssText =
        "display:flex;gap:10px;align-items:center";

        item.innerHTML = `
        <div style="display:flex; gap:12px; width:100%;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;" class="uhuh">
            <img loading="lazy" src="${base91ToImageSrc(data.avatar)}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px; height:40px; border-radius:10px; object-fit:cover; align-self:flex-start;">
            <div style="display:flex; flex-direction:column; gap:7px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
                <div style="display:flex;gap:7px;align-items:center;">
                    <strong style="cursor:pointer;" class="user-link" data-uid="${docSnap.id}">${escapeHTML(data.displayName)}</strong>
                    <span style="font-weight:normal;color:grey;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;font-size:13px;">${escapeHTML(data.name)}</span>
                </div>
                <span style="font-size:14px; color:grey;">
                    ${data.permanent ? "permanent" : `blocked until ${toDate(data.blockUntil)}`}
                </span>
            </div>
        </div>
        <button style="padding:10px; border-radius:10px; background:none; cursor:pointer; border:1px solid grey; margin-left:auto; color: grey" data-id="${docSnap.id}">Unblock</button>
        `;
        list.appendChild(item);

        const uhuh = item.querySelector(".uhuh");
        uhuh.addEventListener("click", () => { 
            openUserSubProfile(docSnap.id);
        });

        const unblockBtn = item.querySelector("button");
        unblockBtn.addEventListener("click", async () => {
            if (localStorage.getItem("disableConfirmation") != "true") {
                if (!(await confirmDialog("Unblock user?", "if this user is a spammer, they can potentially flood your entire notification."))) return;
            }
            
            try {
                await deleteDoc(
                    doc(db, "users", auth.currentUser.uid, "blocks", docSnap.id)
                );
                item.remove();
                if (!list.querySelector(".user-search-item")) {
                    list.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No blocked users</h2><p style="color:grey;margin:7px 0;">when a user is blocked, they won't be able to send you notifications.</p></div></div>`;
                }

            } catch (err) {
                console.error("Failed to unblock:", err);
            }
            loading.classList.remove("show");
        });
    }
    isLoading = false;

    if (isLoading == false && !list.querySelector(".user-search-item")) {
        list.innerHTML = notfound;
        return;
    }
}

scrollBox.addEventListener("scroll", () => {
    const distanceFromBottom =
        scrollBox.scrollHeight -
        scrollBox.scrollTop -
        scrollBox.clientHeight;

    if (distanceFromBottom <= 200) {
        const term = searchInput.value.trim().toLowerCase();
        loadBlocks(term);
    }
});