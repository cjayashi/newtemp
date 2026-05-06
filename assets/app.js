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

function safeExternalUrl(url) {
  try {
    const u = new URL(String(url).trim(), "https://coindesk.com/");
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* noop */
  }
  return null;
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

const DEMO_SESSION_KEY = "zignals_demo_session";
const DEMO_REFERRAL_KEY = "zignals_demo_referral";

function getDemoSession() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function setDemoSession(obj) {
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(obj));
}

function clearDemoSession() {
  localStorage.removeItem(DEMO_SESSION_KEY);
}

function getReferralMeta() {
  try {
    return (
      JSON.parse(localStorage.getItem(DEMO_REFERRAL_KEY) || "null") || {
        code: "ZIG-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
        linkClicks: 12,
        signups: 3,
        commissionUsd: 48.5,
      }
    );
  } catch {
    return { code: "ZIG-DEMO", linkClicks: 0, signups: 0, commissionUsd: 0 };
  }
}

function saveReferralMeta(meta) {
  localStorage.setItem(DEMO_REFERRAL_KEY, JSON.stringify(meta));
}

/** @param {{ active?: string, openManaged?: boolean, openWallet?: boolean }} o */
function mountSidebar(o = {}) {
  const root = document.getElementById("sidebar-root");
  if (!root) return;

  const { active = "", openManaged = false, openWallet = false } = o;
  const nc = (key) => (active === key ? "nav-link active" : "nav-link");
  const mOpen = openManaged ? "submenu open" : "submenu";
  const wOpen = openWallet ? "submenu open" : "submenu";

  root.innerHTML = `
        <a class="brand magnetic" href="./index.html">Zignals<span>.org</span></a>
        <a class="${nc("dashboard")}" href="./index.html">Dashboard</a>
        <button id="toggle-managed" type="button" class="group-title">Managed Trade</button>
        <div id="managed-submenu" class="${mOpen}">
          <div class="submenu-inner">
            <a class="${nc("managed_trade")}" href="./managed-trade.html">Trading Program</a>
            <a class="nav-link" href="./managed-trade.html#history">Trading History</a>
          </div>
        </div>
        <button id="toggle-wallet" type="button" class="group-title">Wallet</button>
        <div id="wallet-submenu" class="${wOpen}">
          <div class="submenu-inner">
            <a class="${nc("deposit")}" href="./wallet-deposit.html">Deposit</a>
            <a class="${nc("withdraw")}" href="./wallet-withdraw.html">Withdraw</a>
          </div>
        </div>
        <a class="${nc("referral")}" href="./referral.html">Referral Program</a>
        <div class="divider"></div>
        <a class="${nc("announcements")}" href="./announcements.html">Announcements</a>
        <a class="${nc("lessons")}" href="./trading-lessons.html">Trading Lessons</a>
        <a class="${nc("market")}" href="./market-chart.html">Market Chart</a>
        <a class="${nc("traders_report")}" href="./traders-report.html">Traders Report</a>
        <div class="divider"></div>
        <a class="${nc("report")}" href="./report-issue.html">Report an issue</a>
        <div class="divider"></div>
        <div class="sidebar-auth">
          <a class="nav-link subtle" href="./login.html">Log in</a>
          <a class="nav-link subtle" href="./register.html">Register</a>
          <a class="${nc("admin")} nav-admin" href="./admin.html">Admin (demo)</a>
        </div>`;
}

function bindSidebar() {
  document.getElementById("toggle-managed")?.addEventListener("click", () => {
    document.getElementById("managed-submenu")?.classList.toggle("open");
  });
  document.getElementById("toggle-wallet")?.addEventListener("click", () => {
    document.getElementById("wallet-submenu")?.classList.toggle("open");
  });
}

function bindInteractiveCards(scope = document) {
  scope.querySelectorAll("[data-tilt], .card.interactive, .interactive-card").forEach((el) => {
    if (el.dataset.tiltBound) return;
    el.dataset.tiltBound = "1";
    const max = 7;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${x * max}deg) rotateX(${-y * max}deg) translateZ(0)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
    });
  });
}

function wireTopbarAuth() {
  const slot = document.querySelector("[data-auth-slot]");
  if (!slot) return;
  const s = getDemoSession();
  if (s?.email) {
    slot.innerHTML = `<span class="topbar-user">${escapeHtml(s.displayName || s.email)}</span><a class="btn btn-ghost btn-sm" href="./index.html">Home</a><button type="button" class="btn btn-ghost btn-sm" id="demo-logout">Log out</button>`;
    document.getElementById("demo-logout")?.addEventListener("click", () => {
      clearDemoSession();
      toast("Signed out", "Demo session cleared.", "ok");
      window.location.href = "./login.html";
    });
  } else {
    slot.innerHTML = `<a class="btn btn-ghost btn-sm" href="./login.html">Log in</a><a class="btn btn-sm" href="./register.html">Register</a>`;
  }
}

