import { getDoc, doc, db, auth } from "./firebase.js";
import { log } from "./texts.js";

function askDeleteReason() {
  return new Promise((resolve, reject) => {
    const overlay = document.getElementById("deleteReasonOverlay");
    const input = document.getElementById("deleteReasonInput");
    const cancelBtn = document.getElementById("deleteReasonCancel");
    const submitBtn = document.getElementById("deleteReasonSubmit");

    overlay.classList.remove("hidden");
    input.value = "";

    const cleanup = () => {
      overlay.classList.add("hidden");
      cancelBtn.onclick = null;
      submitBtn.onclick = null;
    };

    cancelBtn.onclick = () => {
      cleanup();
      reject("cancelled");
    };
    submitBtn.onclick = () => {
      const reason = input.value.trim();
      if (!reason) return log("red", "Please provide a reason");
      if (reason.length < 20) return log("red", "add minimum 20 characters");
      cleanup();
      resolve(reason);
    };
  });
}

async function updateCommentUI(tweetData, isOwner, tweetOwnerId) {
  const permission = tweetData.replyPermission || "everyone";
  
  let canComment = true;
  let isMentioned = false;

  const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
  const displayName = userDoc.exists() ? userDoc.data().displayName : null;
  if (displayName) {
    const mentions = tweetData.text.match(/@(\w+)/g) || [];
    isMentioned = mentions.some(m => m.slice(1) === displayName);
  }

  if (permission === "following") {
    const followingDoc = await getDoc(
      doc(db, "users", tweetOwnerId, "following", auth.currentUser.uid)
    );
    canComment = followingDoc.exists();
  } else if (permission === "mentioned") {
    canComment = isMentioned;
  }

  if (isMentioned) {
    canComment = true;
  }

  const inputBox = document.querySelector("#commentInput");
  const skibidi = document.querySelectorAll(".skibidi");

  if (canComment || isOwner) {
    inputBox?.classList.remove("hidden");
    skibidi.forEach(el => el.classList.remove("hidden"));
  } else {
    inputBox?.classList.add("hidden");
    skibidi.forEach(el => el.classList.add("hidden"));
  }

  const commentStatus = document.getElementById("comment-status");
  if (commentStatus) {
    if (permission === "everyone") {
      commentStatus.innerHTML = "";
    } else if (permission === "following") {
      commentStatus.innerHTML =
        `<img src="/image/exclamation.svg"> the creator has chosen only people they follow can comment`;
    } else if (permission === "mentioned") {
      commentStatus.innerHTML =
        `<img src="/image/exclamation.svg"> the creator has chosen only people they mention can comment`;
    }
  }
}

export { askDeleteReason, updateCommentUI }