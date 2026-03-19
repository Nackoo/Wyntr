import { runTransaction, auth, db, doc, getDoc, collection, query, orderBy, onSnapshot,serverTimestamp, setDoc, limit, getDocs, where, updateDoc, writeBatch, deleteDoc, startAfter, arrayUnion, increment, arrayRemove } from "./firebase.js";
import { loadComments, getUserData } from "./index.js";
import { renderTweetViewer } from "./tweetViewer.js";
import { confirmDialog, escapeHTML, log } from "./texts.js";
import { renderCommentViewer } from "./commentViewer.js";
import { openCommunity } from "./community.js";

let notificationLastDoc = null;
let notificationLoading = false;
const NOTIFICATION_PAGE_SIZE = 30;
const loading = document.getElementById("loadingOverlay");
const notificationsContainer = document.getElementById("notifications");

function formatDateHeader(date) {
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (isToday) return "Today";

  const options = {
    day: "numeric",
    month: "short",
    year: "numeric"
  };
  return date.toLocaleDateString(undefined, options);
}

function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function clearNotificationsUI() {
  notificationsContainer.innerHTML = "";
}

function createNotificationElement(notification) {
  const div = document.createElement("div");
  div.className = `notification`;

  let content = "";
  const hasText = notification.tweetText?.trim().length > 0;
  const tweetPreview = hasText ? `"${textClamp(notification.tweetText)}"` : "";

  if (notification.type === "comment") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- message svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M4 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1v2a1 1 0 0 0 1.707.707L9.414 13H15a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4Z" clip-rule="evenodd"/><path fill-rule="evenodd" d="M8.023 17.215c.033-.03.066-.062.098-.094L10.243 15H15a3 3 0 0 0 3-3V8h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1v2a1 1 0 0 1-1.707.707L14.586 18H9a1 1 0 0 1-.977-.785Z" clip-rule="evenodd"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> commented on your Wynt <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
  `;
  } else if (notification.type === "community-comment") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- message svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M4 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1v2a1 1 0 0 0 1.707.707L9.414 13H15a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4Z" clip-rule="evenodd"/><path fill-rule="evenodd" d="M8.023 17.215c.033-.03.066-.062.098-.094L10.243 15H15a3 3 0 0 0 3-3V8h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1v2a1 1 0 0 1-1.707.707L14.586 18H9a1 1 0 0 1-.977-.785Z" clip-rule="evenodd"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> commented on your Wynt in a community: <b>${notification.communityName}</b> in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
  `;
  } else if (notification.type === "reply") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- message svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M4 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1v2a1 1 0 0 0 1.707.707L9.414 13H15a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4Z" clip-rule="evenodd"/><path fill-rule="evenodd" d="M8.023 17.215c.033-.03.066-.062.098-.094L10.243 15H15a3 3 0 0 0 3-3V8h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1v2a1 1 0 0 1-1.707.707L14.586 18H9a1 1 0 0 1-.977-.785Z" clip-rule="evenodd"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> replied to your comment in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>`;
  } else if (notification.type === "community-reply") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- message svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M4 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1v2a1 1 0 0 0 1.707.707L9.414 13H15a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4Z" clip-rule="evenodd"/><path fill-rule="evenodd" d="M8.023 17.215c.033-.03.066-.062.098-.094L10.243 15H15a3 3 0 0 0 3-3V8h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1v2a1 1 0 0 1-1.707.707L14.586 18H9a1 1 0 0 1-.977-.785Z" clip-rule="evenodd"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> replied to your comment in a community: <b>${notification.communityName}</b> in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>`;
}else if (notification.type === "community-pin-notification") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/pinned.svg">
  <div>
    your Wynt was pinned in community <b style="color:#00ba7c">${notification.communityName}</b><br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
`;
  } else if (notification.type === "commentMention") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/notification-filled.svg">
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> mentioned you on a comment in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
`;
  } else if (notification.type === "community-commentMention") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/notification-filled.svg">
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> mentioned you on a comment in community: <b>${notification.communityName}</b> in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
`;
  } else if (notification.type === "reply-mention") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/notification-filled.svg">
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> mentioned you on a reply in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
    <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
    <span style="color:grey;font-size:12px;">
      ${formatTime(notification.createdAt.toDate())}
    </span>
    <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>`;
  } else if (notification.type === "community-reply-mention") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/notification-filled.svg">
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> mentioned you on a reply in a community: <b>${notification.communityName}</b> in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
    <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
    <span style="color:grey;font-size:12px;">
      ${formatTime(notification.createdAt.toDate())}
    </span>
    <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>`;
  } else if (notification.type === "mention") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/notification-filled.svg">
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> mentioned you on their Wynt: <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
      <span style="color:grey;">${escapeHTML(tweetPreview)}</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
  `;
  } else if (notification.type === "community-mention") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/notification-filled.svg">
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> mentioned you in a community: <b>${notification.communityName}</b> on post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
      <span style="color:grey;">${escapeHTML(tweetPreview)}</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
  `;
  } else if (notification.type === "retweet") {
    const replyPart = notification.text?.trim() ? `${escapeHTML(textClamp(notification.text))}` : "";
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- repeat svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 10 3-3m0 0-3-3m3 3H5v3m3 4-3 3m0 0 3 3m-3-3h14v-3"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> rewynted your post in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
      <span style="color:grey;">"${escapeHTML(replyPart)}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>`;
  } else if (notification.type === "community-retweet") {
    const replyPart = notification.text?.trim() ? `${escapeHTML(textClamp(notification.text))}` : "";
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- repeat svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 10 3-3m0 0-3-3m3 3H5v3m3 4-3 3m0 0 3 3m-3-3h14v-3"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> rewynted your post in a community: <b>${notification.communityName}</b> in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b><br>
      <span style="color:grey;">"${escapeHTML(replyPart)}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>`;
  } else if (notification.type === "reply-retweet") {
    const replyPart = notification.text?.trim() ? `${escapeHTML(textClamp(notification.text))}` : "";
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- repeat svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 10 3-3m0 0-3-3m3 3H5v3m3 4-3 3m0 0 3 3m-3-3h14v-3"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> rewynted your reply on post <b>"${escapeHTML(textClamp(notification.commentTextt))}"</b><br>
      <span style="color:grey;">"${escapeHTML(replyPart)}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>`;
  } else if (notification.type === "community-reply-retweet") {
    const replyPart = notification.text?.trim() ? `${escapeHTML(textClamp(notification.text))}` : "";
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- repeat svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 10 3-3m0 0-3-3m3 3H5v3m3 4-3 3m0 0 3 3m-3-3h14v-3"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> rewynted your reply in a community: <b>${notification.communityName}</b> in post <b>"${escapeHTML(textClamp(notification.commentTextt))}"</b><br>
      <span style="color:grey;">"${escapeHTML(replyPart)}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>`;
  } else if (notification.type === "follow") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- user add svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2 9a4 4 0 0 0-4 4v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1a4 4 0 0 0-4-4H7Zm8-1a1 1 0 0 1 1-1h1v-1a1 1 0 1 1 2 0v1h1a1 1 0 1 1 0 2h-1v1a1 1 0 1 1-2 0v-1h-1a1 1 0 0 1-1-1Z" clip-rule="evenodd"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> is now following you<br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
