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
      tweetData.mentioned = parentData.mentioned;
      tweetData.uid = parentData.uid;
    }
  }

  const permission = tweetData.replyPermission || "everyone";
  const isOwner = tweetData.uid === auth.currentUser.uid;
  
  let canComment = permission === "everyone";
  let isMentioned = false;

  const hasValidMentions =
    Array.isArray(tweetData.mentioned) &&
    tweetData.mentioned.some(uid => uid !== tweetData.uid);

  if (hasValidMentions) {
    isMentioned = tweetData.mentioned.includes(auth.currentUser.uid)
    if (permission === "mentioned") {
      isMentioned =
        Array.isArray(tweetData.mentioned) &&
        tweetData.mentioned.includes(auth.currentUser.uid);

      canComment = isMentioned;
    }
  }

  if ((canComment || isOwner || !hasValidMentions)) {
    commentInput.classList.remove("hidden");
    skibidi.forEach(el => el.classList.remove("hidden"));
  } else {
    commentInput.classList.add("hidden");
    skibidi.forEach(el => el.classList.add("hidden"));
  }

  if (commentStatus) {
    if (permission === "everyone") {
      commentStatus.innerHTML = "";
    } else if (permission === "mentioned" && hasValidMentions) {
      commentStatus.innerHTML =
        `<img src="/image/exclamation.svg"> the creator has chosen only mentioned users can reply to this post`;
    }
  }
}

export { askDeleteReason, updateCommentUI }