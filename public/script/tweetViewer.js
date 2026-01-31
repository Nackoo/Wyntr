import { auth, db, doc, getDoc, getDocs, collection, query, orderBy } from "./firebase.js";
import { loadComments, renderPoll, getUserData, getCommunityNameById, editicon, getSnap, renderPoll1 } from "./index.js";
import { formatDate, escapeHTML, applyReadMoreLogic, parseMentionsToLinks, formatNumber, formatTime, log, getDefaultLanguage, isTranslateEnabled, randomString } from "./texts.js";
import { getSupabaseVideo, base91ToImageSrc } from "./attachments.js";
 
export async function renderTweetViewer(t, tweetId, container, user, comid, isFromMain) {
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
    IQ,
    premium
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
            displayName: rtDisplayName,
            IQ,
            premium
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
  const containsSpoiler = /\|\|.+?\|\|/.test(t.text);
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
            <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;">
              Your browser does not support the video tag.
            </video>
          </div>`;
    } else {
      vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      mediaHTML = `
          <div class="attachment">
            <video class="vid" id="${vidId}" controls style="max-width: 100%; border-radius: 10px;">
              Your browser does not support the video tag.
            </video>
          </div>`;
      if (!document.getElementById(vidId)) getSupabaseVideo(t.media, vidId);
    }
  }
  let retweetHTML = "";
  let quotedHTML = "";
  let originalQuoted = "";

  if (t.retweetOfComment) {
    const { tweetId: parentId, commentId } = t.retweetOfComment;

    let commentRef;
    if (window.communityID != null && isFromMain == false) {
      commentRef = doc(db, "communities", window.communityID, "posts", parentId, "comments", commentId);
    } else if (comid) {
      commentRef = doc(db, "communities", comid, "posts", parentId, "comments", commentId);
    } else if (t.sharedFromCommunity) {
      commentRef = doc(db, "communities", t.sharedFromCommunity, "posts", parentId, "comments", commentId);
    } else {
      commentRef = doc(db, "tweets", parentId, "comments", commentId);
    }

    const commentSnap = await getDoc(commentRef);
    if (commentSnap.exists()) {
      const comment = commentSnap.data();
      const commentUserSnap = await getDoc(doc(db, "users", comment.uid));
      const commentUser = commentUserSnap.exists() ? commentUserSnap.data() : {};
      const { username, avatar, displayName, IQ: aIQ, premium } = await getUserData(comment.uid);
      const parsedCommentText = await parseMentionsToLinks(comment.text || "", comment.mentions || []);
      const hasImage = comment.media && comment.mediaType === "image";
      const hasVideo = comment.media && comment.mediaType === "video";
      const hasText = comment.text?.trim()?.length > 0;
      const userSnap = await getDoc(doc(db, "users", comment.uid));
      const premiumExpiry = premium ? premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;

      let communityHTML = "";
      let communityName = "";

      if (t.sharedFromCommunity && window.communityID != t.sharedFromCommunity) {
        communityName = await getCommunityNameById(t.sharedFromCommunity);
        communityHTML = `
          <div class="communityLink" data-id="${t.sharedFromCommunity}" style="cursor:pointer;display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0;margin-top:10px;">
            <img height="20" src="/image/community-filled.svg">
            ${escapeHTML(communityName)}
          </div>`;
      }

      let donationHTML = "";
      if (comment.donationReceived) {
        donationHTML = `
      <span style="color:#0485b7;font-size:15px;padding-bottom:10px;display:block">
        <img draggable="false" class="emoji" alt="🎁" src="https://ox7jbzyn-13kwt53x-purp2e2u.netlify.app/twemoji/svg/1f381.svg"> Gifted <span style="color:#f91880;font-weight:bold;">${formatNumber(comment.donationReceived)}</span> Wcoins
      </span>
        `;
      }

      let editHTML3 = "";
      if (comment.edited) {
        editHTML3 = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(comment.edited)}
        </span>
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

      if (hasImage && hasText) {
        const containsSpoiler = /\|\|.+?\|\|/.test(comment.text);
        const src = base91ToImageSrc(comment.media.url);
        const path = `${tweetId}-${commentId}`;

        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div class="quoted-comment" data-community-id="${t.sharedFromCommunity || null}" data-id="${parentId}" data-comment-id="${commentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
              `<div class=iq style="margin:0">${aIQ}</div>` 
            }
            <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span>
            <div style="margin-left:auto">
              <span class="cmenubtn" data-text="${comment.text}" data-id="${commentId}" data-tweet="${parentId}" data-author="${comment.uid}">
                <img src="/image/three-dots.svg">
              </span>
            </div>
          </div>
          <div class="quoted-body">
          ${communityHTML}
          <p style="margin: 0px 0px 15px;">${parsedCommentText}</p> 
          ${translateHTML} 
          ${editHTML3}
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
          </div>
          `;
      } else if (hasVideo && hasText) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const containsSpoiler = /\|\|.+?\|\|/.test(comment.text);
        const path = `${tweetId}-${commentId}`;

        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div class="quoted-comment" data-id="${parentId}" data-community-id="${t.sharedFromCommunity || null}" data-comment-id="${commentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
          <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
          ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
            `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
            `<div class=iq style="margin:0">${aIQ}</div>` 
          }
          <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span>
          <div style="margin-left:auto">
            <span class="cmenubtn" data-text="${comment.text}" data-id="${commentId}" data-tweet="${parentId}" data-author="${comment.uid}">
              <img src="/image/three-dots.svg">
            </span>
          </div>
          </div>
          <div class="quoted-body">
          ${communityHTML}
          <p style="margin: 0px 0px 15px;">${parsedCommentText}</p> 
          ${translateHTML} 
          ${editHTML3}
          ${containsSpoiler ?
            `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
              <div class="spoiler-overlay">
                <div class="spoilertxt">sensitive</div>
              </div>
              <video id="${vidId}" controls style="width: auto !important; height: 250px; object-fit: cover; border-radius:15px;">
                Your browser does not support the video tag.
              </video>
              </div>` :
              `<div class="attachment" style="margin-bottom:5px">
                <video id="${vidId}" controls style="width:auto !important; height: 250px; object-fit: cover; border-radius:15px;">
                  Your browser does not support the video tag.
                </video>
              </div>`
          }
          ${donationHTML}
          ${pollHTML}
          </div>
          </div>
          `;
        getSupabaseVideo(comment.media.url, vidId);

      } else if (hasImage) {
        const src = base91ToImageSrc(comment.media.url);
        const path = `${tweetId}-${commentId}`;

        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div class="quoted-comment" data-id="${parentId}" data-community-id="${t.sharedFromCommunity || null}" data-comment-id="${commentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
              `<div class=iq style="margin:0">${aIQ}</div>` 
            }
            <strong class="user-link"   data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span>
            <div style="margin-left:auto"><span class="cmenubtn" data-id="${commentId}" data-tweet="${parentId}" data-text="${comment.text}" data-author="${comment.uid}">
              <img src="/image/three-dots.svg">
            </span></div>
          </div>
          <div class="quoted-body">
          ${communityHTML}
          <div class="attachment">
            <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
          </div>
          ${donationHTML}
          ${pollHTML}
        </div>`;

      } else if (hasVideo) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const path = `${tweetId}-${commentId}`;

        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
          <div id="${path}"></div>
        <div class="quoted-comment"  data-id="${parentId}" data-community-id="${t.sharedFromCommunity || null}" data-comment-id="${commentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
              `<div class=iq style="margin:0">${aIQ}</div>` 
            }
            <strong class="user-link"   data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span>
            <div style="margin-left:auto"><span class="cmenubtn" data-id="${commentId}" data-tweet="${parentId}" data-text="${comment.text}" data-author="${comment.uid}">
              <img src="/image/three-dots.svg">
            </span></div>
          </div>
          <div class="quoted-body">
          ${communityHTML}
          <div class="attachment" style="margin-bottom:5px">
            <video id="${vidId}" controls style="width:auto !important; height: 250px; object-fit: cover; border-radius:15px;">
              Your browser does not support the video tag.
            </video>
          </div>
          ${donationHTML}
          ${pollHTML}
        </div>`;

        getSupabaseVideo(comment.media.url, vidId);
      } else {
        const path = `${tweetId}-${commentId}`;

        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${t.sharedFromCommunity}', '${comid}', '${parentId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
          <div id="${path}"></div>
        <div class="quoted-comment" data-id="${parentId}" data-community-id="${t.sharedFromCommunity || null}" data-comment-id="${commentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
              `<div class=iq style="margin:0">${aIQ}</div>` 
            }
            <strong class="user-link" data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span>
            <div style="margin-left:auto"><span class="cmenubtn" data-id="${commentId}" data-tweet="${parentId}" data-text="${comment.text}" data-author="${comment.uid}">
              <img src="/image/three-dots.svg">
            </span></div>
          </div>
          <div class="quoted-body">
          ${communityHTML}
          <p style="margin: 6px 0px 12px;margin-top:6px;">${parsedCommentText}</p> 
          ${translateHTML} 
          ${editHTML3}
          ${donationHTML}
          ${pollHTML}
        </div>`;
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

    let quotedRef;
    if (window.communityID != null && isFromMain == false) {
      quotedRef = doc(db, "communities", window.communityID, "posts", t.retweetOfComment.tweetId);
    } else if (comid) {
      quotedRef = doc(db, "communities", comid, "posts", t.retweetOfComment.tweetId);
    } else if (t.sharedFromCommunity) {
      quotedRef = doc(db, "communities", t.sharedFromCommunity, "posts", t.retweetOfComment.tweetId);
    } else {
      quotedRef = doc(db, "tweets", t.retweetOfComment.tweetId);
    }

    const quotedSnap = await getDoc(quotedRef);
    if (quotedSnap.exists()) {
      const quoted = quotedSnap.data();
      const parsedQuoted = await parseMentionsToLinks(quoted.text || "", quoted.mentions || []);
      const userSnap = await getDoc(doc(db, "users", quoted.uid));
      const { username, avatar, displayName, IQ: uIQ, premium } = await getUserData(quoted.uid);
      const userData = userSnap.exists() ? userSnap.data() : {};
      const premiumExpiry = premium ? premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;
      const hasText = quoted.text?.trim()?.length > 0;
      const hasImage = quoted.media && quoted.mediaType === "image";
      const hasVideo = quoted.media && quoted.mediaType === "video";
      const likeCount = quoted.likeCount || 0;
      const viewCount = quoted.viewsCount || 0;
      const commentCount = quoted.commentCount || 0;
      const retweetCount = quoted.retweetCount || 0;

      let communityHTML = "";
      let communityName = "";
      let titleHTML2 = "";

      if (quoted.title) {
        titleHTML2 = `<h3 style="margin:10px 0;">${escapeHTML(quoted.title)}</h3>`
      }

      if (quoted.communityId && window.communityID == null) {
        communityName = await getCommunityNameById(quoted.communityId);
        communityHTML = `
          <div class="communityLink" data-id="${quoted.communityId}" style="cursor:pointer;display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0">
            <img height="20" src="/image/community-filled.svg">
            ${escapeHTML(communityName)}
          </div>`;
      }

      let pollHTML1 = "";
      if (quoted.poll && Array.isArray(quoted.poll.options)) {
        const uid = auth.currentUser?.uid;
        let myVoteIndex = null;
        if (uid) {
          let voteRef;
          if (window.communityID != null) {
            voteRef = doc(db, "communities", window.communityID, "posts", t.retweetOfComment.tweetId, "votes", uid);
          } else {
            voteRef = doc(db, "tweets", t.retweetOfComment.tweetId, "votes", uid);
          }
          const voteSnap = await getDoc(voteRef);
          if (voteSnap.exists()) {
            myVoteIndex = voteSnap.data().optionIndex;
          }
        }
        pollHTML1 = renderPoll(quoted, t.retweetOfComment.tweetId, myVoteIndex);
      }

      let editHTML2 = "";
      if (quoted.edited) {
        editHTML2 = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(quoted.edited)}
        </span>
      `
      }

      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();

      let translateHTML1 = "";
      if (quoted.language && quoted.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML1 = `
          <div class="translate-wrapper" style="margin-top:4px;">
            <span
              class="translate-btn"
              data-id="${t.retweetOfComment.tweetId}"
              data-random="${random}"
              data-from="${quoted.language}"
              data-to="${defaultLanguage}"
              data-text="${quoted.text}"
              data-title="null"
              style="color:#B0C4DE;cursor:pointer;font-size:15px;">
              Translate from ${quoted.language}
            </span>
            <div
              id="translated-${t.retweetOfComment.tweetId}-${random}"
              class="translated-text"
              style="display:none;color:grey;font-size:16px;">
            </div>
          </div>
        `;
      }

      if (hasImage && hasText) {
        const rtsrc = base91ToImageSrc(quoted.media);
        const rtcontainsSpoiler = /\|\|.+?\|\|/.test(quoted.text);

        originalQuoted = `
            <div class="quoted-comment actuallyATweet" data-community-id="${quoted.communityId || null}" data-id="${t.retweetOfComment.tweetId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img loading='lazy' class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(quoted.mentions && quoted.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${uIQ}</div>` 
              }
              <strong class="user-link" data-uid="${quoted.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img loading='lazy' src="/image/check.svg" style="margin:0;margin-left:-5px">` : ""} <span class="usernamee">@${escapeHTML(username)} •</span> ${formatDate(quoted.createdAt)} </span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-text="${quoted.text}" data-author="${quoted.uid}" class="menubtn">
                <img src="/image/three-dots.svg">
              </span>
            </div>
            <div class="quoted-body">
              ${communityHTML}
              ${titleHTML2}
              <p style="margin: 0px 0px 15px;">${parsedQuoted}</p> 
              ${translateHTML1} 
              ${editHTML2}
              ${pollHTML1}
              ${rtcontainsSpoiler ?
                `<div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
                  <div class="spoiler-overlay">
                    <div class="spoilertxt">sensitive</div>
                  </div>
                  <img loading='lazy' src="${rtsrc}" data-src="${rtsrc}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                </div>` :
                `<div class="attachment">
                  <img loading='lazy' src="${rtsrc}" data-src="${rtsrc}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
                </div>`
              }
            </div>
          </div>`;
      } else if (hasVideo && hasText) {
        const vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const containsSpoiler = /\|\|.+?\|\|/.test(quoted.text);

        originalQuoted = `
          <div class="quoted-comment actuallyATweet" data-community-id="${quoted.communityId || null}" data-id="${t.retweetOfComment.tweetId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(quoted.mentions && quoted.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${uIQ}</div>` 
              }
              <strong class="user-link" data-uid="${quoted.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
              <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img src="/image/check.svg" style="margin-left:-5px">` : ""} <span class="usernamee">@${username} •</span> ${formatDate(quoted.createdAt)} </span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-text="${quoted.text}" data-author="${quoted.uid}" class="menubtn">
                <img src="/image/three-dots.svg">
              </span>
            </div>
            <div class="quoted-body"> ${communityHTML} ${titleHTML2}
              <p style="margin: 0px 0px 15px;">${parsedQuoted}</p> 
              ${translateHTML1} 
              ${editHTML2}
              ${pollHTML1}
              ${containsSpoiler ?
                `<div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
                  <div class="spoiler-overlay">
                    <div class="spoilertxt">sensitive</div>
                  </div>
                  <video id="${vidId}" controls style="width: auto !important; height: 250px; object-fit: cover; border-radius:15px;">
                    Your browser does not support the video tag.
                  </video>
                  </div>` :
                  `<div class="attachment">
                    <video id="${vidId}" controls style="width:auto !important; height: 250px; object-fit: cover; border-radius:15px;">
                      Your browser does not support the video tag.
                    </video>
                  </div>`
              }
            </div>
          </div>`;
        getSupabaseVideo(quoted.media, vidId);

      } else {
        originalQuoted = `
          <div class="quoted-comment actuallyATweet" data-community-id="${quoted.communityId || null}" data-id="${t.retweetOfComment.tweetId}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" 
                   onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(quoted.mentions && quoted.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${uIQ}</div>` 
              }
              <strong class="user-link" data-uid="${quoted.uid}" style="cursor:pointer">
                ${escapeHTML(displayName || 'Unknown')}
              </strong>
              <span style="color:grey;font-size:12px;">
                ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
                <span class="usernamee">@${username} •</span> ${formatDate(quoted.createdAt)}
              </span>
              <span style="cursor:pointer;margin-left:auto" data-community-id="${quoted.communityId || null}" data-text="${quoted.text}" data-author="${quoted.uid}" class="menubtn"><img src="/image/three-dots.svg"></span>
            </div>
            <div class="quoted-body">
              ${communityHTML}
              ${titleHTML2}
              <p style="margin:6px 0 12px;">${parsedQuoted}</p> ${translateHTML1} ${editHTML2}
              ${pollHTML1}
            </div>
          </div>`;
      }
    } else {
      originalQuoted = `
        <div class="quoted-comment actuallyATweet">
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

  if (t.retweetOf || t.originalId) {
    let retweetDoc;
    if (t.sharedFromCommunity || window.communityID || t.communityId || comid) {
      retweetDoc = await getDoc(doc(db, "communities", t.sharedFromCommunity || window.communityID || t.communityId || comid, "posts", t.originalId));
    } else {
      retweetDoc = await getDoc(doc(db, "tweets", t.retweetOf));
    }
    if (retweetDoc.exists()) {
      const rt = retweetDoc.data();
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
        IQ: qIQ,
        premium
      } = await getUserData(rt.uid);
      const userSnap = await getDoc(doc(db, "users", rt.uid));
      const premiumExpiry = premium ? premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;
      let communityHTML = "";
      let communityName = "";
      let titleHTML1 = "";
      if (rt.title) {
        titleHTML1 = `<p style="margin:0;margin-top:10px;font-size:18px;font-weight:bold;margin-bottom:10px;">${escapeHTML(rt.title)}</p>`;
      }
      if (rt.communityId && window.communityID == null) {
        communityName = await getCommunityNameById(rt.communityId);
        communityHTML = `
          <div class="communityLink" data-id="${rt.communityId}" style="cursor:pointer;display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0;margin-top:10px;">
            <img height="20" src="/image/community-filled.svg">
            ${escapeHTML(communityName)}
          </div>`;
      } else if (rt.sharedFromCommunity && window.communityID == null) {
        communityName = await getCommunityNameById(rt.sharedFromCommunity);
        communityHTML = `
          <div class="communityLink" data-id="${rt.sharedFromCommunity}" style="cursor:pointer;display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0;margin-top:10px;">
            <img height="20" src="/image/community-filled.svg">
            ${escapeHTML(communityName)}
          </div>`;
      }
      let editHTML1 = "";
      if (rt.edited) {
        editHTML1 = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(rt.edited)}
        </span>
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

      if (hasImage && hasText) {
        let parsedText;
        if (t.retweettext) {
          parsedText = await parseMentionsToLinks(t.retweettext, rt.mentions || []);
        } else {
          parsedText = await parseMentionsToLinks(rt.text, rt.mentions || []);
        }

        const rtsrc = base91ToImageSrc(rt.media);
        const rtcontainsSpoiler = /\|\|.+?\|\|/.test(rt.text);

        retweetHTML = `
          <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || t.communityId || null}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img loading='lazy' class="avatar" src="${escapeHTML(rtAvatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(rt.mentions && rt.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${qIQ}</div>` 
              }
              <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img loading='lazy' src="/image/check.svg" style="margin:0;margin-left:-5px">` : ""} <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} </span>
              <div style="margin-left:auto">
                <span class="menubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-text="${rt.text}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                  <img loading='lazy' src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
              ${communityHTML}
              ${titleHTML1}
              <p style="margin: 0;margin-bottom:10px;">${parsedText}</p> 
              ${translateHTML2} 
              ${editHTML1}
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
        const rtcontainsSpoiler = /\|\|.+?\|\|/.test(rt.text);

        retweetHTML = `
          <div class="quoted-comment actuallyATweet" data-id="${t.retweetOf || t.originalId}" data-community-id="${t.sharedFromCommunity || rt.communityId || t.communityId || null}">
            <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
              <img loading='lazy' class="avatar" src="${escapeHTML(rtAvatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(rt.mentions && rt.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${qIQ}</div>` 
              }
              <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img loading='lazy' src="/image/check.svg" style="margin:0;margin-left:-5px">` : ""} <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} </span>
              <div style="margin-left:auto">
                <span class="menubtn" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-text="${rt.text}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                  <img loading='lazy' src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body">
              ${communityHTML}
              ${titleHTML1}
              <p style="margin: 0;margin-bottom:10px;">${parsedText}</p> 
              ${translateHTML2} 
              ${editHTML1}
              ${pollHTML2}
              ${rtcontainsSpoiler ?
                `<div class="attachment spoiler-media" style="margin-bottom:15px" onclick="this.classList.add('revealed')">
                  <div class="spoiler-overlay">
                    <div class="spoilertxt">sensitive</div>
                  </div>
                  <video id="${vidRtId}" controls style="width: auto !important; height: 250px; object-fit: cover; border-radius:15px;">
                    Your browser does not support the video tag.
                  </video>
                </div>` :
                `<div class="attachment" style="margin-bottom:15px">
                  <video id="${vidRtId}" controls style="width:auto !important; height: 250px; object-fit: cover; border-radius:15px;">
                    Your browser does not support the video tag.
                  </video>
                </div>`
              }
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
              ${(rt.mentions && rt.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${qIQ}</div>` 
              }
              <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName || 'Unknown')}</strong>
              <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img loading='lazy' src="/image/check.svg" style="margin:0;margin-left:-5px">` : ""} <span class="usernamee">@${rtUsername} •</span> ${formatDate(rDate)} </span>
              <div style="margin-left:auto">
                <span class="menubtn" data-text="${rt.text}" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${t.retweetOf || t.originalId}" data-author="${rt.uid}">
                  <img loading='lazy' src="/image/three-dots.svg">
                </span>
              </div>
            </div>
            <div class="quoted-body" style="margin-bottom:22px;">
              ${communityHTML}
              ${titleHTML1}
              <p style="margin: 0;margin-bottom:15px;">${parsedText}</p> 
              ${translateHTML2} 
              ${editHTML1}
              ${pollHTML2}
            </div>
          </div>`;
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
  const premiumExpiry = premium ? premium.toDate() : null;
  const now = new Date();
  const isPremium = premiumExpiry && premiumExpiry > now;
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
  let communityName = "";
  let titleHTML = "";
  if (t.title) {
    titleHTML = `<h3 style="margin:10px 0;">${escapeHTML(t.title)}</h3>`
  }
  if (t.communityId && window.communityID != t.communityId) {
    communityName = await getCommunityNameById(t.communityId);
    communityHTML = `
      <div class="communityLink" data-id="${t.communityId}" style="cursor:pointer;display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0;margin-top:10px;">
        <img height="20" src="/image/community-filled.svg">
        ${escapeHTML(communityName)}
      </div>`;
  } else if (t.sharedFromCommunity && window.communityID != t.sharedFromCommunity) {
    communityName = await getCommunityNameById(t.sharedFromCommunity);
    communityHTML = `
      <div class="communityLink" data-id="${t.sharedFromCommunity}" style="cursor:pointer;display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0;margin-top:10px;">
        <img height="20" src="/image/community-filled.svg">
        ${escapeHTML(communityName)}
      </div>`;
  }
  let editHTML = "";
  if (t.edited) {
    editHTML = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(t.edited)}
        </span>
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
  const tweetHTML = `         
  <div class="tweet" id="tweet-${tweetId}" data-id="${tweetId}" ${t.communityId ? `data-community-id="${t.communityId}"` : ""}>
  ${originalQuoted}
  ${quotedHTML}
  ${retweetHTML}
  <div class="flex" style="gap:10px;margin:0;">
    <img class="avatar" src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30" />
              ${(t.mentions && t.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${IQ}</div>` 
              }
    <strong class="user-link" data-uid="${t.uid}" style="cursor:pointer;font-size:17px;">${escapeHTML(displayName)}</strong>
    ${isPremium ? `<img src="/image/check.svg" style="margin:0 -5px;">` : ""}
    <span style="color:#757779;font-size:12px"><span class="usernamee">@${username} •</span> ${dateStr}</span>
    <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-text="${t.text}" data-author="${t.uid}" class="menubtn"><img src="/image/three-dots.svg"></span>
  </div>
  ${communityHTML}
  ${titleHTML}
  <p>${parsedText}</p> ${translateHTML3} ${editHTML}
  <div class="tweet-media">
    ${mediaHTML}
  </div>
  ${pollHTML}
  <div class="flex">
    <span style="cursor:pointer;color:#757779" data-community-id="${window.communityID || null}" class="like-btn" id="likeBtn-${tweetId}">
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
</div>`;
  container.innerHTML = tweetHTML;
  const likeEl = container.querySelector(`#${likeId}`);
  getSnap(likeRef, likeEl);

  const newTweet = container.querySelector(`#tweet-${tweetId}`);
  if (newTweet) {
    applyReadMoreLogic(newTweet);
  }
}

