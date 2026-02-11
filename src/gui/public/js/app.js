// Sidebar Toggle
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (!sidebar || !overlay) return;

  sidebar.classList.toggle("active");
  overlay.classList.toggle("active");

  if (sidebar.classList.contains("active")) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
}

// Utility: Copy text to clipboard
async function copyText(elementId) {
  const text = document.getElementById(elementId).innerText;
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  } catch (err) {
    console.error("Failed to copy: ", err);
  }
}

// Wallet Operations
async function deleteWallet(name) {
  if (
    !confirm(
      `Are you sure you want to delete wallet "${name}"? This action cannot be undone.`,
    )
  )
    return;

  try {
    const response = await fetch(`/api/wallets/${name}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    alert(data.message);
    window.location.href = "/dashboard";
  } catch (e) {
    alert(e.message);
  }
}

// Peer Connection
document
  .getElementById("connect-peer-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const peer = formData.get("peer");

    try {
      const response = await fetch("/net-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peer }),
      });
      const data = await response.json();
      alert(data.message || "Connection initiated");
      location.reload();
    } catch (e) {
      alert(e.message);
    }
  });

document
  .getElementById("btn-create-wallet")
  ?.addEventListener("click", async () => {
    const name = prompt("Enter wallet name:");
    if (!name) return;

    try {
      const response = await fetch("/api/wallets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      location.reload();
    } catch (e) {
      alert(e.message);
    }
  });

document
  .getElementById("btn-import-wallet")
  ?.addEventListener("click", async () => {
    const name = prompt("Enter wallet name:");
    if (!name) return;
    const mnemonic = prompt("Enter 12-word recovery mnemonic:");
    if (!mnemonic) return;

    try {
      const response = await fetch("/api/wallets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mnemonic }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      alert("Wallet imported successfully!");
      location.reload();
    } catch (e) {
      alert(e.message);
    }
  });

document
  .getElementById("btn-create-wallet-main")
  ?.addEventListener("click", () => {
    document.getElementById("btn-create-wallet").click();
  });

// Transfer Form handler is now in views/transfer.ejs for better UI control

// Mining Controls
let isMining = false;

async function checkMiningStatus() {
  try {
    const response = await fetch("http://localhost:3001/miner/status");
    const data = await response.json();
    isMining = data.isAutoMining;
    updateMiningUI();
  } catch (e) {
    console.error("Failed to check mining status");
  }
}

function updateMiningUI() {
  const badge = document.getElementById("mining-status-badge");
  const btn = document.getElementById("toggle-mining");
  if (!badge || !btn) return;

  if (isMining) {
    badge.innerHTML =
      '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> MINING ACTIVE';
    badge.className =
      "text-[10px] font-bold text-emerald-500 flex items-center gap-2 uppercase tracking-widest mb-2 px-1";
    btn.innerHTML = '<i class="fa-solid fa-stop"></i> STOP MINING';
    btn.className =
      "py-5 px-10 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-2xl font-bold text-sm transition-all border border-zinc-700 flex items-center justify-center gap-4 group active:scale-95";
  } else {
    badge.innerHTML =
      '<span class="w-1.5 h-1.5 rounded-full bg-zinc-700"></span> MINER INACTIVE';
    badge.className =
      "text-[10px] font-bold text-zinc-500 flex items-center gap-2 uppercase tracking-widest mb-2 px-1";
    btn.innerHTML =
      '<i class="fa-solid fa-pickaxe group-hover:rotate-12 transition-transform"></i> START MINING';
    btn.className =
      "py-5 px-10 bg-green-600 hover:bg-green-500 text-white rounded-2xl font-bold text-sm shadow-2xl shadow-green-900/40 transition-all flex items-center justify-center gap-4 group active:scale-95";
  }
}

document
  .getElementById("toggle-mining")
  ?.addEventListener("click", async () => {
    const endpoint = isMining ? "stop" : "start";
    try {
      if (!isMining) {
        // Sync the current wallet address as the payout address before starting
        const payoutAddr = document
          .getElementById("miner-payout-address")
          ?.innerText.trim();
        if (payoutAddr) {
          await fetch("http://localhost:3001/set-miner-address", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ minerAddress: payoutAddr }),
          });
        }
      }

      const response = await fetch(`http://localhost:3001/miner/${endpoint}`, {
        method: "POST",
      });
      const data = await response.json();
      isMining = data.isAutoMining;
      updateMiningUI();
    } catch (e) {
      alert("Failed to toggle mining. Is the Node API running?");
    }
  });

// Config Form
document
  .getElementById("config-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.success) {
        alert("Configuration updated! Restart node if needed.");
      } else {
        throw new Error(data.error || "Failed to update config");
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  });

