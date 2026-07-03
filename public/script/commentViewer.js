import { auth, db, doc, getDoc, setDoc, increment, updateDoc, Timestamp } from "./firebase.js";
import { formatDate, escapeHTML, parseMentionsToLinks, formatNumber, formatTime, getDefaultLanguage, isTranslateEnabled, randomString } from "./texts.js";
import { loadComments, getUserData, getCommunityNameById, getSnap, renderPoll, renderPoll1, currentUserRole, waitForAuth } from "./index.js";
import { getSupabaseVideo, base91ToImageSrc } from "./attachments.js";
import { showOriginal } from "./main.js";
import { incrementViews } from "./view_users.js";

await waitForAuth();
 
export async function renderCommentViewer(c, commentId, tweetId, container, communityId, isFromMain) {
  document.getElementById("replyList").classList.add("hidden");
  container.innerHTML = `<div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div>`;
  document.getElementById("replyList").innerHTML = "";
  let vidId = null;
  let parent1 = "";
  container.dataset.tweet = tweetId;

  const { username, avatar, displayName, d } = await getUserData(c.uid);
  const createdAt = formatDate(c.createdAt);
  const parsedText = await parseMentionsToLinks(c.text, c.mentions || []);

  let comid = "";

  let tweetRef;
  if (window.communityID && isFromMain == false) {
    tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
  } else if (communityId) {
    tweetRef = doc(db, "communities", communityId, "posts", tweetId);
  } else {
    tweetRef = doc(db, "tweets", tweetId);
  }

  const tweetSnap = await getDoc(tweetRef);
  const t = tweetSnap.data();

  let commentLikeRef;
  if (window.communityID && isFromMain == false) {
    commentLikeRef = `communities/${window.communityID}/posts/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    comid = window.communityID;
  } else if (communityId) {
    commentLikeRef = `communities/${communityId}/posts/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    comid = communityId;
  } else {
    commentLikeRef = `tweets/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`
  }

  const likeId = randomString(14);

  vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  let donationHTML = "";
  if (c.donationReceived) {
    donationHTML = `
    <span style="color:#0485b7;font-size:15px;padding-bottom:15px;display:block">
      <img draggable="false" class="emoji" alt="🎁" src="https://ox7jbzyn-13kwt53x-purp2e2u.netlify.app/twemoji/svg/1f381.svg"> Gifted <span style="color:#f91880;font-weight:bold;">${formatNumber(c.donationReceived)}</span> Wcoins
    </span>`;
  }

  if (c.isPrivate || c.isPrivateParent || c.isHidden) {
    window.isPrivateReply = true;
  } else { 
    window.isPrivateReply = false;
  }

    let privateHTML = "";
    if (c.isPrivate || c.isPrivateParent) {
      if (auth.currentUser.uid === c.uid) {
        privateHTML = `
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
          <img src="/image/eye.svg">
          <span style="color: grey; font-size: 13px;">
            only you and Wynt owner can see this
          </span>
        </div>
        `;
      } else if (auth.currentUser.uid === c.canReadPrivate) {
        privateHTML = `
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
          <img src="/image/eye.svg">
          <span style="color: grey; font-size: 13px;">
            only you and reply sender can see this
          </span>
        </div>
        `;
      }
    } 

  let mediaHTML = "";
  const containsSpoiler = c.sensitiveMedia === true;
  if (c.media && c.mediaType === "image") {
    const src = base91ToImageSrc(c.media.url);
    if (containsSpoiler) {
      mediaHTML = `
      <div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
        <div style="border-radius:10px;" class="spoiler-overlay">
          <div class="spoilertxt">SENSITIVE</div>
        </div>
        <img src="${src}" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin-bottom:5px;" onerror="this.onerror=null;this.src='/image/image-error.png';"/>
      </div>`;
    } else {
      mediaHTML = `
      <div class="attachment">
        <img src="${src}" onerror="this.onerror=null;this.src='/image/image-error.png';"/>
      </div>`;
    }
  } else if (c.media && c.mediaType === "video" && c.media.url) {
    if (containsSpoiler) {
      mediaHTML = `
      <div class="attachment spoiler-media" style="position: relative;" onclick="
        getSupabaseVideo('${c.media.url}', '${vidId}');
        this.classList.add('revealed')
      ">
        <div style="border-radius:10px;" class="spoiler-overlay">
          <div class="spoilertxt">sensitive</div>
        </div>
        <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">Your browser does not support the video tag.<</video> 
      </div>`;
    } else {
      mediaHTML = `
      <div class="attachment" style="position: relative;">
        <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">Your browser does not support the video tag.</video>
      </div>`;
      getSupabaseVideo(c.media.url, vidId);
    }
  }
  let communityHTML = "";
  let communityName = "";
  if (c.communityId && window.communityID == null) {
    communityName = await getCommunityNameById(c.communityId);
    communityHTML = `
      <div style="cursor:pointer;display:flex;gap:5px;color:grey;margin:5px 0;align-items:center;margin-top:10px;">
        <img loading='lazy' height="17" src="/image/community-filled.svg">
        <span style="font-size:14px;" class="communityLink" data-id="${c.communityId}">posted in @${escapeHTML(communityName)}</span>
    </div>`;
  }

  let editHTML = "";
  if (c.edited && c.editAfterComment) {
    editHTML = `       
      <img src="/image/editicon.svg" title="edited at ${formatTime(c.edited)}. click me" class="editedatt edit0">`
  }

  let parentReply = "";
  let likeId1 = "";
  let parentLikeRef;
  let translateHTML = "";
  let translateHTML1 = "";
  let parent;
  let quoted;
  let translateHTML2 = "";
  let editHTML2 = "";

  if (document.getElementById("tweetViewer").classList.contains("hidden") && c.parentId) {
    let parentRef;
    if (window.communityID != null && isFromMain == false) {
      parentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", c.parentId);
      parentLikeRef = `communities/${window.communityID}/posts${tweetId}/comments/${c.parentId}/likes/${auth.currentUser}`
    } else if (communityId) {
      parentRef = doc(db, "communities", communityId, "posts", tweetId, "comments", c.parentId);
      parentLikeRef = `communities/${communityId}/posts/${tweetId}/comments/${c.parentId}/likes/${auth.currentUser.uid}`
    } else {
      parentRef = doc(db, "tweets", tweetId, "comments", c.parentId);
      parentLikeRef = `tweets/${tweetId}/comments/${c.parentId}/likes/${auth.currentUser.uid}`;
    }

    likeId1 = randomString(14);

    const parentSnap = await getDoc(parentRef);
    if (parentSnap.exists()) {
      parent = parentSnap.data();

      let parsedparent = "";
      if (parent.text) {
        parsedparent = await parseMentionsToLinks(parent.text || "", parent.mentions || []);
      }

      const { username, avatar, displayName, d: data } = await getUserData(parent.uid);

      const hasText = parent.text?.trim()?.length > 0;
      const hasImage = parent.media && parent.mediaType === "image";
      const hasVideo = parent.media && parent.mediaType === "video";

      if (parent.edited && parent.editAfterComment) {
        editHTML2 = `
       <img src="/image/editicon.svg" title="edited at ${formatTime(parent.edited)} click me" class="editedatt edit1>
      `
      }

      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();

      if (parent.language && parent.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML = `
          <div class="translate-wrapper tr6" style="margin-top:-5px;margin-bottom:5px;
          ">
            <span
              class="translate-btn"
              data-id="${tweetId}"
              data-random="${random}"
              data-from="${parent.language}"
              data-to="${defaultLanguage}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;"
            >
              Translate from ${parent.language}
            </span>
            <div
              id="translated-${tweetId}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;"
            ></div>
          </div>
        `;
      }

        let pollHTML = "";
        if (parent.poll && Array.isArray(parent.poll.options)) {
          const uid = auth.currentUser?.uid;
          let myVoteIndex = null;
          if (uid) {
            let voteRef;
            if (window.communityID != null) {
              voteRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", c.parentId, "votes", uid);
            } else {
              voteRef = doc(db, "tweets", tweetId, "comments", c.parentId, "votes", uid);
            }
            const voteSnap = await getDoc(voteRef);
            if (voteSnap.exists()) {
              myVoteIndex = voteSnap.data().optionIndex;
            }
          }
          pollHTML = renderPoll1(parent, tweetId, c.parentId, myVoteIndex);
        }

      const infos = `
            <div class="flex" style="margin:0;gap:25px;">
              ${parent.isHidden ? "" : `
              <span class="comment-like-btn" data-id="${c.parentId}" data-tweet="${tweetId}" style="cursor:pointer;display:flex;align-items:center;gap:3px;">
                <div id="${likeId1}" class="clikeicon" style="height:20px">
                  <img loading='lazy' src="/image/heart.svg">
                </div>
                <span style="color:#757779;" id="comment-like-count-${c.parentId}">${parent.likeCount > 0 ? parent.likeCount : ""}</span>
              </span>
              <span style="cursor:pointer;color:#757779" class="reply-btn" data-id="${c.parentId}" data-tweet="${tweetId}">
                <img loading='lazy' src="/image/message.svg"> ${(parent.replyCount ?? 0) > 0 ? parent.replyCount : ""}
              </span>
              ${parent.isPrivateParent || parent.isPrivate ? "" :
                `<span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${tweetId}" data-comment-id="${c.parentId}">
                  <img loading='lazy' src="/image/rewint.svg"> ${(parent.retweetCount ?? 0) > 0 ? parent.retweetCount : ""}
                </span>`
              }
              <span class="viewbtn" style="margin-left:auto;color:#757779"><img loading="lazy" src="/image/chart.svg"> ${parent.viewsCount > 0 ? parent.viewsCount : ""}</span>
              `
              }
            </div>
      `

      const random = randomString(14);

      if (data.banned === true && currentUserRole != "admin") {
          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer">Suspended user</strong>
              <span style="color:grey;font-size:12px;">
                ${formatDate(parent.createdAt)}
              </span>
            </div>
            <div class="quoted-body">
              <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 6px;color:grey">This reply is from a suspended user</p>
            </div>
          </div>`;
      } else {
        if (hasImage && hasText) {
          const containsSpoiler = parent.sensitiveMedia === true;
          const src = base91ToImageSrc(parent.media.url);
          const path = `${tweetId}-${commentId}`;
          const content = `
              <div class=post-body style="margin:0;">${parsedparent}</div>
              ${translateHTML}
              ${containsSpoiler ?
                  `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                    <div class="spoiler-overlay">
                      <div class="spoilertxt">sensitive</div>
                    </div>
                    <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                  </div>` :
                  `<div class="attachment" style="margin-bottom:5px">
                    <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                  </div>`
              }
              ${pollHTML}
          `;

          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${data.suspended && data.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${parent.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(parent.mentions && Object.values(parent.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
              <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} ${editHTML2}</span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${c.parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" data-text="${parent.text}" class="cmenubtn">
                <img src="/image/three-dots.svg">
              </span>
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
                      This reply is hidden ${parent.hiddenByAuthority ? `by moderators ${parent.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : ""}` : `${parent.hiddenByAdmin ? `by community admin ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : `by Wynt author ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
              </div>` : `
              ${content}
              `}
              ${infos}
            </div>
          </div>`;
        } else if (hasVideo && hasText) {
          const vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const containsSpoiler = parent.sensitiveMedia === true;
          const path = `${tweetId}-${commentId}`;
          const content = `
              <div class=post-body style="margin:0;">${parsedparent}</div> 
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
              ${pollHTML}
          `;

          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${data.suspended && data.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${parent.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(parent.mentions && Object.values(parent.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
              <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} ${editHTML2}</span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${c.parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" data-text="${parent.text}" class="cmenubtn">
                <img src="/image/three-dots.svg">
              </span>
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
                      This reply is hidden ${parent.hiddenByAuthority ? `by moderators ${parent.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : ""}` : `${parent.hiddenByAdmin ? `by community admin ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : `by Wynt author ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
              </div>` : `
              ${content}   
              `}
              ${infos}
            </div>
          </div>`;
          getSupabaseVideo(parent.media.url, vidId);
        } else if (hasVideo) {
          const vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const containsSpoiler = parent.sensitiveMedia === true;
          const path = `${tweetId}-${commentId}`;
          const content = `
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
              ${pollHTML}
          `;

          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${data.suspended && data.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${parent.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(parent.mentions && Object.values(parent.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
              <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} </span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${c.parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" data-text="${parent.text}" class="cmenubtn">
                <img src="/image/three-dots.svg">
              </span>
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
                      This reply is hidden ${parent.hiddenByAuthority ? `by moderators ${parent.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : ""}` : `${parent.hiddenByAdmin ? `by community admin ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : `by Wynt author ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
              </div>` : `
              ${content}
              `}
              ${infos}
            </div>
          </div>`;
          getSupabaseVideo(parent.media.url, vidId);
        } else if (hasImage) {
          const containsSpoiler = parent.sensitiveMedia === true;
          const src = base91ToImageSrc(parent.media.url);
          const path = `${tweetId}-${commentId}`;
          const content = `
            ${containsSpoiler ?
              `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                <div class="spoiler-overlay">
                  <div class="spoilertxt">sensitive</div>
                </div>
                <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
              </div>` :
              `<div class="attachment" style="margin-bottom:5px">
                <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
              </div>`
            }
          ${pollHTML}
          `;

          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${data.suspended && data.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${parent.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(parent.mentions && Object.values(parent.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
              <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} </span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${c.parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" data-text="${parent.text}" class="cmenubtn">
                <img src="/image/three-dots.svg">
              </span>
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
                      This reply is hidden ${parent.hiddenByAuthority ? `by moderators ${parent.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : ""}` : `${parent.hiddenByAdmin ? `by community admin ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : `by Wynt author ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
              </div>` : `
              ${content}        
              `}
              ${infos}
            </div>
          </div>`;
        } else {
          const path = `${tweetId}-${commentId}`;
          const content = `
            <div class=post-body style="margin:6px 0 12px;">${parsedparent}</div> 
            ${translateHTML}
            ${pollHTML}
          `;

          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" 
                onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${data.suspended && data.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${parent.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(parent.mentions && Object.values(parent.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer">
                ${escapeHTML(displayName || 'Unknown')}
              </strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} ${editHTML2}
              </span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${parent.communityId || null}" data-author="${parent.uid}" data-id="${c.parentId}" data-tweet="${tweetId}" data-text="${parent.text}" class="cmenubtn"><img src="/image/three-dots.svg"></span>
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
                      This reply is hidden ${parent.hiddenByAuthority ? `by moderators ${parent.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : ""}` : `${parent.hiddenByAdmin ? `by community admin ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : `by Wynt author ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}`}`}
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
      parentReply = `
      <div style="padding-top:0;" class="quoted-comment quotedTweet">
        <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
        <img class="avatar" src="/image/default-avatar.jpg" width="30">
        <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
          <span style="color:grey;font-size:12px;">
            <img src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
          </span>
        </div>
        <div class="quoted-body">
        <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this Reply is unavailable</i></p>
        </div>
      </div>`;
    }
  }

  const defaultLanguage = getDefaultLanguage();
  const isTranslate = isTranslateEnabled();
  if (c.language && c.language !== defaultLanguage && isTranslate) {
    const random = Math.floor(Math.random() * 10000);
    translateHTML1 = `
          <div class="translate-wrapper tr7" style="margin-top:-10px;margin-bottom:10px;
      ">
            <span
              class="translate-btn"
              data-id="${commentId}"
              data-random="${random}"
              data-from="${c.language}"
              data-to="${defaultLanguage}"
              data-text="${c.text}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;"
            >
              Translate from ${c.language}
            </span>
            <div
              id="translated-${commentId}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;"
            ></div>
          </div>
        `;
  }

        let pollHTML = "";
        if (c.poll && Array.isArray(c.poll.options)) {
          const uid = auth.currentUser?.uid;
          let myVoteIndex = null;
          if (uid) {
            let voteRef;
            if (window.communityID != null) {
              voteRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId, "votes", uid);
            } else {
              voteRef = doc(db, "tweets", tweetId, "comments", commentId, "votes", uid);
            }
            const voteSnap = await getDoc(voteRef);
            if (voteSnap.exists()) {
              myVoteIndex = voteSnap.data().optionIndex;
            }
          }
          pollHTML = renderPoll1(c, tweetId, commentId, myVoteIndex);
        }

  const random1 = randomString(14);

  const content1 = `
    ${communityHTML}
    <div class=post-body>${parsedText}</div> 
    ${translateHTML1} 
    ${mediaHTML}
    ${donationHTML}
    ${privateHTML}
    ${pollHTML}
  `;

  let likeId67, quotedLikeRef = "";
  let editHTML67 = "";

  if (!c.parentId && document.getElementById("tweetViewer").classList.contains("hidden")) {
      let quotedRef;
      if (window.communityID != null && isFromMain == false) {
        quotedRef = doc(db, "communities", window.communityID, "posts", tweetId);
        quotedLikeRef = `communities/${window.communityID}/posts/${tweetId}/likes/${auth.currentUser.uid}`
      } else if (communityId) {
        quotedRef = doc(db, "communities", communityId, "posts", tweetId);
        quotedLikeRef = `communities/${communityId}/posts/${tweetId}/likes/${auth.currentUser.uid}`
      } else {
        quotedRef = doc(db, "tweets", tweetId);
        quotedLikeRef = `tweets/${tweetId}/likes/${auth.currentUser.uid}`;
      }

      likeId67 = randomString(14);

      const quotedSnap = await getDoc(quotedRef);
      if (quotedSnap.exists()) {
        quoted = quotedSnap.data();
        const parsedQuoted = await parseMentionsToLinks(quoted.text || "", quoted.mentions || []);
        const {
          username,
          avatar,
          displayName,
          d: d1
        } = await getUserData(quoted.uid);

        const hasText = quoted.text?.trim()?.length > 0;
        const hasImage = quoted.media && quoted.mediaType === "image";
        const hasVideo = quoted.media && quoted.mediaType === "video";

        let titleHTML2 = "";
        if (quoted.title) {
          titleHTML2 = `<h3 style="margin:10px 0;">${escapeHTML(quoted.title)}</h3>`
        }

        if (quoted.edited && quoted.editAfterComment) {
          editHTML67 = `
          <img src="/image/editicon.svg" title="edited at ${formatTime(quoted.edited)} click me" class="editedatt edit2">
        `
        }

        const defaultLanguage = getDefaultLanguage();
        const isTranslate = isTranslateEnabled();

        let translateHTML = "";
        if (quoted.language && quoted.language !== defaultLanguage && isTranslate) {
          const random = Math.floor(Math.random() * 10000);
          translateHTML = `
            <div class="translate-wrapper tr8" style="margin-top:5px;margin-bottom:10px;
        ">
              <span
                class="translate-btn"
                data-id="${tweetId}"
                data-random="${random}"
                data-from="${quoted.language}"
                data-to="${defaultLanguage}"
                data-title="null"
                style="color:#B0C4DE;cursor:pointer;font-size:15px;"
              >
                Translate from ${quoted.language}
              </span>
              <div
                id="translated-${tweetId}-${random}"
                class="translated-text"
                style="display:none;color:grey;font-size:16px;"
              ></div>
            </div>
          `;
        }

        let pollHTML = "";
        if (quoted.poll && Array.isArray(quoted.poll.options)) {
          const uid = auth.currentUser?.uid;
          let myVoteIndex = null;
          if (uid) {
            let voteRef;
            if (window.communityID != null) {
              voteRef = doc(db, "communities", window.communityID, "posts", tweetId, "votes", uid);
            } else {
              voteRef = doc(db, "tweets", tweetId, "votes", uid);
            }
            const voteSnap = await getDoc(voteRef);
            if (voteSnap.exists()) {
              myVoteIndex = voteSnap.data().optionIndex;
            }
          }
          pollHTML = renderPoll(quoted, tweetId, myVoteIndex);
        }

        const info67 = `
        ${quoted.isHidden ? "" : `
                <div class="flex">
                  <span style="cursor:pointer;color:#757779" data-community-id="${quoted.sharedFromCommunity || window.communityID || quoted.communityId || comid || null}" class="like-btn" id="likeBtn-${tweetId}">
                    <div id="${likeId67}" class="likeicon" style="height:20px">
                      <img loading='lazy' src="/image/heart.svg">
                    </div>
                    ${quoted.likeCount > 0 ? `<span id="likeCount-${tweetId}">${quoted.likeCount}</span>` : ""}
                  </span>
                  <span style="cursor:pointer;color:#757779" class="comment-btn" data-id="${tweetId}">
                    <img loading='lazy' src="/image/message.svg"> ${quoted.commentCount > 0 ? quoted.commentCount : ""}
                  </span>
                  <span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${tweetId}">
                    <img loading='lazy' src="/image/rewint.svg"> ${quoted.retweetCount > 0 ? quoted.retweetCount : ""}
                  </span>
                  <div style="margin-left:auto;">
                    <span class="viewbtn" style="margin-left:10px;color:#757779"><img loading='lazy' src="/image/chart.svg"> ${quoted.viewsCount > 0 ? quoted.viewsCount : ""}</span>
                  </div>
                </div>  
        `}
      `;

      if (quoted.archived && quoted.uid != auth.currentUser.uid && !quoted.viewPermission?.includes(auth.currentUser.uid) && !quoted.allowAnyoneWithLink && currentUserRole != "admin") {
        parent1 = `
          <div class="quoted-comment actuallyATweet quotedTweet">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar" src="/image/default-avatar.jpg" width="30">
            <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
              <span style="color:grey;font-size:12px;">
                <img src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
              </span>
            </div>
            <div class="quoted-body">
            <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this Wynt is archived</i></p>
            </div>
          </div>`;
      } else {
          if (d1.banned === true && currentUserRole != "admin") {
            parent1 = `
            <div class="quoted-comment actuallyATweet quotedTweet" data-community-id="${quoted.communityId || null}" data-id="${tweetId}">
              <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
                <img class="avatar" src="/image/default-avatar.jpg" width="30">
                <strong class="user-link" data-uid="${quoted.uid}" style="cursor:pointer">Suspended user</strong>
              </div>
              <div class="quoted-body">
                <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 15px 0px 6px;color:grey">This Wynt is from a suspended user</p>
              </div>
            </div>`;
          } else {
            if (hasImage && hasText) {
              const containsSpoiler = quoted.sensitiveMedia === true;
              const src = base91ToImageSrc(quoted.media);

              parent1 = `
              <div class="quoted-comment actuallyATweet quotedTweet" data-community-id="${quoted.communityId || null}" data-id="${tweetId}">
                <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
                  <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                  ${d1.suspended && d1.suspendedUntil > Timestamp.now() ? "⚠️" :
                    `${(quoted.mentions && Object.values(quoted.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }
                  <strong class="user-link" data-uid="${quoted.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
                  <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(quoted.createdAt)} ${editHTML67}</span>
                  <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-text="${quoted.text}" data-author="${quoted.uid}" class="menubtn">
                    <img src="/image/three-dots.svg">
                  </span>
                </div>
                <div class="quoted-body"> 
                  ${titleHTML2} 
                  <div class=post-body style="margin:0;">${parsedQuoted}</div>
                  ${translateHTML2}
                  ${containsSpoiler ?
                      `<div class="attachment spoiler-media" style="margin-bottom:5px;margin-top:15px;" onclick="this.classList.add('revealed')">
                        <div class="spoiler-overlay">
                          <div class="spoilertxt">sensitive</div>
                        </div>
                        <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                      </div>` :
                      `<div class="attachment" style="margin-bottom:5px;margin-top:15px;">
                        <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                      </div>`
                  }
                  ${pollHTML}
                  ${info67}
                </div>
              </div>`;
            } else if (hasVideo && hasText) {
              const vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              const containsSpoiler = quoted.sensitiveMedia === true;

              parent1 = `
              <div class="quoted-comment actuallyATweet quotedTweet" data-community-id="${quoted.communityId || null}" data-id="${tweetId}">
                <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
                  <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                  ${d1.suspended && d1.suspendedUntil > Timestamp.now() ? "⚠️" :
                    `${(quoted.mentions && Object.values(quoted.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }
                  <strong class="user-link" data-uid="${quoted.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
                  <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(quoted.createdAt)} </span>
                  <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-text="${quoted.text}" data-author="${quoted.uid}" class="menubtn">
                    <img src="/image/three-dots.svg">
                  </span>
                </div>
                <div class="quoted-body">
                  ${titleHTML2}
                  <div class=post-body style="margin:0;">${parsedQuoted}</div> 
                  ${translateHTML2}
                  
                  ${containsSpoiler ?
                      `<div class="attachment spoiler-media" style="margin-bottom:5px;margin-top:15px;" onclick="this.classList.add('revealed')">
                        <div class="spoiler-overlay">
                          <div class="spoilertxt">sensitive</div>
                        </div>
                        <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                          Your browser does not support the video tag.
                        </video>
                      </div>` :
                      `<div class="attachment" style="margin-bottom:5px;margin-top:15px;">
                        <video id="${vidId}" controls style="max-width: 100%; border-radius: 10px; max-height: 300px;">
                          Your browser does not support the video tag.
                        </video>
                      </div>`
                  }
                  ${pollHTML}
                  ${info67}
                </div>
              </div>`;
              getSupabaseVideo(quoted.media, vidId);
            } else {
              parent1 = `
              <div class="quoted-comment actuallyATweet quotedTweet" data-community-id="${quoted.communityId || null}" data-id="${tweetId}">
                <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
                  <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" 
                    onerror="this.src='/image/default-avatar.jpg'" width="30">
                  ${d1.suspended && d1.suspendedUntil > Timestamp.now() ? "⚠️" :
                    `${(quoted.mentions && Object.values(quoted.mentions).includes(auth.currentUser.uid)) ?
                      `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                      ""
                    }`
                  }
                  <strong class="user-link" data-uid="${quoted.uid}" style="cursor:pointer">
                    ${escapeHTML(displayName || 'Unknown')}
                  </strong>
                  <span style="color:grey;font-size:12px;">
                    <span class="usernamee">@${username} •</span> ${formatDate(quoted.createdAt)}
                  </span>
                  ${editHTML67}
                  <span style="cursor:pointer;margin-left:auto" data-community-id="${quoted.communityId || null}" data-author="${quoted.uid}" data-text="${quoted.text}" class="menubtn"><img src="/image/three-dots.svg"></span>
                </div>
                <div class="quoted-body">
                  ${titleHTML2}
                  <div class=post-body style="margin:6px 0 12px;">${parsedQuoted}</div> 
                  ${translateHTML2}
                  ${pollHTML}
                  ${info67}
                </div>
              </div>`;
            }
          }
        }
      } else {
        parent1 = `
          <div class="quoted-comment actuallyATweet quotedTweet">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar" src="/image/default-avatar.jpg" width="30">
            <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
              <span style="color:grey;font-size:12px;">
                <img src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
              </span>
            </div>
            <div class="quoted-body">
            <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this Wynt is unavailable</i></p>
            </div>
          </div>`;
      }
  }

  if (d.banned && currentUserRole != "admin") {
    container.innerHTML = `
      ${parent1}
      ${parentReply}
      <div class="comment" style="border-bottom:var(--border);padding-bottom:10px;margin-bottom:10px;" id="comment-${commentId}" data-id="${commentId}" data-community-id="${comid || null}" data-tweet="${tweetId}">
        <div class="flex" style="gap:10px;">
          <img class="avatar" src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30" />
          <strong class="user-link" data-uid="${c.uid}" style="cursor:pointer;font-size:17px;">Suspended user</strong>
          <span style="color:#757779;font-size:12px">${createdAt}</span>
        </div>
        <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 15px 0px 6px;color:grey">This Wynt is from a suspended user</p>
      </div>`;
  } else {
    container.innerHTML = `
      ${parent1}
      ${parentReply}
      <div class="comment shutup" style="border-bottom:var(--border);padding-bottom:10px;margin-bottom:10px;" id="comment-${commentId}" data-id="${commentId}" data-community-id="${comid || null}" data-tweet="${tweetId}">
        <div class="flex" style="gap:10px;">
          <img class="avatar" src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30" />
          ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
            `${c.likedByCreator === true ? 
              `<img style="margin-right:-3px" src="/image/star.svg">` :
              `${(c.mentions && Object.values(c.mentions).includes(auth.currentUser.uid)) ?
                `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                ""
              }`
            }`
          }
          <strong class="user-link" data-uid="${c.uid}" style="cursor:pointer;font-size:17px;">${escapeHTML(displayName)}</strong>
          <span style="color:#757779;font-size:12px"><span class="usernamee">@${username} •</span> ${createdAt} ${editHTML}</span>
          <span class="cmenubtn" data-text="${c.text}" data-private="${c.isPrivate || false}" data-community-id="${comid || null}" data-author="${c.uid}" data-id="${commentId}" style="margin-left:auto;" data-tweet="${tweetId}">
            <img src="/image/three-dots.svg">
          </span>
        </div>
        ${c.isHidden ? `
          <button class="hiddenCon" style="line-height:1.5;background:var(--light);padding:10px;border-radius:10px;border:var(--border);color:grey;margin:10px 0;text-align:left;" id="commentHidden-${random1}" onclick="
            this.classList.add('hidden');
            document.getElementById('commentItem-${random1}').classList.remove('hidden');
          ">
            <p style="margin:0;font-size:15px;">This reply ${c.hiddenByAuthority ? "may violate Wyntr guidelines" : `is hidden by the ${c.hiddenByAdmin ? "community admin" : "Wynt author"}.`}  click to view content</p>
          </button>
          <div class="hidden" id="commentItem-${random1}">
            ${content1}
                <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                  <img src="/image/eye.svg">
                  <span style="color: grey; font-size: 13px;">
                    This reply is hidden ${c.hiddenByAuthority ? `by moderators ${c.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${c.hiddenReason ? `(hidden for: ${c.hiddenReason})` : ""}` : ""}` : `${c.hiddenByAdmin ? `by community admin ${c.hiddenReason ? `(hidden for: ${c.hiddenReason})` : ""}` : `by Wynt author ${c.hiddenReason ? `(hidden for: ${c.hiddenReason})` : ""}`}`}
                  </span>
                </div>
          </div>` : `
          ${content1}
        `}
        <div class="flex" style="margin:0;gap:25px;">
          ${c.isHidden ? "" : `
            <span class="comment-like-btn" data-id="${commentId}" data-tweet="${tweetId}" style="cursor:pointer;display:flex;align-items:center;gap:3px;">
              <div id="${likeId}" class="clikeicon" style="height:20px">
                <img src="/image/heart.svg">
              </div>
              <span style="color:#757779;" id="comment-like-count-${commentId}">${c.likeCount > 0 ? formatNumber(c.likeCount) : ""}</span>
            </span>

            <span style="cursor:pointer;color:#757779" class="reply-btn" data-id="${commentId}" data-tweet="${tweetId}">
              <img src="/image/message.svg"> ${c.replyCount > 0 ? formatNumber(c.replyCount) : ""}
            </span>

            ${c.isPrivate || c.isPrivateParent || c.isHidden ? "" :
              `<span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${tweetId}" data-comment-id="${commentId}">
                <img src="/image/rewint.svg"> ${c.retweetCount > 0 ? formatNumber(c.retweetCount) : ""}
              </span>`
            }

            <span class="viewbtn" style="margin-left:auto;color:#757779"><img loading="lazy" src="/image/chart.svg"> ${c.viewsCount > 0 ? c.viewsCount : ""}</span>
          `}
        </div>
        ${c.retweetCount > 0 ? `
          <div style="width:100%;display:flex;align-items:center;cursor:pointer;">
            <span 
              data-tweet="${tweetId}"
              data-comment="${commentId}"
              ${c.communityId ? `data-community="${c.communityId}"` : ""}
              class="xviewQuotes"
              style="font-size:14px;margin-left:auto;margin-top:10px;color:grey">
                View quotes
            </span>
          </div>  
        ` : ""}
      </div>`;
  }

  if (translateHTML != "") {
    container.querySelector(".tr6 .translate-btn").dataset.text = parent.text;
  }
  if (translateHTML1 != "") {
    container.querySelector(".tr7 .translate-btn").dataset.text = c.text;
  }
  if (translateHTML2 != "") {
    container.querySelector(".tr8 .translate-btn").dataset.text = quoted.text;
  }

  if (editHTML != "") { if (c.editAfterComment) {
    container.querySelector(".edit0").onclick = () => {
      showOriginal(c.originalText, c.mentions || []);
    };
  }}
  if (editHTML2 != "") { if (parent.editAfterComment) {
    container.querySelector(".edit1").onclick = () => {
      showOriginal(parent.originalText, parent.mentions || [], parent.originalTitle);
    };
  }}
  if (editHTML67 != "") { if (quoted.editAfterComment) {
    container.querySelector(".edit2").onclick = () => {
      showOriginal(quoted.originalText, quoted.mentions || [], quoted.originalTitle);
    };
  }}

  if (likeId) {
    const likeEl = container.querySelector(`#${likeId}`);
    if (likeEl) getSnap(commentLikeRef, likeEl);
  }

  if (document.getElementById("tweetViewer").classList.contains("hidden") && c.parentId && likeId1) { 
    const likeEl1 = container.querySelector(`#${likeId1}`);
    if (likeEl1) getSnap(parentLikeRef, likeEl1);
  } else if (document.getElementById("tweetViewer").classList.contains("hidden") && !c.parentId && likeId67) {
    const likeEl2 = container.querySelector(`#${likeId67}`);
    if (likeEl2) getSnap(quotedLikeRef, likeEl2);
  }

  document.getElementById("replyList").classList.remove("hidden");

  if (window.communityID) {
    incrementViews(tweetId, commentId, window.communityID);
  } else if (communityId) {
    incrementViews(tweetId, commentId, communityId);
  } else {
    incrementViews(tweetId, commentId, null);
  }
}

document.body.addEventListener("click", async (e) => {
  const body = e.target.closest(".comment-item, .comment-owner, .card-reply");
  if (!body) return;

  const comid = body.dataset.communityId;
  let hascom
  if (comid && comid != "null" && comid != null) {
    hascom = comid;
  }

  const actionEl = body.querySelector(".reply-btn");
  if (!actionEl && !(body.dataset.id && body.dataset.tweet)) return;

  if (
    e.target.closest(".attachment") || 
    e.target.closest(".shutup") ||
    e.target.closest(".comment-like-btn") || 
    e.target.closest(".reply-btn") || 
    e.target.closest(".cmenubtn") || 
    e.target.closest("#replyComment") || 
    e.target.closest(".user-link") || 
    e.target.closest(".tag-link") || 
    e.target.closest(".share-reply") || 
    e.target.closest(".retweet-btn") || 
    e.target.closest(".spoilerr") || 
    e.target.closest(".spoiler-overlay") || 
    e.target.closest("video") || 
    e.target.closest(".hiddenCon") || 
    e.target.closest(".internal-link") || 
    e.target.closest(".translate-btn") ||
    e.target.closest("a") ||
    e.target.closest(".ownerr") && !e.target.closest(".comment-owner") ||
    e.target.closest(".vote-btn1") ||
    e.target.closest(".vote-btn") ||
    e.target.closest(".xviewQuotes") ||
    e.target.closest(".xviewQuotes") ||
    e.target.closest(".editedatt") ||
    (
      e.target.closest(".body-quote") &&
      !e.target.closest(".card-reply")
    )
  ) {
    return;
  }
  e.preventDefault();

  document.getElementById("commentSearch").classList.add("hidden");

  const commentId = actionEl ? actionEl.dataset.id : body.dataset.id;
  const tweetId = actionEl ? actionEl.dataset.tweet : body.dataset.tweet;

  const overlay = document.getElementById("commentViewer");
  const box = overlay.querySelector("#appendComment");
  const replyList = overlay.querySelector("#replyList");

  overlay.classList.remove("hidden");
  box.innerHTML = `<div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div>`;
  replyList.innerHTML = ``;

  let commentRef;
  if (hascom) {
    commentRef = doc(db, "communities", hascom, "posts", tweetId, "comments", commentId);
  } else {
    commentRef = doc(db, "tweets", tweetId, "comments", commentId);
  }

  const snap = await getDoc(commentRef);
  if (snap.exists()) {
    const commentData = {
      id: snap.id,
      ...snap.data()
    };
    renderCommentViewer(commentData, commentId, tweetId, box, hascom);
  } else {
    box.innerHTML = `
      <div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;padding:0 20px;"><h2 style="margin:0;">No reply found</h2><p style="color:grey;margin:7px 0;">seems like this reply have been deleted or you don't have permission to view it.</p></div></div>
    `;
  }
  loadComments(tweetId, true, commentId, replyList, hascom);
});

document.getElementById("commentviewerclose").addEventListener("click", async () => {
  const overlay = document.getElementById("commentViewer");
  overlay.classList.add("hidden");
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  document.addEventListener("DOMContentLoaded", init);
  init();
}

async function init() {
  const user = await waitForAuth();
  if (!user) return info("x", "Unauthorized", "user is not logged in");
  const path = window.location.pathname;
  const communityReplyMatch = path.match(/^\/community\/([^/]+)\/wynt\/([^/]+)\/reply\/([^/]+)$/);
  const normalReplyMatch = path.match(/^\/wynt\/([^/]+)\/reply\/([^/]+)$/);
  let communityId = null;
  let tweetId = null;
  let commentId = null;
  if (communityReplyMatch) {
    communityId = communityReplyMatch[1];
    tweetId = communityReplyMatch[2];
    commentId = communityReplyMatch[3];
  } else if (normalReplyMatch) {
    tweetId = normalReplyMatch[1];
    commentId = normalReplyMatch[2];
  } else {
    return;
  }
  if (communityReplyMatch) {
    const comRef = doc(db, "communities", communityId);
    const comSnap = await getDoc(comRef);
    if (!comSnap.exists()) return;
    const cData = comSnap.data();
    if (cData.private === true) {
      const memberRef = doc(db, "communities", communityId, "members", auth.currentUser.uid);
      const memberSnap = await getDoc(memberRef);
      const isMember = memberSnap.exists();
      if (!isMember) {
        const overlay = document.getElementById("commentViewer");
        const userBox = overlay.querySelector("#appendComment");
        userBox.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">Error: No access</h2><p style="color:grey;margin:7px 0;">The community this Wynt belongs to is a private community and you don't have permission to view this Wynt.</p></div></div>`;
        overlay.classList.remove("hidden");
        document.body.classList.add('no-scroll');
        return;
      }
    }
  }
  const overlay = document.getElementById("commentViewer");
  const box = overlay.querySelector("#appendComment");
  const replyList = overlay.querySelector("#replyList");
  overlay.classList.remove("hidden");
  box.innerHTML = "";
  replyList.innerHTML = "";
  let commentRef;
  if (communityId) {
    commentRef = doc(db, "communities", communityId, "posts", tweetId, "comments", commentId);
  } else {
    commentRef = doc(db, "tweets", tweetId, "comments", commentId);
  }
  const snap = await getDoc(commentRef);
  if (snap.exists()) {
    const commentData = {
      id: snap.id,
      ...snap.data()
    };
    renderCommentViewer(commentData, commentId, tweetId, box, communityId);
    loadComments(tweetId, true, commentId, replyList, communityId);
  } else {
    box.innerHTML = `
    <div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;padding:0 20px;"><h2 style="margin:0;">No reply found</h2><p style="color:grey;margin:7px 0;">seems like this reply have been deleted or you don't have permission to view it.</p></div></div>`;
    replyList.innerHTML = "";
  }
  document.body.classList.add("no-scroll");
}

document.body.addEventListener("click", async (e) => {
  const quoted = e.target.closest(".quoted-comment");
  if (!quoted) return;

  const tweetId = quoted.dataset.id;
  const commentId = quoted.dataset.commentId;
  const comid = quoted.dataset.communityId == "undefined"
                  ? null
                  : quoted.dataset.communityId;

  let hascom;
  if (comid && comid != "null" && comid != null) {
    hascom = comid;
  }
  if (!tweetId || !commentId) return;

  if (
    e.target.closest(".user-link") || 
    e.target.closest(".tag-link") || 
    e.target.closest(".quoted-comment.actuallyATweet") || 
    e.target.closest(".comment-like-btn") || 
    e.target.closest(".reply-btn") || 
    e.target.closest(".retweet-btn") || 
    e.target.closest(".cmenubtn") || 
    e.target.closest(".shutup") ||
    e.target.closest(".comment-btn") || 
    e.target.closest(".like-btn") || 
    e.target.closest(".viewbtn") || 
    e.target.closest(".vote-btn1") ||
    e.target.closest(".menubtn") || 
    e.target.closest(".attachment") || 
    e.target.closest(".attachment2") || 
    e.target.closest(".vote-btn") || 
    e.target.closest(".spoilerr") || 
    e.target.closest(".communityLink") || 
    e.target.closest("video") || 
    e.target.closest(".hiddenCon") || 
    e.target.closest(".internal-link") || 
    e.target.closest(".translate-btn") ||
    e.target.closest("a") ||
    e.target.closest(".viewQuotes") ||
    e.target.closest(".editedatt") ||
    e.target.closest(".body-quote")
  ) {
    return;
  }
  e.preventDefault();

  try {
    const overlay = document.getElementById("commentViewer");
    const box = overlay.querySelector("#appendComment");
    const replyList = overlay.querySelector("#replyList");
    overlay.classList.remove("hidden");
    box.innerHTML = `<div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div>`;
    replyList.innerHTML = ``;

    let commentRef;
    if (window.communityID) {
      commentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", commentId);
    } else if (hascom) {
      commentRef = doc(db, "communities", hascom, "posts", tweetId, "comments", commentId);
    } else {
      commentRef = doc(db, "tweets", tweetId, "comments", commentId);
    }

    const snap = await getDoc(commentRef);
    if (snap.exists()) {
      const commentData = {
        id: snap.id,
        ...snap.data()
      };

      renderCommentViewer(commentData, commentId, tweetId, box, hascom);
      loadComments(tweetId, true, commentId, replyList, hascom);
      document.body.classList.add("no-scroll");
    } else {
      box.innerHTML = `
      <div class="notfound" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;padding-bottom:25px;border-bottom:var(--border)"><div style="max-width:400px;text-align:left;padding:0 20px;"><h2 style="margin:0;">No reply found</h2><p style="color:grey;margin:7px 0;">seems like this reply have been deleted or you don't have permission to view it.</p></div></div>`;
      replyList.innerHTML = "";
    }
  } catch (err) {
    console.error("Failed to open quoted comment:", err);
  }
});

document.addEventListener("mousedown", (e) => {
  if (e.button !== 2) return;
  e.preventDefault();
  if (e.target.closest(".user-link")) return;

  const quoted = e.target.closest(".quoted-comment:not(.retweet)") ||
                 e.target.closest(".comment-item") ||
                 e.target.closest(".comment-owner");
  if (!quoted) return;

  console.log(quoted);

  const tweetId = quoted.dataset.tweet;
  const commentId = quoted.dataset.id;

  const rawComId = quoted.dataset.communityId;
  if (!tweetId || !commentId) return;

  const communityId = rawComId && rawComId !== "null" ? rawComId : null;
  const url = communityId ? `https://wyntr.netlify.app/community/${communityId}/wynt/${tweetId}/reply/${commentId}` : `https://wyntr.netlify.app/wynt/${tweetId}/reply/${commentId}`;
  window.open(url, "_blank", "noopener");
});

async function renderQuoted(communityId, tweetId, parentId, element, isFromMain) {
    document.getElementById(`more-replies-${element}`).textContent = "loading...";
    document.getElementById(`more-replies-${element}`).style.textDecoration = "none";

    let parentReply = "";
    let parentRef;
    let likeRef;
    let editHTML2 = "";

    if (window.communityID != null && isFromMain == false) {
      parentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", parentId);
      likeRef = `communities/${window.communityID}/posts/${tweetId}/comments/${parentId}/likes/${auth.currentUser.uid}`
    } else if (communityId != null && communityId != "null" && communityId != "undefined" && communityId != undefined) {
      parentRef = doc(db, "communities", communityId, "posts", tweetId, "comments", parentId);
      likeRef = `communities/${communityId}/posts/${tweetId}/comments/${parentId}/likes/${auth.currentUser.uid}`
    } else {
      parentRef = doc(db, "tweets", tweetId, "comments", parentId);
      likeRef = `tweets/${tweetId}/comments/${parentId}/likes/${auth.currentUser.uid}`
    }

    const likeId2 = randomString(14);
    let translateHTML = "";
    let parent;

    const parentSnap = await getDoc(parentRef);
    if (parentSnap.exists()) {
      parent = parentSnap.data();

      let parsedparent = "";
      if (parent.text) {
        parsedparent = await parseMentionsToLinks(parent.text || "", parent.mentions || []);
      }

      const { username, avatar, displayName, d } = await getUserData(parent.uid);

      const hasText = parent.text?.trim()?.length > 0;
      const hasImage = parent.media && parent.mediaType === "image";
      const hasVideo = parent.media && parent.mediaType === "video";

      if (parent.edited && parent.editAfterComment) {
        editHTML2 = `
        <img src="/image/editicon.svg" title="edited at ${formatTime(parent.edited)} click me" class="edit0">
      `
      }

      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();

      if (parent.language && parent.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML = `
          <div class="translate-wrapper tr9" style="margin-top:-5px;margin-bottom:5px;
          ">
            <span
              class="translate-btn"
              data-id="${tweetId}"
              data-random="${random}"
              data-from="${parent.language}"
              data-to="${defaultLanguage}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;"
            >
              Translate from ${parent.language}
            </span>
            <div
              id="translated-${tweetId}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;"
            ></div>
          </div>
        `;
      }

        let pollHTML = "";
        if (parent.poll && Array.isArray(parent.poll.options)) {
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
          pollHTML = renderPoll1(parent, tweetId, parentId, myVoteIndex);
        }

      const infos = `
              <div class="flex" style="display:Flex;gap:25px;">
              ${parent.isHidden ? "" : `
              <span class="comment-like-btn" data-id="${parentId}" data-tweet="${tweetId}" style="cursor:pointer;display:flex;align-items:center;gap:3px;">
                <div id="${likeId2}" class="clikeicon" style="height:20px">
                  <img loading='lazy' src="/image/heart.svg">
                </div>
                <span style="color:#757779;" id="comment-like-count-${parentId}">${parent.likeCount > 0 ? parent.likeCount : ""}</span>
              </span>
              <span style="cursor:pointer;color:#757779" class="reply-btn" data-id="${parentId}" data-tweet="${tweetId}">
                <img loading='lazy' src="/image/message.svg"> ${(parent.replyCount ?? 0) > 0 ? parent.replyCount : ""}
              </span>
              ${parent.isPrivate || parent.isPrivateParent ? "" :
                `<span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${tweetId}" data-comment-id="${parentId}">
                  <img loading='lazy' src="/image/rewint.svg"> ${(parent.retweetCount ?? 0) > 0 ? parent.retweetCount : ""}
                </span>`
              }
              <span class="viewbtn" style="margin-left:auto;color:#757779"><img loading="lazy" src="/image/chart.svg"> ${parent.viewsCount > 0 ? parent.viewsCount : ""}</span>`
              }
              </div>
      `

      if (d.banned === true && currentUserRole != "admin") {
        parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer">
                Suspended user
              </strong>
              <span style="color:grey;font-size:12px;">
                ${formatDate(parent.createdAt)}
              </span>
            </div>
            <div class="quoted-body">
              <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 6px;color:grey">This reply is from a suspended user</p>
            </div>
          </div>
        `;
      } else {
        if (hasImage && hasText) {
          const containsSpoiler = parent.sensitiveMedia === true;
          const src = base91ToImageSrc(parent.media.url);
          const path = `${tweetId}-${parentId}`;
          const content = `
              <div class=post-body style="margin:0;">${parsedparent}</div>
              ${translateHTML}
              ${containsSpoiler ?
                  `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                    <div class="spoiler-overlay">
                      <div class="spoilertxt">sensitive</div>
                    </div>
                    <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                  </div>` :
                  `<div class="attachment" style="margin-bottom:5px">
                    <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                  </div>`
              }
              ${pollHTML}
          `;

          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" : 
                `${parent.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(parent.mentions && Object.values(parent.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
              <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} ${editHTML2}</span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${parent.sharedFromCommunity || parent.communityId || null}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" data-text="${parent.text}" class="cmenubtn">
                <img src="/image/three-dots.svg">
              </span>
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
                      This reply is hidden ${parent.hiddenByAuthority ? `by moderators ${parent.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : ""}` : `${parent.hiddenByAdmin ? `by community admin ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : `by Wynt author ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
              </div>` : `
              ${content}
              `}
              ${infos}
            </div>
          </div>`;
        } else if (hasVideo && hasText) {
          const vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const containsSpoiler = parent.sensitiveMedia === true;
          const path = `${tweetId}-${parentId}`;
          const content = `
              <div class=post-body style="margin:0;">${parsedparent}</div> 
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
              ${pollHTML}
          `;

          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${parent.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(parent.mentions && Object.values(parent.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
              <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} ${editHTML2}</span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" data-text="${parent.text}" class="cmenubtn">
                <img src="/image/three-dots.svg">
              </span>
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
                      This reply is hidden ${parent.hiddenByAuthority ? `by moderators ${parent.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : ""}` : `${parent.hiddenByAdmin ? `by community admin ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : `by Wynt author ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
              </div>` : `
              ${content}
              `}
              ${infos}
            </div>
          </div>`;
          getSupabaseVideo(parent.media.url, vidId);
        } else if (hasVideo) {
          const vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const containsSpoiler = parent.sensitiveMedia === true;
          const path = `${tweetId}-${parentId}`;
          const content = `
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
              ${pollHTML}
          `;

          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${parent.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(parent.mentions && Object.values(parent.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
              <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} </span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" data-text="${parent.text}" class="cmenubtn">
                <img src="/image/three-dots.svg">
              </span>
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
                      This reply is hidden ${parent.hiddenByAuthority ? `by moderators ${parent.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : ""}` : `${parent.hiddenByAdmin ? `by community admin ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : `by Wynt author ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
              </div>` : `
              ${content}
              `}
              ${infos}
            </div>
          </div>`;
          getSupabaseVideo(parent.media.url, vidId);
          } else if (hasImage) {
          const containsSpoiler = parent.sensitiveMedia === true;
          const src = base91ToImageSrc(parent.media.url);
          const path = `${tweetId}-${parentId}`;
          const content = `
              ${containsSpoiler ?
                  `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
                    <div class="spoiler-overlay">
                      <div class="spoilertxt">sensitive</div>
                    </div>
                    <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                  </div>` :
                  `<div class="attachment" style="margin-bottom:5px">
                    <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                  </div>`
              }
              ${pollHTML}
          `

          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${parent.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(parent.mentions && Object.values(parent.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
              <span style="color:grey;font-size:12px;"> <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} </span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" data-text="${parent.text}" class="cmenubtn">
                <img src="/image/three-dots.svg">
              </span>
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
                      This reply is hidden ${parent.hiddenByAuthority ? `by moderators ${parent.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : ""}` : `${parent.hiddenByAdmin ? `by community admin ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : `by Wynt author ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}`}`}
                    </span>
                  </div>
              </div>` : `
              ${content}
              `} 
              ${infos}
            </div>
          </div>`;
        } else {
          const path = `${tweetId}-${parentId}`;
          const content = `
            <div class=post-body style="margin:6px 0 12px;">${parsedparent}</div> 
            ${translateHTML}
            ${pollHTML}
          `

          parentReply = `
          ${parent.parentId != null ? `<button class="morereplies" id="more-replies-${path}" onclick="renderQuoted('${communityId}', '${tweetId}', '${parent.parentId}', '${path}', ${isFromMain})" style="margin-left:18px;color:grey;margin-bottom:20px;margin-top:11px;font-size:16px;padding:0;background:none;color: #1a8cd8;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${parentId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" 
                onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${d.suspended && d.suspendedUntil > Timestamp.now() ? "⚠️" :
                `${parent.likedByCreator === true ? 
                  `<img style="margin-right:-3px" src="/image/star.svg">` :
                  `${(parent.mentions && Object.values(parent.mentions).includes(auth.currentUser.uid)) ?
                    `<b style="font-family: arial, sans-serif;margin-right:-3px">@</b>` :
                    ""
                  }`
                }`
              }
              <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer">
                ${escapeHTML(displayName || 'Unknown')}
              </strong>
              <span style="color:grey;font-size:12px;">
                <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} ${editHTML2}
              </span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${parent.communityId || null}" data-author="${parent.uid}" data-id="${parentId}" data-tweet="${tweetId}" data-text="${parent.text}" class="cmenubtn"><img src="/image/three-dots.svg"></span>
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
                      This reply is hidden ${parent.hiddenByAuthority ? `by moderators ${parent.uid === auth.currentUser.uid || currentUserRole === "admin" ? `${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : ""}` : `${parent.hiddenByAdmin ? `by community admin ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}` : `by Wynt author ${parent.hiddenReason ? `(hidden for: ${parent.hiddenReason})` : ""}`}`}
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
      parentReply = `
      <div style="padding-top:0;" class="quoted-comment quotedTweet">
        <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
        <img class="avatar" src="/image/default-avatar.jpg" width="30">
        <strong class="user-link" data-uid="PG1BAWNBc57qK7MFWy0f" style="cursor:pointer">System</strong>
          <span style="color:grey;font-size:12px;">
            <img src="/image/icon.png" height="20" width="20" style="margin:0; margin-left:-5px;">
          </span>
        </div>
        <div class="quoted-body">
        <p style="background:var(--normal);border-radius:10px;border:var(--border);padding:10px;margin: 6px 0px 0;"><i>this Reply is unavailable</i></p>
        </div>
      </div>`;
    }

    const el = document.getElementById(`${element}`)

    document.getElementById(`more-replies-${element}`).remove();
    el.innerHTML = parentReply;

    if (likeId2) {
      const likeEl = el.querySelector(`#${likeId2}`);
      if (likeEl) getSnap(likeRef, likeEl);
    }

    if (editHTML2 != "") { if (parent.editAfterComment) {
      container.querySelector(".edit0").onclick = () => {
        showOriginal(parent.originalText, parent.mentions || [], parent.originalTitle);
      };
    }}

    if (translateHTML != "") {
      el.querySelector(".tr9 .translate-btn").dataset.text = parent.text;
    }
}

window.renderQuoted = renderQuoted;