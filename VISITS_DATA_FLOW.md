# Log Visit & Firms — Data Flow

This document explains exactly what data is stored, where it is stored, and what is fetched at each step of the Log Visit feature.

---

## Firestore Collections

Two collections are involved.

### `visits`

Each document represents one visit logged by a salesperson. The document ID is auto-generated.

```
visits/{auto-id}
  salespersonId       string
  salespersonName     string
  hasGst              boolean
  gstNumber?          string          (only when hasGst = true)
  firmName?           string          (only when hasGst = false)
  address?            string
  status              "draft" | "submitted"
  location            { lat, lng } | null
  media               MediaItem[]
  priorities          { monthly: PriorityItem[], annually: PriorityItem[] }
  relatedFirms        RelatedFirm[]
  createdAt           Timestamp
  updatedAt           Timestamp
```

`MediaItem`:
```
  url           string    Firebase Storage download URL
  storagePath   string    e.g. visits/{uid}/media/{filename}  (needed for deletion)
  type          "image" | "video"
  createdAt     string    ISO 8601
```

`PriorityItem`:
```
  productId     string
  productName   string
  quantity      number
```

`RelatedFirm` (embedded array in the visit document):
```
  hasGst        boolean
  gstNumber?    string
  name?         string
  address?      string
  priorities    { monthly: PriorityItem[], annually: PriorityItem[] }
```

---

### `firms`

Each document represents a firm identified by its GST number. The **document ID is the GST number itself** (e.g., `29AAACR5055K1ZC`).

```
firms/{gstNumber}
  gstNumber           string    (mirrors the doc ID)
  currentName         string    most recent firm name seen
  currentAddress      string    most recent address seen
  currentLocation     { lat, lng }
  defaultPriorities   { monthly: PriorityItem[], annually: PriorityItem[] }
  history             FirmHistoryEntry[]
  createdAt           Timestamp
  updatedAt           Timestamp

  -- added by GST verification (merged separately) --
  legalName?          string
  tradeName?          string
  gstStatus?          string    e.g. "Active"
  registrationDate?   string
  constitution?       string    e.g. "Proprietorship"
  registeredAddress?  string
  state?              string
  pincode?            string
  gstVerifiedAt?      Timestamp
```

`FirmHistoryEntry` (embedded array in the firm document):
```
  firmName    string
  address     string
  location    { lat, lng }
  priorities  { monthly: PriorityItem[], annually: PriorityItem[] }
  updatedAt   Date
```

The `history` array grows every time a salesperson visits the same firm. Each entry records the name, address, location, and priorities captured at that point in time. No duplicates — if all three (name, address, location) are identical to the last entry, a new history entry is not appended.

---

### Firebase Storage

Media files (photos/videos) are stored at:
```
visits/{salespersonUid}/media/{timestamp}_{random}.{extension}
```

The `storagePath` is always saved in Firestore alongside the `url` so the file can be deleted later.

---

## Full Step-by-Step Flow

### 1. Page loads

`page.tsx` mounts and:
- Reads the current user from auth context
- Calls `subscribeActiveProducts()` → real-time listener on the `products` collection → populates the product list used in priority dropdowns
- If `?visitId=` is in the URL (edit mode): calls `getLogVisitById(visitId)` → fetches the `visits/{visitId}` document and normalizes it → calls `populateFromVisit()` to hydrate all form fields

---

### 2. User enters a GST number

Handled inside `FirmLookup` (main firm) or `RelatedFirmCard` (related firm).

**Step A — format check**
`isValidGstFormat()` checks the 15-character regex locally. If it fails, a validation error is shown immediately. No network call is made.

**Step B — GST verification** (triggered on blur or 800ms after 15 chars are typed)
- Calls the Firebase Cloud Function `verifyGST` with `{ gstNumber }` via `httpsCallable`
- The Cloud Function:
  1. Checks the `gst_cache` Firestore collection for a cached result
  2. If cached → returns it immediately
  3. If not cached → calls `GET https://appyflow.in/api/verifyGST?key_secret=KEY&gstNo=GSTIN`
  4. Parses the response, maps it to `GstVerifiedData`, writes to cache, returns
- On success:
  - The firm name field is auto-filled with `tradeName` (or `legalName` as fallback)
  - `saveFirmGstData(gstData)` is called (fire-and-forget) → merges GST fields into `firms/{gstNumber}` in Firestore without overwriting existing priorities or history

**Step C — address history load**
After GST verification (or immediately if gstNumber is already set):
- Calls `getFirmByGst(gstNumber)` → fetches `firms/{gstNumber}`
- Extracts all unique addresses from `firm.history`
- Populates the address dropdown

---

### 3. User selects an address

When an address is chosen from the dropdown:

**Step A — branch check**
`getBranchByGstAndAddress(gstNumber, address)` → reads `firms/{gstNumber}`, checks if any history entry has this address (case-insensitive).
- If yes → shows "This location already exists" dialog (Same Branch / New Branch)
- If no → proceeds to autofill