// --- Real-time Polling ---
async function pollLiveStats() {
  try {
    const res = await fetch("/api/live-stats");
    const data = await res.json();

    // Update Peers
    const peersEl = document.getElementById("live-peers");
    if (peersEl) peersEl.innerText = `${data.nodeStatus.peers} Peers`;

    const statusEl = document.getElementById("live-network-status");
    if (statusEl)
      statusEl.innerText = data.nodeStatus.connected
        ? "Network Live"
        : "Network Offline";

    // Update Header Status
    const headerStatusEl = document.getElementById("live-api-status");
    if (headerStatusEl)
      headerStatusEl.innerText = data.nodeStatus.connected
        ? "API: Online"
        : "API: Offline";

    const headerIndicatorEl = document.getElementById("live-api-indicator");
    if (headerIndicatorEl) {
      headerIndicatorEl.className = `w-1.5 h-1.5 rounded-full ${data.nodeStatus.connected ? "bg-emerald-500 shadow-emerald-500/50" : "bg-red-500 shadow-red-500/50"} shadow-sm`;
    }

    const headerBlockEl = document.getElementById("live-header-block");
    if (headerBlockEl) headerBlockEl.innerText = data.miningData.height;

    // Update Mining Stats (if on mining page)
    const cycleEl = document.getElementById("live-cycle");
    if (cycleEl) cycleEl.innerText = `Cycle #${data.miningData.halvingCycle}`;

    const rewardEl = document.getElementById("live-reward");
    if (rewardEl) rewardEl.innerText = data.miningData.reward;

    const nextBlocksEl = document.getElementById("live-next-blocks");
    if (nextBlocksEl)
      nextBlocksEl.innerText = data.miningData.nextHalving.toLocaleString();

    const progressEl = document.getElementById("live-progress-bar");
    if (progressEl) {
      const progress = ((data.miningData.height % 10000) / 10000) * 100;
      progressEl.style.width = `${progress}%`;
    }
  } catch (e) {
    console.warn("Stats polling failed");
  }
}

// pollWalletBalance removed to avoid conflict with dashboard.ejs
// async function pollWalletBalance() { ... }

// Logs Polling
let lastLogCount = 0;
function clearLogs() {
  const container = document.getElementById("log-container");
  if (container) container.innerHTML = "";
  lastLogCount = 0;
}

async function pollLogs() {
  const container = document.getElementById("log-container");
  const statusEl = document.getElementById("log-status");
  if (!container) return;

  try {
    const res = await fetch("/api/logs");
    const logs = await res.json();

    if (!Array.isArray(logs)) {
      if (statusEl) statusEl.innerText = logs.error || "Failed to load logs";
      return;
    }

    if (logs.length !== lastLogCount) {
      // If cleared or reset, start over
      if (logs.length < lastLogCount) container.innerHTML = "";

      const newLogs = logs.slice(lastLogCount);
      newLogs.forEach((log) => {
        const line = document.createElement("div");
        const time = new Date(log.timestamp).toLocaleTimeString([], {
          hour12: false,
        });

        let levelColor = "text-zinc-500";
        if (log.level === "warn") levelColor = "text-amber-500";
        if (log.level === "error") levelColor = "text-red-500";

        line.className =
          "flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300";
        line.innerHTML = `
          <span class="text-zinc-600 flex-shrink-0">[${time}]</span>
          <span class="${levelColor} uppercase font-bold text-[9px] w-8 flex-shrink-0">${log.level}</span>
          <span class="text-zinc-300 break-all">${log.message}</span>
        `;
        container.appendChild(line);
      });

      lastLogCount = logs.length;

      if (document.getElementById("auto-scroll")?.checked) {
        container.scrollTop = container.scrollHeight;
      }

      if (statusEl)
        statusEl.innerText = `Last updated: ${new Date().toLocaleTimeString()} • ${logs.length} entries`;
    }
  } catch (e) {
    if (statusEl) statusEl.innerText = "Connection lost...";
  }
}

// Global initialization
document.addEventListener("DOMContentLoaded", () => {
  // Check initial mining status
  if (document.getElementById("mining-status-badge")) {
    checkMiningStatus();
  }

  // Start polling every 5 seconds
  pollLiveStats();
  // pollWalletBalance(); // Removed: Handled by dashboard.ejs locally to prevent conflicts
  setInterval(pollLiveStats, 5000);
  // setInterval(pollWalletBalance, 5000);

  // Faster polling for logs if on logs page
  if (document.getElementById("log-container")) {
    pollLogs();
    setInterval(pollLogs, 1500);
  }
});
