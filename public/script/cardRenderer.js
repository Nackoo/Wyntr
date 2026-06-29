import { getDoc, doc, db, auth } from "./firebase.js";
import { escapeHTML, formatDate } from "./texts.js";
import { getUserData, waitForAuth } from "./index.js";
import { base91ToImageSrc } from "./attachments.js";

export async function renderCard(url, match) {
    const userMatch           = url.match(/^\/user\/([^/]+)/);
    const tweetMatch          = url.match(/^\/wynt\/([^/]+)$/);
    const communityTweetMatch = url.match(/^\/community\/([^/]+)\/wynt\/([^/]+)$/);
    const communityReplyMatch = url.match(/^\/community\/([^/]+)\/wynt\/([^/]+)\/reply\/([^/]+)$/);
    const replyMatch          = url.match(/^\/wynt\/([^/]+)\/reply\/([^/]+)$/);
    const communityMatch      = url.match(/^\/community\/([^/]+)$/);

    let internal = `
      <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
        <img height="13px" src="/image/info.svg">
        <div style="color:grey;">invalid link</div>
      </div>
    `;

    if (communityMatch) {
      const snap = await getDoc(doc(db, "communities", communityMatch[1]));

      if (snap.exists()) {
        const data = snap.data();

        if (data.private && !(data.members || []).includes(auth.currentUser.uid)) {
          internal = `
            <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
              <img height="13px" src="/image/info.svg">
              <div style="color:grey;">This community is private</div>
            </div>
          `
        } else {
          internal = `
            <div class="card-community" data-id="${communityMatch[1]}" style="display:flex;align-items:center;gap:12px;">
              <img style="border-radius:7px;min-height:39px;max-height:39px;min-width:39px;max-width:39px;" src="${base91ToImageSrc(data.avatar)}">
              <div style="display:flex;flex-direction:column;gap:2px;">
                <strong class="user-link">${escapeHTML(data.name)}</strong>
                <span style="color:grey;font-size:14px;">${escapeHTML(data.description)}</span>
              </div>
            </div>
          `;
        }
      } else {
        internal = `
          <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
            <img height="13px" src="/image/info.svg">
            <div style="color:grey;">user does not exist</div>
          </div>
        `;
      }
    } else if (communityReplyMatch) {
      const [, communityId, tweetId, commentId] = communityReplyMatch;
      const communitySnap = await getDoc(doc(db, "communities", communityId));

      if (communitySnap.exists()) {
        const cdata = communitySnap.data();
        if (cdata.private && !(cdata.members || []).includes(auth.currentUser.uid)) {
          internal = `
            <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
              <img height="13px" src="/image/info.svg">
              <div style="color:grey;">This community is private</div>
            </div>
          `;          
        } else {
          const snap = await getDoc(doc(db, "communities", communityId, "posts", tweetId, "comments", commentId));

          if (snap.exists()) {
            const data = snap.data();

            const userdata = await getUserData(data.uid);
            internal = `
              <div class="card-reply" data-id="${commentId}" data-tweet="${tweetId}" data-community-id="${communityId}" style="display:flex;gap:9px;">
                <img style="margin-top:5px;min-height:39px;max-height:39px;min-width:39px;max-width:39px;border-radius:7px;" src="${base91ToImageSrc(userdata.avatar)}">
                <div style="display:flex;flex-direction:column;gap:2px;">
                  <div style="display:flex;align-items:center;gap:7px;">
                    <strong style="font-size:14px;" class="user-link">${escapeHTML(userdata.displayName)}</strong>
                    <span class="usernamee" style="color:grey;font-size:14px;">@${escapeHTML(userdata.username)}</span>
                    <span style="color:grey;font-size:14px;">• ${formatDate(data.createdAt)}</span>
                  </div>
                  <span style="font-size:14px;">${data.text.length > 100 ? `${escapeHTML(data.text.slice(0, 100))} ...` : escapeHTML(data.text)}</span>
                  ${data.media ? `
                    <span style="color:grey;font-size:14px;">media attached</span>
                  ` : ""}
                </div>
              </div>
            `;        
          } else {
            internal = `
              <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
                <img height="13px" src="/image/info.svg">
                <div style="color:grey;">Post does not exist</div>
              </div>
            `;
          }
        }
      }
    } else if (communityTweetMatch) {
      const [, communityId, tweetId] = communityTweetMatch;
      const communitySnap = await getDoc(doc(db, "communities", communityId));

      if (communitySnap.exists()) {
        const cdata = communitySnap.data();
        if (cdata.private && !(cdata.members || []).includes(auth.currentUser.uid)) {
          internal = `
            <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
              <img height="13px" src="/image/info.svg">
              <div style="color:grey;">This community is private</div>
            </div>
          `;          
        } else {
          const snap = await getDoc(doc(db, "communities", communityId, "posts", tweetId));

          if (snap.exists()) {
            const data = snap.data();

            if (data.archived == true && data.uid != auth.currentUser.uid) {
              internal = `
                <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
                  <img height="13px" src="/image/info.svg">
                  <div style="color:grey;">This Wynt is archived</div>
                </div>
              `;
            } else {
              const userdata = await getUserData(data.uid);
              internal = `
                <div class="card-tweet" data-id="${tweetId}" data-community-id="${communityId}" style="display:flex;gap:9px;">
                  <img style="margin-top:5px;min-height:39px;max-height:39px;min-width:39px;max-width:39px;border-radius:7px;" src="${base91ToImageSrc(userdata.avatar)}">
                  <div style="display:flex;flex-direction:column;gap:2px;">
                    <div style="display:flex;align-items:center;gap:7px;">
                      <strong style="font-size:14px;" class="user-link">${escapeHTML(userdata.displayName)}</strong>
                      <span class="usernamee" style="color:grey;font-size:14px;">@${escapeHTML(userdata.username)}</span>
                      <span style="color:grey;font-size:14px;">• ${formatDate(data.createdAt)}</span>
                    </div>
                    <span style="font-size:14px;">${data.text.length > 100 ? `${escapeHTML(data.text.slice(0, 100))} ...` : escapeHTML(data.text)}</span>
                    ${data.media ? `
                      <span style="color:grey;font-size:14px;">media attached</span>
                    ` : ""}
                  </div>
                </div>
              `;        
            }
          } else {
            internal = `
              <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
                <img height="13px" src="/image/info.svg">
                <div style="color:grey;">Post does not exist</div>
              </div>
            `;
          }
        }
      }
    } else if (replyMatch) {
      const snap = await getDoc(doc(db, "tweets", replyMatch[1], "comments", replyMatch[2]));

      if (snap.exists()) {
        const data = snap.data();

        if (data.archived == true && data.uid != auth.currentUser.uid) {
          internal = `
            <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
              <img height="13px" src="/image/info.svg">
              <div style="color:grey;">This Wynt is archived</div>
            </div>
          `;
        } else {
          const userdata = await getUserData(data.uid);
          internal = `
            <div class="card-reply" data-id="${replyMatch[2]}" data-tweet="${replyMatch[1]}" data-community-id="null" style="display:flex;gap:9px;">
              <img style="margin-top:5px;min-height:39px;max-height:39px;min-width:39px;max-width:39px;border-radius:7px;" src="${base91ToImageSrc(userdata.avatar)}">
              <div style="display:flex;flex-direction:column;gap:2px;">
                <div style="display:flex;align-items:center;gap:7px;">
                  <strong style="font-size:14px;" class="user-link">${escapeHTML(userdata.displayName)}</strong>
                  <span class="usernamee" style="color:grey;font-size:14px;">@${escapeHTML(userdata.username)}</span>
                  <span style="color:grey;font-size:14px;">• ${formatDate(data.createdAt)}</span>
                </div>
                <span style="font-size:14px;">${data.text.length > 100 ? `${escapeHTML(data.text.slice(0, 100))} ...` : escapeHTML(data.text)}</span>
                ${data.media ? `
                  <span style="color:grey;font-size:14px;">media attached</span>
                ` : ""}
              </div>
            </div>
          `;        
        }
      } else {
        internal = `
          <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
            <img height="13px" src="/image/info.svg">
            <div style="color:grey;">Post does not exist</div>
          </div>
        `;
      }
    } else if (tweetMatch) {
      const snap = await getDoc(doc(db, "tweets", tweetMatch[1]));

      if (snap.exists()) {
        const data = snap.data();

        if (data.archived == true && data.uid != auth.currentUser.uid) {
          internal = `
            <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
              <img height="13px" src="/image/info.svg">
              <div style="color:grey;">This Wynt is archived</div>
            </div>
          `;
        } else {
          const userdata = await getUserData(data.uid);
          internal = `
            <div class="card-tweet" data-id="${tweetMatch[1]}" data-community-id="null" style="display:flex;gap:9px;">
              <img style="margin-top:5px;min-height:39px;max-height:39px;min-width:39px;max-width:39px;border-radius:7px;" src="${base91ToImageSrc(userdata.avatar)}">
              <div style="display:flex;flex-direction:column;gap:2px;">
                <div style="display:flex;align-items:center;gap:7px;">
                  <strong style="font-size:14px;" class="user-link">${userdata.displayName}</strong>
                  <span class="usernamee" style="color:grey;font-size:14px;">@${escapeHTML(userdata.username)}</span>
                  <span style="color:grey;font-size:14px;">• ${formatDate(data.createdAt)}</span>
                </div>
                <span style="font-size:14px;">${data.text.length > 100 ? `${escapeHTML(data.text.slice(0, 100))} ...` : escapeHTML(data.text)}</span>
                ${data.media ? `
                  <span style="color:grey;font-size:14px;">media attached</span>
                ` : ""}
              </div>
            </div>
          `;        
        }
      } else {
        internal = `
          <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
            <img height="13px" src="/image/info.svg">
            <div style="color:grey;">Wynt does not exist</div>
          </div>
        `;
      }
    } else if (userMatch) {
      const snap = await getDoc(doc(db, "users", userMatch[1]));
      if (snap.exists()) {
        const data = snap.data();
        internal = `
          <div class=card-user data-uid="${userMatch[1]}" style="display:flex;align-items:center;gap:12px;">
            <img style="border-radius:7px;min-height:39px;max-height:39px;min-width:39px;max-width:39px;" src="${base91ToImageSrc(data.photoURL)}">
            <div style="display:flex;flex-direction:column;gap:2px;">
              <strong class="user-link">${escapeHTML(data.displayName)}</strong>
              <span style="color:grey;font-size:14px;">${escapeHTML(data.username)}</span>
            </div>
          </div>
        `;
      } else {
        internal = `
          <div style="display:flex;align-items:center;gap:7px;font-size:13px;">
            <img height="13px" src="/image/info.svg">
            <div style="color:grey;">user does not exist</div>
          </div>
        `;
      }
    }
    return internal;
}