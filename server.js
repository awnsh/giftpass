const path = require("path");
const express = require("express");
const { createPkpass, configStatus } = require("./lib/pass");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
// iOS Safari only shows the "Add to Apple Wallet" sheet reliably for a real navigation,
// so the page submits a normal HTML form and we accept urlencoded bodies too.
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/vendor/zxing", express.static(path.join(__dirname, "node_modules/@zxing/library/umd")));

app.get("/api/status", (_req, res) => res.json(configStatus()));

// Card details are only held in memory for the duration of this request. Nothing is stored or logged.
app.post("/api/pass", (req, res) => {
  try {
    const { buffer, filename } = createPkpass(req.body || {});
    res.set({
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    });
    res.send(buffer);
  } catch (err) {
    res.status(err.status || 400);
    if (req.is("json")) return res.json({ error: err.message });
    const msg = String(err.message).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    res.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;padding:24px"><h1>Couldn't create the pass</h1><p>${msg}</p><p><a href="/">Back</a></p>`);
  }
});

module.exports = app; // used by api/index.js on Vercel

if (require.main === module) {
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  const s = configStatus();
  console.log(`GiftPass running on http://localhost:${port}`);
  if (!s.ready) console.log("Signing not configured. Missing: " + s.missing.join(", ") + " (see README.md)");
});
}