async function initShellPage(sidebarOpts) {
  mountSidebar(sidebarOpts);
  bindSidebar();
  wireTopbarAuth();
  await initCore();
  requestAnimationFrame(() => bindInteractiveCards(document.querySelector(".main") || document.body));
}

async function initCore() {
  await tryActivateLiveApi();
  if (apiMode === "live") await refreshWalletFromApi();
  else applyWalletDemoToDom();
}

async function initManagedTradePage() {
  await initShellPage({ active: "managed_trade", openManaged: true });
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
  await initShellPage({ active: "deposit", openWallet: true });
  const form = document.getElementById("deposit-form");
  const history = document.getElementById("deposit-history");

  async function renderHistory() {
    if (!history) return;
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
  await initShellPage({ active: "withdraw", openWallet: true });
  const form = document.getElementById("withdraw-form");
  const history = document.getElementById("withdraw-history");

  async function renderHistory() {
    if (!history) return;
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
  await initShellPage({ active: "dashboard" });
}

async function initLoginPage() {
  wireTopbarAuth();
  requestAnimationFrame(() => bindInteractiveCards(document.body));
  const form = document.getElementById("login-form");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const pass = String(fd.get("password") || "");
    if (email.length < 3 || pass.length < 1) {
      toast("Login", "Enter email and password.", "err");
      return;
    }
    setDemoSession({
      email,
      displayName: email.split("@")[0] || "Member",
      at: Date.now(),
    });
    toast("Welcome", "Demo session saved locally.", "ok");
    window.location.href = "./index.html";
  });
}

async function initRegisterPage() {
  wireTopbarAuth();
  requestAnimationFrame(() => bindInteractiveCards(document.body));
  const refBanner = document.getElementById("ref-banner");
  const refCode = new URLSearchParams(location.search).get("ref");
  if (refBanner && refCode) {
    refBanner.style.display = "block";
    refBanner.textContent = `Referral code detected: ${refCode} (demo attribution).`;
  }
  const form = document.getElementById("register-form");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const name = String(fd.get("name") || "").trim();
    const pass = String(fd.get("password") || "");
    if (email.length < 3 || pass.length < 4) {
      toast("Register", "Use a valid email and password (4+ chars).", "err");
      return;
    }
    const meta = getReferralMeta();
    const refParam = new URLSearchParams(location.search).get("ref")?.trim();
    if (refParam) {
      meta.signups += 1;
      meta.commissionUsd += 12.5;
    }
    saveReferralMeta(meta);
    setDemoSession({
      email,
      displayName: name || email.split("@")[0] || "Member",
      at: Date.now(),
      referralCode: meta.code,
    });
    toast("Account ready", "You're signed in for this demo.", "ok");
    window.location.href = "./index.html";
  });
}

async function initAdminPage() {
  await initShellPage({ active: "admin", openManaged: false, openWallet: false });
  const tbody = document.getElementById("admin-activity");
  if (!tbody) return;
  function row(cells) {
    return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  }
  const lines = [];
  demoState.deposits.slice(0, 5).forEach((d) => {
    lines.push(row([new Date(d.createdAt).toLocaleString(), "Deposit", escapeHtml(d.method), money(d.amountUsd), escapeHtml(d.status)]));
  });
  demoState.withdrawals.slice(0, 5).forEach((w) => {
    lines.push(row([new Date(w.createdAt).toLocaleString(), "Withdraw", escapeHtml(w.destination || "—"), money(w.amountUsd), escapeHtml(w.status)]));
  });
  demoState.trades.slice(0, 5).forEach((t) => {
    lines.push(row([new Date(t.createdAt).toLocaleString(), "Trade", "Program", money(t.amountUsd), escapeHtml(t.status)]));
  });
  tbody.innerHTML =
    lines.join("") ||
    row([
      "—",
      '<span class="muted">No demo activity yet</span>',
      "—",
      "—",
      "—",
    ]);

  document.querySelectorAll("[data-admin-stat]").forEach((el) => {
    const k = el.getAttribute("data-admin-stat");
    if (k === "deposits") el.textContent = String(demoState.deposits.length);
    if (k === "withdrawals") el.textContent = String(demoState.withdrawals.length);
    if (k === "trades") el.textContent = String(demoState.trades.length);
    if (k === "users") el.textContent = getDemoSession() ? "1 (demo)" : "0";
  });
}

function staticPageBase() {
  try {
    return new URL(".", location.href).href;
  } catch {
    return "./";
  }
}

