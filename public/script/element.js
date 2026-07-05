export const messagesvg = `
<svg
    style="min-height: 24px; min-width: 24px; margin-top: 6px"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    fill="currentColor"
    viewBox="0 0 24 24"
>
    <path
        fill-rule="evenodd"
        d="M4 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1v2a1 1 0 0 0 1.707.707L9.414 13H15a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4Z"
        clip-rule="evenodd"
    />
    <path
        fill-rule="evenodd"
        d="M8.023 17.215c.033-.03.066-.062.098-.094L10.243 15H15a3 3 0 0 0 3-3V8h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1v2a1 1 0 0 1-1.707.707L14.586 18H9a1 1 0 0 1-.977-.785Z"
        clip-rule="evenodd"
    />
</svg>`;

export const retweetsvg = `
<svg
    style="min-height: 24px; min-width: 24px; margin-top: 6px"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    fill="none"
    viewBox="0 0 24 24"
>
    <path
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="m16 10 3-3m0 0-3-3m3 3H5v3m3 4-3 3m0 0 3 3m-3-3h14v-3"
    />
</svg>`;

export const coinsvg = `
<svg
    style="min-height: 24px; min-width: 24px; margin-top: 6px"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    fill="none"
    viewBox="0 0 24 24"
>
    <path
        fill="currentColor"
        d="M10.7367 14.5876c.895.2365 2.8528.754 3.1643-.4966.3179-1.2781-1.5795-1.7039-2.5053-1.9117-.1034-.0232-.1947-.0437-.2694-.0623l-.6025 2.4153c.0611.0152.1328.0341.2129.0553Zm.8452-3.5291c.7468.1993 2.3746.6335 2.6581-.5025.2899-1.16213-1.2929-1.5124-2.066-1.68348-.0869-.01923-.1635-.03619-.2262-.0518l-.5462 2.19058c.0517.0129.1123.0291.1803.0472Z"
    />
    <path
        fill="currentColor"
        fill-rule="evenodd"
        d="M9.57909 21.7008c5.35781 1.3356 10.78401-1.9244 12.11971-7.2816 1.3356-5.35745-1.9247-10.78433-7.2822-12.11995C9.06034.963624 3.6344 4.22425 2.2994 9.58206.963461 14.9389 4.22377 20.3652 9.57909 21.7008ZM14.2085 8.0526c1.3853.47719 2.3984 1.1925 2.1997 2.5231-.1441.9741-.6844 1.4456-1.4013 1.6116.9844.5128 1.485 1.2987 1.0078 2.6612-.5915 1.6919-1.9987 1.8347-3.8697 1.4807l-.454 1.8196-1.0972-.2734.4481-1.7953c-.2844-.0706-.575-.1456-.8741-.2269l-.44996 1.8038-1.09594-.2735.45407-1.8234c-.10059-.0258-.20185-.0522-.30385-.0788-.15753-.0411-.3168-.0827-.47803-.1231l-1.42812-.3559.54468-1.2563s.80844.215.7975.1991c.31063.0769.44844-.1256.50282-.2606l.71781-2.8766.11562.0288c-.04375-.0175-.08343-.0288-.11406-.0366l.51188-2.05344c.01375-.23312-.06688-.52719-.51125-.63812.01718-.01157-.79688-.19813-.79688-.19813l.29188-1.17187 1.51313.37781-.0013.00562c.2275.05657.4619.11032.7007.16469l.4497-1.80187 1.0965.27343-.4406 1.76657c.2944.06718.5906.135.8787.20687l.4375-1.755 1.0975.27344-.4493 1.8025Z"
        clip-rule="evenodd"
    />
</svg>`;

