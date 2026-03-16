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