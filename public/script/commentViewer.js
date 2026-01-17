import { auth, db, doc, getDoc, getDocs, collection, query, orderBy } from "./firebase.js";
import { formatDate, escapeHTML, parseMentionsToLinks, formatNumber, formatTime, getDefaultLanguage, isTranslateEnabled } from "./texts.js";
import { loadComments, getUserData, getCommunityNameById, editicon, getSnap } from "./index.js";
import { getSupabaseVideo, base91ToImageSrc } from "./attachments.js";
 
export async function renderCommentViewer(c, commentId, tweetId, container, communityId) {
  container.innerHTML = `<div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div></div><div class="skeleton-dot"></div></div><div class="skeleton-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div><div class="skeleton-footer"><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="skeleton-pill small"></div><div class="invisible skeleton-pill small"></div><div class="skeleton-pill small last"></div></div></div>`;
  document.getElementById("replyList").innerHTML = "";
  let vidId = null;
  container.dataset.tweet = tweetId;

  const { username, avatar, displayName, IQ, premium } = await getUserData(c.uid);
  const createdAt = formatDate(c.createdAt);
  const parsedText = await parseMentionsToLinks(c.text, c.mentions || []);
  const premiumExpiry = premium ? premium.toDate() : null;
  const now = new Date();

  let comid = "";
  const isPremium = premiumExpiry && premiumExpiry > now;

  let tweetRef;
  if (window.communityID) {
    tweetRef = doc(db, "communities", window.communityID, "posts", tweetId);
  } else if (communityId) {
    tweetRef = doc(db, "communities", communityId, "posts", tweetId);
  } else {
    tweetRef = doc(db, "tweets", tweetId);
  }

  const tweetSnap = await getDoc(tweetRef);
  const t = tweetSnap.data();

  let commentLikeRef;
  if (window.communityID) {
    commentLikeRef = `communities/${window.communityID}/posts/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    comid = window.communityID;
  } else if (communityId) {
    commentLikeRef = `communities/${communityId}/posts/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`
    comid = communityId;
  } else {
    commentLikeRef = `tweets/${tweetId}/comments/${commentId}/likes/${auth.currentUser.uid}`
  }

  const likeId = `like-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  let donationHTML = "";
  if (c.donationReceived) {
    donationHTML = `
    <div style="border-radius:7px;background: var(--dark);display:flex;align-items:center;width:150px;padding:7px 10px;margin-bottom:15px;gap:7px;font-size:15px;color:var(--color);border:1px solid var(--color)">
      🎁 Gifted ${formatNumber(c.donationReceived)} Wcoins
    </div>`;
  }
  let mediaHTML = "";
  const containsSpoiler = /\|\|.+?\|\|/.test(c.text);
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
        <img src="${src}" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin-bottom:5px;" onerror="this.onerror=null;this.src='/image/image-error.png';"/>
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
        <video id="${vidId}" controls style="max-width: auto; max-height: 300px; border-radius: 10px;">Your browser does not support the video tag.<</video> 
      </div>`;
    } else {
      mediaHTML = `
      <div class="attachment" style="position: relative;">
        <video id="${vidId}" controls style="max-width: auto; max-height: 300px; border-radius: 10px;">Your browser does not support the video tag.</video>
      </div>`;
      getSupabaseVideo(c.media.url, vidId);
    }
  }
  let communityHTML = "";
  let communityName = "";
  if (c.communityId && window.communityID == null) {
    communityName = await getCommunityNameById(c.communityId);
    communityHTML = `
      <div class="communityLink" data-id="${c.communityId}" style="cursor:pointer;display:flex;gap:5px;font-size:14px;color:grey;margin:5px 0;margin-top:10px;">
        <img height="20" src="/image/community-filled.svg">
        ${escapeHTML(communityName)}
      </div>`;
  }
  let originalQuoted = "";
  let editHTML = "";
  if (c.edited) {
    editHTML = `       
      <span style="margin-bottom:7px;color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(c.edited)}
        </span>`
  }
  if (document.getElementById("tweetViewer").classList.contains("hidden")) {
    let quotedRef;
    if (window.communityID != null) {
      quotedRef = doc(db, "communities", window.communityID, "posts", tweetId);
    } else if (communityId) {
      quotedRef = doc(db, "communities", communityId, "posts", tweetId);
    } else {
      quotedRef = doc(db, "tweets", tweetId);
    }
    const quotedSnap = await getDoc(quotedRef);
    if (quotedSnap.exists()) {
      const quoted = quotedSnap.data();
      const parsedQuoted = await parseMentionsToLinks(quoted.text || "", quoted.mentions || []);
      const userSnap = await getDoc(doc(db, "users", quoted.uid));
      const {
        username,
        avatar,
        displayName,
        IQ: uIQ,
        premium
      } = await getUserData(quoted.uid);
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
      const donationCount = quoted.donations || 0;

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

      let translateHTML = "";
      if (quoted.language && quoted.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML = `
          <div class="translate-wrapper" style="margin-top:-5px;margin-bottom:5px;
      ">
            <span
              class="translate-btn"
              data-id="${tweetId}"
              data-random="${random}"
              data-from="${quoted.language}"
              data-to="${defaultLanguage}"
              data-text="${quoted.text}"
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

      if (hasImage && hasText) {
        const containsSpoiler = /\|\|.+?\|\|/.test(quoted.text);
        const src = base91ToImageSrc(quoted.media);

        originalQuoted = `
        <div class="quoted-comment actuallyATweet quotedTweet" data-community-id="${quoted.communityId || null}" data-id="${tweetId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(quoted.mentions && quoted.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${uIQ}</div>` 
              }
            <strong class="user-link" data-uid="${quoted.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
            <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img src="/image/check.svg" style="margin-left:-5px">` : ""} <span class="usernamee">@${username} •</span> ${formatDate(quoted.createdAt)} </span>
            <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-author="${quoted.uid}" class="menubtn">
              <img src="/image/three-dots.svg">
            </span>
          </div>
          <div class="quoted-body"> 
            ${communityHTML} 
            ${titleHTML2} 
            <p style="margin:0;">${parsedQuoted}</p>
            ${translateHTML}
            ${editHTML2}
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
          </div>
        </div>`;
      } else if (hasVideo && hasText) {
        const vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const containsSpoiler = /\|\|.+?\|\|/.test(quoted.text);

        originalQuoted = `
        <div class="quoted-comment actuallyATweet quotedTweet" data-community-id="${quoted.communityId || null}" data-id="${tweetId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(quoted.mentions && quoted.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${uIQ}</div>` 
              }
            <strong class="user-link" data-uid="${quoted.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
            <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img src="/image/check.svg" style="margin-left:-5px">` : ""} <span class="usernamee">@${username} •</span> ${formatDate(quoted.createdAt)} </span>
            <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-author="${quoted.uid}" class="menubtn">
              <img src="/image/three-dots.svg">
            </span>
          </div>
          <div class="quoted-body"> ${communityHTML} ${titleHTML2}
            <p style="margin:0;">${parsedQuoted}</p> 
            ${translateHTML}
            ${editHTML2}
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
          </div>
        </div>`;
        getSupabaseVideo(quoted.media, vidId);
      } else {
        originalQuoted = `
        <div class="quoted-comment actuallyATweet quotedTweet" data-community-id="${quoted.communityId || null}" data-id="${tweetId}">
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
            <span style="cursor:pointer;margin-left:auto" data-community-id="${quoted.communityId || null}" data-author="${quoted.uid}" class="menubtn"><img src="/image/three-dots.svg"></span>
          </div>
          <div class="quoted-body">
            ${communityHTML}
            ${titleHTML2}
            <p style="margin:6px 0 12px;">${parsedQuoted}</p> 
            ${translateHTML}
            ${editHTML2}
          </div>
        </div>`;
      }
    } else {
      originalQuoted = `
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

  let parentReply = "";
  if (document.getElementById("tweetViewer").classList.contains("hidden") && c.parentId) {
    let parentRef;
    if (window.communityID != null) {
      parentRef = doc(db, "communities", window.communityID, "posts", tweetId, "comments", c.parentId);
    } else if (communityId) {
      parentRef = doc(db, "communities", communityId, "posts", tweetId, "comments", c.parentId);
    } else {
      parentRef = doc(db, "tweets", tweetId, "comments", c.parentId);
    }

    const parentSnap = await getDoc(parentRef);
    if (parentSnap.exists()) {
      const parent = parentSnap.data();

      let parsedparent = "";
      if (parent.text) {
        parsedparent = await parseMentionsToLinks(parent.text || "", parent.mentions || []);
      }

      const userSnap = await getDoc(doc(db, "users", parent.uid));
      const { username, avatar, displayName, IQ, premium } = await getUserData(parent.uid);
      const userData = userSnap.exists() ? userSnap.data() : {};
      const premiumExpiry = premium ? premium.toDate() : null;
      const now = new Date();
      const isPremium = premiumExpiry && premiumExpiry > now;

      const hasText = parent.text?.trim()?.length > 0;
      const hasImage = parent.media && parent.mediaType === "image";
      const hasVideo = parent.media && parent.mediaType === "video";

      const likeCount = parent.likeCount || 0;
      const viewCount = parent.viewsCount || 0;
      const commentCount = parent.commentCount || 0;
      const retweetCount = parent.retweetCount || 0;
      const donationCount = parent.donations || 0;

      let editHTML2 = "";
      if (parent.edited) {
        editHTML2 = `
        <span style="color:grey;font-size:14px;display:flex;align-items:center;gap:5px;">
          ${editicon} 
          ${formatTime(parent.edited)}
        </span>
      `
      }

      const defaultLanguage = getDefaultLanguage();
      const isTranslate = isTranslateEnabled();

      let translateHTML = "";
      if (parent.language && parent.language !== defaultLanguage && isTranslate) {
        const random = Math.floor(Math.random() * 10000);
        translateHTML = `
          <div class="translate-wrapper" style="margin-top:-5px;margin-bottom:5px;
          ">
            <span
              class="translate-btn"
              data-id="${tweetId}"
              data-random="${random}"
              data-from="${parent.language}"
              data-to="${defaultLanguage}"
              data-text="${parent.text}"
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

      if (hasImage && hasText) {
        const containsSpoiler = /\|\|.+?\|\|/.test(parent.text);
        const src = base91ToImageSrc(parent.media.url);

        parentReply = `
        ${parent.parentId != null ? `<div style="margin-left:13px;color:grey;margin-bottom:20px;margin-top:5px;font-size:16px;">more replies...</div>` : ""}
        <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(parent.mentions && parent.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${IQ}</div>` 
              }
            <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
            <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img src="/image/check.svg" style="margin-left:-5px">` : ""} <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} </span>
            <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${c.parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" class="cmenubtn">
              <img src="/image/three-dots.svg">
            </span>
          </div>
          <div class="quoted-body"> 
            <p style="margin:0;">${parsedparent}</p>
            ${translateHTML}
            ${editHTML2}
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
          </div>
        </div>`;
      } else if (hasVideo && hasText) {
        const vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const containsSpoiler = /\|\|.+?\|\|/.test(parent.text);

        parentReply = `
        ${parent.parentId != null ? `<div style="margin-left:13px;color:grey;margin-bottom:20px;margin-top:5px;font-size:16px;">more replies...</div>` : ""}
        <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(parent.mentions && parent.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${IQ}</div>` 
              }
            <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
            <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img src="/image/check.svg" style="margin-left:-5px">` : ""} <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} </span>
            <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${c.parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" class="cmenubtn">
              <img src="/image/three-dots.svg">
            </span>
          </div>
          <div class="quoted-body">
            <p style="margin:0;">${parsedparent}</p> 
            ${translateHTML}
            ${editHTML2}
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
          </div>
        </div>`;
        getSupabaseVideo(parent.media.url, vidId);
      } else if (hasVideo) {
        const vidId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const containsSpoiler = /\|\|.+?\|\|/.test(parent.text);

        parentReply = `
        ${parent.parentId != null ? `<div style="margin-left:13px;color:grey;margin-bottom:20px;margin-top:5px;font-size:16px;">more replies...</div>` : ""}
        <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(parent.mentions && parent.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${IQ}</div>` 
              }
            <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
            <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img src="/image/check.svg" style="margin-left:-5px">` : ""} <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} </span>
            <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${c.parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" class="cmenubtn">
              <img src="/image/three-dots.svg">
            </span>
          </div>
          <div class="quoted-body">
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
          </div>
        </div>`;
        getSupabaseVideo(parent.media.url, vidId);
        } else if (hasImage) {
        const containsSpoiler = /\|\|.+?\|\|/.test(parent.text);
        const src = base91ToImageSrc(parent.media.url);

        parentReply = `
        ${parent.parentId != null ? `<div style="margin-left:13px;color:grey;margin-bottom:20px;margin-top:5px;font-size:16px;">more replies...</div>` : ""}
        <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(parent.mentions && parent.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${IQ}</div>` 
              }
            <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer"> ${escapeHTML(displayName || 'Unknown')} </strong>
            <span style="color:grey;font-size:12px;"> ${isPremium ? ` <img src="/image/check.svg" style="margin-left:-5px">` : ""} <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)} </span>
            <span style="cursor:pointer;margin-left:auto" data-community-id="${t.sharedFromCommunity || t.communityId || null}" data-id="${c.parentId}" data-tweet="${tweetId}" data-author="${parent.uid}" class="cmenubtn">
              <img src="/image/three-dots.svg">
            </span>
          </div>
          <div class="quoted-body"> 
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
          </div>
        </div>`;
      } else {
        parentReply = `
        ${parent.parentId != null ? `<div style="margin-left:13px;color:grey;margin-bottom:20px;margin-top:5px;font-size:16px;">more replies...</div>` : ""}
        <div style="padding-top:0;" class="quoted-comment quotedTweet" data-community-id="${parent.communityId || null}" data-id="${tweetId}" data-comment-id="${c.parentId}">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:15px;">
            <img class="avatar" src="${escapeHTML(avatar) || '/image/default-avatar.jpg'}" 
              onerror="this.src='/image/default-avatar.jpg'" width="30">
              ${(parent.mentions && parent.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${IQ}</div>` 
              }
            <strong class="user-link" data-uid="${parent.uid}" style="cursor:pointer">
              ${escapeHTML(displayName || 'Unknown')}
            </strong>
            <span style="color:grey;font-size:12px;">
              ${isPremium ? `<img src="/image/check.svg" style="margin:0; margin-left:-5px;">` : ""}
              <span class="usernamee">@${username} •</span> ${formatDate(parent.createdAt)}
            </span>
            <span style="cursor:pointer;margin-left:auto" data-community-id="${parent.communityId || null}" data-author="${parent.uid}" data-id="${c.parentId}" data-tweet="${tweetId}" class="cmenubtn"><img src="/image/three-dots.svg"></span>
          </div>
          <div class="quoted-body">
            <p style="margin:6px 0 12px;">${parsedparent}</p> 
            ${translateHTML}
            ${editHTML2}
          </div>
        </div>`;
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
  let translateHTML1 = "";
  if (c.language && c.language !== defaultLanguage && isTranslate) {
    const random = Math.floor(Math.random() * 10000);
    translateHTML1 = `
          <div class="translate-wrapper" style="margin-top:-10px;margin-bottom:10px;
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

  container.innerHTML = `
    ${originalQuoted}
    ${parentReply}
    <div class="comment" style="border-bottom:var(--border);padding-bottom:10px;margin-bottom:10px;" id="comment-${commentId}" data-id="${commentId}" data-community-id="${comid || null}" data-tweet="${tweetId}">
      <div class="flex" style="gap:10px;">
        <img class="avatar" src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30" />
              ${(c.mentions && c.mentions.includes(auth.currentUser.uid)) ?
                `<div class="iq" style="background:#fcd15b;margin:0">mention</div>` :
                `<div class=iq style="margin:0">${IQ}</div>` 
              }
        <strong class="user-link" data-uid="${c.uid}" style="cursor:pointer;font-size:17px;">${escapeHTML(displayName)}</strong>
        ${isPremium ? `<img src="/image/check.svg" style="margin:0 -5px;">` : ""}
        <span style="color:#757779;font-size:12px"><span class="usernamee">@${username} •</span> ${createdAt}</span>
        <span class="cmenubtn" data-private="${c.isPrivate || false}" data-community-id="${comid || null}" data-author="${c.uid}" data-id="${commentId}" style="margin-left:auto;" data-tweet="${tweetId}">
          <img src="/image/three-dots.svg">
        </span>
      </div>
      ${communityHTML}
      <p>${parsedText}</p> ${translateHTML1} ${editHTML}
        ${mediaHTML}
        ${donationHTML}
            <div class="flex" style="margin:0;gap:13px;">
              ${c.isHidden ? "" : `
                <span class="comment-like-btn" data-id="${commentId}" data-tweet="${tweetId}" style="cursor:pointer;display:flex;align-items:center;gap:3px;">
                  <div id="${likeId}" style="height:20px">
                    <img src="/image/heart.svg">
                  </div>
                  <span style="color:#757779;" id="comment-like-count-${commentId}">${c.likeCount > 0 ? formatNumber(c.likeCount) : ""}</span>
                </span>

                <span style="cursor:pointer;color:#757779" class="reply-btn" data-id="${commentId}" data-tweet="${tweetId}">
                  <img src="/image/message.svg"> ${c.replyCount > 0 ? formatNumber(c.replyCount) : ""}
                </span>

                ${c.isPrivate ? "" :
                  `<span style="cursor:pointer;color:#757779" class="retweet-btn" data-id="${tweetId}" data-comment-id="${commentId}">
                    <img src="/image/rewint.svg"> ${c.retweetCount > 0 ? formatNumber(c.retweetCount) : ""}
                  </span>`
                }
              `}
            </div>
    </div>`;
  const likeEl = container.querySelector(`#${likeId}`);
  getSnap(commentLikeRef, likeEl);
}

document.body.addEventListener("click", async (e) => {
  const body = e.target.closest(".comment-item");
  if (!body) return;
  const comid = body.dataset.communityId;
  let hascom
  if (comid && comid != "null" && comid != null) {
    hascom = comid;
  }
  const actionEl = body.querySelector(".reply-btn");
  if (!actionEl) return;

  if (
    e.target.closest(".attachment") || 
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
    e.target.closest(".ownerr")
  ) {
    return;
  }
  e.preventDefault();
  document.getElementById("commentSearch").classList.add("hidden");
  const commentId = actionEl.dataset.id;
  const tweetId = actionEl.dataset.tweet;
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
    await renderCommentViewer(commentData, commentId, tweetId, box, hascom);
  }
  loadComments(tweetId, true, commentId, replyList, hascom);
});
document.getElementById("commentviewerclose").addEventListener("click", async () => {
  const overlay = document.getElementById("commentViewer");
  overlay.classList.add("hidden");
});
async function waitForAuth() {
  if (auth.currentUser) return auth.currentUser;
  return new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      resolve(user);
    });
  });
}
window.addEventListener("DOMContentLoaded", async () => {
  const user = await waitForAuth();
  if (!user) return;
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
    await renderCommentViewer(commentData, commentId, tweetId, box, communityId);
    await loadComments(tweetId, true, commentId, replyList, communityId);
  } else {
    box.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:400px;text-align:left;">
          <h2 style="margin:0;">No reply found</h2>
          <p style="color:grey;margin:7px 0;">Seems like this reply has been deleted.</p>
        </div>
      </div>`;
    replyList.innerHTML = "";
  }
  document.body.classList.add("no-scroll");
});

document.body.addEventListener("click", async (e) => {
  const quoted = e.target.closest(".quoted-comment:not(.retweet)");
  if (!quoted) return;

  const tweetId = quoted.dataset.id;
  const commentId = quoted.dataset.commentId;
  const comid = quoted.dataset.communityId;

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
    e.target.closest(".comment-btn") || 
    e.target.closest(".like-btn") || 
    e.target.closest(".viewbtn") || 
    e.target.closest(".menubtn") || 
    e.target.closest(".attachment") || 
    e.target.closest(".attachment2") || 
    e.target.closest(".vote-btn") || 
    e.target.closest(".donate-btn") || 
    e.target.closest(".spoilerr") || 
    e.target.closest(".communityLink") || 
    e.target.closest("video") || 
    e.target.closest(".hiddenCon") || 
    e.target.closest(".internal-link") || 
    e.target.closest(".translate-btn") ||
    e.target.closest("a")
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

      await renderCommentViewer(commentData, commentId, tweetId, box, hascom);
      await loadComments(tweetId, true, commentId, replyList, hascom);
      document.body.classList.add("no-scroll");
    } else {
      box.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:400px;text-align:left;">
            <h2 style="margin:0;">No reply found</h2>
            <p style="color:grey;margin:7px 0;">Seems like this reply has been deleted.</p>
          </div>
        </div>`;
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

  const quoted = e.target.closest(".quoted-comment:not(.retweet), .comment-item");
  if (!quoted) return;

  const tweetId = quoted.dataset.tweet;
  const commentId = quoted.dataset.id;

  const rawComId = quoted.dataset.communityId;
  if (!tweetId || !commentId) return;

  const communityId = rawComId && rawComId !== "null" ? rawComId : null;
  const url = communityId ? `https://wyntr.netlify.app/community/${communityId}/wynt/${tweetId}/reply/${commentId}` : `https://wyntr.netlify.app/wynt/${tweetId}/reply/${commentId}`;
  window.open(url, "_blank", "noopener");
});