function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}
function php(n, rate = 58) {
  return `PHP ${(Number(n || 0) * rate).toFixed(2)}`;
}

const demoState = JSON.parse(localStorage.getItem("zignals_demo_state") || "null") || {
  availableUsd: 1200,
  tradeEligibleUsd: 1200,
  tradeRestrictedUsd: 0,
  totalWithdrawnUsd: 0,
  deposits: [],
  withdrawals: [],
  trades: [],
};

function saveState() {
  localStorage.setItem("zignals_demo_state", JSON.stringify(demoState));
}

function bindSidebar(section) {
  document.querySelectorAll(".submenu").forEach((el) => el.classList.remove("open"));
  if (section === "managed") document.getElementById("managed-submenu")?.classList.add("open");
  if (section === "wallet") document.getElementById("wallet-submenu")?.classList.add("open");
  document.getElementById("toggle-managed")?.addEventListener("click", () => {
    document.getElementById("managed-submenu")?.classList.toggle("open");
  });
  document.getElementById("toggle-wallet")?.addEventListener("click", () => {
    document.getElementById("wallet-submenu")?.classList.toggle("open");
  });
}

function renderCommon() {
  const avail = document.querySelectorAll("[data-available]");
  const eligible = document.querySelectorAll("[data-eligible]");
  avail.forEach((el) => (el.textContent = `${money(demoState.availableUsd)} · ${php(demoState.availableUsd)}`));
  eligible.forEach((el) => (el.textContent = `${money(demoState.tradeEligibleUsd)} · ${php(demoState.tradeEligibleUsd)}`));
}

function addToast(msg) {
  alert(msg);
}

function bindManagedTrade() {
  const amount = document.getElementById("trade-amount");
  const maxBtn = document.getElementById("trade-max");
  const form = document.getElementById("trade-form");
  const history = document.getElementById("trade-history");
  const lock = 30;
  const dailyPct = 1;

  const renderHistory = () => {
    history.innerHTML = demoState.trades
      .map(
        (t) => `<tr><td>${new Date(t.createdAt).toLocaleString()}</td><td>${money(t.amountUsd)}</td><td>${t.status}</td><td>${money(t.expectedReturn)}</td></tr>`
      )
      .join("");
  };
  renderHistory();

  maxBtn?.addEventListener("click", () => {
    amount.value = demoState.tradeEligibleUsd.toFixed(2);
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = Number(amount.value);
    if (!Number.isFinite(v) || v <= 0) return addToast("Enter valid trade amount.");
    if (v > demoState.tradeEligibleUsd) return addToast("Amount exceeds eligible-to-trade balance.");

    demoState.availableUsd -= v;
    demoState.tradeEligibleUsd -= v;
    demoState.trades.unshift({
      amountUsd: v,
      status: "ACTIVE",
      expectedReturn: v * 1.3,
      createdAt: new Date().toISOString(),
      lockDays: lock,
      dailyPct,
    });
    saveState();
    renderCommon();
    renderHistory();
    form.reset();
    addToast("Trade executed.");
  });
}

function bindDeposit() {
  const form = document.getElementById("deposit-form");
  const history = document.getElementById("deposit-history");
  const render = () => {
    history.innerHTML = demoState.deposits
      .map((d) => `<tr><td>${new Date(d.createdAt).toLocaleString()}</td><td>${d.method}</td><td>${money(d.amountUsd)}</td><td>${d.status}</td></tr>`)
      .join("");
  };
  render();
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const amount = Number(fd.get("amount"));
    const method = String(fd.get("method"));
    if (!Number.isFinite(amount) || amount <= 0) return addToast("Enter valid deposit amount.");
    demoState.deposits.unshift({ method, amountUsd: amount, status: "PENDING", createdAt: new Date().toISOString() });
    saveState();
    render();
    form.reset();
    addToast("Deposit request submitted.");
  });
}

function bindWithdraw() {
  const form = document.getElementById("withdraw-form");
  const history = document.getElementById("withdraw-history");
  const render = () => {
    history.innerHTML = demoState.withdrawals
      .map((w) => `<tr><td>${new Date(w.createdAt).toLocaleString()}</td><td>${money(w.amountUsd)}</td><td>${w.destination}</td><td>${w.status}</td></tr>`)
      .join("");
  };
  render();
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const amount = Number(fd.get("amount"));
    const destination = String(fd.get("destination"));
    if (!Number.isFinite(amount) || amount <= 0) return addToast("Enter valid withdrawal amount.");
    if (amount > demoState.availableUsd) return addToast("Insufficient available balance.");
    demoState.availableUsd -= amount;
    demoState.totalWithdrawnUsd += amount;
    demoState.withdrawals.unshift({ amountUsd: amount, destination, status: "PENDING", createdAt: new Date().toISOString() });
    saveState();
    renderCommon();
    render();
    form.reset();
    addToast("Withdrawal request submitted.");
  });
}

window.DemoApp = {
  bindSidebar,
  renderCommon,
  bindManagedTrade,
  bindDeposit,
  bindWithdraw,
};
