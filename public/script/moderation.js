import { getDoc, doc, db, auth } from "./firebase.js";
import { log } from "./texts.js";

const loading = document.getElementById("loadingOverlay");

export async function updateCommentUI(tweetData, commentInput, skibidi, commentStatus, parentData) {
  if (parentData != null) {
    if (parentData.replyPermission && parentData.replyPermission != "everyone") {
      tweetData.replyPermission = parentData.replyPermission;
      tweetData.mentioned = parentData.mentioned;
      tweetData.uid = parentData.uid;
    }
    tweetData.disableComments = parentData.disableComments;
    tweetData.archived = parentData.archived;
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

  if (tweetData.disableComments && tweetData.archived && tweetData.uid != auth.currentUser.uid) {
    canComment = false;
  }

  if ((canComment || isOwner || (!hasValidMentions && !(tweetData.archived && tweetData.disableComments)))) {
    commentInput.classList.remove("hidden");
    document.querySelectorAll(".skibidi").forEach(el => el.classList.remove("hidden"));
  } else {
    commentInput.classList.add("hidden");
    document.querySelectorAll(".skibidi").forEach(el => el.classList.add("hidden"));
  }

  if (commentStatus) {
    if (permission === "everyone") {
      commentStatus.innerHTML = "";
    }

    if (permission === "mentioned" && hasValidMentions && (!tweetData.disableComments && !(tweetData.archived && tweetData.disableComments))) {
      commentStatus.innerHTML =
        `<img src="/image/exclamation.svg"> the creator has chosen only mentioned users can reply to this post`;
    }

    if (tweetData.disableComments && tweetData.archived) {
      commentStatus.innerHTML = `<img src="/image/exclamation.svg"> Comment section are turned off while Wynt is being archived`
    }
  }
}

export async function discord(title, color, fields, timestamp, images = [], type = "admin") {
  try {
    const response = await fetch("/.netlify/functions/discord", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        color,
        fields,
        timestamp: timestamp || new Date(),
        images,
        type
      })
    });

    const result = await response.json();
    return result;
  } catch (error) {
    log("red", "failed to send report");
    console.error("Failed to route webhook through Netlify function:", error);
  }
}