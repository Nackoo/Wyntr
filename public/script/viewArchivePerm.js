import { escapeHTML, confirmDialog, info } from "./texts.js";
import { auth, query, collection, getDocs, limit, db, doc, deleteDoc, where, startAfter, orderBy, updateDoc, getDoc, arrayRemove, arrayUnion } from "./firebase.js";
import { base91ToImageSrc } from "./attachments.js";
import { openUserSubProfile } from "./user.js";

const notfound = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No users found</h2></div></div>`;

const skeleton = `
    <div class="skeleton-card" style="margin-left:0;margin-right:0;margin-top:15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div>
    <div class="skeleton-card" style="margin-left:0;margin-right:0;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div>
    <div class="skeleton-card" style="margin-left:0;margin-right:0;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div>
`;

const list = document.getElementById("archivePermList");
const searchInput = document.querySelector("#archivePerm input");
const loading = document.getElementById("loadingOverlay");

export async function viewArchivePerm() {
    document.getElementById("archivePerm").classList.remove("hidden");
    searchInput.value = "";
    list.innerHTML = skeleton;

    const ref = window.permission_communityId ?
        doc(db, "communities", window.permission_communityId, "posts", window.permission_tweetId) :
        doc (db, "tweets", window.permission_tweetId);

    const snap = await getDoc(ref);
    const data = snap.data();

    window.permission_ref = ref;

    const switchTrack = document.getElementById("allowAnyoneWithLink");
    switchTrack.checked = data.allowAnyoneWithLink;

    switchTrack.onchange = async () => {
        await updateDoc(ref, {
            allowAnyoneWithLink: switchTrack.checked
        });
    };

    const switchTrack1 = document.getElementById("disableComments");
    switchTrack1.checked = data.disableComments;

    switchTrack1.onchange = async () => {
        await updateDoc(ref, {
            disableComments: switchTrack1.checked
        });
    }
    
    const arr = data.viewPermission;
    if (arr) {
        renderUsers(arr);
    } else {
        list.innerHTML = notfound;
    }
    window.permission_arr = arr || [];
}

async function renderUsers(arr) {
  arr.forEach(async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));

    if (!snap.exists()) return;

    const user = snap.data();

    const item = document.createElement("div");
    item.className = "user-search-item";
    item.id = `user-${snap.id}`;
    item.style.cssText = "display:flex;gap:10px;align-items:center";
    item.innerHTML = renderUser(user, snap.id);

    if (!list.querySelector(".user-search-item")) list.innerHTML = "";
    list.appendChild(item);

    item.addEventListener("click", () => { 
        openUserSubProfile(snap.id);
    });

    item.querySelector(".update-perm").addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (window.permission_arr.includes(snap.id)) {
            if (!(await confirmDialog("remove user access?", "user will no longer be able to view this Wynt while it's staying archived."))) return;
        } else {
            if (!(await confirmDialog("add access to user?", "user will now be able to view this Wynt while it's staying archived"))) return;
        }

        loading.classList.add("show");
        await updatePermission(snap.id, item);
        loading.classList.remove("show");
    });
  });
}

async function updatePermission(id, item) {
    if (window.permission_arr.includes(id)) {
        await updateDoc(window.permission_ref, {
            viewPermission: arrayRemove(id)
        });
        item.querySelector(".update-perm").innerHTML = "+";
        removeArr(id);
    } else {
        if (window.permission_arr.length == 20) return info("x", "limit reached", "you can only add up to 20 users in this list. Remove some or change the permission to allow view to anyone with the link.");
        await updateDoc(window.permission_ref, {
            viewPermission: arrayUnion(id)
        });
        item.querySelector(".update-perm").innerHTML = "–";
        addArr(id);
    }
}

function renderUser(data, id) {
    return `
        <div style="display:flex; gap:12px; width:100%">
            <img loading="lazy" src="${base91ToImageSrc(data.photoURL)}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px; height:40px; border-radius:10px; object-fit:cover; align-self:flex-start;">
            <div style="display:flex; flex-direction:column; gap:7px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
                <strong style="cursor:pointer;" class="user-link" data-uid="${id}">${escapeHTML(data.displayName)}</strong>
                <span style="font-weight:normal;color:grey;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;font-size:13px;">@${escapeHTML(data.username)}</span>
            </div>
            <button class="update-perm">${window.permission_arr.includes(id) ? "–" : "+"}</button>
        </div>`;
}

async function view(term) {
    if (term == "") { 
        list.innerHTML = skeleton;
        renderUsers(window.permission_arr); return; 
    }
    list.innerHTML = skeleton;

    function buildQuery(searchField = null, searchVal = null) { 
        const constraints = [];

        if (searchField && searchVal) {
            constraints.push(
                where(searchField, ">=", searchVal),
                where(searchField, "<=", searchVal + "\uf8ff")
            );
        }
        constraints.push(limit(10));

        return query(collection(db, "users"), ...constraints);
    }

    const uniqueDocs = new Map();
    const lowerTerm = term.toLowerCase();

    const [nameSnap, usernameSnap] = await Promise.all([
        getDocs(buildQuery("name", lowerTerm)),
        getDocs(buildQuery("username", lowerTerm))
    ]);

    nameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
    usernameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));

    const docArray = Array.from(uniqueDocs.values());

    if (!list.querySelector(".user-search-item")) {
        list.innerHTML = "";
    }

    if (docArray.length === 0) {
        list.innerHTML = notfound;
        return;
    }

    for (const docSnap of docArray) {
        const data = docSnap.data(); 

        if (data.blockUntil && data.blockUntil.toDate() < new Date()) continue;

        const item = document.createElement("div");
        item.className = "user-search-item";
        item.id = `user-${docSnap.id}`;
        item.style.cssText = "display:flex;gap:10px;align-items:center";

        item.innerHTML = renderUser(data, docSnap.id);

        item.addEventListener("click", () => { 
            openUserSubProfile(docSnap.id);
        });

        item.querySelector(".update-perm").addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (window.permission_arr.includes(docSnap.id)) {
                if (!(await confirmDialog("remove user access?", "user will no longer be able to view this Wynt while it's staying archived."))) return;
            } else {
                if (!(await confirmDialog("add access to user?", "user will now be able to view this Wynt while it's staying archived"))) return;
            }

            loading.classList.add("show");
            await updatePermission(docSnap.id, item);
            loading.classList.remove("show");
        });

        list.appendChild(item);
    }

    if (!list.querySelector(".user-search-item")) {
        list.innerHTML = notfound;
    }
}

searchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const term = searchInput.value.trim().toLowerCase();  
    view(term);   
  }
});

function addArr(value) {
  if (!window.permission_arr.includes(value)) {
    window.permission_arr.push(value);
  }
}

function removeArr(value) {
  const index = window.permission_arr.indexOf(value);

  if (index !== -1) {
    window.permission_arr.splice(index, 1);
  }
}