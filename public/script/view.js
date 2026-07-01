import { toDate, escapeHTML, confirmDialog, formatDate } from "./texts.js";
import { auth, query, collection, getDocs, limit, db, doc, deleteDoc, where, startAfter, orderBy, updateDoc, setDoc, getDoc, increment } from "./firebase.js";
import { base91ToImageSrc } from "./attachments.js";
import { openUserSubProfile } from "./user.js";

const notfound = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No users found</h2><p style="color:grey;margin:7px 0;">Seems like nobody has ${window.view_mode === "likes" ? "liked" : "interacted with"} this post. Be the first one.</p></div></div>`;

const list = document.getElementById("viewlikesList");
const searchInput = document.querySelector("#viewlikesOverlay input");
const scrollBox = document.querySelector("#viewlikesOverlay .user-box");
const loading = document.getElementById("loadingOverlay");

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

export function viewLikes() {
    document.getElementById("viewlikesOverlay").classList.remove("hidden");
    resetPagination();
    searchInput.value = "";
    view();
}

searchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const term = searchInput.value.trim().toLowerCase();
    resetPagination();          
    currentTerm = term;         
    view(term);   
  }
});

async function view(term = currentTerm) {
    if (isLoading || !hasMore) return;
    isLoading = true;

    list.innerHTML = `
        <div class="skeleton-card" style="margin-left:0;margin-right:0;margin-top:15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div>
        <div class="skeleton-card" style="margin-left:0;margin-right:0;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div>
        <div class="skeleton-card" style="margin-left:0;margin-right:0;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div>
    `;

    const pathArgs = window.view_communityId 
        ? ["communities", window.view_communityId, "posts", window.view_tweetId] 
        : ["tweets", window.view_tweetId];
        
    if (window.view_replyId) {
        pathArgs.push("comments", window.view_replyId);
    }
    window.view_mode == "likes" ?
      pathArgs.push("likes") : pathArgs.push("views");

    const baseCollection = collection(db, ...pathArgs);

    function buildQuery(searchField = null, searchVal = null) {
        const constraints = [
            orderBy("followers", "desc"), 
            where("status", "!=", "private")
        ];  

        if (searchField && searchVal) {
            constraints.push(
                where(searchField, ">=", searchVal),
                where(searchField, "<=", searchVal + "\uf8ff")
            );
        }
        if (lastDoc) constraints.push(startAfter(lastDoc));
        constraints.push(limit(10));

        return query(baseCollection, ...constraints);
    }

    const uniqueDocs = new Map();

    if (term) {
        const lowerTerm = term.toLowerCase();

        const [nameSnap, usernameSnap] = await Promise.all([
            getDocs(buildQuery("name", lowerTerm)),
            getDocs(buildQuery("username", lowerTerm))
        ]);

        nameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
        usernameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
    } else {
        const defaultSnap = await getDocs(buildQuery());
        defaultSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
    }

    const docArray = Array.from(uniqueDocs.values());

    if (docArray.length < 10) {
        hasMore = false;
    }

    if (!lastDoc) list.innerHTML = "";

    if (docArray.length === 0) {
        list.innerHTML = notfound;
        isLoading = false;
        return;
    }

    lastDoc = docArray[docArray.length - 1];

    if (!list.querySelector(".user-search-item")) {
        list.innerHTML = "";
    }

    for (const docSnap of docArray) {
        const data = docSnap.data(); 

        if (data.blockUntil && data.blockUntil.toDate() < new Date()) continue;

        const item = document.createElement("div");
        item.className = "user-search-item";
        item.id = `user-${docSnap.id}`;
        item.style.cssText = "display:flex;gap:10px;align-items:center";

        item.innerHTML = `
        <div style="display:flex; gap:12px; width:100%">
            <img loading="lazy" src="${base91ToImageSrc(data.photoURL)}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px; height:40px; border-radius:10px; object-fit:cover; align-self:flex-start;">
            <div style="display:flex; flex-direction:column; gap:7px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
                <div style="display:flex;gap:7px;align-items:center;">
                    <strong style="cursor:pointer;" class="user-link" data-uid="${docSnap.id}">${escapeHTML(data.displayName)}</strong>
                    <span style="font-weight:normal;color:grey;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;font-size:13px;">@${escapeHTML(data.username)}</span>
                </div>
                <span style="font-size:14px; color:grey;">
                    ${window.view_mode == "likes" ? 
                        `liked ${formatDate(data.likedAt)} ago` :
                        `viewed ${formatDate(data.viewedAt)} ago`}
                </span>
            </div>
            ${docSnap.id == auth.currentUser.uid ? `
            <img class="hide-btn" src="/image/eye.svg" style="margin-left:auto; cursor:pointer;height:22px;">`
            : "" }
        </div>`;

        const hideImg = item.querySelector(".hide-btn");
        if (hideImg) {
            hideImg.addEventListener("click", async (e) => {
                e.stopPropagation(); 
                
                const confirmed = await confirmDialog(
                    "hide this user connection?", 
                    "people browsing this list won't see this entry. This action is irreversible", 
                    "red"
                );
                if (!confirmed) return;

                try {
                    const myLikeDocRef = doc(baseCollection, auth.currentUser.uid);
                    loading.classList.add("show");
                    await updateDoc(myLikeDocRef, {
                        status: "private"
                    });
                    loading.classList.remove("show");

                    item.remove();
                    if (!list.querySelector(".user-search-item")) {
                        list.innerHTML = notfound;
                    }
                } catch (err) {
                    console.error("Failed to update status privacy setting:", err);
                }
            });
        }

        item.addEventListener("click", () => { 
            openUserSubProfile(docSnap.id);
        });
        list.appendChild(item);
    }

    isLoading = false;

    if (!list.querySelector(".user-search-item")) {
        list.innerHTML = notfound;
    }
}

scrollBox.addEventListener("scroll", () => {
    const distanceFromBottom =
        scrollBox.scrollHeight -
        scrollBox.scrollTop -
        scrollBox.clientHeight;

    if (distanceFromBottom <= 200) {
        const term = searchInput.value.trim().toLowerCase();
        view(term);
    }
});

export async function incrementViews(tweetId, replyId, communityId) {
    let postRef, viewRef;

    if (replyId) {
        postRef = communityId ?
            doc(db, "communities", communityId, "posts", tweetId, "comments", replyId) :
            doc(db, "tweets", tweetId, "comments", replyId);
        viewRef = communityId ?
            doc(db, "communities", communityId, "posts", tweetId, "comments", replyId, "views", auth.currentUser.uid) :
            doc(db, "tweets", tweetId, "comments", replyId, "views", auth.currentUser.uid);
    } else {
        postRef = communityId ?
            doc(db, "communities", communityId, "posts", tweetId) :
            doc(db, "tweets", tweetId);
        viewRef = communityId ?
            doc(db, "communities", communityId, "posts", tweetId, "views", auth.currentUser.uid) :
            doc(db, "tweets", tweetId, "views", auth.currentUser.uid)
    }
                
    const [viewSnap, userSnap] = await Promise.all([
        getDoc(viewRef),
        getDoc(doc(db, "users", auth.currentUser.uid))
    ]);
    
    if (!viewSnap.exists() && userSnap.exists()) {
        const d = userSnap.data();
        const status = d.privateView ?
            "private" : "public";

        await setDoc(viewRef, {
            viewedAt: new Date(),
            status,
            displayName: d.displayName,
            photoURL: d.photoURL,
            username: d.username,
            name: d.displayName.toLowerCase(),
            followers: d.followers
        });
        updateDoc(postRef, {
            viewsCount: increment(1)
        });
    }
}

export function initViews(tweetId, communityId, replyId, mode) {
    window.view_tweetId = tweetId;
    window.view_communityId = communityId;
    window.view_replyId = replyId;
    window.view_mode = mode;
    
    viewLikes();
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
}