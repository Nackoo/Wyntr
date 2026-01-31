import { auth, db, doc, runTransaction, increment, arrayUnion } from "./firebase.js";
import { log, confirmDialog } from "./texts.js";

const loading = document.getElementById("loadingOverlay");

document.getElementById("buypremium").onclick = async () => {
  loading.classList.add("show");
  const requiredImage = "/image/ocean.gif";

  const preloadImage = (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const user = auth.currentUser;
  if (!user) {
    log("red", "You must be logged in to purchase premium");
    loading.classList.remove("show");
    return;
  }

  const userRef = doc(db, "users", user.uid);

  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) {
        loading.classList.remove("show");
        throw "User not found.";
      }

      const userData = userSnap.data();
      const balance = userData.balance || 0;

      if (balance < 500) {
        loading.classList.remove("show");
        throw "Not enough Wcoins.";
      }

      if (!(await confirmDialog("buy premium?", "Are you sure you want to buy Premium for Wcoins?"))) {
        loading.classList.remove("show");
        throw "Purchase cancelled.";
      }

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 29);

      transaction.update(userRef, {
        balance: increment(-500),
        premium: expiryDate
      });
    });

    await preloadImage(requiredImage);
    document.getElementById("premiumOverlay").classList.add("hidden");
    document.getElementById("welcomeOverlay").classList.remove("hidden");
    loading.classList.remove("show");
  } catch (err) {
    console.error("Error upgrading to premium:", err);
    log("red", `error: ${err}`);
  }
};

// DON'T USE THESE: 001 006 004 007

document.getElementById("buyFlameEffect").onclick = () =>
  buyEffect("002", 90, "flame profile effect");

document.getElementById("buyRainEffect").onclick = () =>
  buyEffect("003", 110, "rain profile effect");

document.getElementById("buyEarthEffect").onclick = () =>
  buyEffect("005", 120, "earth profile effect");

document.getElementById("buyWaveEffect").onclick = () =>
  buyEffect("008", 150, "wave profile effect");

document.getElementById("buyFihEffect").onclick = () =>
  buyEffect("009", 90, "Fih profile effect");

  document.getElementById("buySakuraEffect").onclick = () =>
  buyEffect("010", 90, "Sakura profile effect");

async function buyEffect(effectId, price, effectName) {
  loading.classList.add("show");

  const user = auth.currentUser;
  if (!user) {
    loading.classList.remove("show");
    log("red", "You must be logged in to make a purchase");
    return;
  }
  const userRef = doc(db, "users", user.uid);

  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        loading.classList.remove("show");
        log("red", "user isn't logged in");
        return;
      }

      const userData = userSnap.data();
      const balance = userData.balance || 0;
      const effectsOwned = userData.effectsOwned || [];

      if (effectsOwned.includes(effectId)) {
        loading.classList.remove("show");
        log("red", "you already own this effect");
        return;
      }

      if (balance < price) {
        loading.classList.remove("show");
        log("red", "not enough Wcoins");
        return;
      }

      if (!(await confirmDialog("buy effect?", `Are you sure you want to purchase ${effectName} for ${price} WC?`))) {
        loading.classList.remove("show");
        log("green", "purchase cancelled");
        return;
      }

      const updates = {
        balance: increment(-price),
        effectsOwned: arrayUnion(effectId)
      };

      if (!effectsOwned.includes("none")) {
        updates.effectsOwned = arrayUnion("none", effectId);
      }

      transaction.update(userRef, updates);
      loading.classList.remove("show");
      log("green", `${effectName} is now usable!`);
    });
  } catch (err) {
    log("red", err);
  }
}