export async function viewTweet(tweetId, comid) {
  const overlay = document.getElementById("tweetViewer");
  const userBox = overlay.querySelector("#appendTweet");
  userBox.innerHTML = "";
  overlay.classList.remove("hidden");
  document.body.classList.add('no-scroll');

  if (comid) {
    await loadTweetRecursive(tweetId, userBox, comid);
  } else {
    await loadTweetRecursive(tweetId, userBox);
  }
}

async function loadTweetRecursive(tweetId, container, comid) {
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
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynt found</h2><p style="color:grey;margin:7px 0;">seems like this Wynt have been deleted or else you don't have permission to view it.</p></div></div>
    `;
    return null;
  }

  const tweetData = tweetDoc.data();
  const tweetDiv = document.createElement("div");
  tweetDiv.className = "tweet-box";
  tweetDiv.dataset.id = tweetId;
  tweetDiv.innerHTML = ``;

  if (comid) {
    await renderTweetViewer(tweetData, tweetId, container, auth.currentUser, comid);
  } else {
    await renderTweetViewer(tweetData, tweetId, container, auth.currentUser);
  }

  container.appendChild(tweetDiv);

  if (comid) {
    await loadComments(tweetId, tweetDiv, comid);
  } else {
    await loadComments(tweetId, tweetDiv);
  }

  if (tweetData.originalTweetId) {
    const originalContainer = document.createElement("div");
    originalContainer.className = "tweet-box original-chain";
    tweetDiv.appendChild(originalContainer);
    if (comid) {
      await loadTweetRecursive(tweetData.originalTweetId, originalContainer, comid);
    } else {
      await loadTweetRecursive(tweetData.originalTweetId, originalContainer);
    }
  }
  return tweetData;
}

document.body.addEventListener("click", async (e) => {
  const link = e.target.closest(".original-tweet-link, .actuallyATweet, .tweet");
  if (!link) return;
  const tweetId = link.dataset.id;
  const rawId = link.dataset.communityId;
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
      e.target.closest(".quoted-comment:not(.quoted-comment.actuallyATweet):not(.quoted-comment.retweet)") || 
      e.target.closest("#appendEdit .tweet") || 
      e.target.closest(".spoilerr") || 
      e.target.closest(".communityLink") || 
      e.target.closest("#replyComment") || 
      e.target.closest("video") || 
      e.target.closest(".internal-link") || 
      e.target.closest(".translate-btn") ||
      e.target.closest("a") ||
      e.target.closest(".morereplies1")
  ) {
    return;
  }

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
  box.innerHTML = "";
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
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No Wynt found</h2><p style="color:grey;margin:7px 0;">seems like this Wynt have been deleted.</p></div></div>
    `;
    return;
  }

  const tweetData = tweetSnap.data();
  await renderTweetViewer(tweetData, tweetId, box, auth.currentUser);
  await loadComments(tweetId, true, null, null, communityId);
});

