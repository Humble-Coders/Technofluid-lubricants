# Invoice PDFs — Humble Bill Engine (HBE)

Tax-invoice PDFs come from HBE (docs: https://hbe-docs.web.app). The office app builds the bill data; HBE only lays it out, in Gaurav's invoice layout.

| What | Where |
|---|---|
| Template (contract 1) | `templates/technofluid-tax-invoice/contract-1.json`, also saved in the HBE Console (https://hbe-console.web.app) as `technofluid-tax-invoice` |
| Field list (data contract) | `DATA-CONTRACT.md` |
| Sale → bill data | `office/core/src/invoice-bill.ts` (tests: `invoice-bill.test.ts`) |
| Sample bills (Console samples + the sync probe) | `samples/`, written by `make-samples.ts` |
| PDF maker client (main process) | `office/desktop/src/main/hbe/` |
| Buttons | Sales → an invoice → copy, **Print** / **Save PDF** |

## Getting the PDF maker (not committed)

The helper is about 25 MB per platform, so it's kept out of git (`vendor/` is ignored). You need read access to `Humble-Coders/HBE`.

```bash
cd office/hbe && mkdir -p vendor && cd vendor
gh release download v0.3.0 --repo Humble-Coders/HBE --pattern 'hbe-render-0.3.0-macos-arm64.tar.gz' --pattern 'template.schema.json' --pattern 'bill.schema.json' --pattern 'hbe-render.js'
tar -xzf hbe-render-0.3.0-macos-arm64.tar.gz
chmod +x hbe-render-0.3.0-macos-arm64/hbe-render hbe-render-0.3.0-macos-arm64/runtime/bin/* hbe-render-0.3.0-macos-arm64/runtime/lib/jspawnhelper
```

Use `macos-x64` on an Intel Mac and `windows-x64` (zip) on Windows. The archive loses the "executable" bit, hence the `chmod`.

## Checking the template and making sample PDFs

```bash
cd office/core && npx vite-node ../hbe/make-samples.ts
cd ../hbe && D=vendor/hbe-render-0.3.0-macos-arm64
$D/runtime/bin/java -jar $D/lib/hbe-render.jar validate --template-file templates/technofluid-tax-invoice/contract-1.json --bill samples/typical.json
$D/runtime/bin/java -jar $D/lib/hbe-render.jar render --template-file templates/technofluid-tax-invoice/contract-1.json --bill samples/typical.json --image irnQr=samples/stand-in-qr.png --out out/typical.pdf
```

`samples/stand-in-qr.png` is a fake QR, only to preview the space.

## Changing the template

- Layout, wording, sizes: edit the JSON, check it with the commands above, paste it into the Console, Save version, Publish. It stays on contract 1, and installed apps pick it up on their next sync.
- A new field, flag or column, or a renamed one: that needs **contract 2** and an app release. See the HBE docs, `/templates/changing/`.
- The app ships a copy of the template, so the first invoice prints offline. Until a version is published, the app uses that copy (the sync log says "unavailable … HTTP 403").

## Known limits

- HBE doesn't count the QR picture when it sizes the bottom row. The signature column is made tall enough to hold it, so don't shrink it.
- Runs of spaces collapse to one: separate things with " · ".
- No "Totals c/o / b/d" page subtotals. Long invoices repeat the header and say "Page 2 of 3".
- Not done yet: e-invoice IRN/QR (needs e-invoicing connected), the helper inside the installer, and records of printed invoices.
