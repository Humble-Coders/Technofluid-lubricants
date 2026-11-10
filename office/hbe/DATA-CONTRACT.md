# technofluid-tax-invoice — data contract 1

The fields the template `templates/technofluid-tax-invoice/contract-1.json` reads, and exactly how each must look. Treat it like an API: renaming or removing a key, or making the template read a new one, needs **contract 2** (HBE docs: /templates/changing/). The app builds these in `office/core/src/invoice-bill.ts` (tested in `invoice-bill.test.ts`); `make-samples.ts` writes the sample bills in `samples/` from the same code.

Layout: Gaurav's current tax invoice (June 2026 samples). Header and footer repeat on every page; the items table fills the page.

Every value is a **string, formatted as it prints**. Money: Indian grouping, 2 decimals, no symbol (`2,24,720.00`), from integer paise. Dates: `DD-MM-YYYY` from the invoice's calendar date. Blank (`""`) prints nothing.

## Fields

| Key | Req. | Example | From |
|---|---|---|---|
| `copyLabel` | | `Triplicate Copy` | one render per copy: Original / Duplicate / Triplicate Copy |
| `seller.name` | ✓ | `Lube Chem Industries` | Settings → legal name |
| `seller.gstin` | ✓ | `06GSJPK2399F1ZD` | Settings |
| `seller.address` | | `Near Gaushala Road …, Karnal` | Settings, one line |
| `seller.panLine` | | `PAN : GSJPK2399F` | PAN = GSTIN characters 3–12 |
| `seller.contactLine` | | `Tel. : 9034675151, 7876058000  ·  email : …` | Settings phone, email |
| `invoiceNo` | ✓ | `TF/2026-27/0869` | the sale (createSale numbers it) |
| `invoiceDate` | ✓ | `11-06-2026` | the sale's invoice date |
| `placeOfSupply` | ✓ | `Haryana (06)` | state name (code) |
| `reverseCharge` | | `N` | always N for now |
| `transport`, `vehicleNo`, `station`, `ewayBillNo` | | `NONE`, `HR99X0001`, `JAGADHRI`, `300000000001` | the sale's dispatch details (New sale → Dispatch); blank when not given |
| `buyer.name` | ✓ | `Sample Agencies` | customer (walk-in: the name typed at billing) |
| `buyer.address` | | `12 Sample Market, Jagadhri` | line1, line2, city |
| `buyer.statePin` | | `HARYANA-135003` | state in capitals - PIN |
| `buyer.pan` | | `AAACL1234M` | from the GSTIN; blank if none |
| `buyer.mobile` | | `90000 00000` | customer's phones |
| `buyer.aadhaar` | | `` | always blank (we don't keep Aadhaar numbers) |
| `buyer.gstin` | | `06AAACL1234M1ZO` | blank for an unregistered buyer |
| `shipTo.*` | | same keys as `buyer.*` | the sale's ship-to address; the buyer when not shipped elsewhere. Mobile is blank for a separate ship-to |
| `irnLine`, `ackLine` | | `IRN : 0123…`, `Ack.No. : 1000…  ·  Ack. Date : 29-05-2026` | e-invoice, once connected |
| `notes` | | `2 EMPTY DRUMS RETURNABLE` | the sale's note |
| `taxableValue` | ✓ | `2,24,720.00` | goods after discount + freight |
| `tax1.label`, `tax1.rate`, `tax1.amount` | | `Add : CGST`, `@ 9.00 %`, `20,224.80` | IGST sale: `Add : IGST`, `@ 18.00 %` |
| `tax2.label`, `tax2.rate`, `tax2.amount` | | `Add : SGST`, `@ 9.00 %`, `20,224.80` | blank on an IGST sale (the line disappears) |
| (rate) | | | blank when the invoice has more than one GST rate — the tax summary shows each |
| `roundOff.label`, `roundOff.amount` | | `Add : Rounded Off (+)`, `0.40` | or `Less : Rounded Off (-)`; blank when zero |
| `totalQty` | | `11.00 Drum` | packs; `Units` when the packs differ |
| `grandTotal` | ✓ | `₹ 2,65,170.00` | ₹, space, amount |
| `taxSummary.rate` / `.taxable` / `.cgst` / `.sgst` / `.igst` / `.total` | | `18%` / `2,24,720.00` / … | one line per GST rate, joined with `\n` |
| `amountInWords` | ✓ | `Rupees Two Lakh Sixty Five Thousand One Hundred Seventy Only` | from the same paise |
| `bank.line1`, `bank.line2` | | `Bank Name: HDFC BANK, Branch: INDRI  ·  Account Type: CA` | Settings → Company details → Bank details |
| `terms` | | `E.& O.E.\n1. Goods once sold …` | Settings → Company details → Terms & conditions, one line each |
| `signatoryFor` | | `For Lube Chem Industries` | "For " + legal name |

## Flags

| Flag | True when | Effect |
|---|---|---|
| `isInterState` | place of supply ≠ Haryana | tax summary shows IGST instead of CGST + SGST |
| `hasIrn` | the invoice has an e-invoice IRN | IRN line and the QR column print |
| `hasNotes` | the sale has a note | (not used for layout: the note row is always there, blank when there is no note) |
| `hasBank` | bank details are set | Bank Details block prints |

## Rows

One row per sale line, style `item`, then one row for freight if charged.

| Cell | Example | Note |
|---|---|---|
| `slNo` | `1.` | |
| `description` | runs: `Champion Hyd 68` + italic `\n205 Liter Drum` | the second line also says `Less 5% discount (1,999.00)` when discounted |
| `hsn` | `27101980` | blank when the product has none yet |
| `qty` | `4.00` | packs |
| `unit` | `Drum` | from the pack label: Drum / Can / Case / Bkt / Jar / Pcs |
| `rate` | `19,990.00` | price of one pack |
| `amount` | `79,960.00` | after the line's discount |

## Images

| Key | Where from |
|---|---|
| `irnQr` | per bill (`images.irnQr`), the e-invoice QR — only with `hasIrn`. `samples/stand-in-qr.png` is a fake one, only to preview the space |

The logo is not used (Gaurav's invoices have none).

## Different from the paper invoice (HBE limits or our data)

- A long invoice repeats the table header and shows "Page 2 of 3". It can't print the "Totals c/o" / "b/d" page subtotals.
- Labels have no ":" column (HBE lines up label and value itself).
- Each line shows its pack under the product name, and its discount if any. Gaurav's invoices have no discount column.
