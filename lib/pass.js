// Builds a signed Apple Wallet store-card pass (.pkpass) for a gift card.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PKPass } = require("passkit-generator");
const { giftIcon } = require("./png");

// Apple Wallet can only render these four barcode symbologies.
const WALLET_FORMATS = {
  QR_CODE: "PKBarcodeFormatQR",
  PDF_417: "PKBarcodeFormatPDF417",
  AZTEC: "PKBarcodeFormatAztec",
  CODE_128: "PKBarcodeFormatCode128",
};

const CERT_DIR = process.env.CERT_DIR || path.join(__dirname, "..", "certs");

function loadCertificates() {
  const file = (n) => path.join(CERT_DIR, n);
  const needed = ["wwdr.pem", "signerCert.pem", "signerKey.pem"];
  if (!needed.every((n) => fs.existsSync(file(n)))) return null;
  return {
    wwdr: fs.readFileSync(file("wwdr.pem")),
    signerCert: fs.readFileSync(file("signerCert.pem")),
    signerKey: fs.readFileSync(file("signerKey.pem")),
    signerKeyPassphrase: process.env.SIGNER_KEY_PASSPHRASE || undefined,
  };
}

function configStatus() {
  const missing = [];
  if (!process.env.PASS_TYPE_ID) missing.push("PASS_TYPE_ID");
  if (!process.env.TEAM_ID) missing.push("TEAM_ID");
  if (!loadCertificates()) missing.push(`certificates (wwdr.pem, signerCert.pem, signerKey.pem) in ${path.relative(process.cwd(), CERT_DIR) || "."}/`);
  return { ready: missing.length === 0, missing };
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = parseInt(m ? m[1] : "1f2937", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;
// Pick black or white text depending on background brightness.
const textOn = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b > 160 ? [17, 24, 39] : [255, 255, 255]);

const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);