`;
    div.dataset.senderId = notification.senderId;
} else if (notification.type === "invite") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/share.svg">
  <div>
    You were invited to join <span style="color:#00ba7c;font-weight:bold;">${notification.communityName}</span> Community. Click to view.<br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
`;
} else if (notification.type === "pin") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/pinned.svg">
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> highlighted your reply<br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? "" : "display:none;"}">(unread)</span>
  </div>
</div>`;
} else if (notification.type === "community-pin") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/pinned.svg">
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> highlighted your reply in a community post: <b>${notification.communityName}</b><br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? "" : "display:none;"}">(unread)</span>
  </div>
</div>`;
} else if (notification.type === "donation") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- coin svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M10.7367 14.5876c.895.2365 2.8528.754 3.1643-.4966.3179-1.2781-1.5795-1.7039-2.5053-1.9117-.1034-.0232-.1947-.0437-.2694-.0623l-.6025 2.4153c.0611.0152.1328.0341.2129.0553Zm.8452-3.5291c.7468.1993 2.3746.6335 2.6581-.5025.2899-1.16213-1.2929-1.5124-2.066-1.68348-.0869-.01923-.1635-.03619-.2262-.0518l-.5462 2.19058c.0517.0129.1123.0291.1803.0472Z"/><path fill="currentColor" fill-rule="evenodd" d="M9.57909 21.7008c5.35781 1.3356 10.78401-1.9244 12.11971-7.2816 1.3356-5.35745-1.9247-10.78433-7.2822-12.11995C9.06034.963624 3.6344 4.22425 2.2994 9.58206.963461 14.9389 4.22377 20.3652 9.57909 21.7008ZM14.2085 8.0526c1.3853.47719 2.3984 1.1925 2.1997 2.5231-.1441.9741-.6844 1.4456-1.4013 1.6116.9844.5128 1.485 1.2987 1.0078 2.6612-.5915 1.6919-1.9987 1.8347-3.8697 1.4807l-.454 1.8196-1.0972-.2734.4481-1.7953c-.2844-.0706-.575-.1456-.8741-.2269l-.44996 1.8038-1.09594-.2735.45407-1.8234c-.10059-.0258-.20185-.0522-.30385-.0788-.15753-.0411-.3168-.0827-.47803-.1231l-1.42812-.3559.54468-1.2563s.80844.215.7975.1991c.31063.0769.44844-.1256.50282-.2606l.71781-2.8766.11562.0288c-.04375-.0175-.08343-.0288-.11406-.0366l.51188-2.05344c.01375-.23312-.06688-.52719-.51125-.63812.01718-.01157-.79688-.19813-.79688-.19813l.29188-1.17187 1.51313.37781-.0013.00562c.2275.05657.4619.11032.7007.16469l.4497-1.80187 1.0965.27343-.4406 1.76657c.2944.06718.5906.135.8787.20687l.4375-1.755 1.0975.27344-.4493 1.8025Z" clip-rule="evenodd"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> donated <b>${notification.donationReceived}</b> Wcoins in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b>.<br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.commentText))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
  `;
 } else if (notification.type === "community-donation") {
    content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <!-- coin svg -->
  <svg style="min-height:24px;min-width:24px;margin-top:6px;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M10.7367 14.5876c.895.2365 2.8528.754 3.1643-.4966.3179-1.2781-1.5795-1.7039-2.5053-1.9117-.1034-.0232-.1947-.0437-.2694-.0623l-.6025 2.4153c.0611.0152.1328.0341.2129.0553Zm.8452-3.5291c.7468.1993 2.3746.6335 2.6581-.5025.2899-1.16213-1.2929-1.5124-2.066-1.68348-.0869-.01923-.1635-.03619-.2262-.0518l-.5462 2.19058c.0517.0129.1123.0291.1803.0472Z"/><path fill="currentColor" fill-rule="evenodd" d="M9.57909 21.7008c5.35781 1.3356 10.78401-1.9244 12.11971-7.2816 1.3356-5.35745-1.9247-10.78433-7.2822-12.11995C9.06034.963624 3.6344 4.22425 2.2994 9.58206.963461 14.9389 4.22377 20.3652 9.57909 21.7008ZM14.2085 8.0526c1.3853.47719 2.3984 1.1925 2.1997 2.5231-.1441.9741-.6844 1.4456-1.4013 1.6116.9844.5128 1.485 1.2987 1.0078 2.6612-.5915 1.6919-1.9987 1.8347-3.8697 1.4807l-.454 1.8196-1.0972-.2734.4481-1.7953c-.2844-.0706-.575-.1456-.8741-.2269l-.44996 1.8038-1.09594-.2735.45407-1.8234c-.10059-.0258-.20185-.0522-.30385-.0788-.15753-.0411-.3168-.0827-.47803-.1231l-1.42812-.3559.54468-1.2563s.80844.215.7975.1991c.31063.0769.44844-.1256.50282-.2606l.71781-2.8766.11562.0288c-.04375-.0175-.08343-.0288-.11406-.0366l.51188-2.05344c.01375-.23312-.06688-.52719-.51125-.63812.01718-.01157-.79688-.19813-.79688-.19813l.29188-1.17187 1.51313.37781-.0013.00562c.2275.05657.4619.11032.7007.16469l.4497-1.80187 1.0965.27343-.4406 1.76657c.2944.06718.5906.135.8787.20687l.4375-1.755 1.0975.27344-.4493 1.8025Z" clip-rule="evenodd"/></svg>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> donated ${notification.donationReceived} Wcoins through your Wynt in a community: <b>${notification.communityName}</b> in post <b>"${escapeHTML(textClamp(notification.tweetTextt))}"</b>.<br>
      <span style="color:grey;">"${escapeHTML(textClamp(notification.commentText))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
  `;
 } else if (notification.type === "tweet") {
   content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
    <div style="margin-top:6px;">⚠</div>
    <div>
    <span style="color:#db1d23;font-weight:bold;">Your Wynt got deleted for violating Wyntr ToS</span><br>
      <span>text:</span> <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br><span>reason:</span> <span style="color:grey;">"${escapeHTML(textClamp(notification.reason))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
   `
 } else if (notification.type === "community-tweet-delete") {
   content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
    <div style="margin-top:6px;">⚠</div>
    <div>
    <span style="color:#db1d23;font-weight:bold;">Your Wynt got deleted by community admins in "${escapeHTML(notification.name)}"</span><br>
      <span>text:</span> <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br><span>reason:</span> <span style="color:grey;">"${escapeHTML(textClamp(notification.reason))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
   `
 } else if (notification.type === "community-reply-delete") {
   content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
    <div style="margin-top:6px;">⚠</div>
    <div>
    <span style="color:#db1d23;font-weight:bold;">Your reply got deleted by community admins in "${escapeHTML(notification.name)}"</span><br>
      <span>text:</span> <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br><span>reason:</span> <span style="color:grey;">"${escapeHTML(textClamp(notification.reason))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
   `
 } else if (notification.type === "hide-notification") {
   content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
    <div style="margin-top:6px;">⚠</div>
    <div>
    <span style="color:#db1d23;font-weight:bold;">Your reply got hidden by moderators</span><br>
      <span>text:</span> <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br><span>reason:</span> <span style="color:grey;">"${escapeHTML(textClamp(notification.reason))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
   `
 } else if (notification.type === "communityAdminDismissed") {
   content = `<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
  <div style="margin-top:6px;">⚠</div>
  <div>
    <span style="color:#00ba7c;font-weight:bold;">@${notification.name}</span> resigned as admin in community <b>"${notification.communityName}"</b><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>`
 } else if (notification.type === "comment-delete") {
   content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
    <div style="margin-top:6px;">⚠</div>
    <div>
    <span style="color:#db1d23;font-weight:bold;">Your Reply got deleted</span><br>
      <span>text:</span> <span style="color:grey;">"${escapeHTML(textClamp(notification.text))}"</span><br><span>reason:</span> <span style="color:grey;">"${escapeHTML(textClamp(notification.reason))}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
   `
 } else if (notification.type === "community-delete") {
   content = `
<div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
    <div style="margin-top:6px;">⚠</div>
    <div>
    <span style="color:#db1d23;font-weight:bold;">Your Community <span style="color:var(--color)">${escapeHTML(notification.name)}</span> got disbanded</span><br>
      <span>reason:</span> <span style="color:grey;">"${escapeHTML(notification.reason)}"</span><br>
      <span style="color:grey;font-size:12px;">
        ${formatTime(notification.createdAt.toDate())}
      </span>
      <span class="notif-unread" style="margin-left:5px;font-size:12px;color:#00ba7c;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
  </div>
</div>
   `
} else if (notification.type === "communityJoinRequest") {
  content = `
  <div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
    <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/community-filled.svg">
    <div>
      <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> requested to join your community <b>${notification.communityName}</b><br>
      <button class="acceptJoinBtn" style="margin:5px 0;padding:9px 20px;border-radius:6px;margin-right:2px;">Accept</button>
      <button class="rejectJoinBtn" style="margin:5px 0;padding:9px 20px;border-radius:6px;background:crimson;color:white;">Reject</button><br>
      <span style="color:grey;font-size:12px;">${formatTime(notification.createdAt.toDate())}</span>
    </div>
  </div>`;
} else if (notification.type === "communityJoinAccepted") {
  content = `
  <div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
    <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/community-filled.svg">
    <div>
      Your request to join <b style="color:#00ba7c;">${notification.communityName}</b> was accepted<br>
      <span style="color:grey;font-size:12px;">${formatTime(notification.createdAt.toDate())}
    </div>
  </div>`;
 } else if (notification.type === "communityAdmin") {
  content = `
  <div style="display:flex;gap:12px;line-height:1.9;align-items:flex-start !important;">
    <img style="min-height:24px;min-width:24px;margin-top:6px;" src="/image/community-filled.svg">
    <div>
      <span style="color:#00ba7c;font-weight:bold;">@${notification.senderName}</span> made you as an admin in <b>${notification.communityName}</b><br>
      <span style="color:grey;font-size:12px;">${formatTime(notification.createdAt.toDate())}</span>
    </div>
  </div>`;

 } else {
    content = `<span style="color:grey;">You received a notification. But your Wyntr version might doesn't support it.</span>`;
  }

  div.innerHTML = `
<div style="display:flex;margin:0;">
  ${content}
  ${["community-delete", "comment-delete", "community-reply-delete", "community-tweet-delete", "tweet"].includes(notification.type) ? "" : `
    <button class="MenuNotif" data-sender="${notification.SENDERUID}" data-id="${notification.id}" style="display:none;background:none;margin-left:auto;padding-right: 0;">
      <img src="/image/three-dots.svg">
    </button>  
  `}
</div>
  `;

