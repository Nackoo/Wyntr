import { auth, db, doc, getDoc, getDocs, collection, query, orderBy, setDoc, updateDoc, increment, Timestamp } from "./firebase.js";
import { loadComments, renderPoll, getUserData, getCommunityNameById, getSnap, renderPoll1, currentUserRole } from "./index.js";
import { formatDate, escapeHTML, applyReadMoreLogic, parseMentionsToLinks, formatNumber, formatTime, log, getDefaultLanguage, isTranslateEnabled, randomString } from "./texts.js";
import { getSupabaseVideo, base91ToImageSrc } from "./attachments.js";
import { showOriginal } from "./main.js"; 
import { incrementViews } from "./view_users.js";
import { openCommunity } from "./community.js";
 
export async function renderTweetViewer(t, tweetId, container, user, comid, isFromMain, isStored) {
  document.getElementById("commentList").classList.add("hidden");
  container.innerHTML = `<div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div>`;
  document.getElementById("commentList").innerHTML = "";

  let likeRef;
  if (window.communityID != null) {
    likeRef = `communities/${window.communityID}/posts/${tweetId}/likes/${user.uid}`
  } else if (comid) {
    likeRef = `communities/${comid}/posts/${tweetId}/likes/${user.uid}`
  } else {
    likeRef = `tweets/${tweetId}/likes/${user.uid}`
  }
  const likeId = randomString(14);

  const {
    username,
    avatar,
    displayName,
    d: x
  } = await getUserData(t.uid);

  if (t.retweetOf) {
    let retweetDoc;
    if (window.communityID != null && isFromMain == false) {
      retweetDoc = await getDoc(doc(db, "communities", window.communityID, "posts", t.retweetOf));
    } else if (comid) {
      retweetDoc = await getDoc(doc(db, "communities", comid, "posts", t.retweetOf));
    } else {
      retweetDoc = await getDoc(doc(db, "tweets", t.retweetOf));
    }
    if (retweetDoc.exists()) {
      const rt = retweetDoc.data();
      const rDate = formatDate(rt.createdAt);
      try {
        const rtUserDoc = await getDoc(doc(db, "users", rt.uid));
        if (rtUserDoc.exists()) {
          const {
            username: rtUsername,
            avatar: rtAvatar,
            displayName: rtDisplayName
          } = await getUserData(rt.uid);
        }
      } catch (err) {
        console.warn("Failed to fetch retweet user profile:", err);
      }
    }
  }
  const likeCount = t.likeCount || 0;
  const viewCount = t.viewsCount || 0;
  const commentCount = t.commentCount || 0;
  const retweetCount = t.retweetCount || 0;
  const dateStr = formatDate(t.createdAt);
  let mediaHTML = "";
  const containsSpoiler = t.sensitiveMedia === true;
  let vidId = null;
  let vidRtId = null;
  if (t.media && t.mediaType === "image") {
    const src = base91ToImageSrc(t.media);
    if (containsSpoiler) {
      mediaHTML = `
          <div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
            <div class="spoiler-overlay">
              <div class="spoilertxt">sensitive</div>
            </div>
            <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';" />
          </div>`;
    } else {
      mediaHTML = `
          <div class="attachment">
            <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';" />
          </div>`;
    }
  } else if (t.media && t.mediaType === "video") {
    if (containsSpoiler) {
      vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      mediaHTML = `
          <div class="attachment spoiler-media" onclick="
            getSupabaseVideo('${t.media}', '${vidId}');
            this.classList.add('revealed')
          ">
            <div class="spoiler-overlay">
              <div class="spoilertxt">sensitive</div>
            </div>
            <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
              Your browser does not support the video tag.
            </video>
          </div>`;
    } else {
      vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      mediaHTML = `
          <div class="attachment">
            <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
              Your browser does not support the video tag.
            </video>
          </div>`;
      if (!document.getElementById(vidId)) getSupabaseVideo(t.media, vidId);
    }
  }
  let retweetHTML = "";
  let quotedHTML = "";
  let likeId1 = "";
  let likeRef1;
  let editHTML3 = "";
  let comment;

  if (t.retweetOfComment) {
    const { tweetId: parentId, commentId } = t.retweetOfComment;

    let commentRef;
    if (window.communityID != null && isFromMain == false) {
      commentRef = doc(db, "communities", window.communityID, "posts", parentId, "comments", commentId);
      likeRef1 = `communities/${window.communityID}/posts/${parentId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    } else if (comid) {
      commentRef = doc(db, "communities", comid, "posts", parentId, "comments", commentId);
      likeRef1 = `communities/${comid}/posts/${parentId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    } else if (t.sharedFromCommunity) {
      commentRef = doc(db, "communities", t.sharedFromCommunity, "posts", parentId, "comments", commentId);
      likeRef1 = `communities/${t.sharedFromCommunity}/posts/${parentId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    } else {
      commentRef = doc(db, "tweets", parentId, "comments", commentId);
      likeRef1 = `tweets/${parentId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    }

    const commentSnap = await getDoc(commentRef);
    if (commentSnap.exists()) {
      comment = commentSnap.data();
      const { username, avatar, displayName, d } = await getUserData(comment.uid);
      const parsedCommentText = await parseMentionsToLinks(comment.text || "", comment.mentions || []);
      const hasImage = comment.media && comment.mediaType === "image";
      const hasVideo = comment.media && comment.mediaType === "video";
      const hasText = comment.text?.trim()?.length > 0;

      likeId1 = randomString(14);

      let donationHTML = "";
      if (comment.donationReceived) {
        donationHTML = `
      <span style="color:#0485b7;font-size:15px;padding-bottom:10px;display:block">
        <img draggable="false" class="emoji" alt="🎁" src="https://ox7jbzyn-13kwt53x-purp2e2u.netlify.app/twemoji/svg/1f381.svg"> Gifted <span style="color:#f91880;font-weight:bold;">${formatNumber(comment.donationReceived)}</span> Wcoins
      </span>
        `;
      }

      if (comment.edited && comment.editAfterComment) {
        editHTML3 = `
        <img src="/image/editicon.svg" class="editedatt edit0 title="edited at ${formatTime(comment.edited)}. click me">
        `
      }

      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();

      let translateHTML = "";
      if (comment.language && comment.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML = `
          <div class="translate-wrapper" style="margin-top:-10px;margin-bottom:5px;">
            <span
              class="translate-btn"
              data-id="${commentId}"
              data-random="${random}"
              data-from="${comment.language}"
              data-to="${defaultLanguage}"
              data-text="${comment.text}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;">
              Translate from ${comment.language}
            </span>
            <div
              id="translated-${commentId}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;">
            </div>
          </div>
        `;
      }

      let pollHTML = "";
      if (comment.poll && Array.isArray(comment.poll.options)) {
        const uid = auth.currentUser?.uid;
        let myVoteIndex = null;
        if (uid) {
          let voteRef;
          if (window.communityID != null) {
            voteRef = doc(db, "communities", window.communityID, "posts", parentId, "comments", commentId, "votes", uid);
          } else {
            voteRef = doc(db, "tweets", parentId, "comments", commentId, "votes", uid);
          }
          const voteSnap = await getDoc(voteRef);
          if (voteSnap.exists()) {
            myVoteIndex = voteSnap.data().optionIndex;
          }
        }
        pollHTML = renderPoll1(comment, parentId, commentId, myVoteIndex);
      }

      const random = randomString(14);

      const infos = `
          <div class="flex" style="margin:0;gap:25px;">
            ${comment.isHidden ? "" : `
            <span class="comment-like-btn" data-id="${commentId}" data-tweet="${parentId}" style="cursor:pointer;display:flex;align-items:center;gap:3px;">
              <div id="${likeId1}" class="clikeicon" style="height:20px">
                <img loading='lazy' src="/image/heart.svg">
              </div>
              <span style="color:#757779;" id="comment-like-count-${commentId}">${comment.likeCount > 0 ? comment.likeCount : ""}</span>
            </span>
            <span style="cursor:pointer;color:#757779" class="reply-btn" data-id="${commentId}" data-tweet="${parentId}">
              <img loading='lazy' src="/image/message.svg"> ${(comment.replyCount ?? 0) > 0 ? comment.replyCount : ""}
            </span>
            <span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${parentId}" data-comment-id="${commentId}">
              <img loading='lazy' src="/image/rewint.svg"> ${(comment.retweetCount ?? 0) > 0 ? comment.retweetCount : ""}
            </span>
            <span class="viewbtn" style="margin-left:auto;color:#757779"><img loading="lazy" src="/image/chart.svg"> ${comment.viewsCount > 0 ? comment.viewsCount : ""}</span>`
            }
          </div>
      `;
      
      if (d.banned === true && currentUserRole != "admin") {
        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
          <div class="quoted-comment" data-id="${parentId}" data-community-id="${t.sharedFromCommunity || null}" data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              <strong class="user-link" data-uid="${comment.uid}"  style="cursor:pointer">Suspended user</strong>
              <span style="color:grey;font-size:12px;">
                ${formatDate(comment.createdAt)}
              </span>
            </div>
            <div class="quoted-body">
              <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;color:grey">This reply is from a suspended user</p>
            </div>
          </div>`;
      } else {
        if (hasImage && hasText) {
          const containsSpoiler = comment.sensitiveMedia === true;
          const src = base91ToImageSrc(comment.media.url);
          const path = `${tweetId}-${commentId}`;
          const content = `
            <div class=post-body style="margin: 0px 0px 15px;">${parsedCommentText}</div> 
            ${translateHTML} 
            ${containsSpoiler ?
                `<div class="attachment spoiler-media" style="margin-bottom:25px" onclick="this.classList.add('revealed')">
                  <div class="spoiler-overlay">
                    <div class="spoilertxt">sensitive</div>
                  </div>
                  <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                </div>` :
                `<div class="attachment" style="margin-bottom:25px">
                  <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                </div>`
            }
            ${donationHTML}
            ${pollHTML}
          `;

          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
            <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || null}" data-id="${parentId}" data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${comment.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)} ${editHTML3}
              </span>
              <div style="margin-left:auto">
                <span class="cmenubtn" data-text="${comment.text}" data-id="${commentId}" data-tweet="${parentId}" data-author="${comment.uid}">
                  <img src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
            ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
            ${content}
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                <img src="/image/eye.svg">
                <span style="color: grey; font-size: 13px;">
                  This reply is hidden  ${comment.hiddenByAdmin ? `by (hidden for: ${comment.hiddenReason || "no reason stated"})` : `${!comment.hiddenByAuthority ? `by Wynt author ${comment.tweetOwnerId === auth.currentUser.uid || comment.uid === auth.currentUser.uid ? `${comment.hiddenReason || "no reason stated"}` : ""}` : ""}`}
                </span>
              </div> 
            </div>` : `
            ${content}
            `}
            ${infos}
            </div>
            </div>
            `;
        } else if (hasVideo && hasText) {
          vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          const containsSpoiler = comment.sensitiveMedia === true;
          const path = `${tweetId}-${commentId}`;
          const content = `
            <div class=post-body style="margin: 0px 0px 15px;">${parsedCommentText}</div> 
            ${translateHTML} 
            ${containsSpoiler ?
              `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                <div class="spoiler-overlay">
                  <div class="spoilertxt">sensitive</div>
                </div>
                <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                  Your browser does not support the video tag.
                </video>
                </div>` :
                `<div class="attachment" style="margin-bottom:5px">
                  <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                    Your browser does not support the video tag.
                  </video>
                </div>`
            }
            ${donationHTML}
            ${pollHTML}
          `;

          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
            <div class="quoted-comment" data-id="${parentId}" data-community-id="${t.sharedFromCommunity || null}" data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
              `${comment.likedByCreator === true ? 
                `<img style="margin-right:-3px" src="/image/star.svg">` :
                `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                  `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                  ""
                }`
              }`
            }
            <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)} ${editHTML3}
              </span>
            <div style="margin-left:auto">
              <span class="cmenubtn" data-text="${comment.text}" data-id="${commentId}" data-tweet="${parentId}" data-author="${comment.uid}">
                <img src="/image/three-dots.svg">
              </span>
            </div>
            </div>
            <div class="quoted-body">
            ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
            ${content}
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                <img src="/image/eye.svg">
                <span style="color: grey; font-size: 13px;">
                  This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                </span>
              </div>
            </div>` : `
            ${content}
            `}
            ${infos}
            </div>
            </div>
            `;
          getSupabaseVideo(comment.media.url, vidId);

        } else if (hasImage) {
          const src = base91ToImageSrc(comment.media.url);
          const path = `${tweetId}-${commentId}`;
          const content = `
            <div class="attachment">
              <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
            </div>
            ${donationHTML}
            ${pollHTML}
          `

          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
            <div class="quoted-comment" data-id="${parentId}" data-community-id="${t.sharedFromCommunity || null}" data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${comment.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link"   data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
              </span>
              <div style="margin-left:auto"><span class="cmenubtn" data-id="${commentId}" data-tweet="${parentId}" data-text="${comment.text}" data-author="${comment.uid}">
                <img src="/image/three-dots.svg">
              </span></div>
            </div>
            <div class="quoted-body">
            ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
            ${content}
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                <img src="/image/eye.svg">
                <span style="color: grey; font-size: 13px;">
                  This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                </span>
              </div>
            </div>` : `
            ${content}
            `}
            ${infos}
            </div>
          </div>`;

        } else if (hasVideo) {
          vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          const path = `${tweetId}-${commentId}`;
          const content = `
            <div class="attachment" style="margin-bottom:5px">
              <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                Your browser does not support the video tag.
              </video>
            </div>
            ${donationHTML}
            ${pollHTML}
          `;

          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
          <div class="quoted-comment"  data-id="${parentId}" data-community-id="${t.sharedFromCommunity || null}" data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${comment.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link"   data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
              </span>
              <div style="margin-left:auto"><span class="cmenubtn" data-id="${commentId}" data-tweet="${parentId}" data-text="${comment.text}" data-author="${comment.uid}">
                <img src="/image/three-dots.svg">
              </span></div>
            </div>
            <div class="quoted-body">
            ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
            ${content}
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                <img src="/image/eye.svg">
                <span style="color: grey; font-size: 13px;">
                  This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                </span>
              </div>
            </div>` : `
            ${content}
            `}
            ${infos}
            </div>
          </div>`;

          getSupabaseVideo(comment.media.url, vidId);
        } else {
          const path = `${tweetId}-${commentId}`;
          const content = `
            <div class=post-body style="margin: 6px 0px 12px;margin-top:6px;">${parsedCommentText}</div> 
            ${translateHTML} 
            ${donationHTML}
            ${pollHTML}
          `

          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
          <div class="quoted-comment" data-id="${parentId}" data-community-id="${t.sharedFromCommunity || null}" data-comment-id="${commentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${comment.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)} ${editHTML3}
              </span>
              <div style="margin-left:auto"><span class="cmenubtn" data-id="${commentId}" data-tweet="${parentId}" data-text="${comment.text}" data-author="${comment.uid}">
                <img src="/image/three-dots.svg">
              </span></div>
            </div>
            <div class="quoted-body">
            ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
              </button>
              <div class="hidden" id="commentItem-${random}">
                ${content}
                <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                  <img src="/image/eye.svg">
                  <span style="color: grey; font-size: 13px;">
                    This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}This reply is hidden for: ${comment.hiddenReason || "no reason stated"}
                  </span>
                </div>
              </div>` : `
            ${content}
            `}
            ${infos}
            </div>
          </div>`;
        }
      }
    } else {
      quotedHTML = `
        <div class="quoted-comment">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
          <img class="avatar" src="/image/default-avatar.jpg" width="30">
          <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
            <span style="color:grey;font-size:12px;">
              <img src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
            </span>
          </div>
          <div class="quoted-body">
          <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this reply is unavailable</i></p>
          </div>
        </div>`;
    }
  }

  let likeId2 = "";
  let likeRef2;
  let editHTML1 = "";
  let rt;

  if (t.retweetOf || t.originalId) {
    let retweetDoc;
    if (t.sharedFromCommunity || window.communityID || t.communityId || comid) {
      retweetDoc = await getDoc(doc(db, "communities", t.sharedFromCommunity || window.communityID || t.communityId || comid, "posts", t.originalId));
    } else {
      retweetDoc = await getDoc(doc(db, "tweets", t.retweetOf));
    }

    if (retweetDoc.exists()) {
      if (t.sharedFromCommunity || window.communityID || t.communityId || comid) {
        likeRef2 = `communities/${t.sharedFromCommunity || window.communityID || t.communityId || comid}/posts/${t.originalId}/likes/${auth.currentUser.uid}`;
      } else {
        likeRef2 = `tweets/${t.retweetOf}/likes/${auth.currentUser.uid}`;
      }

      rt = retweetDoc.data();
      const rDate = rt.createdAt;
      let hasText;
      if (t.retweettext) {
        hasText = t.retweettext?.trim()?.length > 0;
      } else {
        hasText = rt.text?.trim()?.length > 0;
      }
      const hasImage = rt.media && rt.mediaType === "image";
      const hasVideo = rt.media && rt.mediaType === "video";
      const {
        displayName: rtDisplayName,
        username: rtUsername,
        avatar: rtAvatar,
        d
      } = await getUserData(rt.uid);

      likeId2 = randomString(14);

      let titleHTML1 = "";
      if (rt.title) {
        titleHTML1 = `<p style="margin:0;margin-top:10px;font-size:18px;font-weight:bold;margin-bottom:10px;">${escapeHTML(rt.title)}</p>`;
      }

      if (rt.edited && rt.editAfterComment) {
        editHTML1 = `
        <img src="/image/editicon.svg" class="editedatt edit1" title="edited at ${formatTime(rt.edited)}. click me">
        `
      }
      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();
      let translateHTML2 = "";
      if (rt.language && rt.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML2 = `
          <div class="translate-wrapper" style="margin-top:-10px;margin-bottom:10px;
      ">
            <span
              class="translate-btn"
              data-id="${t.retweetOf}"
              data-random="${random}"
              data-from="${rt.language}"
              data-to="${defaultLanguage}"
              data-text="${rt.text}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;"
            >
              Translate from ${rt.language}
            </span>
            <div
              id="translated-${t.retweetOf}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;"
            ></div>
          </div>
        `;
      }

      let pollHTML2 = "";
      if (rt.poll && Array.isArray(rt.poll.options)) {
        const uid = auth.currentUser?.uid;
        let myVoteIndex = null;
        if (uid) {
          let voteRef;
          if (window.communityID != null) {
            voteRef = doc(db, "communities", window.communityID, "posts", t.retweetOf || t.originalId, "votes", uid);
          } else {
            voteRef = doc(db, "tweets", t.retweetOf || t.originalId, "votes", uid);
          }
          const voteSnap = await getDoc(voteRef);
          if (voteSnap.exists()) {
            myVoteIndex = voteSnap.data().optionIndex;
          }
        }
        pollHTML2 = renderPoll(rt, t.retweetOf || t.originalId, myVoteIndex);
      }

      const info = `
        ${rt.isHidden ? "" : `
                <div class="flex" style="margin-bottom:10px">
                  <span style="cursor:pointer;color:#757779" data-community-id="${t.sharedFromCommunity || window.communityID || t.communityId || comid || null}" class="like-btn" id="likeBtn-${t.retweetOf || t.originalId}">
                    <div id="${likeId2}" class="likeicon" style="height:20px">
                      <img loading='lazy' src="/image/heart.svg">
                    </div>
                    ${rt.likeCount > 0 ? `<span id="likeCount-${t.retweetOf || t.originalId}">${rt.likeCount}</span>` : ""}
                  </span>
                  <span style="cursor:pointer;color:#757779" class="comment-btn" data-id="${t.retweetOf || t.originalId}">
                    <img loading='lazy' src="/image/message.svg"> ${rt.commentCount > 0 ? rt.commentCount : ""}
                  </span>
                  <span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${t.retweetOf || t.originalId}">
                    <img loading='lazy' src="/image/rewint.svg"> ${rt.retweetCount > 0 ? rt.retweetCount : ""}
                  </span>
                  <div style="margin-left:auto;">
                    <span class="viewbtn" style="margin-left:10px;color:#757779"><img loading='lazy' src="/image/chart.svg"> ${rt.viewsCount > 0 ? rt.viewsCount : ""}</span>
                  </div>
                </div>  
        `}
      `;
      
      if (rt.archived && rt.uid != auth.currentUser.uid && !rt.viewPermission?.includes(auth.currentUser.uid) && !rt.allowAnyoneWithLink && currentUserRole != "admin") {
      retweetHTML = `
        <div class="quoted-comment">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
          <img loading='lazy' class="avatar" src="/image/default-avatar.jpg" width="30">
          <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
            <span style="color:grey;font-size:12px;">
              <img loading='lazy' src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
            </span>
          </div>
          <div class="quoted-body" style="margin-bottom:22px;">
            <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this Wynt is archived</i></p>
          </div>
        </div>`;
      } else {
        if (d.banned === true && currentUserRole != "admin") {
          retweetHTML = `
            <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || t.communityId || null}">
              <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
                <img loading='lazy' class="avatar" src="${escapeHTML(rtAvatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">Suspended user</strong>
                <span style="color:grey;font-size:12px;">${formatDate(rDate)}</span>
              </div>
              <div class="quoted-body" style="margin-bottom:22px;">
                <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;color:grey">This Wynt is from a suspended user</p>
              </div>
            </div>`;
        } else {
          if (hasImage && hasText) {
            let parsedText;
            if (t.retweettext) {
              parsedText = await parseMentionsToLinks(t.retweettext, rt.mentions || []);
            } else {
              parsedText = await parseMentionsToLinks(rt.text, rt.mentions || []);
            }

            const rtsrc = base91ToImageSrc(rt.media);
            const rtcontainsSpoiler = rt.sensitiveMedia === true;

            retweetHTML = `
              <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || t.communityId || null}">
                <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
                  <img loading='lazy' class="avatar" src="${escapeHTML(rtAvatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                  ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                    `${(rt.mentions && Object.values(rt.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }
                  <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
                  <span style="color:grey;font-size:12px;"> <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} ${editHTML1}</span>
                  <div style="margin-left:auto">
                    <span class="menubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-text="${rt.text}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                      <img loading='lazy' src="/image/three-dots.svg">
                    </span>
                  </div>
                </div>
                <div class="quoted-body">
                  ${titleHTML1}
                  <div class=post-body style="margin: 0;margin-bottom:10px;">${parsedText}</div> 
                  ${translateHTML2} 
                  ${pollHTML2}
                  ${rtcontainsSpoiler ?
                    `<div class="attachment spoiler-media" onclick="this.classList.add('revealed')" style="margin-bottom:20px;">
                      <div class="spoiler-overlay">
                        <div class="spoilertxt">sensitive</div>
                      </div>
                      <img loading='lazy' src="${rtsrc}" data-src="${rtsrc}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                    </div>` :
                    `<div class="attachment" style="margin-bottom:20px;">
                      <img loading='lazy' src="${rtsrc}" data-src="${rtsrc}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                    </div>`
                  }
                  ${info}
                </div>
              </div>` ;
          } else if (hasVideo && hasText) {
            let parsedText;
            if (t.retweettext) {
              parsedText = await parseMentionsToLinks(t.retweettext, rt.mentions || []);
            } else {
              parsedText = await parseMentionsToLinks(rt.text, rt.mentions || []);
            }
            vidRtId = rt.id ? `vid-${rt.id}` : `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
            const rtcontainsSpoiler = rt.sensitiveMedia === true;

            retweetHTML = `
              <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || t.communityId || null}">
                <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
                  <img loading='lazy' class="avatar" src="${escapeHTML(rtAvatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                  ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                    `${(rt.mentions && Object.values(rt.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }
                  <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
                  <span style="color:grey;font-size:12px;"> <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} ${editHTML1}</span>
                  <div style="margin-left:auto">
                    <span class="menubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-text="${rt.text}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                      <img loading='lazy' src="/image/three-dots.svg">
                    </span>
                  </div>
                </div>
                <div class="quoted-body">
                  ${titleHTML1}
                  <div class=post-body style="margin: 0;margin-bottom:10px;">${parsedText}</div> 
                  ${translateHTML2} 
                  ${pollHTML2}
                  ${rtcontainsSpoiler ?
                    `<div class="attachment spoiler-media" style="margin-bottom:15px" onclick="this.classList.add('revealed')">
                      <div class="spoiler-overlay">
                        <div class="spoilertxt">sensitive</div>
                      </div>
                      <video id="${vidRtId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                        Your browser does not support the video tag.
                      </video>
                    </div>` :
                    `<div class="attachment" style="margin-bottom:15px">
                      <video id="${vidRtId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                        Your browser does not support the video tag.
                      </video>
                    </div>`
                  }
                  ${info}
                </div>
              </div>
              `;
            getSupabaseVideo(rt.media, vidRtId);
          } else {
            let parsedText;
            if (t.retweettext) {
              parsedText = await parseMentionsToLinks(t.retweettext, rt.mentions || []);
            } else {
              parsedText = await parseMentionsToLinks(rt.text, rt.mentions || []);
            }
            
            retweetHTML = `
            <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || t.communityId || null}">
                <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
                  <img loading='lazy' class="avatar" src="${escapeHTML(rtAvatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                  ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                    `${(rt.mentions && Object.values(rt.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }
                  <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
                  <span style="color:grey;font-size:12px;"> <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} ${editHTML1}</span>
                  <div style="margin-left:auto">
                    <span class="menubtn" data-text="${rt.text}" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                      <img loading='lazy' src="/image/three-dots.svg">
                    </span>
                  </div>
                </div>
                <div class="quoted-body" style="margin-bottom:22px;">
                  ${titleHTML1}
                  <div class=post-body style="margin: 0;margin-bottom:15px;">${parsedText}</div> 
                  ${translateHTML2} 
                  ${pollHTML2}
                  ${info}
                </div>
              </div>`;
          }
        }
      }
    } else {
      retweetHTML = `
        <div class="quoted-comment">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
          <img loading='lazy' class="avatar" src="/image/default-avatar.jpg" width="30">
          <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
            <span style="color:grey;font-size:12px;">
              <img loading='lazy' src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
            </span>
          </div>
          <div class="quoted-body" style="margin-bottom:22px;">
            <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this Wynt is unavailable</i></p>
          </div>
        </div>`;
    }
  }
  const parsedText = await parseMentionsToLinks(t.text, t.mentions || []);
  let pollHTML = "";
  if (t.poll && Array.isArray(t.poll.options)) {
    const uid = auth.currentUser?.uid;
    let myVoteIndex = null;
    if (uid) {
      let voteRef;
      if (window.communityID != null && isFromMain == false) {
        voteRef = doc(db, "communities", window.communityID, "posts", tweetId, "votes", uid);
      } else if (comid) {
        voteRef = doc(db, "communities", comid, "posts", tweetId, "votes", uid);
      } else {
        voteRef = doc(db, "tweets", tweetId, "votes", uid);
      }
      const voteSnap = await getDoc(voteRef);
      if (voteSnap.exists()) {
        myVoteIndex = voteSnap.data().optionIndex;
      }
    }
    pollHTML = renderPoll(t, tweetId, myVoteIndex);
  }
  let communityHTML = "";
  let titleHTML = "";
  if (t.title) {
    titleHTML = `<h3 style="margin:10px 0;">${escapeHTML(t.title)}</h3>`
  }
  if (t.communityId && window.communityID == null) {
    const communityName = await getCommunityNameById(t.communityId);
    communityHTML = `
    <div style="cursor:pointer;display:flex;gap:5px;color:grey;margin:5px 0;margin-top:10px;align-items:center;">
      <img loading='lazy' height="17" src="/image/community-filled.svg">
      <span style="font-size:14px;" class="communityLink" ${t.postedInPublic ? `data-tweet=${t.connectedWynt}` : ""} data-id="${t.communityId}">posted in @${escapeHTML(communityName)}</span>
    </div>`;
  } else if (t.sharedFromCommunity && window.communityID == null) {
    const communityName = await getCommunityNameById(t.sharedFromCommunity);
    communityHTML = `
    <div style="cursor:pointer;display:flex;gap:5px;color:grey;margin:5px 0;margin-top:10px;align-items:center;">
      <img loading='lazy' height="17" src="/image/community-filled.svg">
      <span style="font-size:14px;" class="communityLink" ${t.postedInPublic ? `data-tweet=${t.connectedWynt}` : ""} data-id="${t.sharedFromCommunity}">posted in @${escapeHTML(communityName)}</span>
    </div>`;
  }

  let editHTML = "";
  if (t.edited && t.editAfterComment) {
    editHTML = `
      <img src="/image/editicon.svg" title="edited at ${formatTime(t.edited)}. click me" class="editedatt edit2">
  `
  }
  const defaultLanguage = getDefaultLanguage();
  const isTranslate = isTranslateEnabled();
  let translateHTML3 = "";
  if (t.language && t.language !== defaultLanguage && isTranslate) {
    const random = Math.floor(Math.random() * 10000);
    translateHTML3 = `
          <div class="translate-wrapper" style="margin-top:-10px;margin-bottom:5px;
      ">
            <span
              class="translate-btn"
              data-id="${tweetId}"
              data-random="${random}"
              data-from="${t.language}"
              data-to="${defaultLanguage}"
              data-text="${t.text}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;"
            >
              Translate from ${t.language}
            </span>
            <div
              id="translated-${tweetId}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;"
            ></div>
          </div>
        `;
  }
  
  let tweetHTML = "";

  if (t.archived && auth.currentUser.uid != t.uid && !t.viewPermission?.includes(auth.currentUser.uid) && !t.allowAnyoneWithLink && currentUserRole != "admin") {
    tweetHTML = `         
    <div class="tweet" id="tweet-${tweetId}" data-id="${tweetId}" ${t.communityId ? `data-community-id="${t.communityId}"` : ""}>
    ${quotedHTML}
    ${retweetHTML}
    <div class="flex" style="gap:10px;margin:0;">
      <img class="avatar" src="/image/default-avatar.jpg" onerror="this.src='/image/default-avatar.jpg'" width="30" />
      <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer;font-size:17px;">System</strong>
      <span style="color:#757779;font-size:12px">${dateStr}</span>
    </div>
      <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 15px 0px 0;color:grey">This Wynt is archived</p>
    </div>`
  } else {
    if (x.banned === true && currentUserRole != "admin") {
      tweetHTML = `         
      <div class="tweet" id="tweet-${tweetId}" data-id="${tweetId}" ${t.communityId ? `data-community-id="${t.communityId}"` : ""}>
      ${quotedHTML}
      ${retweetHTML}
      <div class="flex" style="gap:10px;margin:0;">
        <img class="avatar" src="/image/default-avatar.jpg" onerror="this.src='/image/default-avatar.jpg'" width="30" />
        <strong class="user-link" data-uid="${t.uid}" style="cursor:pointer;font-size:17px;">Suspended user</strong>
        <span style="color:#757779;font-size:12px">${dateStr}</span>
      </div>
        <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 15px 0px 0;color:grey">This Wynt is from a suspended user</p>
      </div>`;
    } else {
      tweetHTML = `         
      <div class="tweet" id="tweet-${tweetId}" data-id="${tweetId}" ${t.communityId ? `data-community-id="${t.communityId}"` : ""}>
      ${quotedHTML}
      ${retweetHTML}
      <div class="flex" style="gap:10px;margin:0;">
        <img class="avatar" src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30" />
        ${x.suspended && x.suspendedUntil > Timestamp.now() ? "⚠️" :
          `${((t.mentions && Object.values(t.mentions).includes(auth.currentUser.uid))) ?
            `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
            ""
          }`
        }
        <strong class="user-link" data-uid="${t.uid}" style="cursor:pointer;font-size:17px;">${escapeHTML(displayName)}</strong>
        <span style="color:#757779;font-size:12px"><span class="usernamee">@${username} •</span> ${dateStr} ${editHTML}</span>
        ${t.archived ? `<img title="archived" src="/image/archive.svg">` : ""}
        <span style="cursor:pointer;margin-left:auto" data-community-id="${comid || t.sharedFromCommunity || t.communityId || null}" data-id=${tweetId} data-text="${t.text}" data-author="${t.uid}" ${isStored ? `data-stored="true"` : ""} class="menubtn"><img src="/image/three-dots.svg"></span>
      </div>
      ${communityHTML}
      ${titleHTML}
      <div class="post-body">${parsedText}</div> 
      ${translateHTML3} 
      <div class="tweet-media">
        ${mediaHTML}
      </div>
      ${pollHTML}
      ${t.isHidden ? "" : `
          <div class="flex">
            <span style="cursor:pointer;color:#757779" data-community-id="${window.communityId || null}" class="like-btn" id="likeBtn-${tweetId}">
              <div id="${likeId}" class="likeicon" style="height:20px">
                <img loading='lazy' src="/image/heart.svg">
              </div>
              ${likeCount > 0 ? `<span id="likeCount-${tweetId}">${likeCount}</span>` : ""}
            </span>
            <span style="cursor:pointer;color:#757779" class="comment-btn" data-id="${tweetId}">
              <img src="/image/message.svg"> ${commentCount > 0 ? commentCount : ""}
            </span>
            <span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${tweetId}">
              <img src="/image/rewint.svg"> ${retweetCount > 0 ? retweetCount : ""}
            </span>
            <div style="margin-left:auto;">
              <span class="viewbtn" style="margin-left:10px;color:#757779"><img src="/image/chart.svg"> ${viewCount > 0 ? viewCount : ""}</span>
            </div>
          </div>  
      `}
      ${retweetCount > 0 ? `
        <div style="width:100%;display:flex;align-items:center;cursor:pointer;">
          <span 
          data-tweet="${tweetId}"
          ${((t.communityId && !t.postedInPublic) || (window.communityID)) ? `
            data-community="${t.communityId && !t.postedInPublic ? t.communityId : window.communityID}"  
          ` : ""}
          class="viewQuotes"
          style="font-size:14px;margin-left:auto;margin-top:10px;color:grey">View quotes</span>
        </div>  
      ` : ""}
      </div>
      `;
    }
  }

  container.innerHTML = tweetHTML;

  if (likeId) {
    const likeEl = container.querySelector(`#${likeId}`);
    if (likeEl) getSnap(likeRef, likeEl);
  }
  if (t.retweetOfComment && likeId1) { 
    const likeEl1 = container.querySelector(`#${likeId1}`);
    if (likeEl1) getSnap(likeRef1, likeEl1);
  }
  if ((t.retweetOf || t.originalId) && likeId2) {
    const likeEl2  = container.querySelector(`#${likeId2}`);
    if (likeEl2) getSnap(likeRef2, likeEl2)
  }

  if (editHTML != "") { if (t.editAfterComment) {
    container.querySelector(".edit2").onclick = () => {
      showOriginal(t.originalText, t.mentions || [], t.originalTitle)
    };
  }}
  if (editHTML1 != "") { if (rt.editAfterComment) {
    container.querySelector(".edit1").onclick = () => {
      showOriginal(rt.originalText, rt.mentions || [], rt.originalTitle)
    };
  }}
  if (editHTML3 != "") { if (comment.editAfterComment) {
    container.querySelector(".edit0").onclick = () => {
      showOriginal(comment.originalText, comment.mentions || []);
    };
  }}

  const newTweet = container.querySelector(`#tweet-${tweetId}`);
  if (newTweet) {
    applyReadMoreLogic(newTweet);
  }
  document.getElementById("commentList").classList.remove("hidden");

  if (window.communityID) {
    incrementViews(tweetId, null, window.communityID);
  } else if (comid) {
    incrementViews(tweetId, null, comid);
  } else {
    incrementViews(tweetId, null, null);
  }
}

export async function viewTweet(tweetId, comid) {
  const overlay = document.getElementById("tweetViewer");
  const container = overlay.querySelector("#appendTweet");
  container.innerHTML = "";
  overlay.classList.remove("hidden");
  document.body.classList.add('no-scroll');

  let tweetDoc;
  if (window.communityID != null) {
    tweetDoc = await getDoc(doc(db, "communities", window.communityID, "posts", tweetId));
  } else if (comid) {
    tweetDoc = await getDoc(doc(db, "communities", comid, "posts", tweetId));
  } else {
    tweetDoc = await getDoc(doc(db, "tweets", tweetId));
  }

  if (!tweetDoc.exists()) {
    document.getElementById("commentList").innerHTML = "";
    container.innerHTML = `
      <div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;padding:0 20px;"><h2 style="margin:0;">No Wynt found</h2><p style="color:grey;margin:7px 0;">seems like this Wynt have been deleted or you don't have permission to view it.</p></div></div>
    `;
    return null;
  }

  const tweetData = tweetDoc.data();

  renderTweetViewer(tweetData, tweetId, container, auth.currentUser, comid || null);
  if (comid) openCommunity(comid);

  if (!(tweetData.archived && auth.currentUser.uid != tweetData.uid && !tweetData.viewPermission?.includes(auth.currentUser.uid) && !tweetData.allowAnyoneWithLink && currentUserRole != "admin")) {
    loadComments(tweetId, true, null, document.getElementById("commentList"), comid || null);
  }
}

document.body.addEventListener("click", async (e) => {
  const link = e.target.closest(".original-tweet-link, .actuallyATweet, .tweet, .quoted-comment.actuallyATweet, .card-tweet");
  if (!link) return;
  const tweetId = link.dataset.id;
  const rawId = link.dataset.communityId;

  const isStored = link.dataset.stored == "true";
  const communityId = rawId && rawId !== "null" ? rawId : null;
  const tweetViewer = document.getElementById("tweetViewer");
  const box = tweetViewer.querySelector("#appendTweet");

  if (e.target.closest('.tag-link') || 
      e.target.closest(".user-link") || 
      e.target.closest(".commentTweet") || 
      e.target.closest(".comment-btn") || 
      e.target.closest(".like-btn") || 
      e.target.closest(".viewbtn") || 
      e.target.closest(".menubtn") || 
      e.target.closest(".retweet-btn") || 
      e.target.closest(".tweet-menu") || 
      e.target.closest(".attachment") || 
      e.target.closest(".attachment2") || 
      e.target.closest("#commentTweet") || 
      e.target.closest("#retweetOverlay #retweetOriginal") || 
      e.target.closest(".vote-btn") ||
      (
        e.target.closest(".quoted-comment") && 
        !e.target.closest(".actuallyATweet") &&
        !e.target.closest(".retweet")
      ) ||
      e.target.closest("#appendEdit .tweet") || 
      e.target.closest(".spoilerr") || 
      e.target.closest(".communityLink") || 
      e.target.closest("#replyComment") || 
      e.target.closest("video") || 
      e.target.closest(".internal-link") || 
      e.target.closest(".translate-btn") ||
      e.target.closest("a") ||
      e.target.closest(".morereplies1") ||
      e.target.closest(".viewQuotes") ||
      e.target.closest(".editedatt") ||
      (
        e.target.closest(".body-quote") &&
        !e.target.closest(".card-tweet")        
      )
  ) {
    return;
  }

  document.getElementById("quoteViewer").classList.add("hidden");

  box.innerHTML = `
    <div class="skeleton-card">
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
    </div>`;

  document.getElementById("commentList").innerHTML = ``;
  e.preventDefault();
  tweetViewer.classList.remove("hidden");
  document.getElementById("commentViewer").classList.add("hidden");
  document.body.classList.add("no-scroll");

  let tweetRef;
  if (communityId) {
    tweetRef = doc(db, "communities", communityId, "posts", tweetId);
  } else if (window.communityID) {
    tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
  } else {
    tweetRef = doc(db, "tweets", tweetId);
  }

  const tweetSnap = await getDoc(tweetRef);
  if (!tweetSnap.exists()) {
    document.getElementById("commentList").innerHTML = "";
    box.innerHTML = `
      <div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;padding:0 20px;"><h2 style="margin:0;">No Wynt found</h2><p style="color:grey;margin:7px 0;">seems like this Wynt have been deleted or you don't have permission to view it.</p></div></div>
    `;
    return;
  }

  const tweetData = tweetSnap.data();
  renderTweetViewer(tweetData, tweetId, box, auth.currentUser, communityId, false, isStored);
  if (tweetData.archived && auth.currentUser.uid != tweetData.uid && !tweetData.viewPermission?.includes(auth.currentUser.uid) && !tweetData.allowAnyoneWithLink && currentUserRole != "admin") return;
  loadComments(tweetId, true, null, null, communityId);
});

document.getElementById("tweetviewerclose").addEventListener("click", async () => {
  const overlay = document.getElementById("tweetViewer");
  overlay.classList.add("hidden");
  history.pushState({}, '', '/');
});

const COMMENTS_PAGE = 10;
const commentSearchInput = document.querySelector("#commentSearch input");
const appendCommentSearch = document.getElementById("appendCommentSearch");
window.previousCommentTerm = "";

commentSearchInput.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  /*
  if (!document.querySelector("#tweetViewer #appendTweet .tweet") && !document.querySelector("#commentViewer #appendComment #actuallyATweet")) {
    log("red", "please wait and try again");
    return;
  }
  */

  const term = commentSearchInput.value.trim();
  if (term === window.previousCommentTerm) return;

  window.previousCommentTerm = term;
  appendCommentSearch.innerHTML = "";

  if (term.length < 1) {
    appendCommentSearch.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:300px;text-align:left;">
          <h2 style="margin:0;display:flex;gap:10px;"><img height="33" style="transform:rotate(90deg)" src="/image/search.svg"> Search for Replies</h2>
        </div>
      </div>`;
    return;
  }

  let currentTweetId;
  if (!document.getElementById("tweetViewer").classList.contains("hidden")) {
    currentTweetId = document.querySelector("#tweetViewer #appendTweet .tweet").dataset.id;
  } else if (document.getElementById("tweetViewer").classList.contains("hidden") && !document.getElementById("commentViewer").classList.contains("hidden")) {
    currentTweetId = document.querySelector("#commentViewer #appendComment .comment").dataset.tweet;
  }

  if (!document.getElementById("commentViewer").classList.contains("hidden") && document.querySelector("#commentViewer #appendComment .comment")) {
    const comment = document.querySelector("#commentViewer #appendComment .comment").dataset.id;
    await loadComments(currentTweetId, true, comment, appendCommentSearch, window.communityID, term);
  } else {
    await loadComments(currentTweetId, true, null, appendCommentSearch, window.communityID, term);
  }
});

async function searchComments(term, reset = true) {
  const words = tokenize(term);
  if (words.length === 0) return [];

  const searchList = words.slice(0, 10);
  if (reset) lastCommentDoc = null;

  const base = [
    where("searchTokens", "array-contains-any", searchList),
    orderBy("createdAt", "desc"),
    limit(COMMENTS_PAGE)
  ];

  const col = window.communityID ? 
    collection(db, "communities", window.communityID, "posts", currentTweetId, "comments") : 
    collection(db, "tweets", currentTweetId, "comments");
  const q = lastCommentDoc ? 
    query(col, ...base, startAfter(lastCommentDoc)) : 
    query(col, ...base);

  const snap = await getDocs(q);
  console.log(snap)
  const mustHaveAll = true;
  const results = [];

  snap.forEach(docSnap => {
    const d = docSnap.data();
    if (!mustHaveAll || words.every(w => (d.searchTokens || []).includes(w))) {
      results.push({
        id: docSnap.id,
        ...d
      });
    }
  });

  if (results.length === 0) {
    appendCommentSearch.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:300px;text-align:left;">
          <h2 style="margin:0;">No results</h2>
          <p style="color:grey;margin:7px 0;">Seems like we couldn't find what you're looking for. Try searching for another query.</p>
        </div>
      </div>`;
    lastCommentDoc = snap.docs[snap.docs.length - 1];
    return;
  }
  return results;
}

document.addEventListener("mousedown", (e) => {
  if (e.button !== 2) return;
  e.preventDefault();
  if (e.target.closest(".user-link")) return;

  const link = e.target.closest(".original-tweet-link, .actuallyATweet, .tweet");
  if (!link) return;

  const tweetId = link.dataset.id;
  if (!tweetId) return;

  const rawCommunityId = link.dataset.communityId;
  const communityId = rawCommunityId && rawCommunityId !== "null" ? rawCommunityId : null;
  const url = communityId ? `https://wyntr.netlify.app/community/${communityId}/wynt/${tweetId}` : `https://wyntr.netlify.app/wynt/${tweetId}`;

  e.preventDefault();
  window.open(url, "_blank", "noopener");
});

async function renderparent(sharedfromcommunity, comid, tweetId, parentId, element, isFromMain) {
    document.getElementById(`more-replies-${element}`).textContent = "loading...";
    document.getElementById(`more-replies-${element}`).style.textDecoration = "none";

    let commentRef, quotedHTML, likeRef;
    let likeId = "";

    if (window.communityID != null) {
      commentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", parentId);
      likeRef = `communities/${window.communityID}/posts/${tweetId}/comments/${parentId}/likes/${auth.currentUser.uid}`;
    } else if (comid != null && comid != "null" && comid != "undefined" && comid != undefined) {
      commentRef = doc(db, "communities", comid, "posts", tweetId, "comments", parentId);
      likeRef = `communities/${comid}/posts/${tweetId}/comments/${parentId}/likes/${auth.currentUser.uid}`;
    } else if (sharedfromcommunity != null && sharedfromcommunity != "null" && sharedfromcommunity != "undefined" && sharedfromcommunity != undefined) {
      commentRef = doc(db, "communities", sharedfromcommunity, "posts", tweetId, "comments", parentId);
      likeRef = `communities/${sharedfromcommunity}/posts/${tweetId}/comments/${parentId}/likes/${auth.currentUser.uid}`;
    } else {
      commentRef = doc(db, "tweets", tweetId, "comments", parentId);
      likeRef = `tweets/${tweetId}/comments/${parentId}/likes/${auth.currentUser.uid}`
    }


    let editHTML3 = "";
    let comment;

    const commentSnap = await getDoc(commentRef);
    if (commentSnap.exists()) {
      comment = commentSnap.data();
      const { username, avatar, displayName, d } = await getUserData(comment.uid);
      const parsedCommentText = await parseMentionsToLinks(comment.text || "", comment.mentions || []);
      const hasImage = comment.media && comment.mediaType === "image";
      const hasVideo = comment.media && comment.mediaType === "video";
      const hasText = comment.text?.trim()?.length > 0;

      likeId = randomString(14);

      let donationHTML = "";
      if (comment.donationReceived) {
        donationHTML = `
          <span style="color:#0485b7;font-size:15px;padding-bottom:10px;display:block">
            <img draggable="false" class="emoji" alt="🎁" src="https://ox7jbzyn-13kwt53x-purp2e2u.netlify.app/twemoji/svg/1f381.svg"> Gifted <span style="color:#f91880;font-weight:bold;">${formatNumber(comment.donationReceived)}</span> Wcoins
          </span>
        `;
      }

      if (comment.edited && comment.editAfterComment) {
        editHTML3 = `
        <img src="/image/editicon.svg" title="edited at ${formatTime(comment.edited)} click me" class="editedatt">
        `
      }

      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();

      let translateHTML = "";
      if (comment.language && comment.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML = `
          <div class="translate-wrapper" style="margin-top:-10px;margin-bottom:5px;">
            <span
              class="translate-btn"
              data-id="${parentId}"
              data-random="${random}"
              data-from="${comment.language}"
              data-to="${defaultLanguage}"
              data-text="${comment.text}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;">
              Translate from ${comment.language}
            </span>
            <div
              id="translated-${parentId}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;">
            </div>
          </div>
        `;
      }

      let pollHTML = "";
      if (comment.poll && Array.isArray(comment.poll.options)) {
        const uid = auth.currentUser?.uid;
        let myVoteIndex = null;
        if (uid) {
          let voteRef;
          if (window.communityID != null) {
            voteRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", parentId, "votes", uid);
          } else {
            voteRef = doc(db, "tweets", tweetId, "comments", parentId, "votes", uid);
          }
          const voteSnap = await getDoc(voteRef);
          if (voteSnap.exists()) {
            myVoteIndex = voteSnap.data().optionIndex;
          }
        }
        pollHTML = renderPoll1(comment, tweetId, parentId, myVoteIndex);
      }

      const random = randomString(14);

      const infos = `
          <div class="flex" style="margin:0;gap:25px;">
            ${comment.isHidden ? "" : `
            <span class="comment-like-btn" data-id="${parentId}" data-tweet="${tweetId}" style="cursor:pointer;display:flex;align-items:center;gap:3px;">
              <div id="${likeId}" class="clikeicon" style="height:20px">
                <img loading='lazy' src="/image/heart.svg">
              </div>
              <span style="color:#757779;" id="comment-like-count-${parentId}">${comment.likeCount > 0 ? comment.likeCount : ""}</span>
            </span>
            <span style="cursor:pointer;color:#757779" class="reply-btn" data-id="${parentId}" data-tweet="${tweetId}">
              <img loading='lazy' src="/image/message.svg"> ${(comment.replyCount ?? 0) > 0 ? comment.replyCount : ""}
            </span>
            <span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${tweetId}" data-comment-id="${parentId}">
              <img loading='lazy' src="/image/rewint.svg"> ${(comment.retweetCount ?? 0) > 0 ? comment.retweetCount : ""}
            </span>
            <div style="margin-left:auto;">
              <span class="viewbtn" style="margin-left:10px;color:#757779"><img loading='lazy' src="/image/chart.svg"> ${comment.viewsCount > 0 ? comment.viewsCount : ""}</span>
            </div>`
            }
          </div>
      `;
      
      if (d.banned === true && currentUserRole != "admin") {
          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
          <div class="quoted-comment renderedparent" data-id="${tweetId}" data-community-id="${sharedfromcommunity || null}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              <strong class="user-link" data-uid="${comment.uid}"  style="cursor:pointer">Suspended user</strong>
              <span style="color:grey;font-size:12px;">
                ${formatDate(comment.createdAt)}
              </span> 
            </div>
            <div class="quoted-body">
              <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 6px;color:grey">This reply is from a suspended user</p>
            </div>
          </div>`;
      } else {
        if (hasImage && hasText) {
          const containsSpoiler = comment.sensitiveMedia === true;
          const src = base91ToImageSrc(comment.media.url);
          const path = `${tweetId}-${parentId}`;
          const content = `
            <div class=post-body style="margin: 0px 0px 15px;">${parsedCommentText}</div> 
            ${translateHTML} 
            ${containsSpoiler ?
                `<div class="attachment spoiler-media" style="margin-bottom:25px" onclick="this.classList.add('revealed')">
                  <div class="spoiler-overlay">
                    <div class="spoilertxt">sensitive</div>
                  </div>
                  <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                </div>` :
                `<div class="attachment" style="margin-bottom:25px">
                  <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                </div>`
            }
            ${donationHTML}
            ${pollHTML}
          `

          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
            <div class="quoted-comment renderedparent" data-community-id="${sharedfromcommunity || null}" data-id="${tweetId}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${comment.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)} ${editHTML3}
              </span>
              <div style="margin-left:auto">
                <span class="cmenubtn" data-text="${comment.text}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${comment.uid}">
                  <img src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
            ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
            ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
            </div>` : `
            ${content}
            `}
            ${infos}
            </div>
            </div>
            `;
        } else if (hasVideo && hasText) {
          vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          const containsSpoiler = comment.sensitiveMedia === true;
          const path = `${tweetId}-${parentId}`;
          const content = `
            <div class=post-body style="margin: 0px 0px 15px;">${parsedCommentText}</div> 
            ${translateHTML}
            ${containsSpoiler ?
              `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                <div class="spoiler-overlay">
                  <div class="spoilertxt">sensitive</div>
                </div>
                <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                  Your browser does not support the video tag.
                </video>
                </div>` :
                `<div class="attachment" style="margin-bottom:5px">
                  <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                    Your browser does not support the video tag.
                  </video>
                </div>`
            }
            ${donationHTML}
            ${pollHTML}
          `

          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
            <div class="quoted-comment renderedparent" data-id="${tweetId}" data-community-id="${sharedfromcommunity || null}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
              `${comment.likedByCreator === true ? 
                `<img style="margin-right:-3px" src="/image/star.svg">` :
                `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                  `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                  ""
                }`
              }`
            }
            <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)} ${editHTML3}
              </span>
            <div style="margin-left:auto">
              <span class="cmenubtn" data-text="${comment.text}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${comment.uid}">
                <img src="/image/three-dots.svg">
              </span>
            </div>
            </div>
            <div class="quoted-body">
            ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
            ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
            </div>` : `
            ${content}
            `}
            ${infos}
            </div>
            </div>
            `;
          getSupabaseVideo(comment.media.url, vidId);

        } else if (hasImage) {
          const src = base91ToImageSrc(comment.media.url);
          const path = `${tweetId}-${parentId}`;
          const content = `
            <div class="attachment">
              <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
            </div>
            ${donationHTML}
            ${pollHTML}
          `;

          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
            <div class="quoted-comment renderedparent" data-id="${tweetId}" data-community-id="${sharedfromcommunity || null}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${comment.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link"   data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
              </span>
              <div style="margin-left:auto"><span class="cmenubtn" data-text="${comment.text}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${comment.uid}">
                <img src="/image/three-dots.svg">
              </span></div>
            </div>
            <div class="quoted-body">
            ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
            ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
            </div>` : `
            ${content}
            `}
            ${infos}
            </div>
          </div>`;

        } else if (hasVideo) {
          vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          const path = `${tweetId}-${parentId}`;
          const content = `
            <div class="attachment" style="margin-bottom:5px">
              <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                Your browser does not support the video tag.
              </video>
            </div>
            ${donationHTML}
            ${pollHTML}
          `;

          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
          <div class="quoted-comment renderedparent"  data-id="${tweetId}" data-community-id="${sharedfromcommunity || null}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${comment.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link"   data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
              </span>
              <div style="margin-left:auto"><span class="cmenubtn" data-text="${comment.text}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${comment.uid}">
                <img src="/image/three-dots.svg">
              </span></div>
            </div>
            <div class="quoted-body">
            ${comment.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${comment.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${comment.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
            ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
            </div>` : `
            ${content}
            `}
            ${infos}
            </div>
          </div>`;

          getSupabaseVideo(comment.media.url, vidId);
        } else {
          const path = `${tweetId}-${parentId}`;
          const content = `
            <div class=post-body style="margin: 6px 0px 12px;margin-top:6px;">${parsedCommentText}</div> 
            ${translateHTML}
            ${donationHTML}
            ${pollHTML}
          `;

          quotedHTML = `
            ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
            <div id="${path}"></div>
          <div class="quoted-comment renderedparent" data-id="${tweetId}" data-community-id="${sharedfromcommunity || null}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${comment.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(comment.mentions && Object.values(comment.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)} ${editHTML3}
              </span> 
              <div style="margin-left:auto"><span class="cmenubtn" data-text="${comment.text}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${comment.uid}">
                <img src="/image/three-dots.svg">
              </span></div>
            </div>
            <div class="quoted-body">
            ${parent.isHidden ? `
              <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random}" onclick="
                  this.classList.add('hidden');
                  document.getElementById('commentItem-${random}').classList.remove('hidden');">
                  <p style="margin:0;font-size:15px;">This reply ${parent.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${parent.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
                </button>
                <div class="hidden" id="commentItem-${random}">
                ${content}
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <img src="/image/eye.svg">
                    <span style="color: grey; font-size: 13px;">
                      This reply is hidden ${comment.hiddenByAuthority ? `by moderators ${comment.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : ""}` : `${comment.hiddenByAdmin ? `by community admin ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}` : `by Wynt author ${comment.hiddenReason ? `(hidden for: ${comment.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
            </div>` : `
            ${content}
            `}
            ${infos}
            </div>
          </div>`;
        }
      }
    } else {
      quotedHTML = `
        <div class="quoted-comment renderedparent">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
          <img class="avatar" src="/image/default-avatar.jpg" width="30">
          <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
            <span style="color:grey;font-size:12px;">
              <img src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
            </span>
          </div>
          <div class="quoted-body">
          <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this reply is unavailable</i></p>
          </div>
        </div>`;
    }

    const el = document.getElementById(`${element}`);

    document.getElementById(`more-replies-${element}`).remove();
    el.innerHTML = quotedHTML;

    if (likeId) {
      const likeEl = el.querySelector(`#${likeId}`);
      if (likeEl) getSnap(likeRef, likeEl);
    }

    if (editHTML3 != "") { if (comment.editAfterComment) {
      container.querySelector(".editedatt").onclick = () => {
        showOriginal(comment.originalText, comment.mentions || [])
      };
    }}
}

window.renderparent = renderparent;