export const communityoverlay = `    
<div class="user-box" style="height:100dvh !important;width:100%;max-width:539px;pointer-events:auto;">
    <header class="flex" style="position:absolute;top:20px;left:0;right:0;margin:0">
        <button onclick="document.getElementById('createCommunity').classList.add('hidden')" class="close-btn">
            <img src="/image/x.svg" alt="Close">
        </button>
    </header>

    <div class="banner-preview1" style="z-index:1;">
        <div id="com-banner-preview"></div>
        <div class="group">
            <label class="button" id="com-banner-label" for="com-banner-input"><img src="/image/upload.svg"></label>
        </div>
    </div>

    <div class="ava-preview1">
        <div id="com-ava-preview"></div>
        <label class="button" id="com-ava-label" for="com-ava-input"></label>
    </div>
    <br>

    <h2 id="createCom">Create a Community</h2>

    <p style="margin-bottom:10px">Name</p>
    <input id="communityNameInput" type="text" placeholder="i just lost my dawg" style="border:none;padding:0;color:grey">

    <p style="margin-bottom:10px">Description</p>
    <input id="communityDescInput" type="text" placeholder="a community on wyntr" style="border:none;padding:0;color:grey">

    <hr style="margin:0 -20px;margin-top:15px;">
    <div id="comTags">
        <p>Select up to 3 tags</p>
        <p style="color:grey;font-size:15px;">Choose topics your community is made for</p>

        <div id="communityTagOptions">
            ${["tech","gaming","entertainment","lifestyle","art","science","social","finance","hobbies"]
            .map(t => `
            <div class="tagBox" data-tag="${t}" style="padding:5px 12px;border-radius:8px;cursor:pointer;border:1px solid transparent;font-size:15px;">
                ${t}
            </div>
            `).join("")}
        </div>
    </div>

    <hr style="margin:0 -20px;margin-top:15px;">
    <p>Community mode</p>
      
    <div style="display:flex;align-items:center;gap:5px;margin:5px 0;margin-bottom:10px;color:grey">
        <span>Accepting applications</span>
        <div class="switch-row" style="margin-left:auto">
            <input id="acceptApplicationCheck" type="checkbox">
            <label for="acceptApplicationCheck" class="switch-label" aria-hidden="true">
                <span class="switch-track">
                    <span class="switch-knob" aria-hidden="true"></span>
                </span>
            </label>
        </div>
    </div>

    <div style="display:flex;align-items:center;gap:5px;margin:5px 0;margin-bottom:10px;color:grey">
        <span>Only admins can Wynt</span>
        <div class="switch-row" style="margin-left:auto">
            <input id="onlyAdmins" type="checkbox">
            <label for="onlyAdmins" class="switch-label" aria-hidden="true">
                <span class="switch-track">
                    <span class="switch-knob" aria-hidden="true"></span>
                </span>
            </label>
        </div>
    </div>

    <div id="followersonly" style="display:flex;align-items:center;gap:5px;margin:5px 0;margin-bottom:10px;color:grey">
        <span>Only your followers can join</span>
        <div class="switch-row" style="margin-left:auto">
            <input id="followersOnly" type="checkbox">
            <label for="followersOnly" class="switch-label" aria-hidden="true">
                <span class="switch-track">
                    <span class="switch-knob" aria-hidden="true"></span>
                </span>
            </label>
        </div>
     </div>

    <div style="display:flex;align-items:center;gap:5px;margin:5px 0;color:grey">
        <span>Private community</span>
        <div class="switch-row" style="margin-left:auto">
            <input id="privateCheck" type="checkbox">
            <label for="privateCheck" class="switch-label" aria-hidden="true">
                <span class="switch-track">
                    <span class="switch-knob" aria-hidden="true"></span>
                </span>
            </label>
        </div>
    </div>

    <hr style="margin:0 -20px;margin-top:15px;">

    <div id="rulesSection">
        <p style="margin-top:15px;">community Rules</p>
        <p style="color:grey;font-size:15px;">These rules must comply with the <a href="/user/tos" target="_blank">Wyntr terms of service</a></p>

        <div id="rulesList" style="display:flex;flex-direction:column;gap:10px;margin-top:10px;"></div>

        <button id="addRuleBtn" class="link" style="margin-top:15px;">+ Add Rule</button>
    </div>
          
    <div style="display:flex;gap:5px;align-items:Center;margin-top:10px;">
        <button id="createCommunityBtn" style="padding:10px 25px;border-radius:10px;margin-top:5px;" class="">Create for 300 Wcoins</button>
        <button id="cancelCreateCommunityBtn" style="background:none;color:var(--color);border:none;margin-left:auto;text-decoration:underline">Cancel</button>
    </div>

    <input type="file" id="com-banner-input" class="hidden-input" accept="image/*">
    <button id="com-ava-input" class="hidden-input"></button>
    <br><br><br><br><br><br><br>
</div>`;

export const USERS_SKELETON = `
<div style="margin: 0 -20px">
    <div class="skeleton-card">
        <div class="skeleton-header">
            <div class="skeleton-avatar"></div>
            <div class="skeleton-header-lines">
                <div class="skeleton-line long"></div>
                <div class="skeleton-line medium"></div>
            </div>
        </div>
    </div>
    <div class="skeleton-card">
        <div class="skeleton-header">
            <div class="skeleton-avatar"></div>
            <div class="skeleton-header-lines">
                <div class="skeleton-line long"></div>
                <div class="skeleton-line medium"></div>
            </div>
        </div>
    </div>
    <div class="skeleton-card">
        <div class="skeleton-header">
            <div class="skeleton-avatar"></div>
            <div class="skeleton-header-lines">
                <div class="skeleton-line long"></div>
                <div class="skeleton-line medium"></div>
            </div>
        </div>
    </div>
</div>`;

