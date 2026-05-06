/**
 * Zignals static prototype — vanilla JS.
 * - Uses real Next.js (or Laravel later) APIs when same-origin + logged in.
 * - Falls back to localStorage demo when API returns 401/unreachable.
 *
 * Set API origin before other scripts:
 *   window.__ZIGNALS_API__ = "http://localhost:3000";
 * Or: ?api=http://localhost:3000
 * Or: localStorage.zignals_api_origin
 */
const LOCK_DAYS = 30;
const DAILY_RATE = 0.01;

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}
function phpAmt(n, rate) {
  return `PHP ${(Number(n || 0) * Number(rate || 58)).toFixed(2)}`;
}

function resolveApiBase() {
  if (typeof window.__ZIGNALS_API__ === "string" && window.__ZIGNALS_API__.trim())
    return window.__ZIGNALS_API__.replace(/\/$/, "");
  try {
    const q = new URLSearchParams(window.location.search).get("api");
    if (q) return q.replace(/\/$/, "");
  } catch {
    /* noop */
  }
  const ls = localStorage.getItem("zignals_api_origin");
  if (ls) return ls.replace(/\/$/, "");
  return "";
}

/** @type {"live" | "demo"} */
let apiMode = "demo";
let usdToPhpRate = 58;

const demoState = JSON.parse(localStorage.getItem("zignals_demo_state") || "null") || {
  availableUsd: 1200,
  tradeEligibleUsd: 1200,
  tradeRestrictedUsd: 0,
  totalWithdrawnUsd: 0,
  deposits: [],
  withdrawals: [],
  trades: [],
};

function saveDemoState() {
  localStorage.setItem("zignals_demo_state", JSON.stringify(demoState));
}

async function apiFetch(path, opts = {}) {
  const base = resolveApiBase();
  const url = `${base}${path}`;
  const headers = { ...(opts.headers || {}) };
  if (opts.body && typeof opts.body === "string" && !headers["Content-Type"])
    headers["Content-Type"] = "application/json";

  return fetch(url, {
    ...opts,
    headers,
    credentials: "include",
  });
}

function ensureToastRoot() {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  return root;
}

