# ⚠️ Project Rules for AI Agents (READ BEFORE CODING)

## 1. Framework Awareness (Critical)

This project uses a **modified Next.js environment**.

* APIs, routing, and conventions may differ from standard Next.js
* ALWAYS check: `node_modules/next/dist/docs/` before using any Next.js feature
* Do NOT assume Pages Router or App Router behavior without verification

---

## 2. Tech Stack (STRICT)

* Next.js (custom environment)
* Firebase Firestore (NoSQL database)
* Firebase Storage (media handling)
* Tailwind CSS (UI styling)

DO NOT:

* Introduce Prisma, Drizzle, or SQL
* Introduce external state libraries unless explicitly asked
* Introduce backend servers (Express, NestJS, etc.)

---

## 3. Data Architecture Rules (VERY IMPORTANT)

### Firestore Structure:

* Use **flat, document-based design**
* Avoid deep nesting beyond 2–3 levels
* Avoid unnecessary subcollections unless required

### Required Schema Patterns:

* Always store both `id` and `name` for referenced entities

  * Example: `{ productId, productName }`
* Always include:

  * `createdAt`
  * `updatedAt`
* Use arrays for ordered data (e.g., priority lists)

### Media Handling:

* Files must be uploaded to Firebase Storage
* Firestore must store:

  * `url`
  * `storagePath` (MANDATORY for deletion)

---

## 4. Form & UI Rules

### DO:

* Use controlled React components
* Use reusable components (e.g., ProductSelect, PriorityList)
* Use Tailwind CSS internally only

### DO NOT:

* Expose Tailwind classes to users/admins (e.g., no "bg-blue-500" inputs)
* Generate unstructured or hardcoded UI
* Mix business logic inside UI components

---

## 5. Validation Rules

* Enforce constraints in frontend (Firestore does not enforce schema)
* Example:

  * Minimum 5 items in priority lists
  * Quantity must be > 0
  * Required fields must not be empty

---

## 6. Performance Rules

* Minimize Firestore reads
* Avoid unnecessary queries
* Prefer denormalized data over joins

---

## 7. Code Quality Rules

### DO:

* Write modular, reusable components
* Use clear naming conventions
* Keep functions small and focused

### DO NOT:

* Generate overly complex abstractions
* Add unnecessary dependencies
* Write "demo-level" or placeholder code

---

## 8. Feature-Specific Rules (Sales Dashboard)

### Log Visit Feature:

* Must support:

  * Geolocation capture (lat/lng)
  * Media upload (image/video)
  * Priority lists (monthly + annual)
  * Related firms with nested priorities

### Schema must follow:

* `visits` collection
* Embedded arrays for priorities and related firms
* No subcollections unless explicitly required

---

## 9. Error Handling

* Handle:

  * Geolocation permission denied
  * Upload failures
  * Firestore write errors

* Provide user-friendly feedback

---

## 10. Output Expectations

* Production-ready code only
* No pseudo-code
* No missing integrations
* No assumptions without validation

---

## 11. When Unsure

* Ask for clarification instead of guessing
* Do not hallucinate APIs or features

---

## 12. Priority

Correctness > Simplicity > Speed

---

# 🚨 FINAL RULE

If a decision affects:

* data structure
* scalability
* or user experience

→ Choose the option that is **production-safe**, not just easy.
