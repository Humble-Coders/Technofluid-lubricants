# Lubricant Project — Complete Flow & Variable Reference

This document explains every file, every variable, and the complete end-to-end flow for the admin user management system (Distributors, Salespersons, Supervisors).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Layer-by-Layer Explanation](#4-layer-by-layer-explanation)
   - [Layer 1 — Firebase Config (`lib/firebase.ts`)](#layer-1--firebase-config)
   - [Layer 2 — Constants (`lib/constants.ts`)](#layer-2--constants)
   - [Layer 3 — Cloud Functions (Backend)](#layer-3--cloud-functions-backend)
   - [Layer 4 — API Wrapper (`lib/api/admin.ts`)](#layer-4--api-wrapper)
   - [Layer 5 — Action Functions (`lib/actions/`)](#layer-5--action-functions)
   - [Layer 6 — Services (`lib/services/`)](#layer-6--services)
   - [Layer 7 — Custom Hooks (`lib/use*.ts`)](#layer-7--custom-hooks)
   - [Layer 8 — Pages](#layer-8--pages)
   - [Layer 9 — Table Components](#layer-9--table-components)
   - [Layer 10 — Modal Components](#layer-10--modal-components)
5. [Complete Flow Walkthrough](#5-complete-flow-walkthrough)
   - [CREATE a user](#flow-a-create-a-user)
   - [APPROVE a user](#flow-b-approve-a-user)
   - [EDIT a user](#flow-c-edit-a-user)
   - [DELETE a user](#flow-d-delete-a-user)
6. [Firestore Data Shape](#6-firestore-data-shape)
7. [Error Handling Chain](#7-error-handling-chain)
8. [Environment Variables](#8-environment-variables)

---

## 1. Project Overview

This is a **lubricant distribution management system**. An admin can manage three types of users:

| Role | Description |
|------|-------------|
| `distributor` | A business that receives and distributes products |
| `salesperson` | A person who manages distributors in the field |
| `supervisor` | A person who oversees salespersons |

The admin can **create**, **approve**, **edit**, and **delete** these users through admin dashboard pages.

---

## 2. Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js (App Router) + TypeScript |
| UI | Custom component library (Button, Modal, Table, Badge, etc.) |
| Backend | Firebase Cloud Functions v2 (Node.js) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| Real-time updates | Firestore `onSnapshot` (live listener) |

---

## 3. Project Structure

```
lubricant-project/
│
├── firebase/                          ← Backend (Cloud Functions)
│   └── functions/src/
│       ├── index.ts                   ← Exports all cloud functions
│       └── users/
│           ├── createUserCallable.ts  ← Creates user in Auth + Firestore
│           └── deleteUser.ts          ← Deletes user from Auth + Firestore
│
└── frontend/                          ← Frontend (Next.js)
    ├── .env                           ← Firebase config keys (secret)
    └── lib/
        ├── firebase.ts                ← Initializes Firebase SDK
        ├── constants.ts               ← App-wide string constants
        ├── api/
        │   └── admin.ts               ← Calls Cloud Functions via httpsCallable
        ├── actions/
        │   ├── createDistributor.ts   ← Action: create distributor + send email
        │   ├── createSalesperson.ts   ← Action: create salesperson + send email
        │   └── createSupervisor.ts    ← Action: create supervisor + send email
        ├── services/
        │   ├── distributorService.ts  ← Firestore CRUD for distributors collection
        │   └── userService.ts         ← Firestore CRUD for users collection
        ├── useDistributors.ts         ← React hook: state + operations for distributors
        ├── useSalespersons.ts         ← React hook: state + operations for salespersons
        └── useSupervisors.ts          ← React hook: state + operations for supervisors
```

---

## 4. Layer-by-Layer Explanation

---

### Layer 1 — Firebase Config

**File:** `frontend/lib/firebase.ts`

This file boots up Firebase and exports three services that every other file uses.

```ts
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};
```

| Variable | Purpose |
|----------|---------|
| `apiKey` | Identifies your Firebase project to Google's API |
| `authDomain` | The domain used for Firebase Auth (e.g. `yourapp.firebaseapp.com`) |
| `projectId` | The unique ID of your Firebase project |
| `storageBucket` | Firebase Storage bucket URL |
| `messagingSenderId` | Used for Firebase Cloud Messaging (push notifications) |
| `appId` | The specific app ID within your Firebase project |

```ts
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
```

> **Why this check?** Next.js can run the same file multiple times (server-side + client-side). Without this guard, you'd get an error about initializing Firebase twice. `getApps().length` checks if any Firebase app already exists — if yes, reuse it; if no, create it.

```ts
export const auth      = getAuth(app);        // Firebase Authentication service
export const db        = getFirestore(app);   // Firestore database service
export const functions = getFunctions(app, "us-central1");  // Cloud Functions
```

| Export | Type | Used for |
|--------|------|---------|
| `auth` | Firebase Auth | Sending password reset emails |
| `db` | Firestore | Reading/writing documents |
| `functions` | Functions | Calling Cloud Functions from frontend |

> The `"us-central1"` region must match exactly where the Cloud Functions are deployed. If they don't match, calls will fail.

---

### Layer 2 — Constants

**File:** `frontend/lib/constants.ts`

Single source of truth for strings used throughout the app. Instead of writing `"admin"` everywhere (and risking typos), import from here.

```ts
export const USER_ROLES = {
  ADMIN:       "admin",
  SUPERVISOR:  "supervisor",
  SALESPERSON: "salesperson",
  DISTRIBUTOR: "distributor",
} as const;
```

> `as const` means TypeScript treats these as literal types (e.g. `"admin"`, not just `string`). This gives you autocomplete and type safety.

```ts
export const USER_STATUS = {
  PENDING:  "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
```

```ts
export const COLLECTIONS = {
  USERS:        "users",
  DISTRIBUTORS: "distributors",
  ORDERS:       "orders",
  VISITS:       "visits",
} as const;
```

These are the exact Firestore collection names. If you change a collection name in Firestore, you only change it here.

```ts
export const ROLE_ROUTES: Record<string, string> = {
  admin:       "/dashboard",
  salesperson: "/dashboard",
  supervisor:  "/dashboard",
  distributor: "/dashboard",
};
```

Used to redirect users to the correct page after login based on their role.

---

### Layer 3 — Cloud Functions (Backend)

These run on Google's servers, not in the browser. The browser cannot bypass them or fake them.

---

#### `firebase/functions/src/index.ts`

```ts
import * as admin from "firebase-admin";

admin.initializeApp();

export { createUserByAdminCallable } from "./users/createUserCallable";
export { deleteUser }                from "./users/deleteUser";
```

| Line | What it does |
|------|-------------|
| `import * as admin` | Loads the Firebase Admin SDK (server-side SDK with full permissions) |
| `admin.initializeApp()` | Boots the Admin SDK using the service account that Google automatically provides in Cloud Functions |
| `export { ... }` | Registers these functions so Firebase deploys them |

---

#### `firebase/functions/src/users/createUserCallable.ts`

Creates a new user account in both Firebase Auth and Firestore. Only an admin can call this.

```ts
export const createUserByAdminCallable = onCall(
  { region: "us-central1" },
  async (request) => {
```

| Variable | Type | Description |
|----------|------|-------------|
| `request` | `CallableRequest` | The full request object from the frontend |
| `request.auth` | `object \| null` | Firebase automatically puts the caller's auth info here. If `null`, the user is not logged in |
| `request.auth.uid` | `string` | The UID of whoever is calling this function (the admin) |
| `request.data` | `object` | The payload sent from the frontend |

**Step 1 — Auth check:**
```ts
if (!request.auth) {
  throw new HttpsError("unauthenticated", "unauthenticated");
}
```
If the caller is not logged in, reject immediately.

**Step 2 — Destructure input:**
```ts
const { email, password, name, role, phone } = request.data;
```

| Field | Required | Description |
|-------|----------|-------------|
| `email` | Yes | The new user's email address |
| `password` | Yes | Temporary password (will be reset via email) |
| `name` | Yes | Display name |
| `role` | Yes | One of: `"distributor"`, `"salesperson"`, `"supervisor"` |
| `phone` | No | Phone number (defaults to `""` if missing) |

**Step 3 — Verify the caller is an admin:**
```ts
const callerDoc  = await admin.firestore().collection("users").doc(request.auth.uid).get();
const callerData = callerDoc.data();

if (!callerData || callerData.role !== "admin") {
  throw new HttpsError("permission-denied", "permission-denied");
}
```

Fetches the caller's document from Firestore and checks their `role` field. Even if someone obtains a valid token, they can't create users unless their Firestore role is `"admin"`.

**Step 4 — Create Firebase Auth account:**
```ts
let userRecord;
try {
  userRecord = await admin.auth().createUser({ email, password });
} catch (error: any) {
  if (error.code === "auth/email-already-exists") {
    throw new HttpsError("already-exists", "Email already registered");
  }
  throw new HttpsError("internal", error.message);
}
```

| Variable | Description |
|----------|-------------|
| `userRecord` | The newly created Firebase Auth user object |
| `userRecord.uid` | The unique ID Firebase assigned to this new user |
| `error.code` | Firebase-specific error code, e.g. `"auth/email-already-exists"` |

**Step 5 — Save user to Firestore:**
```ts
const uid = userRecord.uid;
const now = admin.firestore.FieldValue.serverTimestamp();

await admin.firestore().collection("users").doc(uid).set({
  email,
  name,
  role,
  phone:          phone ?? "",
  status:         "approved",
  isActive:       true,
  distributorCount: 0,
  ordersCount:    0,
  createdBy:      request.auth.uid,
  approvedBy:     request.auth.uid,
  approvedAt:     now,
  createdAt:      now,
  updatedAt:      now,
});
```

| Field | Type | Description |
|-------|------|-------------|
| `uid` | `string` | The new user's UID, used as the Firestore document ID |
| `now` | `FieldValue` | Server-side timestamp (avoids clock skew between client and server) |
| `email` | `string` | User's email |
| `name` | `string` | User's display name |
| `role` | `string` | `"distributor"`, `"salesperson"`, or `"supervisor"` |
| `phone` | `string` | Phone number; `phone ?? ""` means "use phone if not null/undefined, else use empty string" |
| `status` | `string` | Set to `"approved"` immediately because admin is creating them directly |
| `isActive` | `boolean` | Whether the account is active |
| `distributorCount` | `number` | How many distributors this user manages (starts at 0) |
| `ordersCount` | `number` | How many orders this user has (starts at 0) |
| `createdBy` | `string` | UID of the admin who created this user |
| `approvedBy` | `string` | UID of who approved them (same as `createdBy` since admin creates already-approved) |
| `approvedAt` | `Timestamp` | When they were approved |
| `createdAt` | `Timestamp` | When the document was created |
| `updatedAt` | `Timestamp` | Last update time |

**Step 6 — If role is distributor, also write to `distributors` collection:**
```ts
if (role === "distributor") {
  await admin.firestore().collection("distributors").doc(uid).set({
    email,
    name,
    phone:       phone ?? "",
    contactInfo: phone ?? "",
    status:      "approved",
    isActive:    true,
    createdBy:   request.auth.uid,
    approvedBy:  request.auth.uid,
    approvedAt:  now,
    createdAt:   now,
    updatedAt:   now,
  });
}
```

> Distributors exist in TWO collections: `users` (for authentication/login) and `distributors` (for business data). Other roles only exist in `users`.

**Return value:**
```ts
return { success: true, uid };
```

---

#### `firebase/functions/src/users/deleteUser.ts`

Deletes a user from both Firebase Auth and Firestore (and from `distributors` if applicable).

```ts
const { uid } = request.data as { uid: string };
```

| Variable | Description |
|----------|-------------|
| `uid` | The UID of the user to delete (sent from the frontend) |

```ts
const targetDoc  = await admin.firestore().collection("users").doc(uid).get();
const targetRole = targetDoc.data()?.role;
```

| Variable | Description |
|----------|-------------|
| `targetDoc` | The Firestore document snapshot of the user being deleted |
| `targetRole` | Their role, needed to know if we also need to delete from `distributors` |

```ts
await admin.auth().deleteUser(uid);                              // removes login
await admin.firestore().collection("users").doc(uid).delete();  // removes user doc

if (targetRole === "distributor") {
  await admin.firestore().collection("distributors").doc(uid).delete(); // removes distributor doc
}
```

---

### Layer 4 — API Wrapper

**File:** `frontend/lib/api/admin.ts`

This is the frontend's "door" to call Cloud Functions. It wraps `httpsCallable` and handles errors.

#### Types defined here:

```ts
type CreateUserByAdminPayload = {
  email:    string;
  password: string;
  name:     string;
  role:     UserRole;   // "admin" | "supervisor" | "salesperson" | "distributor"
  phone?:   string;     // optional (the ? means it's not required)
};
```

```ts
type ApproveUserPayload = { uid: string };
type RejectUserPayload  = { uid: string; reason?: string };

type CreateUserByAdminResponse = { success: boolean; uid?: string };
type MutationResponse          = { success: boolean };
```

#### `handleFirebaseError(error)` — the error translator:

```ts
function handleFirebaseError(error: unknown): Error {
  if (error instanceof FunctionsError) {
    switch (error.code) {
      case "unauthenticated":  return new Error("You must be logged in...");
      case "permission-denied": return new Error("You don't have permission...");
      case "invalid-argument":  return new Error("Invalid input: " + error.message);
      case "already-exists":    return new Error("This email is already registered");
      case "not-found":         return new Error("User not found");
      case "internal":          return new Error("Server error. Please try again later");
      default:                  return new Error(error.message || "An error occurred");
    }
  }
  // ...
}
```

| Variable | Description |
|----------|-------------|
| `error` | Could be anything — `unknown` type means TypeScript forces you to check before using it |
| `FunctionsError` | Special Firebase error class; has `.code` (e.g. `"permission-denied"`) and `.message` |
| `error.code` | Machine-readable error code from the Cloud Function |
| `error.message` | Human-readable message from the Cloud Function |

#### `createUserByAdmin(payload)`:

```ts
export async function createUserByAdmin(payload: CreateUserByAdminPayload) {
  const callable = httpsCallable<CreateUserByAdminPayload, CreateUserByAdminResponse>(
    functions,
    "createUserByAdminCallable"   // must match the exported function name in index.ts
  );
  const result = await callable(payload);
  return result.data;
}
```

| Variable | Description |
|----------|-------------|
| `callable` | A typed function that, when called, sends an HTTPS request to the Cloud Function |
| `functions` | The Firebase Functions instance from `lib/firebase.ts` |
| `"createUserByAdminCallable"` | The exact name of the Cloud Function to call |
| `payload` | The data to send to the function |
| `result` | The response from the Cloud Function |
| `result.data` | The actual return value (e.g. `{ success: true, uid: "abc123" }`) |

#### `deleteUser(payload)`:

```ts
export async function deleteUser(payload: ApproveUserPayload) {
  const callable = httpsCallable<ApproveUserPayload, MutationResponse>(
    functions, "deleteUser"
  );
  const result = await callable(payload);
  return result.data;
}
```

---

### Layer 5 — Action Functions

These are small orchestration functions. They call the Cloud Function AND also trigger a password reset email so the new user can set their own password.

**File:** `frontend/lib/actions/createDistributor.ts`

```ts
type CreateDistributorInput = {
  name:  string;
  email: string;
  phone: string;
};

export async function createDistributor(input: CreateDistributorInput) {
  const tempPassword = Math.random().toString(36).slice(-12) + "A1!";
  // ...
}
```

| Variable | Description |
|----------|-------------|
| `input` | Object with `name`, `email`, `phone` — the form values entered by the admin |
| `tempPassword` | A random 12-character string + `"A1!"` appended to ensure it meets Firebase's password requirements (uppercase, number, special char). Example: `"k7xp2mqdf3jtA1!"`. This is temporary — the user will reset it via email. |

```ts
const data = await createUserByAdmin({
  email:    input.email,
  password: tempPassword,
  name:     input.name,
  phone:    input.phone,
  role:     "distributor",
});
```

Calls the Cloud Function to create the account.

```ts
await sendPasswordResetEmail(auth, input.email);
```

Sends a "set your password" email to the new user's email. They click the link and set their own real password.

```ts
return { success: true, uid: data.uid };
```

`createSalesperson.ts` and `createSupervisor.ts` are identical except they pass `role: "salesperson"` and `role: "supervisor"` respectively.

---

### Layer 6 — Services

Services talk directly to Firestore. They contain all the read/write logic.

---

#### `frontend/lib/services/distributorService.ts`

**`mapDistributor(docSnap)` — converts a raw Firestore doc to a typed object:**

```ts
function mapDistributor(docSnap: QueryDocumentSnapshot): Distributor {
  const data = docSnap.data();
  return {
    uid:         docSnap.id,           // The document ID = the user's UID
    name:        String(data.name ?? ""),
    email:       data.email ? String(data.email) : "",
    phone:       data.phone ? String(data.phone) : "",
    address:     data.address ? String(data.address) : "",
    status:      (data.status as Distributor["status"]) ?? USER_STATUS.PENDING,
    isActive:    Boolean(data.isActive ?? false),
    createdBy:   String(data.createdBy ?? ""),
    approvedBy:  data.approvedBy ? String(data.approvedBy) : null,
    approvedAt:  data.approvedAt ?? null,
    lastLoginAt: data.lastLoginAt ?? null,
    contactInfo: String(data.contactInfo ?? data.phone ?? ""),
    createdAt:   data.createdAt ?? null,
    updatedAt:   data.updatedAt ?? null,
  };
}
```

> **Why `??` (nullish coalescing)?** Firestore can return `undefined` for missing fields. The `??` operator provides a fallback: `data.name ?? ""` means "use `data.name` if it's not null/undefined, otherwise use empty string". This prevents runtime errors.

> **Why `String(...)`?** Firestore stores everything loosely typed. Wrapping in `String()` ensures you always get a string, not a number or boolean that looks like a string.

| Variable | Type | Description |
|----------|------|-------------|
| `docSnap` | `QueryDocumentSnapshot` | A single Firestore document result |
| `docSnap.id` | `string` | The document ID (which equals the user's Firebase Auth UID) |
| `docSnap.data()` | `object` | The raw field values from Firestore |

**`getAllDistributors()`:**
```ts
export async function getAllDistributors(): Promise<Distributor[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.DISTRIBUTORS));
  return snap.docs.map(mapDistributor);
}
```

Fetches all documents in the `distributors` collection **once**. Returns an array of `Distributor` objects.

**`subscribeDistributors(onChange, onError)`:**
```ts
export function subscribeDistributors(
  onChange: (rows: Distributor[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTIONS.DISTRIBUTORS),
    (querySnap) => onChange(querySnap.docs.map(mapDistributor)),
    (error) => { if (onError) onError(error); },
  );
}
```

| Variable | Type | Description |
|----------|------|-------------|
| `onChange` | `function` | Called every time the `distributors` collection changes in Firestore. Receives the fresh list. |
| `onError` | `function` | Called if the listener fails (e.g., lost internet, permission denied) |
| `Unsubscribe` | `function` | Call this to stop listening (returned by `onSnapshot`). Used in React's `useEffect` cleanup. |
| `querySnap` | `QuerySnapshot` | The full snapshot of all docs in the collection at the moment of change |

> **`onSnapshot` vs `getDocs`:** `getDocs` is a one-time fetch. `onSnapshot` is a permanent listener — every time ANY document in the collection changes, your `onChange` callback fires automatically. This is what makes the table update in real-time without refreshing.

**`updateDistributor(uid, fields)`:**
```ts
export async function updateDistributor(uid: string, fields: { name?: string; phone?: string }) {
  const distributorRef = doc(db, COLLECTIONS.DISTRIBUTORS, uid);
  await updateDoc(distributorRef, {
    ...fields,
    ...(fields.phone ? { contactInfo: fields.phone } : {}),
    updatedAt: serverTimestamp(),
  });
}
```

| Variable | Description |
|----------|-------------|
| `uid` | The UID of the distributor to update |
| `fields` | Only the fields you want to change (`name` and/or `phone`) |
| `distributorRef` | A Firestore document reference (a pointer, not the actual data) |
| `...fields` | Spreads the fields object into the update call |
| `...(fields.phone ? { contactInfo: fields.phone } : {})` | If phone is being updated, also update `contactInfo` to keep them in sync |
| `serverTimestamp()` | Tells Firestore to use the server's current time |

**`approveDistributor(uid, approvedBy)`:**
```ts
export async function approveDistributor(uid: string, approvedBy?: string) {
  const distributorRef = doc(db, COLLECTIONS.DISTRIBUTORS, uid);
  await updateDoc(distributorRef, {
    status:     USER_STATUS.APPROVED,   // "approved"
    approvedBy: approvedBy ?? null,
    approvedAt: serverTimestamp(),
    updatedAt:  serverTimestamp(),
  });
}
```

---

#### `frontend/lib/services/userService.ts`

**`mapUser(docSnap)`** — same concept as `mapDistributor` but for the `users` collection:

```ts
function mapUser(docSnap: QueryDocumentSnapshot): User {
  const data = docSnap.data();
  return {
    uid:              docSnap.id,
    email:            String(data.email ?? ""),
    name:             String(data.name ?? ""),
    phone:            data.phone ? String(data.phone) : "",
    role:             (data.role as UserRole) ?? USER_ROLES.SALESPERSON,
    status:           (data.status as User["status"]) ?? USER_STATUS.PENDING,
    isActive:         Boolean(data.isActive ?? false),
    distributorCount: Number(data.distributorCount ?? 0),
    ordersCount:      Number(data.ordersCount ?? 0),
    createdBy:        data.createdBy ? String(data.createdBy) : null,
    approvedBy:       data.approvedBy ? String(data.approvedBy) : null,
    approvedAt:       data.approvedAt ?? null,
    lastLoginAt:      data.lastLoginAt ?? null,
    createdAt:        data.createdAt ?? null,
    updatedAt:        data.updatedAt ?? null,
  };
}
```

**`subscribeUsersByRole(role, onChange, onError)`:**
```ts
export function subscribeUsersByRole(
  role: UserRole,
  onChange: (users: User[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const usersRef   = collection(db, COLLECTIONS.USERS);
  const roleQuery  = query(usersRef, where("role", "==", role));
  return onSnapshot(roleQuery, ...);
}
```

| Variable | Description |
|----------|-------------|
| `role` | Which role to filter by (e.g. `"salesperson"`) |
| `usersRef` | Reference to the entire `users` collection |
| `roleQuery` | A filtered query: `WHERE role == "salesperson"` |

> Unlike `subscribeDistributors` (which returns all distributors), this function returns only users of a specific role from the `users` collection.

---

### Layer 7 — Custom Hooks

Hooks connect the services to React. They manage state (`useState`) and set up/tear down the real-time listener (`useEffect`).

**File:** `frontend/lib/useDistributors.ts`

```ts
export function useDistributors() {
  const [distributors, setDistributors] = useState<DistributorRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
```

| State variable | Initial value | Description |
|----------------|---------------|-------------|
| `distributors` | `[]` | The list of distributors shown in the table |
| `loading` | `true` | Whether the data is still being fetched |
| `error` | `null` | An error message string, or `null` if no error |

**The listener setup:**
```ts
useEffect(() => {
  const unsubscribe = subscribeDistributors(
    (queryRows) => {
      const distributorsData: DistributorRow[] = queryRows.map((row) => ({
        id:          row.uid,
        name:        row.name,
        phone:       row.phone || "",
        email:       row.email || "",
        createdBy:   row.createdBy,
        status:      row.status === "approved" ? "approved" : "pending",
        contactInfo: row.contactInfo || row.phone || "",
      }));
      setDistributors(distributorsData);
      setLoading(false);
    },
    (err) => {
      setError(err instanceof Error ? err.message : "Failed to fetch distributors");
      setLoading(false);
    },
  );

  return () => unsubscribe();  // cleanup: stop listening when component unmounts
}, []);
```

| Variable | Description |
|----------|-------------|
| `queryRows` | Array of `Distr+ibutor` objects from the service (Firestore data) |
| `distributorsData` | Transformed to `DistributorRow[]` — a simpler shape the table uses |
| `row.uid` → `id` | Renamed: the table uses `id`, not `uid` |
| `row.status === "approved" ? "approved" : "pending"` | Normalizes status to only two values for the UI |
| `unsubscribe` | The cleanup function returned by `onSnapshot`, called when the component unmounts |
| `return () => unsubscribe()` | React's `useEffect` cleanup mechanism — stops the Firestore listener to prevent memory leaks |

**`DistributorRow` shape** (what the UI components actually receive):

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | The user's UID |
| `name` | `string` | Full name |
| `phone` | `string` | Phone number |
| `email` | `string` | Email address |
| `createdBy` | `string` | UID of admin who created them |
| `status` | `"approved" \| "pending"` | Current status |
| `contactInfo` | `string` | Contact info (same as phone usually) |

**Operations returned by the hook:**

```ts
return {
  distributors,            // the current list (updates in real-time)
  loading,                 // true while first fetch is happening
  error,                   // error string or null
  approveDistributor,      // (id: string) => Promise<void>
  createDistributor,       // (data: CreateDistributorInput) => Promise<DistributorRow>
  updateDistributor,       // (id: string, fields: {name?, phone?}) => Promise<void>
  deleteDistributor,       // (id: string) => Promise<void>
};
```

**`useSalespersons`** and **`useSupervisors`** follow the exact same pattern but use `subscribeUsersByRole(USER_ROLES.SALESPERSON, ...)` and `subscribeUsersByRole(USER_ROLES.SUPERVISOR, ...)` respectively.

**`toDate(value)` helper in salesperson/supervisor hooks:**
```ts
function toDate(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    const timestamp = value as { toDate: () => Date };
    return timestamp.toDate().toISOString().slice(0, 10);
  }
  if (typeof value === "string") return value.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}
```

| Case | What happens |
|------|-------------|
| Firestore `Timestamp` object | Has a `.toDate()` method. Convert to JS `Date`, then format as `"YYYY-MM-DD"` |
| Already a string | Take the first 10 characters (`"YYYY-MM-DD"`) |
| Anything else | Use today's date as fallback |

---

### Layer 8 — Pages

Pages are the top-level React components for each admin section.

**File:** `frontend/app/(dashboard)/admin/distributors/page.tsx`

```ts
const [searchQuery, setSearchQuery]   = useState("");
const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved">("all");
const [isCreateOpen, setIsCreateOpen] = useState(false);
const [editTarget, setEditTarget]     = useState<DistributorRow | null>(null);
const [deleteTarget, setDeleteTarget] = useState<DistributorRow | null>(null);
const [errorMessage, setErrorMessage] = useState<string | null>(null);
```

| State variable | Initial | Description |
|----------------|---------|-------------|
| `searchQuery` | `""` | Current text in the search input box |
| `statusFilter` | `"all"` | Current value of the status dropdown filter |
| `isCreateOpen` | `false` | Whether the "Create Distributor" modal is visible |
| `editTarget` | `null` | The distributor currently being edited (or `null` if modal is closed) |
| `deleteTarget` | `null` | The distributor currently being deleted (or `null` if modal is closed) |
| `errorMessage` | `null` | An error message to show at the top of the page |

**`filteredDistributors` — the search + filter logic:**
```ts
const filteredDistributors = useMemo(() => {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  let rows = distributors;
  if (normalizedSearch) {
    rows = rows.filter((distributor) =>
      distributor.name.toLowerCase().includes(normalizedSearch) ||
      distributor.createdBy.toLowerCase().includes(normalizedSearch) ||
      distributor.contactInfo.toLowerCase().includes(normalizedSearch)
    );
  }
  if (statusFilter !== "all") {
    rows = rows.filter((distributor) => distributor.status === statusFilter);
  }
  return rows;
}, [distributors, searchQuery, statusFilter]);
```

| Variable | Description |
|----------|-------------|
| `useMemo` | Only re-calculates when `distributors`, `searchQuery`, or `statusFilter` change. Avoids re-filtering on every render. |
| `normalizedSearch` | Trimmed and lowercased search query for case-insensitive matching |
| `rows` | The working list — starts as all distributors, then filters are applied |

**Handlers:**

```ts
const handleApprove = async (distributorId: string) => { ... }
const handleCreate  = async (distributorData: CreateDistributorFormInput) => { ... }
const handleEdit    = async (id: string, fields: { name?: string; phone?: string }) => { ... }
const handleDelete  = async () => { if (!deleteTarget) return; await deleteDistributor(deleteTarget.id); }
```

| Handler | What it does |
|---------|-------------|
| `handleApprove` | Calls `approveDistributor(distributorId)` from the hook |
| `handleCreate` | Calls `createDistributorAction(distributorData)` (the action function) |
| `handleEdit` | Calls `updateDistributor(id, fields)` from the hook |
| `handleDelete` | Calls `deleteDistributor(deleteTarget.id)` from the hook. Uses `deleteTarget` state to know which one. |

The `SalespersonsPage` and `SupervisorsPage` files are structurally identical, only swapping `distributor` → `salesperson` / `supervisor` throughout.

---

### Layer 9 — Table Components

**File:** `frontend/app/(dashboard)/admin/distributors/_components/DistributorsTable.tsx`

```ts
type DistributorsTableProps = {
  distributors: DistributorRow[];
  onApprove: (id: string) => void;
  onEdit:    (distributor: DistributorRow) => void;
  onDelete:  (distributor: DistributorRow) => void;
};
```

| Prop | Description |
|------|-------------|
| `distributors` | The filtered list passed down from the page |
| `onApprove` | Called with `distributor.id` when "Approve" is clicked |
| `onEdit` | Called with the full `DistributorRow` object when "Edit" is clicked (page needs the full object to pre-fill the modal) |
| `onDelete` | Called with the full `DistributorRow` object when "Delete" is clicked |

> **Why pass the full object for edit/delete vs just `id` for approve?**
> Approve only needs the ID (no modal, just an action).
> Edit needs the full object so the modal can pre-fill the name and phone fields.
> Delete needs the full object so the confirmation modal can show the user's name.

The table renders one row per distributor. The "Approve" button is disabled once `status === "approved"`.

---

### Layer 10 — Modal Components

#### `EditDistributorModal` (same pattern for Salesperson and Supervisor)

**File:** `frontend/app/(dashboard)/admin/distributors/_components/EditDistributorModal.tsx`

```ts
type EditDistributorModalProps = {
  open:    boolean;
  initial: { id: string; name: string; phone: string };
  onClose: () => void;
  onSave:  (id: string, fields: { name: string; phone: string }) => Promise<void>;
};
```

| Prop | Description |
|------|-------------|
| `open` | Controls visibility. `true` = modal is showing |
| `initial` | The existing values to pre-fill the form (comes from `editTarget` in the page) |
| `onClose` | Called when Cancel is clicked or save succeeds |
| `onSave` | Called with the ID and new values when Save is clicked |

**Internal state:**
```ts
const [name, setName]         = useState(initial.name);
const [phone, setPhone]       = useState(initial.phone);
const [isLoading, setLoading] = useState(false);
const [error, setError]       = useState<string | null>(null);
```

| State | Description |
|-------|-------------|
| `name` | Current value in the name input |
| `phone` | Current value in the phone input |
| `isLoading` | When `true`, buttons are disabled to prevent double-clicking during save |
| `error` | Validation or server error to display inline |

**The `useEffect` for resetting form when modal opens:**
```ts
useEffect(() => {
  if (open) {
    setName(initial.name);
    setPhone(initial.phone);
    setError(null);
  }
}, [open, initial]);
```

> This resets the form every time the modal opens. Without this, if you edit one distributor and then immediately edit another, the form might still show the first one's values.

**`handleSave`:**
```ts
const handleSave = async () => {
  const trimmedName = name.trim();
  if (!trimmedName) {
    setError("Name is required");
    return;
  }
  setIsLoading(true);
  try {
    await onSave(initial.id, { name: trimmedName, phone: phone.trim() });
    onClose();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to update");
  } finally {
    setIsLoading(false);
  }
};
```

| Variable | Description |
|----------|-------------|
| `trimmedName` | Name with whitespace removed. If empty after trimming, show validation error. |
| `onSave(initial.id, ...)` | Calls the parent's `handleEdit` with the ID and new values |
| `finally` | Always runs, even if an error occurs. Resets `isLoading` so the button isn't stuck disabled. |

#### `DeleteConfirmModal`

**File:** `frontend/components/ui/DeleteConfirmModal.tsx`

```ts
type DeleteConfirmModalProps = {
  open:      boolean;
  name:      string;          // The person's name to show in the message
  onClose:   () => void;
  onConfirm: () => Promise<void>;
};
```

Shows: *"Are you sure you want to delete **[name]**? This will remove them from both authentication and the database. This action cannot be undone."*

Internal state is just `isLoading` and `error` — same pattern as edit modals.

---

## 5. Complete Flow Walkthrough

### Flow A: CREATE a user

```
Admin fills form → CreateModal
        ↓
handleCreate() in page.tsx
        ↓
createDistributorAction() in lib/actions/createDistributor.ts
        ↓
Step 1: createUserByAdmin({ email, password: tempPassword, name, phone, role })
   in lib/api/admin.ts
        ↓
httpsCallable → Cloud Function: createUserByAdminCallable
   on Google's servers
        ↓
Cloud Function:
  1. Checks request.auth (is caller logged in?)
  2. Fetches caller's Firestore doc → checks role === "admin"
  3. admin.auth().createUser({ email, password })    ← creates login
  4. Firestore: users/{uid}.set({ ...fields })       ← creates user doc
  5. If distributor: Firestore: distributors/{uid}.set({ ...fields })
  6. Returns { success: true, uid }
        ↓
Step 2: sendPasswordResetEmail(auth, email)
   Firebase sends an email to the new user saying "set your password"
        ↓
UI: modal closes, table auto-updates via onSnapshot listener
```

---

### Flow B: APPROVE a user

```
Admin clicks "Approve" button in table
        ↓
onApprove(distributor.id) → handleApprove(distributorId) in page.tsx
        ↓
approveDistributor(distributorId) from useDistributors hook
        ↓
approveDistributor(uid) in lib/services/distributorService.ts
        ↓
Firestore: distributors/{uid}.update({
  status: "approved",
  approvedBy: ...,
  approvedAt: serverTimestamp(),
  updatedAt: serverTimestamp()
})
        ↓
onSnapshot listener fires → table row badge changes from "pending" to "approved"
        ↓
"Approve" button becomes disabled (status is now "approved")
```

---

### Flow C: EDIT a user

```
Admin clicks "Edit" button in table row
        ↓
onEdit(distributor) → setEditTarget(distributor) in page.tsx
        (editTarget is now the full DistributorRow object)
        ↓
EditDistributorModal renders with open={true}
  initial = { id: editTarget.id, name: editTarget.name, phone: editTarget.phone }
        ↓
Admin changes name/phone in the form
        ↓
Admin clicks "Save" → handleSave() in EditDistributorModal
  Validates: name cannot be empty
        ↓
onSave(initial.id, { name, phone }) → handleEdit(id, fields) in page.tsx
        ↓
updateDistributor(id, fields) from useDistributors hook
        ↓
updateDistributor(uid, fields) in lib/services/distributorService.ts
        ↓
Firestore: distributors/{uid}.update({ name, phone, contactInfo, updatedAt })
        ↓
onSnapshot fires → table row updates automatically
        ↓
Modal closes (onClose() called after successful save)
        ↓
setEditTarget(null) → EditDistributorModal unmounts
```

---

### Flow D: DELETE a user

```
Admin clicks "Delete" button in table row
        ↓
onDelete(distributor) → setDeleteTarget(distributor) in page.tsx
        ↓
DeleteConfirmModal renders with open={true}, name={deleteTarget.name}
        ↓
Admin reads warning and clicks "Delete" (red button)
        ↓
handleConfirm() in DeleteConfirmModal
        ↓
onConfirm() → handleDelete() in page.tsx
  Guard: if (!deleteTarget) return;
        ↓
deleteDistributor(deleteTarget.id) from useDistributors hook
        ↓
deleteUser({ uid: id }) in lib/api/admin.ts
        ↓
httpsCallable → Cloud Function: deleteUser
        ↓
Cloud Function:
  1. Checks request.auth (is caller logged in?)
  2. Fetches caller's Firestore doc → checks role === "admin"
  3. Fetches target user's doc → gets their role
  4. admin.auth().deleteUser(uid)                     ← removes login account
  5. Firestore: users/{uid}.delete()                  ← removes user doc
  6. If distributor: Firestore: distributors/{uid}.delete()
  7. Returns { success: true }
        ↓
onSnapshot fires → row disappears from table
        ↓
Modal closes → setDeleteTarget(null)
```

---

## 6. Firestore Data Shape

### `users` collection — document ID = user's Firebase Auth UID

```
users/{uid}
├── email:            string    "john@example.com"
├── name:             string    "John Smith"
├── phone:            string    "0501234567"
├── role:             string    "distributor" | "salesperson" | "supervisor" | "admin"
├── status:           string    "pending" | "approved" | "rejected"
├── isActive:         boolean   true
├── distributorCount: number    0
├── ordersCount:      number    0
├── createdBy:        string    (UID of admin who created them)
├── approvedBy:       string    (UID of admin who approved them, or null)
├── approvedAt:       Timestamp (or null)
├── lastLoginAt:      Timestamp (or null)
├── createdAt:        Timestamp
└── updatedAt:        Timestamp
```

### `distributors` collection — document ID = same UID as in `users`

```
distributors/{uid}
├── email:       string
├── name:        string
├── phone:       string
├── contactInfo: string    (same as phone)
├── status:      string    "pending" | "approved"
├── isActive:    boolean
├── createdBy:   string    (UID)
├── approvedBy:  string    (UID or null)
├── approvedAt:  Timestamp (or null)
├── lastLoginAt: Timestamp (or null)
├── createdAt:   Timestamp
└── updatedAt:   Timestamp
```

> **Note:** When admin creates a distributor via the Cloud Function (`createUserByAdminCallable`), the document is created in BOTH `users` and `distributors` with the same UID. When admin creates a salesperson or supervisor, only `users` is written.

---

## 7. Error Handling Chain

Errors bubble up through each layer:

```
Cloud Function throws HttpsError
       ↓
Firebase SDK catches it as FunctionsError
       ↓
handleFirebaseError() in lib/api/admin.ts
  → Converts error codes to human-readable messages
  → Returns a plain Error object
       ↓
Hook (useDistributors etc.) re-throws it
       ↓
Page handler (handleApprove, handleEdit, etc.) catches it
  → Sets setErrorMessage(message) to show at top of page
  OR
Modal handler (handleSave) catches it
  → Sets setError(message) to show inline in the modal
       ↓
User sees the error message in red
```

---

## 8. Environment Variables

**File:** `frontend/.env`

These are loaded by Next.js automatically. The `NEXT_PUBLIC_` prefix is required for any variable that needs to be accessible in the browser. Without it, the variable is only available on the server.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase project API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain (e.g. `yourproject.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage bucket URL |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID for Cloud Messaging |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID |

> These are safe to expose to the browser because Firebase's security is enforced through Firestore Security Rules and Cloud Function auth checks — not by keeping these keys secret.

---

*End of document.*