const menu = div.querySelector(".MenuNotif");

div.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (menu) menu.style.display = "block";
});

document.addEventListener("mousedown", (e) => {
  if (!div.contains(e.target)) {
    if (menu) menu.style.display = "none";
  }
});

div.dataset.tweetId = notification.tweetId;
if (notification.commentId) div.dataset.commentId = notification.commentId;
if (notification.communityId) div.dataset.communityId = notification.communityId;
if (notification.replyId) div.dataset.replyId = notification.replyId; 
div.dataset.type = notification.type;

div.addEventListener("click", () => {
  handleNotificationClick(div.dataset);
});

if (menu) {
  div.querySelector(".MenuNotif").addEventListener("click", async (e) => {
    e.stopPropagation();
    const el = e.currentTarget;

    document.getElementById("notifMenuOverlay").classList.remove("hidden");
    document.getElementById("deleteNotif").onclick = async () => {
      const user = auth.currentUser;
      if (!user) return;

      loading.classList.add("show");
      const notifRef = doc(db, "users", user.uid, "notifications", el.dataset.id);
      try {
        await deleteDoc(notifRef);
        div.remove();
      } catch (err) {
        console.error("Failed to delete notification:", err);
      }
      loading.classList.remove("show");
      document.getElementById("notifMenuOverlay").classList.add("hidden");
      log("green", "Notification deleted");
    };

    const senderId = el.dataset.sender;
    if (senderId != "null" && senderId != "undefined") {
      document.getElementById("blockNotif").style.display = "flex";
      document.getElementById("blockNotif").onclick = async () => {
        const blockRef = doc(db, "users", auth.currentUser.uid, "blocks", el.dataset.sender);
  
        document.getElementById("blockOptions").classList.remove("hidden");
        document.getElementById("confirmBlock").onclick = async () => {
          const options = document.getElementById("blockDuration");

          const durations = {
            "1d": 1,
            "1w": 7,
            "1m": 30,
            "6m": 180,
          };

          try {
            document.getElementById("confirmBlock").disabled = true;
            document.getElementById("confirmBlock").classList.add("disabled");

            const { realavatar, realusername } = await getUserData(el.dataset.sender);

            if (options.value === "permanent") {
              await setDoc(blockRef, { 
                permanent: true,
                blockedAt: new Date(),
                avatar: realavatar,
                name: realusername
              });
            } else {
              const days = durations[options.value];
              const expireAt = new Date();
              expireAt.setDate(expireAt.getDate() + days);

              await setDoc(blockRef, { 
                blockUntil: expireAt,
                blockedAt: new Date(),
                avatar: realavatar,
                name: realusername
              });
            }
            log("green", "User muted");
          } catch (err) {
            console.error("Failed to mute user:", err);
            log("red", "Failed to mute user");
          }
          document.getElementById("blockOptions").classList.add("hidden");
          document.getElementById("confirmBlock").disabled = false;
          document.getElementById("confirmBlock").classList.remove("disabled");
        };
      };
    } else {
      document.getElementById("blockNotif").style.display = "none";
    }
  });
}

