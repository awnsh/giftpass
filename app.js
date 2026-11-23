(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const form = $("cardForm");
  const f = form.elements;

  // ================= Storage (this device only) =================
  const KEY = "giftpass.cards.v1";
  let memoryFallback = [];
  function loadCards() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return memoryFallback; }
  }
  function saveCards(cards) {
    memoryFallback = cards;
    try { localStorage.setItem(KEY, JSON.stringify(cards)); return true; } catch { return false; }
  }
  const getCard = (id) => loadCards().find((c) => c.id === id);
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  // Ask the browser not to evict our storage when space is low.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ================= Helpers =================
  const money = (amount, currency) => {
    const n = Number(amount);
    if (amount === "" || amount == null || isNaN(n)) return "";
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(n); }
    catch { return n.toFixed(2); }
  };
  const last4 = (num) => { const d = (num || "").replace(/\s/g, ""); return d.length > 4 ? "•••• " + d.slice(-4) : d || ""; };
  function textColor(hex) {
    const n = parseInt((hex || "#3b4bdb").slice(1), 16);
    const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return l > 160 ? "#111827" : "#ffffff";
  }
  const normUrl = (u) => { u = (u || "").trim(); return !u ? "" : /^https?:\/\//i.test(u) ? u : "https://" + u; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ================= Barcode drawing (original symbology) =================
  const BCID = {
    CODE_128: "code128", PDF_417: "pdf417", QR_CODE: "qrcode", AZTEC: "azteccode", CODE_39: "code39",
    CODE_93: "code93", EAN_13: "ean13", EAN_8: "ean8", UPC_A: "upca", UPC_E: "upce", ITF: "interleaved2of5",
    CODABAR: "rationalizedCodabar", DATA_MATRIX: "datamatrix",
  };
  const TWO_D = ["pdf417", "qrcode", "azteccode", "datamatrix"];

  /** Renders the card's barcode as SVG into `el`. Falls back to Code 128 if the data doesn't fit the original type. */
  function drawBarcode(el, card) {
    const text = (card.barcodeValue || (card.cardNumber || "").replace(/\s/g, "")).trim();
    el.innerHTML = "";
    delete el.dataset.kind;
    if (!text) { el.innerHTML = '<span class="no-barcode">No barcode. Show the card number.</span>'; return null; }
    if (!window.bwipjs) { el.textContent = "Loading barcode…"; return null; }
    const tries = [BCID[card.barcodeFormat] || "code128", "code128"];
    for (const bcid of tries) {
      try {
        // Scanners usually drop Codabar's start/stop letters; the encoder needs them back.
        const data = bcid === "rationalizedCodabar" && !/^[A-D].*[A-D]$/i.test(text) ? `A${text}A` : text;
        const opts = { bcid, text: data, scale: 3, paddingwidth: 0, paddingheight: 0, includetext: false };
        if (!TWO_D.includes(bcid)) opts.height = 16;
        if (bcid === "pdf417") { opts.columns = 4; opts.rowmult = 6; }
        el.innerHTML = bwipjs.toSVG(opts);
        el.dataset.kind = TWO_D.includes(bcid) ? "2d" : "1d";
        return bcid;
      } catch { /* try next */ }
    }
    el.innerHTML = '<span class="no-barcode">This barcode can\'t be drawn. Show the card number.</span>';
    return null;
  }

  // ================= Routing + app chrome =================
  const views = { home: $("viewHome"), edit: $("viewEdit"), card: $("viewCard") };
  let editingId = null;

  function chrome(name, title) {
    for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
    const home = name === "home";
    $("brand").hidden = !home;
    $("backBtn").hidden = home;
    $("barTitle").hidden = home;
    $("barTitle").textContent = title || "";
    $("bbAdd").hidden = name !== "home";
    $("bbSave").hidden = name !== "edit";
    $("bbShow").hidden = name !== "card";
    document.body.dataset.view = name;
    window.scrollTo(0, 0);
  }
  function route() {
    stopCamera();
    closeFullscreen();
    const [, page, rawId] = location.hash.split("/");
    const id = rawId ? decodeURIComponent(rawId) : "";
    if (page === "add") { openEditor(null); chrome("edit", "Add a card"); }
    else if (page === "edit" && getCard(id)) { openEditor(getCard(id)); chrome("edit", "Edit card"); }
    else if (page === "card" && getCard(id)) { renderDetail(getCard(id)); chrome("card", getCard(id).merchant); }
    else { renderHome(); chrome("home"); document.title = "GiftPass · Your gift cards, on your phone"; }
  }
  window.addEventListener("hashchange", route);
  // Back always goes to the parent screen (card → list, edit → card), replacing the
  // current history entry so the phone's own back gesture doesn't loop through old screens.
  $("backBtn").addEventListener("click", () => {
    const [, page, id] = location.hash.split("/");
    location.replace(page === "edit" && id ? `#/card/${id}` : "#/");
  });

  // ================= Home =================
  function renderHome() {
    const cards = loadCards().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    $("cardStack").innerHTML = cards.map((c) => `
      <a class="mini" href="#/card/${encodeURIComponent(c.id)}" style="background:${esc(c.color)};color:${textColor(c.color)}">
        <span class="pass-shine" aria-hidden="true"></span>
        <span class="mini-top"><span class="pass-logo"></span><span class="mini-name">${esc(c.merchant)}</span><span class="mini-bal">${esc(money(c.balance, c.currency))}</span></span>
        <span class="mini-num">${esc(last4(c.cardNumber))}</span>
      </a>`).join("");
    $("emptyState").hidden = cards.length > 0;
    $("cardStack").hidden = cards.length === 0;
    views.home.classList.toggle("has-cards", cards.length > 0);
    const totals = {};
    for (const c of cards) if (c.balance !== "" && !isNaN(Number(c.balance))) totals[c.currency] = (totals[c.currency] || 0) + Number(c.balance);
    const parts = Object.entries(totals).map(([cur, v]) => money(v, cur));
    $("totalBalance").textContent = parts.length ? parts.join(" + ") : "";
  }

  // Install tip: iPhone/iPad Safari, not already installed, not dismissed.
  (function installTip() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    let dismissed = false;
    try { dismissed = localStorage.getItem("giftpass.tipDismissed") === "1"; } catch {}
    if (ios && !standalone && !dismissed) $("installTip").hidden = false;
    $("installTipClose").addEventListener("click", () => {
      $("installTip").hidden = true;
      try { localStorage.setItem("giftpass.tipDismissed", "1"); } catch {}
    });
  })();

  // Backup / restore
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "GiftPass", version: 1, exportedAt: new Date().toISOString(), cards: loadCards() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `giftpass-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $("backupMsg").textContent = "Backup downloaded. It contains your card numbers and PINs, so keep it private.";
  });
  $("importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data.cards;
      if (!Array.isArray(incoming)) throw new Error();
      const byId = new Map(loadCards().map((c) => [c.id, c]));
      let added = 0;
      for (const c of incoming) {
        if (!c || typeof c.merchant !== "string") continue;
        const clean = sanitize(c);
        clean.id = typeof c.id === "string" ? c.id : newId();
        if (!byId.has(clean.id)) added++;
        byId.set(clean.id, clean);
      }
      saveCards([...byId.values()]);
      $("backupMsg").textContent = `Restored. ${added} new card${added === 1 ? "" : "s"} added.`;
      renderHome();
    } catch {
      $("backupMsg").textContent = "That file isn't a GiftPass backup.";
    }
  });

  // ================= Add / edit =================
  const SWATCHES = ["#3b4bdb", "#0e0e11", "#c8102e", "#e8590c", "#f2c94c", "#2f9e44", "#006241", "#0c8599", "#7048e8", "#d6336c", "#f2e9d8", "#868e96"];
  $("swatches").innerHTML = SWATCHES.map((c) =>
    `<button type="button" class="swatch" role="radio" aria-checked="false" aria-label="Colour ${c}" data-color="${c}" style="background:${c}"></button>`).join("");
  function selectSwatch(color) {
    f.color.value = color;
    document.querySelectorAll(".swatch").forEach((s) => s.setAttribute("aria-checked", String(s.dataset.color.toLowerCase() === color.toLowerCase())));
  }
  $("swatches").addEventListener("click", (e) => {
    const s = e.target.closest(".swatch");
    if (!s) return;
    selectSwatch(s.dataset.color);
    updatePreview();
  });

  function sanitize(src) {
    const s = (v, max) => String(v ?? "").trim().slice(0, max);
    return {
      merchant: s(src.merchant, 60),
      cardNumber: s(src.cardNumber, 64),
      pin: s(src.pin, 32),
      balance: s(src.balance, 20),
      currency: s(src.currency || "USD", 3).toUpperCase(),
      expires: /^\d{4}-\d{2}-\d{2}$/.test(src.expires || "") ? src.expires : "",
      barcodeValue: s(src.barcodeValue, 2000),
      barcodeFormat: BCID[src.barcodeFormat] ? src.barcodeFormat : "",
      redeemUrl: normUrl(s(src.redeemUrl, 300)),
      balanceUrl: normUrl(s(src.balanceUrl, 300)),
      notes: s(src.notes, 500),
      color: /^#[0-9a-f]{6}$/i.test(src.color || "") ? src.color : "#3b4bdb",
      createdAt: src.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
  }

  function openEditor(card) {
    editingId = card ? card.id : null;
    form.reset();
    $("formError").hidden = true;
    $("bbSave").textContent = card ? "Save changes" : "Save card";
    $("scanResult").textContent = "No barcode? Just type the card number below.";
    if (card) for (const k of Object.keys(card)) if (f[k] && k !== "color") f[k].value = card[k];
    selectSwatch(card ? card.color : SWATCHES[0]);
    form.querySelector(".more").open = false;
    updatePreview();
  }

  function updatePreview() {
    const merchant = f.merchant.value.trim() || "Store";
    const pv = $("preview");
    pv.style.background = f.color.value;
    pv.style.color = textColor(f.color.value);
    $("pvMerchant").textContent = merchant;
    const bal = money(f.balance.value, f.currency.value);
    $("pvPrimaryLabel").textContent = bal ? "BALANCE" : "GIFT CARD";
    $("pvPrimary").textContent = bal || merchant;
    $("pvNumber").textContent = last4(f.cardNumber.value) || "—";
    $("pvPinWrap").hidden = !f.pin.value;
    drawBarcode($("pvBarcode"), { barcodeValue: f.barcodeValue.value, barcodeFormat: f.barcodeFormat.value, cardNumber: f.cardNumber.value });
    $("pvAlt").textContent = f.cardNumber.value || f.barcodeValue.value;
  }
  form.addEventListener("input", updatePreview);
  form.addEventListener("change", updatePreview);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("formError");
    const problem =
      !f.merchant.value.trim() ? ["Enter the store or brand name.", f.merchant] :
      !f.cardNumber.value.trim() && !f.barcodeValue.value.trim() ? ["Scan the barcode or type the card number.", f.cardNumber] :
      f.balance.value && !/^\d+(\.\d{1,2})?$/.test(f.balance.value.trim()) ? ["Balance must be a number like 25 or 25.00.", f.balance] : null;
    if (problem) {
      err.textContent = problem[0]; err.hidden = false;
      toast(problem[0]);
      problem[1].focus();
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    const cards = loadCards();
    const existing = cards.find((c) => c.id === editingId);
    const card = sanitize({ ...data, createdAt: existing?.createdAt });
    card.id = editingId || newId();
    const next = existing ? cards.map((c) => (c.id === card.id ? card : c)) : [...cards, card];
    if (!saveCards(next)) { err.textContent = "Couldn't save. Private Browsing may be on, or storage is full."; err.hidden = false; return; }
    toast(existing ? "Changes saved" : "Card saved");
    // Replace the add/edit screen so Back from the card goes home, not to the form.
    history.replaceState(null, "", `#/card/${encodeURIComponent(card.id)}`);
    route();
  });

  // ================= Scanner =================
  let reader = null;
  let scanning = false;
  function getReader() {
    if (reader || !window.ZXing) return reader;
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, Object.keys(BCID).map((n) => ZXing.BarcodeFormat[n]));
    reader = new ZXing.BrowserMultiFormatReader(hints);
    return reader;
  }
  function stopCamera() {
    if (reader) reader.reset();
    scanning = false;
    $("scanBtn").textContent = "Start camera";
    $("scanHint").hidden = false;
    document.querySelector(".scanner").classList.remove("live");
  }
  function onScan(result) {
    const text = result.getText();
    const format = ZXing.BarcodeFormat[result.getBarcodeFormat()];
    f.barcodeValue.value = text;
    f.barcodeFormat.value = BCID[format] ? format : "";
    const digits = text.replace(/\s/g, "");
    if (!f.cardNumber.value && /^\d{8,24}$/.test(digits)) f.cardNumber.value = digits;
    $("scanResult").textContent = `Scanned a ${format.replace(/_/g, " ")} barcode. Now add the store name.`;
    toast("Barcode scanned");
    if (navigator.vibrate) navigator.vibrate(80);
    updatePreview();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => f.merchant.focus({ preventScroll: true }), 350);
  }
  $("scanBtn").addEventListener("click", async () => {
    if (scanning) return stopCamera();
    const r = getReader();
    if (!r) { $("scanResult").textContent = "The scanner is still loading. Try again in a second."; return; }
    if (!window.isSecureContext || !navigator.mediaDevices) { $("scanResult").textContent = "The camera isn't available here. Tap “Photo” instead."; return; }
    scanning = true;
    $("scanBtn").textContent = "Stop camera";
    try {
      await r.decodeFromConstraints(
        { video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } },
        $("video"),
        (result) => { if (result && scanning) { stopCamera(); onScan(result); } }
      );
      $("scanHint").hidden = true;
      document.querySelector(".scanner").classList.add("live");
    } catch (err) {
      stopCamera();
      $("scanResult").textContent = "Couldn't open the camera (" + (err.message || err.name) + "). Tap “Photo” instead.";
    }
  });
  $("photo").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    const r = getReader();
    if (!file || !r) return;
    const url = URL.createObjectURL(file);
    $("scanResult").textContent = "Reading photo…";
    try { onScan(await r.decodeFromImageUrl(url)); }
    catch { $("scanResult").textContent = "No barcode found in that photo. Try a closer, well-lit, flat shot, or type the number."; }
    finally { URL.revokeObjectURL(url); }
  });

  // ================= Card detail =================
  let currentId = null;
  let pinShown = false;
  function renderDetail(card) {
    currentId = card.id;
    pinShown = false;
    const p = $("detailPass");
    p.style.background = card.color;
    p.style.color = textColor(card.color);
    $("dMerchant").textContent = card.merchant;
    const bal = money(card.balance, card.currency);
    $("dPrimaryLabel").textContent = bal ? "BALANCE" : "GIFT CARD";
    $("dPrimary").textContent = bal || card.merchant;
    $("dExpWrap").hidden = !card.expires;
    $("dExpires").textContent = card.expires ? new Date(card.expires + "T12:00:00").toLocaleDateString(undefined, { dateStyle: "medium" }) : "";
    const drawn = drawBarcode($("dBarcode"), card);
    $("dBarcodeBtn").disabled = !drawn;
    $("bbShow").hidden = !drawn;
    $("dAlt").textContent = card.cardNumber || card.barcodeValue;
    $("numRow").hidden = !card.cardNumber;
    $("dNumber").textContent = card.cardNumber;
    $("pinRow").hidden = !card.pin;
    $("dPin").textContent = "••••";
    $("revealPin").textContent = "Show";
    $("dRedeem").hidden = !card.redeemUrl; $("dRedeem").href = card.redeemUrl || "#";
    $("dBalanceLink").hidden = !card.balanceUrl; $("dBalanceLink").href = card.balanceUrl || "#";
    $("dNotes").hidden = !card.notes; $("dNotes").textContent = card.notes;
    $("balanceForm").elements.balance.value = card.balance;
    $("dEdit").href = `#/edit/${encodeURIComponent(card.id)}`;
    $("deleteLabel").textContent = "Delete card";
    $("deleteBtn").dataset.armed = "";
    document.title = `${card.merchant} · GiftPass`;
  }
  $("revealPin").addEventListener("click", () => {
    const c = getCard(currentId); if (!c) return;
    pinShown = !pinShown;
    $("dPin").textContent = pinShown ? c.pin : "••••";
    $("revealPin").textContent = pinShown ? "Hide" : "Show";
  });
  document.querySelectorAll("[data-copy]").forEach((btn) => btn.addEventListener("click", async () => {
    const c = getCard(currentId); if (!c) return;
    const which = btn.dataset.copy;
    const value = which === "pin" ? c.pin : c.cardNumber.replace(/\s/g, "");
    try {
      await navigator.clipboard.writeText(value);
      toast(which === "pin" ? "PIN copied" : "Card number copied");
    } catch {
      toast("Press and hold the text to copy it");
    }
  }));
  $("balanceForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = e.target.elements.balance;
    const v = input.value.trim();
    if (v && !/^\d+(\.\d{1,2})?$/.test(v)) { toast("Balance must be a number like 12.50"); return; }
    saveCards(loadCards().map((c) => (c.id === currentId ? { ...c, balance: v, updatedAt: Date.now() } : c)));
    input.blur();
    renderDetail(getCard(currentId));
    toast("Balance updated");
  });
  $("deleteBtn").addEventListener("click", () => {
    const btn = $("deleteBtn");
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      $("deleteLabel").textContent = "Tap again to delete";
      setTimeout(() => { if (btn.dataset.armed === "1") { btn.dataset.armed = ""; $("deleteLabel").textContent = "Delete card"; } }, 4000);
      return;
    }
    btn.dataset.armed = "";
    saveCards(loadCards().filter((c) => c.id !== currentId));
    toast("Card deleted");
    history.replaceState(null, "", "#/");
    route();
  });

  // ================= Full-screen barcode (for the cashier) =================
  let wakeLock = null;
  async function openFullscreen() {
    const c = getCard(currentId); if (!c) return;
    $("fsMerchant").textContent = c.merchant;
    $("fsNumber").textContent = c.cardNumber || c.barcodeValue;
    const kind = drawBarcode($("fsBarcode"), c);
    if (!kind) return;
    $("fullscreen").hidden = false;
    document.body.classList.add("fs-open");
    // Keep the screen awake while the cashier scans.
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch {}
  }
  function closeFullscreen() {
    if ($("fullscreen").hidden) return;
    $("fullscreen").hidden = true;
    document.body.classList.remove("fs-open");
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  $("dBarcodeBtn").addEventListener("click", openFullscreen);
  $("bbShow").addEventListener("click", openFullscreen);
  $("fsClose").addEventListener("click", closeFullscreen);
  $("fullscreen").addEventListener("click", (e) => { if (e.target.id === "fullscreen") closeFullscreen(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeFullscreen(); });

  // ================= Desktop: QR to open on a phone =================
  function drawDeskQr() {
    if (!window.bwipjs || !matchMedia("(min-width: 900px)").matches || $("deskQr").childElementCount) return;
    try { $("deskQr").innerHTML = bwipjs.toSVG({ bcid: "qrcode", text: location.origin + location.pathname, scale: 4, paddingwidth: 0, paddingheight: 0 }); } catch {}
  }

  // ================= Start =================
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  route();
  drawDeskQr();
  matchMedia("(min-width: 900px)").addEventListener("change", drawDeskQr);
})();
