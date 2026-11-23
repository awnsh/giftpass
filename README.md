<p align="center">
  <img src="brand/logo-512.png" alt="GiftPass logo" width="112" height="112" />
</p>

<h1 align="center">GiftPass</h1>

<p align="center"><strong>Every gift card, right on your phone.</strong></p>

<p align="center">
  Scan a gift card once and leave the plastic at home.<br />
  Show the barcode at the till, or copy the number and PIN at checkout.<br />
  <a href="https://awnsh.github.io/giftpass/">awnsh.github.io/giftpass</a>
</p>

<p align="center">
  Free &nbsp;|&nbsp; No account &nbsp;|&nbsp; Works offline &nbsp;|&nbsp; Nothing leaves your phone
</p>

---

## How it works

1. Open **[awnsh.github.io/giftpass](https://awnsh.github.io/giftpass/)** on your phone.
2. Tap **+ Add card**, then **Start camera** and point it at the barcode on the back of the gift card (or pick a photo of it).
3. Check the store name, card number, PIN and balance, then tap **Save card**.

**Install it like an app:** on iPhone, open the site in Safari, tap **Share → Add to Home Screen**. On Android Chrome, tap **⋮ → Add to Home screen** (or **Install app**). It then opens full-screen and works without signal.

## Using a card

| Where | How |
|---|---|
| In store | Open the card and turn your screen brightness up. The cashier scans the barcode. The card number is printed under it in case they need to type it. |
| Online | Open the card, tap **Copy** next to the card number and PIN, and paste them at checkout. There are links to the store's site and balance page if you added them. |
| After spending | Type the new amount into **Update balance**. |

GiftPass redraws the **same barcode type the card uses** (UPC/EAN, Code 128, PDF417, QR, Code 39, ITF, Codabar, Data Matrix, Aztec and more), so store scanners read it the same way they read the plastic card.

## Privacy

- Cards are saved **only in your browser on your device** (localStorage). There's no server, no account and no tracking. The site is just static files on GitHub Pages.
- Scanning happens on your device too. Camera images are never uploaded.
- Anyone who can unlock your phone and open the app can see and use your cards, just like the physical cards.

## Backups

Because nothing is stored online, deleting the app or clearing Safari's website data deletes your cards. Use **Backup & restore → Download backup** on the home screen to save a `.json` file, and **Restore from file** to load it on a new phone. The file contains your card numbers and PINs, so keep it private.

## Limits

- Balances don't update automatically. Retailers don't share balances through any common API, so the balance is what you type.
- Not Apple Wallet. Adding passes to Apple Wallet requires a paid Apple Developer membership ($99/year), so GiftPass is a free home-screen app instead.
- A few stores only accept the physical card or their own app. In that case the cashier can usually type the number.

## Run it locally

It's a static site with no build step. Serve the folder over HTTP, for example:

```powershell
npx http-server -p 8080
```

Then open http://localhost:8080. The camera needs HTTPS or `localhost`, so to test scanning on a phone, use the GitHub Pages URL.

## Files

- `index.html`, `styles.css`, `app.js`: the whole app (card list, scanner, card view, backup)
- `sw.js`, `manifest.webmanifest`: offline support and home-screen install
- `vendor/`: [ZXing](https://github.com/zxing-js/library) for scanning (Apache-2.0) and [bwip-js](https://github.com/metafloor/bwip-js) for drawing barcodes (MIT)
- `brand/`: GiftPass logo (SVG + 512px PNG)

## License

MIT. Not affiliated with Apple or any retailer.