document.getElementById("tweetviewerclose").addEventListener("click", async () => {
  const overlay = document.getElementById("tweetViewer");
  overlay.classList.add("hidden");
  history.pushState({}, '', '/');
});

const MIN_LEN = 3;
const COMMENTS_PAGE = 10;
const commentSearchInput = document.querySelector("#commentSearch input");
const appendCommentSearch = document.getElementById("appendCommentSearch");
window.previousCommentTerm = "";

commentSearchInput.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  if (!document.querySelector("#tweetViewer #appendTweet .tweet") && !document.querySelector("#commentViewer #appendComment #actuallyATweet")) {
    log("red", "please wait and try again");
    return;
  }

  const term = commentSearchInput.value.trim();
  if (term === window.previousCommentTerm) return;

  window.previousCommentTerm = term;
  appendCommentSearch.innerHTML = "";

  if (term.length < 3) {
    appendCommentSearch.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:300px;text-align:left;">
          <h2 style="margin:0;display:flex;gap:10px;"><img height="33" style="transform:rotate(90deg)" src="/image/search.svg"> Search for Replies</h2>
          <p style="color:grey;margin:7px 0;">enter at least 3 characters to search replies.</p>
        </div>
      </div>`;
    return;
  }

  let currentTweetId;
  if (!document.getElementById("tweetViewer").classList.contains("hidden")) {
    currentTweetId = document.querySelector("#tweetViewer #appendTweet .tweet").dataset.id;
  } else if (document.getElementById("tweetViewer").classList.contains("hidden") && !document.getElementById("commentViewer").classList.contains("hidden")) {
    currentTweetId = document.querySelector("#commentViewer #appendComment #actuallyATweet").dataset.id;
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

  const col = window.communityID ? collection(db, "communities", window.communityID, "posts", currentTweetId, "comments") : collection(db, "tweets", currentTweetId, "comments");
  const q = lastCommentDoc ? query(col, ...base, startAfter(lastCommentDoc)) : query(col, ...base);

  const snap = await getDocs(q);
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

  if (!snap.empty) {
    appendCommentSearch.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:300px;text-align:left;">
          <h2 style="margin:0;">No results</h2>
          <p style="color:grey;margin:7px 0;">Seems like we couldn't find what you're looking for. Try searching for another query.</p>
        </div>
      </div>`;
    lastCommentDoc = snap.docs[snap.docs.length - 1];
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

    let commentRef, quotedHTML;
    if (window.communityID != null) {
      commentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", parentId);
    } else if (comid != null && comid != "null" && comid != "undefined" && comid != undefined) {
      commentRef = doc(db, "communities", comid, "posts", tweetId, "comments", parentId);
    } else if (sharedfromcommunity != null && sharedfromcommunity != "null" && sharedfromcommunity != "undefined" && sharedfromcommunity != undefined) {
      commentRef = doc(db, "communities", sharedfromcommunity, "posts", tweetId, "comments", parentId);
    } else {
      commentRef = doc(db, "tweets", tweetId, "comments", parentId);
    }

    const commentSnap = await getDoc(commentRef);
    if (commentSnap.exists()) {
      const comment = commentSnap.data();
      const commentUserSnap = await getDoc(doc(db, "users", comment.uid));
      const commentUser = commentUserSnap.exists() ? commentUserSnap.data() : {};
      const { username, avatar, displayName, IQ: aIQ, premium } = await getUserData(comment.uid);
      const parsedCommentText = await parseMentionsToLinks(comment.text || "", comment.mentions || []);
      const hasImage = comment.media && comment.mediaType === "image";
      const hasVideo = comment.media && comment.mediaType === "video";
      const hasText = comment.text?.trim()?.length > 0;
      const userSnap = await getDoc(doc(db, "users", comment.uid));
      const premiumExpiry = premium ? premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;

      let donationHTML = "";
      if (comment.donationReceived) {
        donationHTML = `
          <span style="color:#0485b7;font-size:15px;padding-bottom:10px;display:block">
            <img draggable="false" class="emoji" alt="🎁" src="https://ox7jbzyn-13kwt53x-purp2e2u.netlify.app/twemoji/svg/1f381.svg"> Gifted <span style="color:#f91880;font-weight:bold;">${formatNumber(comment.donationReceived)}</span> Wcoins
          </span>
        `;
      }

      let editHTML3 = "";
      if (comment.edited) {
        editHTML3 = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(comment.edited)}
        </span>
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

      if (hasImage && hasText) {
        const containsSpoiler = /\|\|.+?\|\|/.test(comment.text);
        const src = base91ToImageSrc(comment.media.url);
        const path = `${tweetId}-${parentId}`;

        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div class="quoted-comment renderedparent" data-community-id="${sharedfromcommunity || null}" data-id="${tweetId}" data-comment-id="${parentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
              `<div class=iq style="margin:0">${aIQ}</div>` 
            }
            <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span>
            <div style="margin-left:auto">
              <span class="cmenubtn" data-text="${comment.text}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${comment.uid}">
                <img src="/image/three-dots.svg">
              </span>
            </div>
          </div>
          <div class="quoted-body">
          <p style="margin: 0px 0px 15px;">${parsedCommentText}</p> 
          ${translateHTML} 
          ${editHTML3}
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
          </div>
          `;
      } else if (hasVideo && hasText) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const containsSpoiler = /\|\|.+?\|\|/.test(comment.text);
        const path = `${tweetId}-${parentId}`;

        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div class="quoted-comment renderedparent" data-id="${tweetId}" data-community-id="${sharedfromcommunity || null}" data-comment-id="${parentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
          <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
          ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
            `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
            `<div class=iq style="margin:0">${aIQ}</div>` 
          }
          <strong class="user-link" data-uid="${comment.uid}" style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span>
          <div style="margin-left:auto">
            <span class="cmenubtn" data-text="${comment.text}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${comment.uid}">
              <img src="/image/three-dots.svg">
            </span>
          </div>
          </div>
          <div class="quoted-body">
          <p style="margin: 0px 0px 15px;">${parsedCommentText}</p> 
          ${translateHTML} 
          ${editHTML3}
          ${containsSpoiler ?
            `<div class="attachment spoiler-media" style="margin-bottom:5px" onclick="this.classList.add('revealed')">
              <div class="spoiler-overlay">
                <div class="spoilertxt">sensitive</div>
              </div>
              <video id="${vidId}" controls style="width: auto !important; height: 250px; object-fit: cover; border-radius:15px;">
                Your browser does not support the video tag.
              </video>
              </div>` :
              `<div class="attachment" style="margin-bottom:5px">
                <video id="${vidId}" controls style="width:auto !important; height: 250px; object-fit: cover; border-radius:15px;">
                  Your browser does not support the video tag.
                </video>
              </div>`
          }
          ${donationHTML}
          ${pollHTML}
          </div>
          </div>
          `;
        getSupabaseVideo(comment.media.url, vidId);

      } else if (hasImage) {
        const src = base91ToImageSrc(comment.media.url);
        const path = `${tweetId}-${parentId}`;

        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
          <div id="${path}"></div>
          <div class="quoted-comment renderedparent" data-id="${tweetId}" data-community-id="${sharedfromcommunity || null}" data-comment-id="${parentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
              `<div class=iq style="margin:0">${aIQ}</div>` 
            }
            <strong class="user-link"   data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span>
            <div style="margin-left:auto"><span class="cmenubtn" data-text="${comment.text}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${comment.uid}">
              <img src="/image/three-dots.svg">
            </span></div>
          </div>
          <div class="quoted-body">
          <div class="attachment">
            <img loading='lazy' src="${src}" data-src="${src}" class="upscale" onerror="this.onerror=null;this.src='/image/image-error.png';" />
          </div>
          ${donationHTML}
          ${pollHTML}
        </div>`;

      } else if (hasVideo) {
        vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const path = `${tweetId}-${parentId}`;

        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
          <div id="${path}"></div>
        <div class="quoted-comment renderedparent"  data-id="${tweetId}" data-community-id="${sharedfromcommunity || null}" data-comment-id="${parentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
              `<div class=iq style="margin:0">${aIQ}</div>` 
            }
            <strong class="user-link"   data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span>
            <div style="margin-left:auto"><span class="cmenubtn" data-text="${comment.text}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${comment.uid}">
              <img src="/image/three-dots.svg">
            </span></div>
          </div>
          <div class="quoted-body">
          <div class="attachment" style="margin-bottom:5px">
            <video id="${vidId}" controls style="width:auto !important; height: 250px; object-fit: cover; border-radius:15px;">
              Your browser does not support the video tag.
            </video>
          </div>
          ${donationHTML}
          ${pollHTML}
        </div>`;

        getSupabaseVideo(comment.media.url, vidId);
      } else {
        const path = `${tweetId}-${parentId}`;

        quotedHTML = `
          ${comment.parentId != null ? `<button class=morereplies1 id="more-replies-${path}" onclick="renderparent('${sharedfromcommunity}', '${comid}', '${tweetId}', '${comment.parentId}', '${path}', ${isFromMain})" style="margin-top:17px;color:grey;margin-bottom:-5px;font-size:16px;padding:0;background:none;color:var(--color);text-decoration:underline;">more replies...</button>` : ""}
          <div id="${path}"></div>
        <div class="quoted-comment renderedparent" data-id="${tweetId}" data-community-id="${sharedfromcommunity || null}" data-comment-id="${parentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar"  src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}"  onerror="this.src='/image/default-avatar.jpg'"  width="30">
            ${(comment.mentions && comment.mentions.includes(auth.currentUser.uid)) ?
              `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
              `<div class=iq style="margin:0">${aIQ}</div>` 
            }
            <strong class="user-link" data-uid="${comment.uid}"  style="cursor:pointer">${escapeHTML(displayName || 'Unknown')}</strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(comment.createdAt)}
            </span> 
            <div style="margin-left:auto"><span class="cmenubtn" data-text="${comment.text}" data-id="${parentId}" data-tweet="${tweetId}" data-author="${comment.uid}">
              <img src="/image/three-dots.svg">
            </span></div>
          </div>
          <div class="quoted-body">
          <p style="margin: 6px 0px 12px;margin-top:6px;">${parsedCommentText}</p> 
          ${translateHTML} 
          ${editHTML3}
          ${donationHTML}
          ${pollHTML}
        </div>`;
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
    document.getElementById(`more-replies-${element}`).remove();
    document.getElementById(`${element}`).innerHTML = quotedHTML;
}

window.renderparent = renderparent;