/** Validates and normalises the form input. Throws with a user-facing message on bad input. */
function normalise(input) {
  const card = {
    merchant: clean(input.merchant, 60),
    cardNumber: clean(input.cardNumber, 64).replace(/\s+/g, " "),
    pin: clean(input.pin, 32),
    balance: clean(input.balance, 20),
    currency: clean(input.currency || "USD", 3).toUpperCase(),
    expires: clean(input.expires, 10),
    barcodeValue: clean(input.barcodeValue, 2000),
    barcodeFormat: clean(input.barcodeFormat, 20).toUpperCase(),
    redeemUrl: clean(input.redeemUrl, 300),
    balanceUrl: clean(input.balanceUrl, 300),
    notes: clean(input.notes, 500),
    color: hexToRgb(input.color),
  };
  if (!card.merchant) throw new Error("Store / brand name is required.");
  if (!card.cardNumber && !card.barcodeValue) throw new Error("Enter a card number or scan the card's barcode.");
  if (card.balance && !/^\d+(\.\d{1,2})?$/.test(card.balance)) throw new Error("Balance must be a number like 25 or 25.00.");
  if (card.expires && !/^\d{4}-\d{2}-\d{2}$/.test(card.expires)) throw new Error("Expiry must be a date.");
  for (const k of ["redeemUrl", "balanceUrl"]) {
    if (card[k] && !/^https?:\/\//i.test(card[k])) card[k] = "https://" + card[k];
  }
  return card;
}

/** Chooses the barcode to show in Wallet. Returns { message, format, reencoded } or null. */
function chooseBarcode(card) {
  const message = card.barcodeValue || card.cardNumber.replace(/\s/g, "");
  if (!message) return null;
  if (WALLET_FORMATS[card.barcodeFormat]) {
    return { message, format: WALLET_FORMATS[card.barcodeFormat], reencoded: false };
  }
  // Wallet can't draw EAN/UPC/Code39/ITF/etc. Re-encode the same data as Code 128,
  // which virtually every retail scanner reads and which yields the same string at the till.
  // 2D codes it can't draw (e.g. Data Matrix) fall back to QR.
  const twoD = ["DATA_MATRIX", "MAXICODE"].includes(card.barcodeFormat);
  const printable = /^[\x20-\x7e]+$/.test(message);
  return {
    message,
    format: twoD || !printable ? WALLET_FORMATS.QR_CODE : WALLET_FORMATS.CODE_128,
    reencoded: Boolean(card.barcodeFormat),
  };
}

const masked = (num) => {
  const digits = num.replace(/\s/g, "");
  return digits.length > 4 ? "•••• " + digits.slice(-4) : digits;
};

function buildPassJson(card) {
  const barcode = chooseBarcode(card);
  const fg = textOn(card.color);
  // Same store + card number => same serial, so re-adding (e.g. with a new balance)
  // replaces the existing pass in Wallet instead of creating a duplicate.
  const serialNumber = crypto
    .createHash("sha256")
    .update(`${card.merchant.toLowerCase()}|${card.cardNumber || card.barcodeValue}`)
    .digest("hex")
    .slice(0, 32);

  const primary = card.balance
    ? [{ key: "balance", label: "BALANCE", value: Number(card.balance), currencyCode: card.currency }]
    : [{ key: "title", label: "GIFT CARD", value: card.merchant }];

  const secondary = [];
  if (card.cardNumber) secondary.push({ key: "number", label: "CARD", value: masked(card.cardNumber) });
  if (card.pin) secondary.push({ key: "pinHint", label: "PIN", value: "On back ⓘ" });

  const auxiliary = [];
  if (card.expires) {
    auxiliary.push({ key: "expires", label: "EXPIRES", value: `${card.expires}T23:59:59Z`, dateStyle: "PKDateStyleMedium", timeStyle: "PKDateStyleNone", ignoresTimeZone: true });
  }

  const back = [];
  if (card.cardNumber) back.push({ key: "fullNumber", label: "Card number (tap & hold to copy)", value: card.cardNumber });
  if (card.pin) back.push({ key: "pin", label: "PIN / security code", value: card.pin });
  if (card.barcodeValue && card.barcodeValue !== card.cardNumber.replace(/\s/g, "")) {
    back.push({ key: "barcodeData", label: "Barcode data", value: card.barcodeValue });
  }
  if (card.redeemUrl) back.push({ key: "redeem", label: "Use online", value: card.redeemUrl, attributedValue: `<a href="${card.redeemUrl}">Shop / redeem online</a>` });
  if (card.balanceUrl) back.push({ key: "checkBalance", label: "Check balance", value: card.balanceUrl, attributedValue: `<a href="${card.balanceUrl}">Check current balance</a>` });
  back.push({
    key: "howTo",
    label: "How to redeem",
    value:
      "In store: show the barcode to the cashier to scan. If it won't scan, they can type the card number shown under the barcode (and the PIN above, if asked).\n" +
      "Online: at checkout choose “gift card”, then copy the card number and PIN from this side of the pass.",
  });
  if (barcode?.reencoded) {
    back.push({ key: "reencoded", label: "Barcode note", value: `The original card used a barcode type Wallet can't show (${card.barcodeFormat}). The same data is shown as a ${barcode.format.replace("PKBarcodeFormat", "")} code, which most store scanners accept. If not, the cashier can key in the number.` });
  }
  if (card.balance) back.push({ key: "balanceNote", label: "About the balance", value: "The balance shown is what you entered when adding the card. It does not update automatically. Re-add the card with a new balance to replace it." });
  if (card.notes) back.push({ key: "notes", label: "Notes", value: card.notes });

  const json = {
    formatVersion: 1,
    passTypeIdentifier: process.env.PASS_TYPE_ID,
    teamIdentifier: process.env.TEAM_ID,
    organizationName: process.env.ORG_NAME || "GiftPass",
    serialNumber,
    description: `${card.merchant} gift card`,
    logoText: card.merchant,
    backgroundColor: rgb(card.color),
    foregroundColor: rgb(fg),
    labelColor: rgb(fg),
    sharingProhibited: true,
    storeCard: { primaryFields: primary, secondaryFields: secondary, auxiliaryFields: auxiliary, backFields: back },
  };
  if (card.expires) json.expirationDate = `${card.expires}T23:59:59Z`;
  if (barcode) {
    const bc = {
      message: barcode.message,
      format: barcode.format,
      messageEncoding: "iso-8859-1",
      altText: card.cardNumber || barcode.message,
    };
    json.barcodes = [bc];
    json.barcode = bc; // legacy key for very old iOS versions
  }
  return { json, barcode };
}

function createPkpass(input) {
  const status = configStatus();
  if (!status.ready) {
    const err = new Error("Pass signing is not set up yet. Missing: " + status.missing.join(", "));
    err.status = 503;
    throw err;
  }
  const card = normalise(input);
  const { json } = buildPassJson(card);
  const icon = (s) => giftIcon(s, card.color);
  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(json)),
      "icon.png": icon(29), "icon@2x.png": icon(58), "icon@3x.png": icon(87),
      "logo.png": icon(50), "logo@2x.png": icon(100), "logo@3x.png": icon(150),
    },
    loadCertificates()
  );
  return { buffer: pass.getAsBuffer(), filename: `${card.merchant.replace(/[^\w-]+/g, "_")}-giftcard.pkpass` };
}

module.exports = { createPkpass, configStatus, normalise, buildPassJson, chooseBarcode };
