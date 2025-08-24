let points = 0;

// Load saved points
if (localStorage.getItem("ecoPoints")) {
  points = parseInt(localStorage.getItem("ecoPoints"));
  document.getElementById("points").innerText = points;
}

function addPoints(value) {
  points += value;
  document.getElementById("points").innerText = points;
  localStorage.setItem("ecoPoints", points);

  // Toast message
  showToast("✅ You earned " + value + " points!");
}

function redeemPoints() {
  if (points >= 50) {
    showToast("🎉 Congratulations! You redeemed a reward!");
    points -= 50;
  } else {
    showToast("⚠️ You need at least 50 points to redeem.");
  }
  document.getElementById("points").innerText = points;
  localStorage.setItem("ecoPoints", points);
}

// Simple toast popup
function showToast(message) {
  let toast = document.createElement("div");
  toast.className = "toast";
  toast.innerText = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 100);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
// Register service worker for PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .then(() => console.log("Service Worker Registered ✅"))
    .catch((err) => console.log("Service Worker Error ❌", err));
}

