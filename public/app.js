(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("cardForm");
  const f = form.elements;
  const WALLET_OK = ["CODE_128", "PDF_417", "QR_CODE", "AZTEC"];

  // ---------- Scanning ----------
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    "CODE_128", "PDF_417", "QR_CODE", "AZTEC", "CODE_39", "CODE_93", "EAN_13", "EAN_8",
    "UPC_A", "UPC_E", "ITF", "CODABAR", "DATA_MATRIX",
  ].map((n) => ZXing.BarcodeFormat[n]));
  const reader = new ZXing.BrowserMultiFormatReader(hints);
  let scanning = false;

  function stopCamera() {
    reader.reset();
    scanning = false;
    $("scanBtn").textContent = "Start camera";
    $("scanHint").hidden = false;
    $("scanHint").textContent = "Camera is off";
  }

  function onScan(result) {
    const text = result.getText();
    const format = ZXing.BarcodeFormat[result.getBarcodeFormat()];
    f.barcodeValue.value = text;
    f.barcodeFormat.value = format;
    // If the barcode is just the card number, fill it in for the user.
    const digits = text.replace(/\s/g, "");
    if (!f.cardNumber.value && /^\d{8,24}$/.test(digits)) f.cardNumber.value = digits;
    $("scanResult").textContent = `Scanned ${format.replace(/_/g, " ")}: ${text.length > 40 ? text.slice(0, 40) + "…" : text}. Check the details below.`;
    if (navigator.vibrate) navigator.vibrate(80);
    updatePreview();
    form.scrollIntoView({ behavior: "smooth" });
  }

  $("scanBtn").addEventListener("click", async () => {
    if (scanning) return stopCamera();
    if (!window.isSecureContext) {
      $("scanResult").textContent = "The camera needs HTTPS. Use “Use a photo” instead, or open the site over https://.";
      return;
    }
    scanning = true;
    $("scanBtn").textContent = "Stop camera";
    $("scanHint").textContent = "Point at the barcode";
    try {
      await reader.decodeFromConstraints(
        { video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } },
        $("video"),
        (result) => {
          if (result && scanning) { stopCamera(); onScan(result); }
        }
      );
      $("scanHint").hidden = true;
    } catch (err) {
      stopCamera();
      $("scanResult").textContent = "Couldn't open the camera (" + err.message + "). Try “Use a photo”.";
    }
  });

  $("photo").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    $("scanResult").textContent = "Reading photo…";
    try {
      onScan(await reader.decodeFromImageUrl(url));
    } catch {
      $("scanResult").textContent = "No barcode found in that photo. Try a closer, well-lit, flat shot, or type the number below.";
    } finally {
      URL.revokeObjectURL(url);
      e.target.value = "";
    }
  });

  // ---------- Preview ----------
  function textColor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return l > 160 ? "#111827" : "#ffffff";
  }

  function updatePreview() {
    const merchant = f.merchant.value.trim() || "Store";
    const num = f.cardNumber.value.replace(/\s/g, "");
    const pv = $("preview");
    pv.style.background = f.color.value;
    pv.style.color = textColor(f.color.value);
    $("pvMerchant").textContent = merchant;
    if (f.balance.value) {
      $("pvPrimaryLabel").textContent = "BALANCE";
      const amt = Number(f.balance.value);
      $("pvPrimary").textContent = isNaN(amt) ? f.balance.value
        : new Intl.NumberFormat(undefined, { style: "currency", currency: f.currency.value }).format(amt);
    } else {
      $("pvPrimaryLabel").textContent = "GIFT CARD";
      $("pvPrimary").textContent = merchant;
    }
    $("pvNumber").textContent = num ? (num.length > 4 ? "•••• " + num.slice(-4) : num) : "—";
    $("pvPinWrap").hidden = !f.pin.value;

    const data = f.barcodeValue.value || num;
    const fmt = f.barcodeFormat.value;
    let shown = "No barcode";
    if (data) {
      shown = WALLET_OK.includes(fmt) ? fmt.replace(/_/g, " ") : (fmt === "DATA_MATRIX" ? "QR CODE" : "CODE 128");
    }
    $("pvBarcode").textContent = shown;
    $("pvAlt").textContent = f.cardNumber.value || data;

    const note = $("formatNote");
    if (data && fmt && !WALLET_OK.includes(fmt)) {
      note.hidden = false;
      note.textContent = `Apple Wallet can't show ${fmt.replace(/_/g, " ")} barcodes, so the same data will be shown as a ${shown} code. Most store scanners read it. If one doesn't, the cashier can type the number under the barcode.`;
    } else if (data && !fmt) {
      note.hidden = false;
      note.textContent = "No barcode was scanned, so the card number will be shown as a Code 128 barcode. If the store's scanner rejects it, the cashier can type the number.";
    } else note.hidden = true;
  }
  form.addEventListener("input", updatePreview);
  updatePreview();

  // ---------- Submit ----------
  form.addEventListener("submit", (e) => {
    const err = $("formError");
    err.hidden = true;
    const problem =
      !f.merchant.value.trim() ? "Enter the store or brand name." :
      !f.cardNumber.value.trim() && !f.barcodeValue.value.trim() ? "Scan the barcode or type the card number." :
      f.balance.value && !/^\d+(\.\d{1,2})?$/.test(f.balance.value.trim()) ? "Balance must be a number like 25 or 25.00." : "";
    if (problem) {
      e.preventDefault();
      err.textContent = problem;
      err.hidden = false;
    }
    // Otherwise let the browser submit normally: Safari on iPhone opens the
    // "Add to Apple Wallet" sheet when the .pkpass response arrives.
  });

  // ---------- Setup status ----------
  fetch("/api/status").then((r) => r.json()).then((s) => {
    if (s.ready) return;
    const b = $("setupBanner");
    b.hidden = false;
    b.textContent = "Setup needed: pass signing isn't configured on the server yet (missing " + s.missing.join(", ") + "). You can scan and preview, but adding to Wallet won't work until it is. See README.md.";
  }).catch(() => {});
})();