if (notification.type === "communityJoinRequest") {
  const acceptBtn = div.querySelector(".acceptJoinBtn");
  const rejectBtn = div.querySelector(".rejectJoinBtn");

  div.addEventListener("click", (e) => {
    if (e.target.closest(".acceptJoinBtn") || e.target.closest(".rejectJoinBtn")) return;
    openCommunity(notification.communityId);
  });

  acceptBtn.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (!(await confirmDialog("accept user?", `are you sure you want to accept this user to join "${notification.communityName}"?`))) return;

    const user = auth.currentUser;
    const ownerId = user.uid;

    loading.classList.add("show");
    try {
      const memberRef = doc(db, "communities", notification.communityId, "members", notification.senderId);

      await runTransaction(db, async (tx) => {
        const userRef = doc(db, "users", notification.senderId);
        const creatorRef = doc(db, "users", ownerId);
        const comRef = doc(db, "communities", notification.communityId);

        const userSnap = await tx.get(userRef);
        const comSnap = await tx.get(comRef);

        if (!comSnap.exists()) return log("red", "Community not found");
        if (!userSnap.exists()) return log("red", "User doesn't exist");

        const userData = userSnap.data();
        const comData = comSnap.data();

        if (comData.creatorId !== ownerId) return log("red", "You aren't the community owner");

        tx.update(comRef, {
          membersCount: increment(1),
          members: arrayUnion(notification.senderId)
        });
        tx.set(memberRef, {
          uid: notification.senderId,
          joinedAt: new Date(),
          username: userData.username,
          photoURL: userData.photoURL,
          displayName: userData.displayName,
          role: 1
        });
        tx.update(userRef, {
          communitiesCount: increment(1)
        });
        tx.delete(doc(db, "users", ownerId, "notifications", notification.id));
      });

      await sendAcceptedNotification(
        notification.senderId,
        notification.communityId,
        notification.communityName,
      );

      div.remove();
      log("green", `${notification.senderName} has been accepted to ${notification.communityName}`);
    } catch (err) {
      console.error("Error accepting join request:", err);
      log("red", "Error accepting join request")
    }
    loading.classList.remove("show");
  });

  rejectBtn.addEventListener("click", async (e) => {
    if (!(await confirmDialog("Reject user?", `are you sure you want to reject this user from joining ${notification.communityName}?`, "red"))) return;
    e.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;

    const ownerId = user.uid;
    const comRef = doc(db, "communities", notification.communityId);
    const comSnap = await getDoc(comRef);
    if (!comSnap.exists()) return log("red", "Community not found");

    const comData = comSnap.data();
    if (comData.creatorId !== ownerId) return log("red", "you aren't the community owner");

    try {
      await deleteDoc(doc(db, "users", ownerId, "notifications", notification.id));
      div.remove();
      log("green", `Rejected join request from ${notification.senderName}`);
    } catch (err) {
      console.error("Error rejecting join request:", err);
      log("red", "Something went wrong while rejecting the request");
    }
  });
}

  return div;
}

export async function handleNotificationClick({
  tweetId,
  commentId,
  type,
  senderId,
  communityId,
  replyId,
}) {
  if (type === "follow") {
    if (typeof window.openUserSubProfile === "function") {
      window.openUserSubProfile(senderId);
    }
    return;
  }

  if (type === "tweet" || type === "comment-delete" || type === "community-delete") {
    return;
  }

  if (type === "community-invite" || type === "community-pin-notification" || type === "communityJoinAccepted" || type === "communityAdmin" || type === "communityAdminDismissed" || type === "community-tweet-delete" || type === "community-reply-delete" || type === "invite") {
    if (!communityId) {
      console.warn("Missing communityId in notification data");
      return;
    }
    await openCommunity(communityId);
    return;
  }

  if (type === "community-reply-mention" || type === "community-reply") {
    const overlay = document.getElementById("commentViewer");
    const box = overlay.querySelector("#appendComment");
    const replyList = overlay.querySelector("#replyList");

    overlay.classList.remove("hidden");
    box.innerHTML = ""; 
    replyList.innerHTML = "";

    const commentRef = doc(db, "communities", communityId, "posts", tweetId, "comments", replyId);
    const snap = await getDoc(commentRef);

    if (snap.exists()) {
      const commentData = { id: snap.id, ...snap.data() };
      await renderCommentViewer(commentData, replyId, tweetId, box, communityId);
      await loadComments(tweetId, true, replyId, replyList, communityId);
      document.body.classList.add("no-scroll");
      await openCommunity(communityId);
    } else {
      document.getElementById("appendComment").innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:300px;text-align:left;">
            <h2 style="margin:0;">No reply found</h2>
            <p style="color:grey;margin:7px 0;">seems like this reply has been deleted.</p>
          </div>
        </div>`;
      replyList.innerHTML = "";
    }

    return;  
  }

  if (type === "community-comment" || type === "community-commentMention" || type === "community-donation" || type === "community-pin") {
    const overlay = document.getElementById("commentViewer");
    const box = overlay.querySelector("#appendComment");
    const replyList = overlay.querySelector("#replyList");

    overlay.classList.remove("hidden");
    box.innerHTML = ""; 
    replyList.innerHTML = "";

    const commentRef = doc(db, "communities", communityId, "posts", tweetId, "comments", commentId);
    const snap = await getDoc(commentRef);

    if (snap.exists()) {
      const commentData = { id: snap.id, ...snap.data() };
      await renderCommentViewer(commentData, commentId, tweetId, box, communityId);
      await loadComments(tweetId, true, commentId, replyList, communityId);
      document.body.classList.add("no-scroll");
      await openCommunity(communityId);
    } else {
      document.getElementById("appendComment").innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:300px;text-align:left;">
            <h2 style="margin:0;">No reply found</h2>
            <p style="color:grey;margin:7px 0;">seems like this reply has been deleted.</p>
          </div>
        </div>`;
      replyList.innerHTML = "";
    }

    return;  
  }

  if (type === "reply" || type === "reply-mention") {
    const overlay = document.getElementById("commentViewer");
    const box = overlay.querySelector("#appendComment");
    const replyList = overlay.querySelector("#replyList");

    overlay.classList.remove("hidden");
    box.innerHTML = "";
    replyList.innerHTML = "";

    const commentRef = doc(db, "tweets", tweetId, "comments", replyId);
    const snap = await getDoc(commentRef);

    if (snap.exists()) {
      const commentData = { id: snap.id, ...snap.data() };
      await renderCommentViewer(commentData, replyId, tweetId, box);
      await loadComments(tweetId, true, replyId, replyList);
      document.body.classList.add("no-scroll");
    } else {
      document.getElementById("appendComment").innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:300px;text-align:left;">
            <h2 style="margin:0;">No reply found</h2>
            <p style="color:grey;margin:7px 0;">seems like this reply has been deleted.</p>
          </div>
        </div>`;
      replyList.innerHTML = "";
    }

    return;
  }

  else if (type === "comment" || type === "comment-mention" || type === "pin" || type === "donation") {
    const overlay = document.getElementById("commentViewer");
    const box = overlay.querySelector("#appendComment");
    const replyList = overlay.querySelector("#replyList");

    overlay.classList.remove("hidden");
    box.innerHTML = "";
    replyList.innerHTML = "";

    const commentRef = doc(db, "tweets", tweetId, "comments", commentId);
    const snap = await getDoc(commentRef);

    if (snap.exists()) {
      const commentData = { id: snap.id, ...snap.data() };
      await renderCommentViewer(commentData, commentId, tweetId, box);
      await loadComments(tweetId, true, commentId, replyList);
      document.body.classList.add("no-scroll");
    } else {
      document.getElementById("appendComment").innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:300px;text-align:left;">
            <h2 style="margin:0;">No reply found</h2>
            <p style="color:grey;margin:7px 0;">seems like this reply has been deleted.</p>
          </div>
        </div>`;
      replyList.innerHTML = "";
    }

    return;
  }

  else if (type === "community-mention" || type === "community-retweet" || type === "community-reply-retweet") {
    const tweetViewer = document.getElementById("tweetViewer");
    const box = tweetViewer.querySelector("#appendTweet");
    tweetViewer.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    box.innerHTML = "";

    const tweetSnap = await getDoc(doc(db, "communities", communityId, "posts", tweetId));

    if (!tweetSnap.exists()) {
      box.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:300px;text-align:left;">
          <h2 style="margin:0;">No Wynt found</h2>
          <p style="color:grey;margin:7px 0;">seems like this Wynt has been deleted.</p>
        </div>
      </div>`;
      document.getElementById("commentList").innerHTML = "";
      return;
    }

    await renderTweetViewer(tweetSnap.data(), tweetId, box, auth.currentUser, communityId);
    await loadComments(tweetId, true, null, null, communityId);
    await openCommunity(communityId);
  
  } else if (type === "communityJoinRequest") {
    return;

  } else {
    const tweetViewer = document.getElementById("tweetViewer");
    const box = tweetViewer.querySelector("#appendTweet");
    tweetViewer.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    box.innerHTML = "";

    const tweetSnap = await getDoc(doc(db, "tweets", tweetId));
    if (!tweetSnap.exists()) {
      box.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:300px;text-align:left;">
            <h2 style="margin:0;">No Wynt found</h2>
            <p style="color:grey;margin:7px 0;">seems like this Wynt has been deleted.</p>
          </div>
        </div>`;
      document.getElementById("commentList").innerHTML = "";
      return;
    }

    await renderTweetViewer(tweetSnap.data(), tweetId, box, auth.currentUser);
    await loadComments(tweetId);
  }
}

