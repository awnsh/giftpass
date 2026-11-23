<p align="center">
  <img src="brand/logo-512.png" alt="GiftPass logo" width="112" height="112" />
</p>

<h1 align="center">GiftPass</h1>

<p align="center"><strong>Every gift card, right in your Wallet.</strong></p>

<p align="center">
  Scan a gift card's barcode, check the details, and add it to Apple Wallet.<br />
  Use it at the till like the plastic card, or copy the number and PIN at checkout online.
</p>

<p align="center">
  Node.js &nbsp;|&nbsp; Signed .pkpass &nbsp;|&nbsp; Scans in the browser &nbsp;|&nbsp; Card details never stored
</p>

---

**How it works**
1. Open the site in Safari on an iPhone, tap **Start camera** (or **Use a photo**) and scan the barcode on the back of the card.
2. Check the store name, card number, PIN and balance.
3. Tap **Add to Apple Wallet**. The server builds a signed `.pkpass` and Safari shows the Add to Wallet sheet.

**Using the card**
| Where | How |
|---|---|
| In store | Open the pass (double-click the side button → Wallet, or it appears on the lock screen). The cashier scans the barcode. The full card number is printed under the barcode so they can type it in if the scan fails. |
| Online | Flip the pass (⋯ → Pass Details). The card number and PIN are on the back; tap and hold to copy them. There are links to the store's site and its balance-check page if you entered them. |
| Balance changed | Add the same card again with the new balance. It has the same serial number, so Wallet updates the existing pass instead of adding a duplicate. |

## What it can't do

- **Tap-to-pay (NFC) at the register.** NFC passes need a special entitlement from Apple and an agreement with each retailer. This site uses the barcode, the same way the retailer's own app or a printed e-gift card works.
- **Live balances.** No shared gift-card balance API exists across retailers. The balance on the pass is what you typed.
- **Unsupported barcode types.** Wallet can only show QR, PDF417, Aztec and Code 128. If a card uses EAN/UPC/Code 39/ITF, the same data is shown as a Code 128 barcode instead. Most POS scanners read it, but some stores only accept the original type. In that case the cashier types the number.
- **Cards with no barcode** (number and PIN only). These still work. The card number is shown as a Code 128 barcode and printed as text for manual entry.

## Setup (one-time)

You need a paid **Apple Developer Program** membership ($99/year). Wallet won't install a pass that isn't signed by an Apple-issued Pass Type ID certificate.

1. **Create a Pass Type ID.** Go to developer.apple.com → Certificates, IDs & Profiles → Identifiers → **+** → Pass Type IDs, and enter something like `pass.com.yourname.giftcards`.
2. **Create its certificate.** Select the Pass Type ID → Create Certificate. Upload a CSR. On Windows you can make one with:
   ```powershell
   openssl req -new -newkey rsa:2048 -nodes -keyout certs/signerKey.pem -out certs/pass.csr -subj "/CN=Gift Card Wallet"
   ```
   Download the resulting `pass.cer`, then convert it:
   ```powershell
   openssl x509 -inform DER -in pass.cer -out certs/signerCert.pem
   ```
   (If you made the CSR on a Mac with Keychain instead, export a `.p12` and run `openssl pkcs12 -in Certificates.p12 -clcerts -nokeys -out certs/signerCert.pem -legacy` and `openssl pkcs12 -in Certificates.p12 -nocerts -nodes -out certs/signerKey.pem -legacy`.)
3. **Get Apple's WWDR intermediate certificate (G4)** from https://www.apple.com/certificateauthority/ and convert it:
   ```powershell
   openssl x509 -inform DER -in AppleWWDRCAG4.cer -out certs/wwdr.pem
   ```
4. Copy `.env.example` to `.env` and fill in `PASS_TYPE_ID` and `TEAM_ID`.
5. Run it:
   ```powershell
   npm install
   ```
   ```powershell
   npm start
   ```

## Testing on an iPhone

The camera only works over **HTTPS**. Plain `http://<your-pc-ip>:3000` will load, but the camera will be blocked. **Use a photo** still works there. Options:
- Deploy it to any Node host with HTTPS (Render, Railway, Fly.io, a VPS behind Caddy).
- Or tunnel your local server, e.g. `cloudflared tunnel --url http://localhost:3000`, and open the https URL on your phone.

`npm test` builds and signs a pass with throwaway self-signed certificates and checks the bundle and signature. That pass won't install on a phone, but the test confirms the pipeline works.

## Privacy and security

- Card numbers and PINs are only in server memory while the pass is being built. Nothing is saved or logged.
- Passes are marked `sharingProhibited` so they can't be AirDropped from Wallet.
- Anyone who sees the pass can use the card, just like the physical card. Keep `certs/` and `.env` out of source control (already in `.gitignore`).

## Files

- `server.js` – Express server: static site + `POST /api/pass` → `.pkpass`
- `lib/pass.js` – builds the pass JSON (store card layout, barcode choice, back-of-pass details) and signs it with `passkit-generator`
- `lib/png.js` – draws the pass icon/logo in the card's colour
- `brand/` – GiftPass logo (SVG + 512px PNG)
- `public/` – the scanner/form UI (barcode decoding by ZXing, running in the browser)
- `test/pass.test.js` – end-to-end pass generation test
