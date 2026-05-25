# Distributor Form Changes

## What changed and why

---

### 1. Merged two duplicate sections into one

Before, the create form had:
- **Service Coverage** — a text box to type a service area + product category checkboxes
- **Distribution Territory** — a states/cities selector

Both were asking for the same thing (where the distributor operates). This was confusing.

Now there is one section called **Distribution Coverage** (Step 4) that has:
- States selector (search and pick)
- Cities selector (optional, shows up after states are picked)
- Product checkboxes (below a divider)

The old free-text "service area" field is gone. States/cities is the single source of truth for geography.

---

### 2. Products now filter by distributor type

Before, the product category checkboxes showed all categories regardless of the distributor type selected.

Now, when you pick a distributor type in Step 3, Step 4 only shows the relevant products:

| Distributor Type | Products shown |
|---|---|
| Automotive | Automotive products only |
| Industrial | Industrial, Metalworking, Maintenance products |
| Combined | All products |

If no type is selected yet, Step 4 shows a message asking you to pick a type first.
Changing the type clears the previously selected products.

---

### 3. Select individual products, not just categories

Before, admins picked broad categories like "Automotive" or "Industrial".

Now, admins pick specific products (e.g. "Engine Oil 15W40", "Hydraulic Oil 68") using checkboxes. Each checkbox shows the product name and its category underneath.

These are stored in Firestore as `assignedProducts` — an array of `{ productId, productName, category }`.

---

### 4. Conflict detection

If two distributors share the same state AND the same product, the form blocks the save and shows an error message.

The check runs automatically after selecting territory and products (800ms debounce). A green message confirms "No conflicts" when the coverage is clear.

---

### What was NOT changed

- The create flow (auth user creation, password reset email) is untouched
- Firestore still gets 1 write per create/update — no extra reads or subcollections
- Existing distributor records with old fields (`serviceArea`, `productCategories`) are still readable — those fields are kept as optional on the type for backward compat