async function initReferralPage() {
  await initShellPage({ active: "referral" });
  const meta = getReferralMeta();
  const link = new URL(`register.html?ref=${encodeURIComponent(meta.code)}`, staticPageBase()).href;

  const codeEl = document.getElementById("ref-code");
  const linkEl = document.getElementById("ref-link");
  if (codeEl) codeEl.textContent = meta.code;
  if (linkEl) linkEl.textContent = link;

  document.querySelectorAll("[data-ref-stat]").forEach((el) => {
    const k = el.getAttribute("data-ref-stat");
    if (k === "clicks") el.textContent = String(meta.linkClicks);
    if (k === "signups") el.textContent = String(meta.signups);
    if (k === "commission") el.textContent = money(meta.commissionUsd);
  });

  document.getElementById("copy-code")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(meta.code);
      toast("Copied", "Referral code copied.", "ok");
    } catch {
      toast("Copy", "Could not copy — select manually.", "err");
    }
  });
  document.getElementById("copy-link")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("Copied", "Referral link copied.", "ok");
    } catch {
      toast("Copy", "Could not copy — select manually.", "err");
    }
  });

  document.getElementById("sim-click")?.addEventListener("click", () => {
    meta.linkClicks += 1;
    saveReferralMeta(meta);
    document.querySelector('[data-ref-stat="clicks"]') && (document.querySelector('[data-ref-stat="clicks"]').textContent = String(meta.linkClicks));
    toast("Demo", "Simulated link click.", "ok");
  });
}

async function initAnnouncementsPage() {
  await initShellPage({ active: "announcements" });
}

async function initLessonsPage() {
  await initShellPage({ active: "lessons" });
  document.querySelectorAll(".lesson-item").forEach((item) => {
    item.querySelector(".lesson-head")?.addEventListener("click", () => {
      item.classList.toggle("open");
    });
  });
}

async function initTradersReportPage() {
  await initShellPage({ active: "traders_report" });
}

async function initReportIssuePage() {
  await initShellPage({ active: "report" });
  const form = document.getElementById("issue-form");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    toast("Thanks", "Demo: issue would be sent to support.", "ok");
    form.reset();
  });
}

async function fetchCoinGeckoSimple() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true"
  );
  if (!res.ok) throw new Error("price");
  return res.json();
}

async function fetchCoinDeskRssTitles(max = 8) {
  const rssUrl = "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml";
  const proxy = "https://api.allorigins.win/raw?url=" + encodeURIComponent(rssUrl);
  const res = await fetch(proxy);
  if (!res.ok) throw new Error("rss");
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const items = [...doc.querySelectorAll("item")].slice(0, max);
  return items.map((it) => ({
    title: it.querySelector("title")?.textContent?.trim() || "—",
    link: it.querySelector("link")?.textContent?.trim() || "",
    pub: it.querySelector("pubDate")?.textContent?.trim() || "",
  }));
}

async function populateMarketPanels() {
  const box = document.getElementById("price-grid");
  if (box) {
    box.innerHTML = `<p class="note">Loading spot prices…</p>`;
    try {
      const j = await fetchCoinGeckoSimple();
      const cards = ["bitcoin", "ethereum", "solana"].map((id) => {
        const row = j[id];
        if (!row) return "";
        const ch = row.usd_24h_change != null ? Number(row.usd_24h_change).toFixed(2) + "%" : "—";
        const up = Number(row.usd_24h_change) >= 0;
        return `<div class="interactive-card stat-chip" data-tilt>
          <div class="muted" style="text-transform:capitalize">${id}</div>
          <div class="value" style="font-size:22px">${money(row.usd)}</div>
          <div class="price-24h ${up ? "up" : "down"}">24h ${ch}</div>
          <div class="api-hint">via CoinGecko API</div>
        </div>`;
      });
      box.innerHTML = `<div class="grid grid-3">${cards.join("")}</div>`;
      bindInteractiveCards(box);
    } catch {
      box.innerHTML = `<p class="note">Could not load CoinGecko. Check network / adblock.</p>`;
    }
  }

  const feed = document.getElementById("coindesk-feed");
  if (feed) {
    feed.innerHTML = `<p class="note">Loading CoinDesk headlines…</p>`;
    try {
      const items = await fetchCoinDeskRssTitles(10);
      feed.innerHTML = items
        .map((it) => {
          const href = safeExternalUrl(it.link) || "https://www.coindesk.com/";
          return `<a class="news-row interactive" href="${href}" target="_blank" rel="noopener noreferrer">
              <span class="news-title">${escapeHtml(it.title)}</span>
              <span class="news-meta">${escapeHtml(it.pub)}</span>
            </a>`;
        })
        .join("");
    } catch {
      feed.innerHTML =
        `<p class="note">RSS proxy unavailable. Read live at </p>` +
        `<a href="https://www.coindesk.com/" target="_blank" rel="noopener" class="btn secondary btn-sm">coindesk.com</a>`;
    }
  }
}

async function initMarketChartPage() {
  await initShellPage({ active: "market" });
  await populateMarketPanels();
  const btn = document.getElementById("refresh-market");
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      await populateMarketPanels();
      toast("Market", "Refreshed feeds & prices.", "ok");
    });
  }
}

window.DemoApp = {
  bindSidebar,
  mountSidebar,
  initDashboardPage,
  initManagedTradePage,
  initDepositPage,
  initWithdrawPage,
  initLoginPage,
  initRegisterPage,
  initAdminPage,
  initReferralPage,
  initAnnouncementsPage,
  initLessonsPage,
  initMarketChartPage,
  initTradersReportPage,
  initReportIssuePage,
  toast,
};