function toast(title, message, type = "ok") {
  const root = ensureToastRoot();
  const el = document.createElement("div");
  el.className = `toast ${type === "err" ? "err" : "ok"}`;
  el.innerHTML = `<div class="toast-title">${escapeHtml(title)}</div><div class="toast-msg">${escapeHtml(message)}</div>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 380);
  }, 4200);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setApiBadge() {
  document.querySelectorAll("[data-api-badge]").forEach((el) => {
    el.textContent = apiMode === "live" ? "Live API" : "Demo mode";
    el.className = `badge-live ${apiMode === "live" ? "live" : "demo"}`;
  });
}

async function tryActivateLiveApi() {
  const res = await apiFetch("/api/me", { method: "GET" });
  if (res.ok) {
    const j = await res.json();
    if (j.wallet) {
      apiMode = "live";
      usdToPhpRate = Number(j.usdToPhp) || usdToPhpRate;
      setApiBadge();
      return j;
    }
  }
  apiMode = "demo";
  setApiBadge();
  return null;
}

function applyWalletDemoToDom() {
  document.querySelectorAll("[data-available]").forEach(
    (el) => (el.textContent = `${money(demoState.availableUsd)} · ${phpAmt(demoState.availableUsd, usdToPhpRate)}`)
  );
  document.querySelectorAll("[data-eligible]").forEach(
    (el) => (el.textContent = `${money(demoState.tradeEligibleUsd)} · ${phpAmt(demoState.tradeEligibleUsd, usdToPhpRate)}`)
  );
  const tw = document.querySelectorAll("[data-total-withdrawn]");
  tw.forEach((el) => (el.textContent = `${money(demoState.totalWithdrawnUsd)} · ${phpAmt(demoState.totalWithdrawnUsd, usdToPhpRate)}`));
}

async function refreshWalletFromApi() {
  const j = await tryActivateLiveApi();
  if (!j || !j.wallet) {
    applyWalletDemoToDom();
    return;
  }
  const w = j.wallet;
  document.querySelectorAll("[data-available]").forEach(
    (el) => (el.textContent = `${money(w.availableUsd)} · ${phpAmt(w.availableUsd, usdToPhpRate)}`)
  );
  document.querySelectorAll("[data-eligible]").forEach(
    (el) => (el.textContent = `${money(w.tradeEligibleUsd)} · ${phpAmt(w.tradeEligibleUsd, usdToPhpRate)}`)
  );
  document.querySelectorAll("[data-total-withdrawn]").forEach(
    (el) =>
      (el.textContent = `${money(w.totalWithdrawnUsd)} · ${phpAmt(w.totalWithdrawnUsd, usdToPhpRate)}`)
  );
}

function principalNum(inv) {
  return Number(inv.principalUsd);
}

function displayDayFor(inv) {
  const p = principalNum(inv);
  if (!Number.isFinite(p)) return 1;
  if (inv.status === "COMPLETED") return LOCK_DAYS;
  const start = new Date(inv.startedAt).getTime();
  const daysSince = Math.floor((Date.now() - start) / 86400000);
  return Math.min(Math.max(daysSince + 1, 1), LOCK_DAYS);
}

function progressPercent(inv) {
  return Math.min(100, (displayDayFor(inv) / LOCK_DAYS) * 100);
}

function renderAllocationCard(inv) {
  const p = principalNum(inv);
  const day = displayDayFor(inv);
  const pct = progressPercent(inv);
  const accrued = p * DAILY_RATE * Math.min(day, LOCK_DAYS);
  const ticks = Array.from({ length: LOCK_DAYS }, (_, i) => {
    const done = i < day;
    return `<div class="tick${done ? " done" : ""}" title="Day ${i + 1}"></div>`;
  }).join("");

  const status = escapeHtml(inv.status || "—");
  return `
    <div class="alloc-card" data-inv-id="${escapeHtml(inv.id || "")}">
      <div class="alloc-head">
        <div>
          <div class="muted" style="font-size:11px">Active allocation</div>
          <div class="alloc-principal">${money(p)} <span class="muted" style="font-size:13px;font-weight:400">${phpAmt(p, usdToPhpRate)}</span></div>
        </div>
        <span class="pill" style="display:inline-block;padding:4px 10px;border-radius:8px;background:rgba(251,191,36,.12);color:#fcd34d;font-size:11px;font-weight:600">${status}</span>
      </div>
      <div class="muted" style="margin-bottom:6px;font-size:12px">Day ${day} / ${LOCK_DAYS} · ~${money(accrued)} accrued (1% / day model)</div>
      <div class="alloc-bar-wrap"><div class="alloc-bar" style="width:${pct}%"></div></div>
      <div class="tick-row">${ticks}</div>
      <p class="note" style="margin-top:10px">Settlement runs when you load the app after lock — backend handles credits.</p>
    </div>`;
}

function renderOngoingAllocations(container, investments) {
  if (!container) return;
  const ongoing = (investments || []).filter((inv) => inv.status !== "COMPLETED");
  if (ongoing.length === 0) {
    container.innerHTML = `<p class="note">No active allocation. Execute a trade to see progress here.</p>`;
    return;
  }
  container.innerHTML = `<div class="allocations">${ongoing.map(renderAllocationCard).join("")}</div>`;
}

async function loadInvestmentsAndRender() {
  const box = document.getElementById("allocations-ongoing");
  const hist = document.getElementById("trade-history");
  if (apiMode !== "live") {
    if (box) {
      const fake = demoState.trades.map((t, i) => ({
        id: `demo-${i}`,
        principalUsd: t.amountUsd,
        startedAt: t.createdAt,
        status: t.status || "ACTIVE",
        maturesAt: t.createdAt,
      }));
      renderOngoingAllocations(box, fake);
    }
    if (hist) {
      hist.innerHTML = demoState.trades
        .map(
          (t) =>
            `<tr><td>${new Date(t.createdAt).toLocaleString()}</td><td>${money(t.amountUsd)}</td><td>${escapeHtml(t.status)}</td><td>${money(t.expectedReturn)}</td></tr>`
        )
        .join("");
    }
    return;
  }

  const res = await apiFetch("/api/investments", { method: "GET" });
  if (!res.ok) return;
  const j = await res.json();
  const invs = j.investments || [];

  renderOngoingAllocations(box, invs);

  if (hist) {
    hist.innerHTML = invs
      .map((row) => {
        const p = principalNum(row);
        const paid =
          row.status === "COMPLETED" ? p * 0.3 : row.status === "EARLY_PROFIT_TAKEN" ? p * 0.15 : null;
        return `<tr><td>${new Date(row.startedAt).toLocaleString()}</td><td>${money(p)}</td><td>${escapeHtml(row.status)}</td><td>${paid != null ? money(paid) : "—"}</td></tr>`;
      })
      .join("");
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function bindSidebar(section) {
  document.getElementById("toggle-managed")?.addEventListener("click", () => {
    document.getElementById("managed-submenu")?.classList.toggle("open");
  });
  document.getElementById("toggle-wallet")?.addEventListener("click", () => {
    document.getElementById("wallet-submenu")?.classList.toggle("open");
  });
  if (section === "managed") document.getElementById("managed-submenu")?.classList.add("open");
  if (section === "wallet") document.getElementById("wallet-submenu")?.classList.add("open");
}

async function initCore() {
  await tryActivateLiveApi();
  if (apiMode === "live") await refreshWalletFromApi();
  else applyWalletDemoToDom();
}

async function initManagedTradePage() {
  await initCore();
  const amount = document.getElementById("trade-amount");
  const maxBtn = document.getElementById("trade-max");
  const form = document.getElementById("trade-form");

  maxBtn?.addEventListener("click", async () => {
    if (apiMode === "live") {
      await refreshWalletFromApi();
      const resMe = await apiFetch("/api/me", { method: "GET" });
      if (resMe.ok) {
        const d = await resMe.json();
        amount.value = Number(d.wallet?.tradeEligibleUsd || 0).toFixed(2);
        return;
      }
    }
    amount.value = demoState.tradeEligibleUsd.toFixed(2);
  });

  await loadInvestmentsAndRender();

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Number(amount.value);
    if (!Number.isFinite(v) || v <= 0) {
      toast("Trade", "Enter a valid amount.", "err");
      return;
    }

    if (apiMode === "live") {
      const res = await apiFetch("/api/investments", {
        method: "POST",
        body: JSON.stringify({ amountUsd: v }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("Trade failed", typeof j.error === "string" ? j.error : "Could not execute trade.", "err");
        return;
      }
      toast("Trade executed", "Capital allocated. Progress appears below.", "ok");
      form.reset();
      await refreshWalletFromApi();
      await loadInvestmentsAndRender();
      const first = document.querySelector(".alloc-card");
      first?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      first?.classList.add("card-flash");
      setTimeout(() => first?.classList.remove("card-flash"), 900);
      return;
    }

    if (v > demoState.tradeEligibleUsd) {
      toast("Trade", "Amount exceeds eligible-to-trade balance.", "err");
      return;
    }
    demoState.availableUsd -= v;
    demoState.tradeEligibleUsd -= v;
    demoState.trades.unshift({
      amountUsd: v,
      status: "ACTIVE",
      expectedReturn: v * 1.3,
      createdAt: new Date().toISOString(),
    });
    saveDemoState();
    applyWalletDemoToDom();
    await loadInvestmentsAndRender();
    form.reset();
    toast("Trade executed", "Demo: stored locally. Connect Live API for real backend.", "ok");
  });
}

async function initDepositPage() {
  await initCore();
  const form = document.getElementById("deposit-form");
  const history = document.getElementById("deposit-history");

  async function renderHistory() {
    if (apiMode !== "live") {
      history.innerHTML = demoState.deposits
        .map(
          (d) =>
            `<tr><td>${new Date(d.createdAt).toLocaleString()}</td><td>${escapeHtml(d.method)}</td><td>${money(d.amountUsd)}</td><td>${escapeHtml(d.status)}</td></tr>`
        )
        .join("");
      return;
    }
    const res = await apiFetch("/api/deposits", { method: "GET" });
    if (!res.ok) return;
    const j = await res.json();
    const rows = j.deposits || [];
    history.innerHTML = rows
      .map(
        (d) =>
          `<tr><td>${new Date(d.createdAt).toLocaleString()}</td><td>${escapeHtml(d.method)}</td><td>${money(Number(d.amountUsd))}</td><td>${escapeHtml(d.status)}</td></tr>`
      )
      .join("");
  }

  await renderHistory();

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const amount = Number(fd.get("amount"));
    const method = String(fd.get("method"));
    const referenceNumber = String(fd.get("reference") || "").trim();
    const currency = String(fd.get("currency") || "USD");
    const file = fd.get("proof");

    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Deposit", "Enter a valid amount.", "err");
      return;
    }
    if (referenceNumber.length < 3) {
      toast("Deposit", "Reference number must be at least 3 characters.", "err");
      return;
    }

    if (apiMode === "live") {
      if (!file || typeof file === "string" || !file.size) {
        toast("Deposit", "Proof image is required for the real API.", "err");
        return;
      }
      let proofImageBase64;
      try {
        proofImageBase64 = await readFileAsDataUrl(file);
      } catch {
        toast("Deposit", "Could not read image file.", "err");
        return;
      }
      const res = await apiFetch("/api/deposits", {
        method: "POST",
        body: JSON.stringify({
          method,
          currency,
          amount,
          referenceNumber,
          proofImageBase64,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("Deposit failed", typeof j.error === "string" ? j.error : "Request failed.", "err");
        return;
      }
      toast("Deposit submitted", "Pending admin review.", "ok");
      form.reset();
      await renderHistory();
      return;
    }

    demoState.deposits.unshift({ method, amountUsd: amount, status: "PENDING", createdAt: new Date().toISOString() });
    saveDemoState();
    await renderHistory();
    form.reset();
    toast("Deposit submitted", "Demo mode — stored in localStorage.", "ok");
  });
}

async function initWithdrawPage() {
  await initCore();
  const form = document.getElementById("withdraw-form");
  const history = document.getElementById("withdraw-history");

  async function renderHistory() {
    if (apiMode !== "live") {
      history.innerHTML = demoState.withdrawals
        .map(
          (w) =>
            `<tr><td>${new Date(w.createdAt).toLocaleString()}</td><td>${money(w.amountUsd)}</td><td>${escapeHtml(w.destination)}</td><td>${escapeHtml(w.status)}</td></tr>`
        )
        .join("");
      return;
    }
    const res = await apiFetch("/api/withdrawals", { method: "GET" });
    if (!res.ok) return;
    const j = await res.json();
    const rows = j.withdrawals || [];
    history.innerHTML = rows
      .map(
        (w) =>
          `<tr><td>${new Date(w.createdAt).toLocaleString()}</td><td>${money(Number(w.amountUsd))}</td><td>${escapeHtml(w.destinationNote || "")}</td><td>${escapeHtml(w.status)}</td></tr>`
      )
      .join("");
  }

  await renderHistory();

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const amount = Number(fd.get("amount"));
    const destinationNote = String(fd.get("destination") || "").trim();
    const confirmWithdrawal = fd.get("confirm") === "on";

    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Withdraw", "Enter a valid amount.", "err");
      return;
    }
    if (destinationNote.length < 3) {
      toast("Withdraw", "Destination / notes need at least 3 characters.", "err");
      return;
    }
    if (apiMode === "live" && !confirmWithdrawal) {
      toast("Withdraw", "Confirm your payout destination.", "err");
      return;
    }

    if (apiMode === "live") {
      const res = await apiFetch("/api/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amountUsd: amount, destinationNote, confirmWithdrawal }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("Withdraw failed", typeof j.error === "string" ? j.error : "Request failed.", "err");
        return;
      }
      toast("Withdrawal requested", "Funds reserved pending review.", "ok");
      form.reset();
      await refreshWalletFromApi();
      await renderHistory();
      return;
    }

    if (amount > demoState.availableUsd) {
      toast("Withdraw", "Insufficient available balance.", "err");
      return;
    }
    demoState.availableUsd -= amount;
    demoState.totalWithdrawnUsd += amount;
    demoState.withdrawals.unshift({
      amountUsd: amount,
      destination: destinationNote,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });
    saveDemoState();
    applyWalletDemoToDom();
    await renderHistory();
    form.reset();
    toast("Withdrawal requested", "Demo mode — stored in localStorage.", "ok");
  });
}

async function initDashboardPage() {
  await initCore();
}

window.DemoApp = {
  bindSidebar,
  initDashboardPage,
  initManagedTradePage,
  initDepositPage,
  initWithdrawPage,
  toast,
};
