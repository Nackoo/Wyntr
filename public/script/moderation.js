import { getDoc, doc, db, auth } from "./firebase.js";
import { log } from "./texts.js";

const loading = document.getElementById("loadingOverlay");

function askDeleteReason() {
  return new Promise((resolve, reject) => {
    if (loading.classList.contains("show")) {
      loading.classList.remove("show");
    }
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

async function updateCommentUI(tweetData, commentInput, skibidi, commentStatus, parentData) {
  if (parentData != null && parentData.replyPermission) {
    if (parentData.replyPermission != "everyone") {
      tweetData.replyPermission = parentData.replyPermission;
    }
  }

  const permission = tweetData.replyPermission || "everyone";
  const isOwner = tweetData.uid === auth.currentUser.uid;
  const tweetOwnerId = tweetData.uid;
  
  let canComment = true;
  let isMentioned = false;

  if (tweetData.mentions && Array.isArray(tweetData.mentions)) {
    isMentioned = tweetData.mentions.includes(auth.currentUser.uid)
  } 

  if (permission === "following") {
    const followingDoc = await getDoc(
      doc(db, "users", tweetOwnerId, "following", auth.currentUser.uid)
    );
    canComment = followingDoc.exists();
  } else if (permission === "mentioned") {
    canComment = isMentioned;
  } else if (permission === "follower") {
    const followingDoc = await getDoc(
      doc(db, "users", auth.currentUser.uid, "following", tweetOwnerId)
    ); 
    canComment = followingDoc.exists();
  }

  // people mentioned can always reply
  if (isMentioned) {
    canComment = true;
  }

  if (canComment || isOwner) {
    commentInput.classList.remove("hidden");
    skibidi.forEach(el => el.classList.remove("hidden"));
  } else {
    commentInput.classList.add("hidden");
    skibidi.forEach(el => el.classList.add("hidden"));
  }

  if (commentStatus) {
    if (permission === "everyone") {
      commentStatus.innerHTML = "";
    } else if (permission === "following") {
      commentStatus.innerHTML =
        `<img src="/image/exclamation.svg"> the creator has chosen only people they follow can comment`;
    } else if (permission === "mentioned") {
      commentStatus.innerHTML =
        `<img src="/image/exclamation.svg"> the creator has chosen only people they mention can comment`;
    } else if (permission === "follower") {
      commentStatus.innerHTML =
        `<img src="/image/exclamation.svg"> the creator has chosen only people that follow them can comment`;
    }
  }
}

export { askDeleteReason, updateCommentUI }