let lastUnreadCount = 0;

export function listenForUnreadNotifications() {
  const user = auth.currentUser;
  if (!user) return;

  const ref = collection(db, "users", user.uid, "notifications");
  const q = query(ref, where("read", "==", false), limit(30));

  onSnapshot(q, (snap) => {
    const unreadCount = snap.size;
    const hasUnread = unreadCount > 0;
    const unread = document.getElementById('unread');

    if (unread) {
      unread.classList.toggle("has-unread", hasUnread);
    }

    if (unreadCount === 0) {
      document.title = "Wyntr";
    } else {
      document.title = `(${unreadCount > 29 ? "30+" : unreadCount}) Wyntr`;
      unread.textContent = `${unreadCount > 29 ? "30+" : unreadCount}`;
    }
  });
}

export function listenForSystemNotifications() {
  const user = auth.currentUser;
  if (!user || !("Notification" in window) || Notification.permission !== "granted") return;

  const ref = collection(db, "users", user.uid, "notifications");
  const q = query(ref, orderBy("createdAt", "desc"), limit(1));

  onSnapshot(q, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added") {
        const data = change.doc.data();
        if (data.read === false) {
          showSystemNotification(data);
        }
      }
    });
  });
}

navigator.serviceWorker.addEventListener("message", event => {
  if (event.data?.type === "NOTIFICATION_CLICK") {
    handleNotificationClick(event.data.data);
  }
});

function showSystemNotification(data) {
  const title = `@${data.senderName}`;
  const body =
    data.type === "comment"
      ? `commented: "${data.text || ""}"`
      : data.type === "mention"
      ? `mentioned you: "${data.tweetText || ""}"`
      : data.type === "follow"
      ? `started following you`
      : data.type === "retweet"
      ? `rewynted your post`
      : `You have a new notification`;

  const options = {
    body,
    icon: "/image/icon.png",
    tag: data.id,
    data,
  };

  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      const notif = new Notification(title, options);

      notif.onclick = () => {
        window.focus();
        handleNotificationClick(data);
      };
    }
    return;
  }

  if (typeof self !== "undefined" && self.registration) {
    self.registration.showNotification(title, options);
  }
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const interval = 100;
    const maxTries = timeout / interval;
    let tries = 0;

    const timer = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(timer);
        resolve(el);
      } else if (++tries > maxTries) {
        clearInterval(timer);
        reject(new Error(`Element ${selector} not found within timeout.`));
      }
    }, interval);
  });
}

const notificationOverlay = document.getElementById("notificationOverlay");
const notificationScrollBox = notificationOverlay.querySelector(".user-box");

notificationScrollBox.addEventListener("scroll", async () => {
  if (notificationLoading) return;

  const { scrollTop, scrollHeight, clientHeight } = notificationScrollBox;

  if (scrollTop + clientHeight >= scrollHeight - 50) {
    await loadNotifications(false);
  }
});

async function scrollHandler() {
  if (notificationLoading) return;

  const { scrollTop, scrollHeight, clientHeight } = notificationScrollBox;
  if (scrollTop + clientHeight >= scrollHeight - 50) {
    await loadNotifications(false);
  }
}

notificationScrollBox.addEventListener("scroll", scrollHandler);

export async function loadNotifications(initial = false) {
  if (notificationLoading) return;
  notificationLoading = true;

  const user = auth.currentUser;
  if (!user) return;

  const notificationsRef = collection(db, "users", user.uid, "notifications");
  let q = query(
    notificationsRef,
    orderBy("createdAt", "desc"),
    limit(NOTIFICATION_PAGE_SIZE)
  );

  if (!initial && notificationLastDoc) {
    q = query(
      notificationsRef,
      orderBy("createdAt", "desc"),
      startAfter(notificationLastDoc),
      limit(NOTIFICATION_PAGE_SIZE)
    );
  }

  const snap = await getDocs(q);

  if (snap.docs.length < NOTIFICATION_PAGE_SIZE) {
    notificationScrollBox.removeEventListener("scroll", scrollHandler);
  }

  if (snap.empty && initial) {
    notificationsContainer.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No activities — yet</h2><p style="color:grey;margin:7px 0;">seems like you're new here.</p></div></div>`;
    notificationLoading = false;
    return;
  }

  if (!snap.empty) {
    notificationLastDoc = snap.docs[snap.docs.length - 1];

    let currentDate = "";
    for (const docSnap of snap.docs) {
      const data = {
        id: docSnap.id,
        ...docSnap.data()
      };
      if (!data.createdAt) continue;

      const date = data.createdAt.toDate();
      const formattedDate = formatDateHeader(date);

      if (formattedDate !== currentDate) {
        currentDate = formattedDate;
        notificationsContainer.appendChild(
          createDateDivider(formattedDate)
        );
      }

      notificationsContainer.appendChild(createNotificationElement(data));
    }
  }

  notificationLoading = false;
}