**Step B — priority autofill**
`getAutoFillPriorities(gstNumber, address)` → reads `firms/{gstNumber}`:
- Looks for a history entry matching the address
- If found → returns that entry's priorities
- If not found → returns `firm.defaultPriorities`
- Populates the monthly and annual priority lists

---

### 4. User fills priorities and media

- Media files: each file is uploaded immediately when selected via `uploadVisitMedia(file, uid)` → stored in Firebase Storage → returns `{ url, storagePath, type, createdAt }` → added to form state
- Priorities: user selects product + quantity for each slot (minimum 5 for submit, 0 for draft)

---

### 5. Save (Draft or Submit)

Both draft and submit follow the same path. The only difference is `status: "draft"` vs `status: "submitted"` and stricter validation on submit.

**Step A — validation**
`validateAndGetInput(isFullSubmit)`:
- GST mode: requires `gstNumber` and `address`
- No-GST mode: requires `firmName`
- Always: at least 1 media item
- Full submit only: ≥ 5 monthly priorities (each with productId and quantity > 0), same rules for each related firm

If validation fails → errors are shown inline, save is aborted.

**Step B — create/update main firm** (only if `hasGst = true`)
`createOrUpdateFirm(gstNumber, firmName, address, location, priorities)` → writes to `firms/{gstNumber}`:
- If document does not exist → creates it with `currentName`, `currentAddress`, `currentLocation`, `defaultPriorities`, and initial `history` entry
- If document exists → updates `currentName/Address/Location`, appends to `history` (skips if duplicate), updates `updatedAt`

**Step C — create/update each related firm** (only if `hasGst = true` for that firm)
Same `createOrUpdateFirm()` call for each related firm with a GST number.

**Step D — write the visit document**
- Create mode: `createLogVisit(input, salespersonId, salespersonName)` → `addDoc` to `visits` collection → returns the new document ID
- Edit mode: `updateLogVisit(visitId, input, ...)` → `updateDoc` on `visits/{visitId}`

Before writing, `removeUndefined()` recursively strips any `undefined` fields from the object so Firestore doesn't reject it.

**Step E — redirect**
On success → navigates to `/salesperson/visits`

---

## What is fetched vs. what is stored

| Action | Collection/Storage | Read or Write | What |
|---|---|---|---|
| Page loads (edit mode) | `visits/{id}` | Read | Full visit document |
| Products dropdown | `products` | Read (live) | All active products |
| GST verification (cached) | `gst_cache/{gstin}` | Read | Cached taxpayer info |
| GST verification (fresh) | AppyFlow API → `gst_cache/{gstin}` | Write | Taxpayer info |
| Save GST data to firm | `firms/{gstin}` | Write (merge) | Legal/trade name, status, pincode, etc. |
| Load address history | `firms/{gstin}` | Read | Full firm doc (history array) |
| Branch check | `firms/{gstin}` | Read | Full firm doc |
| Priority autofill | `firms/{gstin}` | Read | Full firm doc |
| Upload media file | Storage `visits/{uid}/media/…` | Write | File bytes |
| Save firm on submit | `firms/{gstin}` | Write (create or update) | currentName, currentAddress, history entry |
| Save visit on submit | `visits/{auto-id}` | Write | Full visit document |
| Delete media | Storage `visits/{uid}/media/…` | Delete | File by storagePath |

---

## How the `firms` document grows over time

Every time a salesperson logs a visit to the same GST number:

1. `currentName`, `currentAddress`, `currentLocation` are overwritten with the latest values
2. A new entry is appended to `history[]` with name, address, location, and the priorities that were set during that visit — **unless** the previous history entry already has the exact same name, address, and location, in which case no duplicate is added
3. GST-verified fields (`legalName`, `tradeName`, `gstStatus`, etc.) are merged in separately by `saveFirmGstData` and are never overwritten by `createOrUpdateFirm`

This means the `firms` document is a living record of every address and priority set ever associated with that GST number, and is used to pre-fill future visits.

---

## Component → Service → Firestore map

```
page.tsx
  └─ handleSave()
       ├─ createOrUpdateFirm()         → firms/{gstNumber}
       └─ createLogVisit()             → visits/{auto-id}

FirmLookup / RelatedFirmCard
  ├─ useGstVerification → verifyGstNumber()
  │    └─ Cloud Function verifyGST
  │         ├─ Read  gst_cache/{gstin}
  │         └─ Write gst_cache/{gstin}  +  AppyFlow API
  ├─ saveFirmGstData()                 → firms/{gstin}  (merge)
  ├─ getFirmByGst()                    → firms/{gstin}  (read)
  ├─ getBranchByGstAndAddress()        → firms/{gstin}  (read)
  └─ getAutoFillPriorities()           → firms/{gstin}  (read)

MediaSection
  └─ uploadVisitMedia()               → Storage visits/{uid}/media/…
  └─ deleteVisitMedia()               → Storage (delete by storagePath)
```
