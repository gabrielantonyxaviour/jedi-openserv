import { CHARACTERS, AGENT_TYPES } from "./characters.js";

// Global state
let currentSide = null;
let currentAgentIndex = 0;
let userWallet = null;
let userId = null;
let web3 = null;

// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Get user ID from URL or Telegram
const urlParams = new URLSearchParams(window.location.search);
userId = urlParams.get("user_id") || tg.initDataUnsafe?.user?.id;

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    showScreen("side-selection");
  }, 2000);
});

// Screen management
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });
  document.getElementById(screenId).classList.add("active");
}

// Side selection
window.selectSide = async (side) => {
  currentSide = side;

  // Update theme
  document.body.className = side === "dark" ? "dark-side" : "light-side";

  // Save selection
  if (userId) {
    await fetch("/api/select-side", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, side }),
    });
  }

  // Setup character introduction
  setupCharacterIntro(side);
  showScreen("character-intro");
};

// Character introduction setup
function setupCharacterIntro(side) {
  const sideData = CHARACTERS[side];
  const sideBadge = document.getElementById("side-badge");
  const sideTitle = document.getElementById("side-title");

  sideBadge.textContent = side === "light" ? "🔵" : "🔴";
  sideTitle.textContent = side === "light" ? "Jedi Council" : "Sith Order";

  // Create agent cards
  const agentsGrid = document.getElementById("agents-grid");
  agentsGrid.innerHTML = "";

  AGENT_TYPES.forEach((agentType, index) => {
    const character = sideData[agentType.id];
    const agentCard = document.createElement("div");
    agentCard.className = `agent-card ${index === 0 ? "active" : ""}`;
    agentCard.innerHTML = `
            <div class="agent-icon">${character.image}</div>
            <h2 class="agent-name">${character.name}</h2>
            <h3 class="agent-title">${character.title}</h3>
            <p class="agent-greeting">"${character.greeting}"</p>
            <p class="agent-description">${character.description}</p>
        `;
    agentsGrid.appendChild(agentCard);
  });

  currentAgentIndex = 0;
  updateAgentDisplay();
}

// Agent navigation
window.nextAgent = () => {
  if (currentAgentIndex < 3) {
    currentAgentIndex++;
    updateAgentDisplay();
  }
};

window.previousAgent = () => {
  if (currentAgentIndex > 0) {
    currentAgentIndex--;
    updateAgentDisplay();
  }
};

function updateAgentDisplay() {
  const agentCards = document.querySelectorAll(".agent-card");
  agentCards.forEach((card, index) => {
    card.classList.toggle("active", index === currentAgentIndex);
  });

  document.querySelector(".current").textContent = currentAgentIndex + 1;
  document.getElementById("prev-agent").disabled = currentAgentIndex === 0;
  document.getElementById("next-agent").disabled = currentAgentIndex === 3;

  if (currentAgentIndex === 3) {
    document.getElementById("meet-agents").style.display = "block";
  }
}

// Wallet connection
window.showWalletConnection = () => {
  showScreen("wallet-connection");
};

window.connectWallet = async () => {
  if (typeof window.ethereum !== "undefined") {
    try {
      web3 = new Web3(window.ethereum);
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      userWallet = accounts[0];
      document.getElementById("wallet-status").innerHTML = `
                ✅ Wallet Connected<br>
                <small>${userWallet.slice(0, 6)}...${userWallet.slice(
        -4
      )}</small>
            `;

      // Save wallet connection
      if (userId) {
        await fetch("/api/connect-wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, walletAddress: userWallet }),
        });
      }

      document.getElementById("payment-section").style.display = "block";
    } catch (error) {
      document.getElementById("wallet-status").innerHTML = `
                ❌ Connection failed: ${error.message}
            `;
    }
  } else {
    document.getElementById("wallet-status").innerHTML = `
            ❌ Please install MetaMask or another Web3 wallet
        `;
  }
};

window.payActivationFee = async () => {
  if (!web3 || !userWallet) {
    alert("Please connect your wallet first");
    return;
  }

  try {
    document.getElementById("payment-status").innerHTML =
      "⏳ Processing payment...";

    // Switch to Base Sepolia (chainId: 84532)
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x14a34" }], // 84532 in hex
      });
    } catch (switchError) {
      // Add Base Sepolia if not found
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x14a34",
              chainName: "Base Sepolia",
              nativeCurrency: {
                name: "ETH",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia-explorer.base.org"],
            },
          ],
        });
      }
    }

    // Send transaction
    const txHash = await web3.eth.sendTransaction({
      from: userWallet,
      to: "0x742d35Cc6609BC5E85A3A7b5f98F10D6Cd7f2C4a", // Replace with your address
      value: web3.utils.toWei("0.0001", "ether"),
      gas: 21000,
    });

    document.getElementById("payment-status").innerHTML = `
            ✅ Payment successful!<br>
            <small>TX: ${txHash.slice(0, 10)}...</small>
        `;

    // Verify payment
    if (userId) {
      await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, txHash }),
      });
    }

    setTimeout(() => {
      showWelcome();
    }, 2000);
  } catch (error) {
    document.getElementById("payment-status").innerHTML = `
            ❌ Payment failed: ${error.message}
        `;
  }
};

// Welcome screen
function showWelcome() {
  const userSummary = document.getElementById("user-summary");
  userSummary.innerHTML = `
        <h3>🌟 Your Jedi Configuration</h3>
        <p><strong>Side:</strong> ${
          currentSide === "light" ? "🔵 Light Side" : "🔴 Dark Side"
        }</p>
        <p><strong>Wallet:</strong> ${userWallet.slice(
          0,
          6
        )}...${userWallet.slice(-4)}</p>
        <p><strong>Agents:</strong> 4 Active</p>
        <p><strong>Status:</strong> ✅ Ready for Action</p>
    `;

  showScreen("welcome");
}

window.openTelegram = () => {
  tg.close();
};

window.showAgentPanel = () => {
  // Could show a detailed agent panel or redirect back to character intro
  showScreen("character-intro");
};