function createDateDivider(dateText) {
  const wrapper = document.createElement("div");
  wrapper.className = "date-divider";
  wrapper.textContent = dateText;
  return wrapper;
}

const notifications = document.getElementById("notifications");

document.getElementById('notifsvg1').addEventListener("click", async () => {
  document.getElementById("notificationOverlay").classList.remove("hidden");
  notificationsContainer.innerHTML = "";
  notificationLastDoc = null;
  await loadNotifications(true);

  notifications.classList.remove("hidden");

  const user = auth.currentUser;
  if (user) {
    const notificationsRef = collection(db, "users", user.uid, "notifications");
    const unreadQuery = query(notificationsRef, where("read", "==", false));
    const snap = await getDocs(unreadQuery);

    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => batch.update(docSnap.ref, {
      read: true
    }));
    await batch.commit();
  }
  document.title = "Wyntr";
});

function textClamp(text, maxLength = 30) {
  if (!text || typeof text !== "string") return "…";
  return text.length > maxLength ? text.slice(0, maxLength) + "…" : text;
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

export async function sendCommunityCommentNotification(tweetId, commentText, communityId, commentId, communityName, tweetText, authorId) {
  const sender = auth.currentUser;
  if (!sender) return;

  if (authorId === sender.uid) return;
  const { username : senderName } = await getUserData(sender.uid);

  const notificationRef = doc(db, "users", authorId, "notifications", `comment-${tweetId}-${commentId}-${communityId}`);

  await setDoc(notificationRef, {
    type: "community-comment",
    senderName,
    text: textClamp(commentText),
    createdAt: serverTimestamp(),
    tweetId,
    read: false,
    communityId,
    commentId,
    communityName,
    tweetTextt: tweetText,
    SENDERUID: sender.uid
  });
}

export async function sendCommentNotification(tweetId, commentText, commentId, tweetText, authorId) {
  const sender = auth.currentUser;
  if (!sender) return;
  if (authorId === sender.uid) return;

  const { username : senderName } = await getUserData(sender.uid);

  const notificationRef = doc(db, "users", authorId, "notifications", `comment-${tweetId}-${commentId}`);

  await setDoc(notificationRef, {
    type: "comment",
    senderName,
    text: textClamp(commentText),
    createdAt: serverTimestamp(),
    tweetId,
    read: false,
    commentId,
    tweetTextt: tweetText,
    SENDERUID: sender.uid
  });
}

export async function sendCommunityMentionNotification(tweetId, mentionedUserId, communityId, communityName, tweetText) {
  const sender = auth.currentUser;
  if (!sender || sender.uid === mentionedUserId) return;

  const { username : senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notificationRef = doc(db, "users", mentionedUserId, "notifications", `mention-${tweetId}-${communityId}`);

  await setDoc(notificationRef, {
    type: "community-mention",
    senderName,
    createdAt: serverTimestamp(),
    tweetId,
    tweetText: tweetText,
    read: false,
    communityId,
    communityName,
    tweetTextt: tweetText,
    SENDERUID: sender.uid
  });
}

export async function sendMentionNotification(tweetId, mentionedUserId, tweetText) {
  const sender = auth.currentUser;
  if (!sender || sender.uid === mentionedUserId) return;

  const { username : senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notificationRef = doc(db, "users", mentionedUserId, "notifications", `mention-${tweetId}}`);

  await setDoc(notificationRef, {
    type: "mention",
    senderName,
    createdAt: serverTimestamp(),
    tweetId,
    tweetText: tweetText || "",
    read: false,
    tweetTextt: tweetText,
    SENDERUID: sender.uid
  });
}

export async function sendCommunityRetweetNotification(originalTweetId, replyText, retweetId, communityId, communityName, tweetText, authorId) {
  const sender = auth.currentUser;
  if (!sender) return;
  if (sender.uid === authorId) return;

  const { username : senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notificationRef = doc(db, "users", authorId, "notifications", `retWynt-${retweetId}-${communityId}`);

  await setDoc(notificationRef, {
    type: "community-retweet",
    senderName,
    text: replyText || "",
    createdAt: serverTimestamp(),
    tweetId: retweetId,
    originalTweetId: originalTweetId,
    tweetText: tweetText,
    read: false,
    communityId,
    communityName,
    tweetTextt: tweetText,
    SENDERUID: sender.uid
  });
}

export async function sendRetweetNotification(originalTweetId, replyText, retweetId, tweetText, authorId) {
  const sender = auth.currentUser;
  if (!sender) return;
  if (sender.uid === authorId) return;

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const { username : senderName } = await getUserData(sender.uid);

  const notificationRef = doc(db, "users", authorId, "notifications", `reWynt-${retweetId}`);

  await setDoc(notificationRef, {
    type: "retweet",
    senderName,
    text: replyText || "",
    createdAt: serverTimestamp(),
    tweetId: retweetId,
    originalTweetId: originalTweetId,
    tweetText: tweetText || "",
    read: false,
    tweetTextt: tweetText,
    SENDERUID: sender.uid
  });
}

export async function sendCommunityReplyRetweetNotification(originalTweetId, commentId, replyText, retweetId, communityId, communityName, tweetText, authorId) {
  const sender = auth.currentUser;
  if (!sender) return;
  if (sender.uid === authorId) return; 

  const { username : senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notificationRef = doc(
    db,
    "users",
    authorId,
    "notifications",
    `replyReWynt-${retweetId}-${commentId}-${communityId}`
  );

  await setDoc(notificationRef, {
    type: "community-reply-retweet",
    senderName,
    text: replyText || "",
    createdAt: serverTimestamp(),
    tweetId: retweetId,
    originalTweetId: originalTweetId,
    commentId: commentId,
    commentText: tweetText,
    read: false,
    communityId,
    communityName,
    SENDERUID: sender.uid
  });
}

export async function sendReplyRetweetNotification(originalTweetId, commentId, replyText, retweetId, tweetText, authorId) {
  const sender = auth.currentUser;
  if (!sender) return;

  if (sender.uid === authorId) return; 

  const { username : senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notificationRef = doc(
    db,
    "users",
    authorId,
    "notifications",
    `replyReWynt-${retweetId}-${commentId}`
  );

  await setDoc(notificationRef, {
    type: "reply-retweet",
    senderName,
    text: replyText || "",
    createdAt: serverTimestamp(),
    tweetId: retweetId,
    originalTweetId: originalTweetId,
    commentId: commentId,
    commentText: tweetText,
    read: false,
    SENDERUID: sender.uid 
  });
}

export async function sendCommunityCommentMentionNotification(tweetId, mentionedUserId, commentText, communityId, commentId, communityName, tweetText) {
  const sender = auth.currentUser;
  if (!sender || sender.uid === mentionedUserId) return;

  const { username : senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notificationRef = doc(
    db,
    "users",
    mentionedUserId,
    "notifications",
    `replyMention-${tweetId}-${commentId}-${communityId}`
  );

  await setDoc(notificationRef, {
    type: "community-commentMention",
    senderName,
    text: textClamp(commentText),
    createdAt: serverTimestamp(),
    tweetId,
    read: false,
    communityId,
    commentId,
    communityName,
    tweetTextt: tweetText,
    SENDERUID: sender.uid
  });
}

export async function sendCommentMentionNotification(tweetId, mentionedUserId, commentText, commentId, tweetText) {
  const sender = auth.currentUser;
  if (!sender || sender.uid === mentionedUserId) return;

  const { username : senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notificationRef = doc(
    db,
    "users",
    mentionedUserId,
    "notifications",
    `replyMention-${tweetId}-${commentId}`
  );

  await setDoc(notificationRef, {
    type: "commentMention",
    senderName,
    text: textClamp(commentText),
    createdAt: serverTimestamp(),
    tweetId,
    read: false,
    commentId,
    tweetTextt: tweetText,
    SENDERUID: sender.uid
  });
}

async function isBlocked(uid) {
  const blockRef = doc(db, "users", uid, "blocks", auth.currentUser.uid);
  const blockSnap = await getDoc(blockRef);

  if (blockSnap.exists()) {
    const blockData = blockSnap.data();
    if (
      (blockData.blockUntil && blockData.blockUntil.toDate() > new Date())
      || blockData.permanent === true
    ) {
      return true;
    }
  }
  return false;
}

export async function sendCommunityJoinRequest(ownerId, communityId, communityName) {
  const sender = auth.currentUser;
  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const today = new Date().toISOString().split("T")[0];
  const { username: senderName } = await getUserData(sender.uid);

  const notifRef = doc(db, "users", ownerId, "notifications", `joinrequest-${auth.currentUser.uid}-${communityId}-${today}`);

  await setDoc(notifRef, {
    type: "communityJoinRequest",
    senderName,
    senderId: sender.uid,
    communityId,
    communityName,
    createdAt: serverTimestamp(),
    read: false,
    SENDERUID: sender.uid
  }, { merge: true });
}

export async function sendInviteNotification(uid, communityId, communityName) {
  const blocked = await isBlocked(uid);
  if (blocked) return;

  const today = new Date().toISOString().split("T")[0];
  const {username} = await getUserData(auth.currentUser.uid);
  const notificationId = `${auth.currentUser.uid}-invite-${communityId}-${today}`;
  const notificationRef = doc(db, "users", uid, "notifications", notificationId);

  await setDoc(notificationRef, {
    type: "invite",
    senderName: username,
    senderId: auth.currentUser.uid,
    communityId,
    communityName,
    createdAt: serverTimestamp(),
    read: false,
    SENDERUID: auth.currentUser.uid
  }, { merge: true });
}

export async function sendFollowNotification(targetUserId, username) {
  const blocked = await isBlocked(targetUserId);
  if (blocked) return;

  const today = new Date().toISOString().split("T")[0]; 
  const notificationId = `${auth.currentUser.uid}-follow-${today}`;
  const notificationRef = doc(db, "users", targetUserId, "notifications", notificationId);

  await setDoc(notificationRef, {
    type: "follow",
    senderName: username,
    senderId: sender.uid,
    text: `${username} just followed you`,
    createdAt: serverTimestamp(),
    read: false,
    SENDERUID: sender.uid
  }, { merge: true });
}

export async function sendCommunityDonationNotification(tweetId, donationAmount, donationReceived, commentText = "", communityId, commentId, communityName, tweetText) {
  const tweetSnap = await getDoc(doc(db, "communities", communityId, "posts", tweetId));
  if (!tweetSnap.exists()) return;

  const creatorId = tweetSnap.data().uid;
  const { username: senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(creatorId);
  if (blocked) return;

  const notificationRef = doc(db, "users", creatorId, "notifications", `donation-${tweetId}-${commentId}-${communityId}`);

  await setDoc(notificationRef, {
    type: "community-donation",
    senderName,
    donationReceived,
    communityId,
    commentText,
    createdAt: serverTimestamp(),
    tweetId,
    read: false,
    commentId,
    communityName,
    tweetTextt: tweetText,
    SENDERUID: sender.uid
  });
}

export async function sendDonationNotification(tweetId, donationAmount, donationReceived, commentText = "", commentId) {
  const sender = auth.currentUser;
  if (!sender) return;

  const tweetSnap = await getDoc(doc(db, "tweets", tweetId));
  if (!tweetSnap.exists()) return;

  const creatorId = tweetSnap.data().uid;
  if (creatorId === sender.uid) return;

  const { username: senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notificationRef = doc(
    db,
    "users",
    creatorId,
    "notifications",
    `donation-${tweetId}-${commentId}`
  );

  await setDoc(notificationRef, {
    type: "donation",
    senderName,
    donationReceived,
    commentText,
    createdAt: serverTimestamp(),
    tweetId,
    read: false,
    commentId,
    SENDERUID: sender.uid
  });
}

export async function sendCommunityReplyNotification(tweetId, parentCommentId, replyText, communityId, communityName, tweetText, replyId) {
  const sender = auth.currentUser;
  if (!sender) return;

  const parentRef = doc(db, "communities", communityId, "posts", tweetId, "comments", parentCommentId);
  const parentSnap = await getDoc(parentRef);
  if (!parentSnap.exists()) return;

  const parentData = parentSnap.data();
  const parentOwnerId = parentData.uid;
  if (parentOwnerId === sender.uid) return;

  const { username: senderName } = await getUserData(sender.uid);
  
  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notifRef = doc(
    db,
    "users",
    parentOwnerId,
    "notifications",
    `reply-${tweetId}-${parentCommentId}-${replyId}-${communityId}`
  );

  await setDoc(notifRef, {
    type: "community-reply",
    senderName,
    text: textClamp(replyText),
    createdAt: serverTimestamp(),
    tweetId,
    commentId: parentCommentId,
    read: false,
    communityId,
    communityName,
    tweetTextt: tweetText,
    replyId,
    SENDERUID: sender.uid
  });
}

export async function sendReplyNotification(tweetId, parentCommentId, replyText, tweetText, replyId) {
  const sender = auth.currentUser;
  if (!sender) return;

  const parentRef = doc(db, "tweets", tweetId, "comments", parentCommentId);
  const parentSnap = await getDoc(parentRef);
  if (!parentSnap.exists()) return;

  const parentData = parentSnap.data();
  const parentOwnerId = parentData.uid;
  if (parentOwnerId === sender.uid) return;

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const { username: senderName } = await getUserData(sender.uid);

  const notifRef = doc(
    db,
    "users",
    parentOwnerId,
    "notifications",
    `reply-${tweetId}-${parentCommentId}-${replyId}`
  );

  await setDoc(notifRef, {
    type: "reply",
    senderName,
    text: textClamp(replyText),
    createdAt: serverTimestamp(),
    tweetId,
    commentId: parentCommentId,
    read: false,
    tweetTextt: tweetText,
    replyId,
    SENDERUID: sender.uid
  });
}

export async function sendCommunityReplyMentionNotification(tweetId, parentCommentId, mentionedUserId, replyText, communityId, communityName, tweetText, replyId) {
  const sender = auth.currentUser;
  if (!sender) return;
  if (mentionedUserId === sender.uid) return;

  const { username: senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notifRef = doc(
    db,
    "users",
    mentionedUserId,
    "notifications",
    `replyMention-${tweetId}-${parentCommentId}-${replyId}-${communityId}`
  );

  await setDoc(notifRef, {
    type: "community-reply-mention",
    senderName,
    text: textClamp(replyText),
    createdAt: serverTimestamp(),
    tweetId,
    commentId: parentCommentId,
    communityId,
    read: false,
    communityName,
    tweetTextt: tweetText,
    replyId,
    SENDERUID: sender.uid
  });
}

export async function sendReplyMentionNotification(tweetId, parentCommentId, mentionedUserId, replyText, tweetText, replyId) {
  const sender = auth.currentUser;
  if (!sender) return;
  if (mentionedUserId === sender.uid) return;

  const { username: senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notifRef = doc(
    db,
    "users",
    mentionedUserId,
    "notifications",
    `replyMention-${tweetId}-${parentCommentId}-${replyId}`
  );

  await setDoc(notifRef, {
    type: "reply-mention",
    senderName,
    text: textClamp(replyText),
    createdAt: serverTimestamp(),
    tweetId,
    commentId: parentCommentId,
    read: false,
    tweetTextt: tweetText,
    replyId,
    SENDERUID: sender.uid
  });
}

export async function sendCommunityPinNotification1(communityId, communityName, receiverId, text) {
  const sender = auth.currentUser;
  if (!sender) return;
  if (sender.uid === receiverId) return;  

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notifRef = doc(
    db,
    "users",
    receiverId,
    "notifications",
    `communityPin-${communityId}-${Date.now()}`
  );

  await setDoc(notifRef, {
    type: "community-pin-notification",
    createdAt: serverTimestamp(),
    read: false,
    communityId,
    communityName,
    text,
    SENDERUID: sender.uid
  });
}

export async function sendCommunityPinNotification(tweetOwner, replyText, tweetId, commentId, communityId, communityName) {
  const sender = auth.currentUser;
  if (!sender) return;
  if (sender.uid === tweetOwner) return;

  const { username: senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notifRef = doc(
    db,
    "users",
    tweetOwner,
    "notifications",
    `pin-${tweetId}-${commentId}-${communityId}-${Date.now()}`
  );

  await setDoc(notifRef, {
    type: "community-pin",
    senderName,
    text: textClamp(replyText),
    createdAt: serverTimestamp(),
    tweetId,
    commentId,
    read: false,
    communityId,
    communityName,
    SENDERUID: sender.uid
  });
}

export async function sendPinNotification(tweetOwner, replyText, tweetId, commentId) {
  const sender = auth.currentUser;
  if (!sender) return;
  if (sender.uid === tweetOwner) return;

  const { username: senderName } = await getUserData(sender.uid);

  const blocked = await isBlocked(sender.uid);
  if (blocked) return;

  const notifRef = doc(
    db,
    "users",
    tweetOwner,
    "notifications",
    `pin-${tweetId}-${commentId}-${Date.now()}`
  );

  await setDoc(notifRef, {
    type: "pin",
    senderName,
    text: textClamp(replyText),
    createdAt: serverTimestamp(),
    tweetId,
    commentId,
    read: false,
    SENDERUID: sender.uid
  });
}

export async function sendHideNotification(text, targetUserId, reason) {
  if (!targetUserId) return;

  const warningRef = doc(
    db,
    "users",
    targetUserId,
    "notifications",
    `commentHide-${Date.now()}`
  );

  await setDoc(warningRef, {
    type: "hide-notification",
    text,
    reason,
    createdAt: serverTimestamp(),
    read: false,
  });
}

export async function sendCommunityReplyDeleteNotification(targetUserId, text, reason, name, communityId) {
  if (!targetUserId) return;

  const warningRef = doc(
    db,
    "users",
    targetUserId,
    "notifications",
    `replyDelete-${communityId}-${Date.now()}`
  );

  await setDoc(warningRef, {
    type: "community-reply-delete",
    text,
    reason,
    createdAt: serverTimestamp(),
    read: false,
    name,
    communityId,
    SENDERUID: auth.currentUser.uid
  });
}

export async function sendCommunityTweetDeleteNotification(targetUserId, text, reason, name, communityId) {
  if (!targetUserId) return;

  const warningRef = doc(
    db,
    "users",
    targetUserId,
    "notifications",
    `wyntDelete-${communityId}-${Date.now()}`
  );

  await setDoc(warningRef, {
    type: "community-tweet-delete",
    text,
    reason,
    createdAt: serverTimestamp(),
    read: false,
    name,
    communityId,
    SENDERUID: auth.currentUser.uid
  });
}

export async function sendTweetWarningNotification(targetUserId, text, reason) {
  if (!targetUserId) return;

  const warningRef = doc(
    db,
    "users",
    targetUserId,
    "notifications",
    `wyntDelete-${Date.now()}`
  );

  await setDoc(warningRef, {
    type: "tweet",
    text,
    reason,
    createdAt: serverTimestamp(),
    read: false
  });
}

export async function sendCommentWarningNotification(targetUserId, text, reason) {
  if (!targetUserId) return;

  const warningRef = doc(
    db,
    "users",
    targetUserId,
    "notifications",
    `replyDelete-${Date.now()}`
  );

  await setDoc(warningRef, {
    type: "comment-delete",
    text,
    reason,
    createdAt: serverTimestamp(),
    read: false
  });
}

export async function sendCommunityWarningNotification(targetUserId, name, reason) {
  if (!targetUserId) return;

  const warningRef = doc(
    db,
    "users",
    targetUserId,
    "notifications",
    `communityDelete-${Date.now()}`
  );

  await setDoc(warningRef, {
    type: "community-delete",
    name,
    reason,
    createdAt: serverTimestamp(),
    read: false
  });
}

export async function sendAdminNotification(targetUserId, communityId, communityName, ownerName, ownerId) {

  const today = new Date().toISOString().split("T")[0];
  const notifRef = doc(db, "users", targetUserId, "notifications", `adminNotif-${communityId}-${today}`);

  const blocked = await isBlocked(auth.currentUser.uid);
  if (blocked) return;

  await setDoc(notifRef, {
    id: notifRef.id,
    type: "communityAdmin",
    senderName: ownerName,
    senderId: ownerId,
    communityName,
    communityId,
    createdAt: new Date(),
    read: false,
    SENDERUID: ownerId,
  }, { merge: true });
}

export async function sendadminDismissedNotification(targetUserId, communityId, communityName, name) {
  const notifRef = doc(db, "users", targetUserId, "notifications", `adminDismiss-${communityId}-${Date.now()}`);

  await setDoc(notifRef, {
    id: notifRef.id,
    type: "communityAdminDismissed",
    communityName,
    communityId,
    name,
    createdAt: new Date(),
    read: false
  });
} 

export async function sendAcceptedNotification(targetUserId, communityId, communityName) {
  const notifRef = doc(db, "users", targetUserId, "notifications", `communityAccepted-${communityId}-${Date.now()}`);
  
  await setDoc(notifRef, {
    id: notifRef.id,
    type: "communityJoinAccepted",
    communityName,
    communityId,
    createdAt: new Date(),
    read: false
  });
}