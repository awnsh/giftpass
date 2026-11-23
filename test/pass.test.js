// Generates a pass with throwaway self-signed certificates and checks the bundle.
// (A self-signed pass won't install on an iPhone; this only verifies the build/sign pipeline.)
const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Minimal zip reader (central directory) so the test has no extra dependencies.
function unzip(buf) {
  const zlib = require("zlib");
  let eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString();
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    out[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gcw-"));
const ssl = (...a) => execFileSync("openssl", a, { cwd: dir, stdio: "pipe" });
ssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "wwdrKey.pem", "-out", "wwdr.pem", "-days", "2", "-subj", "/CN=Test WWDR");
ssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "signerKey.pem", "-out", "signer.csr", "-subj", "/CN=Test Signer");
ssl("x509", "-req", "-in", "signer.csr", "-CA", "wwdr.pem", "-CAkey", "wwdrKey.pem", "-CAcreateserial", "-out", "signerCert.pem", "-days", "2");

Object.assign(process.env, { CERT_DIR: dir, PASS_TYPE_ID: "pass.test.giftcards", TEAM_ID: "TEST123456" });
const { createPkpass, buildPassJson, normalise } = require("../lib/pass");

// 1. Wallet-native barcode is kept as-is
let { json } = buildPassJson(normalise({ merchant: "Target", cardNumber: "041 234 567 890 123", pin: "1234", balance: "50", barcodeValue: "0412345678901231234", barcodeFormat: "PDF_417", redeemUrl: "target.com" }));
assert.equal(json.barcodes[0].format, "PKBarcodeFormatPDF417");
assert.equal(json.barcodes[0].message, "0412345678901231234");
assert.equal(json.barcodes[0].altText, "041 234 567 890 123");
assert.equal(json.storeCard.primaryFields[0].value, 50);
assert.ok(json.storeCard.backFields.some((b) => b.key === "pin" && b.value === "1234"));
assert.ok(json.storeCard.backFields.some((b) => b.key === "redeem" && b.value === "https://target.com"));

// 2. Unsupported symbology is re-encoded as Code 128 with the same data
({ json } = buildPassJson(normalise({ merchant: "Shop", barcodeValue: "6006491234567", barcodeFormat: "EAN_13" })));
assert.equal(json.barcodes[0].format, "PKBarcodeFormatCode128");
assert.equal(json.barcodes[0].message, "6006491234567");

// 3. Same card => same serial (so re-adding updates instead of duplicating)
const s1 = buildPassJson(normalise({ merchant: "Shop", cardNumber: "123", balance: "10" })).json.serialNumber;
const s2 = buildPassJson(normalise({ merchant: "shop", cardNumber: "123", balance: "5" })).json.serialNumber;
assert.equal(s1, s2);

// 4. Validation
assert.throws(() => normalise({ cardNumber: "1" }), /Store/);
assert.throws(() => normalise({ merchant: "X" }), /card number/);

// 5. Full signed bundle
const { buffer, filename } = createPkpass({ merchant: "Target", cardNumber: "0412345678901231", pin: "9876", balance: "25.00", barcodeFormat: "CODE_128", barcodeValue: "0412345678901231" });
const out = path.join(dir, filename);
fs.writeFileSync(out, buffer);
assert.equal(buffer.subarray(0, 2).toString(), "PK", "pkpass is a zip");
const files = unzip(buffer);
for (const f of ["pass.json", "manifest.json", "signature", "icon.png", "icon@2x.png", "logo.png"]) assert.ok(files[f], f + " in bundle");
for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), data);
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
const sha1 = require("crypto").createHash("sha1").update(fs.readFileSync(path.join(dir, "pass.json"))).digest("hex");
assert.equal(manifest["pass.json"], sha1, "manifest hash matches pass.json");
ssl("cms", "-verify", "-binary", "-inform", "DER", "-in", "signature", "-content", "manifest.json", "-CAfile", "wwdr.pem", "-purpose", "any", "-out", os.devNull);

console.log("All pass tests passed (" + buffer.length + " byte .pkpass, signature verified).");
fs.rmSync(dir, { recursive: true, force: true });
