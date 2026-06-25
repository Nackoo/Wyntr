import { auth, query, collection, getDocs, limit, db, where, startAfter, orderBy } from "./firebase.js";
import { tokenize } from "./texts.js";
import { renderTweet } from "./index.js";

function getSkeletonHTML() {
    return Array(3).fill(`
      <div class="skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-header-lines"><div class="skeleton-line short"></div></div>
          <div class="skeleton-dot"></div>
        </div>
        <div class="skeleton-body">
          <div class="skeleton-line long"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
        </div>
        <div class="skeleton-footer">
          <div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div>
          <div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div>
        </div>
      </div>`).join('');
}

export function initArchiveViewer({
    openButton,
    overlay,
    listElement,
    scrollBox,
    searchInput,
    getCollectionRef,
    emptyMessage = "No items found"
}) {

    let lastDoc = null;
    let isLoading = false;
    let currentTerm = "";
    let hasMore = true;

    function resetPagination() {
        lastDoc = null;
        hasMore = true;
        isLoading = false;
        listElement.innerHTML = "";
    }

    async function loadArchive(term = currentTerm) {
        if (isLoading || !hasMore) return;
        isLoading = true;

        if (!lastDoc) {
            listElement.innerHTML = getSkeletonHTML();
        }

        try {
            let q;
            const baseCollection = getCollectionRef();
            
            if (term) {
                const words = tokenize(term);
                if (words.length === 0) {
                    isLoading = false;
                    return;
                }
                const searchList = words.slice(0, 10);
                
                q = query(
                    baseCollection,
                    where("archived", "==", true),
                    where("searchTokens", "array-contains-any", searchList),
                    where("uid", "==", auth.currentUser.uid),
                    orderBy("createdAt", "desc"),
                    ...(lastDoc ? [startAfter(lastDoc)] : []),
                    limit(7)
                );
            } else {
                q = query(
                    baseCollection,
                    where("archived", "==", true),
                    where("uid", "==", auth.currentUser.uid),
                    orderBy("createdAt", "desc"),
                    ...(lastDoc ? [startAfter(lastDoc)] : []),
                    limit(7)
                );
            }

            const snap = await getDocs(q);

            if (!lastDoc) {
                listElement.innerHTML = "";
            }

            if (snap.empty && !lastDoc) {
                listElement.innerHTML = `
                    <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
                        <div style="max-width:400px;text-align:left;">
                            <h2 style="margin:0;">${emptyMessage}</h2>
                        </div>
                    </div>`;
                hasMore = false;
                isLoading = false;
                return;
            }

            if (snap.docs.length < 7) {
                hasMore = false;
            }

            lastDoc = snap.docs[snap.docs.length - 1];

            snap.docs.forEach(async (docSnap) => {
                const id = docSnap.id;
                if (listElement.querySelector(`.tweet[data-id="${id}"]`)) return;
                await renderTweet(docSnap.data(), id, auth.currentUser, "append", listElement); 
            });

        } catch (error) {
            console.error("Error loading archive:", error);
        } finally {
            isLoading = false;
        }
    }

    openButton.addEventListener("click", () => {
        overlay.classList.remove("hidden");
        resetPagination();
        currentTerm = "";
        loadArchive();
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            currentTerm = searchInput.value.trim().toLowerCase();
            resetPagination();
            loadArchive();
        }
    });

    scrollBox.addEventListener("scroll", () => {
        const distanceFromBottom = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight;
        if (distanceFromBottom <= 200) {
            console.log("yes");
            loadArchive();
        }
    });
}

initArchiveViewer({
    openButton: document.getElementById("openArchive"),
    overlay: document.getElementById("archiveOverlay"),
    listElement: document.getElementById("archiveList"),
    scrollBox: document.querySelector("#archiveOverlay .user-box"),
    searchInput: document.querySelector("#archiveOverlay input"),
    getCollectionRef: () => collection(db, "tweets"),
    emptyMessage: "No archived Wynts found"
});