export const TWEETS_SKELETON = `
<div class="skeleton-card" style="margin-top:50px">
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
</div>
<div class="skeleton-card">
    <div class="skeleton-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-header-lines">
            <div class="skeleton-line short"></div>
        </div>
        <div class="skeleton-dot"></div>
    </div>
    <div class="skeleton-body">
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line short"></div>
    </div>
    <div class="skeleton-footer">
        <div class="skeleton-pill small"></div>
        <div class="skeleton-pill small"></div>
        <div class="skeleton-pill small"></div>
        <div class="invisible skeleton-pill small"></div>
        <div class="skeleton-pill small last"></div>
    </div>
</div>
<div class="skeleton-card">
    <div class="skeleton-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-header-lines">
            <div class="skeleton-line short"></div>
        </div>
        <div class="skeleton-dot"></div>
    </div>
    <div class="skeleton-body">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line medium"></div>
    </div>
    <div class="skeleton-footer">
        <div class="skeleton-pill small"></div>
        <div class="skeleton-pill small"></div>
        <div class="skeleton-pill small"></div>
        <div class="invisible skeleton-pill small"></div>
        <div class="skeleton-pill small last"></div>
    </div>
</div>
`;

export const NO_ACCESS = `
<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
    <div style="max-width:400px;text-align:left;">
        <h2 style="margin:0;">No permission</h2>
        <p style="color:grey;margin:7px 0;">This user chose to not show this list publicly.</p>
    </div>
</div>
`;

export const COMMUNITIES_SKELETON = `
<div class="skeleton-skibidi">
    <div class="skeleton-card" style="width:100%;margin:30px -15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div></div></div><div class="skeleton-line medium" style="margin-top:-15px"></div></div>
</div>
<div class="skeleton-skibidi">
    <div class="skeleton-card" style="width:100%;margin:30px -15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div></div></div><div class="skeleton-line medium" style="margin-top:-15px"></div></div>
</div>
<div class="skeleton-skibidi">
    <div class="skeleton-card" style="width:100%;margin:30px -15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div></div></div><div class="skeleton-line medium" style="margin-top:-15px"></div></div>
</div>`;

export const BOOKMARKS_SKELETON = `
<div class="skeleton-skibidi">
    <div class="skeleton-card" style="width:100%;margin-right:0;margin-left:0"><div class="skeleton-header"><div class="skeleton-header-lines" style="margin:0;"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div></div></div>
</div>
<div class="skeleton-skibidi">
    <div class="skeleton-card" style="width:100%;margin-right:0;margin-left:0"><div class="skeleton-header"><div class="skeleton-header-lines" style="margin:0;"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div></div></div>
</div>
<div class="skeleton-skibidi">
    <div class="skeleton-card" style="width:100%;margin-right:0;margin-left:0"><div class="skeleton-header"><div class="skeleton-header-lines" style="margin:0;"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div></div></div>
</div>
<div class="skeleton-skibidi">
    <div class="skeleton-card" style="width:100%;margin-right:0;margin-left:0"><div class="skeleton-header"><div class="skeleton-header-lines" style="margin:0;"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div></div></div>
</div>
<div class="skeleton-skibidi">
    <div class="skeleton-card" style="width:100%;margin-right:0;margin-left:0"><div class="skeleton-header"><div class="skeleton-header-lines" style="margin:0;"><div class="skeleton-line short"></div><div class="skeleton-line medium"></div></div></div></div>
</div>
`;

function CREATE_OVERLAY(overlay, list, placeholder) {
    const Overlay = document.createElement("div");
    Overlay.id = overlay;
    Overlay.className = "useroverlay hidden";

    Overlay.innerHTML = `
        <div class="user-box" style="height:100dvh !important;">
            <header style="margin:0 -20px;padding:0 20px;background:rgba(0, 0, 0, 0.9);backdrop-filter: blur(10px);border-bottom:var(--border)">
                <button onclick="document.getElementById('${overlay}').classList.add('hidden')" class="close-btn" style="position:absolute;top:13px;left:0;"><img src="/image/leftArrow.svg"></button>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:100%;padding:12px;display:flex;align-items:center;gap:10px;margin-right:-20px;">
                        <input style="margin:0 10px;" type="text" placeholder="${placeholder ? placeholder : "search anything"}">
                    </div>
                </div>
            </header>
            <br>
            <div id="${list}"></div>
            <br><br><br><br><br><br>
        </div>`;
    document.body.appendChild(Overlay);
    console.log(`${overlay} created`);
}

CREATE_OVERLAY("followOverlay", "followList");
CREATE_OVERLAY("profileCom", "profileComList");
CREATE_OVERLAY("viewlikesOverlay", "viewlikesList", "search user");
CREATE_OVERLAY("blockOverlay", "blockList", "search mutes");
CREATE_OVERLAY("archiveOverlay", "archiveList", "search archives");