# Lubricant Project

This repository contains the codebase for the Lubricant Project, which includes both backend (Firebase Functions) and frontend (Next.js) applications.

````
firebase/
    firebase.json
    functions/
        package.json
        tsconfig.dev.json
        tsconfig.json
        lib/
            index.js
        src/
            index.ts
frontend/
    AGENTS.md
    CLAUDE.md
    eslint.config.mjs
    next-env.d.ts
    next.config.ts
    package.json
    postcss.config.mjs
    ```
    .
    │
    ├─▶ firebase
    │   │
    │   ├─▶ firebase.json
    │   └─▶ functions
    │       │
    │       ├─▶ package.json
    │       ├─▶ tsconfig.dev.json
    │       ├─▶ tsconfig.json
    │       ├─▶ lib
    │       │   └─▶ index.js
    │       └─▶ src
    │           └─▶ index.ts
    │
    ├─▶ frontend
    │   │
    │   ├─▶ AGENTS.md
    │   ├─▶ CLAUDE.md
    │   ├─▶ eslint.config.mjs
    │   ├─▶ next-env.d.ts
    │   ├─▶ next.config.ts
    │   ├─▶ package.json
    │   ├─▶ postcss.config.mjs
    │   ├─▶ README.md
    │   ├─▶ schema.md
    │   ├─▶ tsconfig.json
    │   ├─▶ workflow.md
    │   ├─▶ app
    │   │   │
    │   │   ├─▶ globals.css
    │   │   ├─▶ layout.tsx
    │   │   ├─▶ page.tsx
    │   │   ├─▶ (auth)
    │   │   │   │
    │   │   │   ├─▶ layout.tsx
    │   │   │   ├─▶ _components
    │   │   │   │   ├─▶ button.tsx
    │   │   │   │   └─▶ input.tsx
    │   │   │   ├─▶ _lib
    │   │   │   │   └─▶ auth-placeholders.ts
    │   │   │   ├─▶ login
    │   │   │   │   └─▶ page.tsx
    │   │   │   └─▶ signup
    │   │   │       └─▶ page.tsx
    │   │   ├─▶ (dashboard)
    │   │   │   │
    │   │   │   ├─▶ admin
    │   │   │   │   ├─▶ layout.tsx
    │   │   │   │   ├─▶ page.tsx
    │   │   │   │   ├─▶ _data
    │   │   │   │   │   └─▶ mockData.ts
    │   │   │   │   ├─▶ coupons
    │   │   │   │   │   ├─▶ page.tsx
    │   │   │   │   │   ├─▶ _components
    │   │   │   │   │   │   ├─▶ CouponsTable.tsx
    │   │   │   │   │   │   └─▶ CreateCouponModal.tsx
    │   │   │   │   │   └─▶ _lib
    │   │   │   │   │       └─▶ couponSchemas.ts
    │   │   │   │   ├─▶ distributors
    │   │   │   │   │   ├─▶ page.tsx
    │   │   │   │   │   └─▶ _components
    │   │   │   │   │       └─▶ ...
    │   │   │   │   ├─▶ orders
    │   │   │   │   │   ├─▶ page.tsx
    │   │   │   │   │   └─▶ _components
    │   │   │   │   ├─▶ salespersons
    │   │   │   │   │   ├─▶ page.tsx
    │   │   │   │   │   └─▶ _components
    │   │   │   │   ├─▶ supervisors
    │   │   │   │   │   ├─▶ page.tsx
    │   │   │   │   │   └─▶ _components
    │   │   │   ├─▶ dashboard
    │   │   │   │   ├─▶ layout.tsx
    │   │   │   │   ├─▶ page.tsx
    │   │   │   │   ├─▶ coupons
    │   │   │   │   │   └─▶ page.tsx
    │   │   │   │   ├─▶ distributors
    │   │   │   │   │   └─▶ page.tsx
    │   │   │   │   ├─▶ orders
    │   │   │   │   │   └─▶ page.tsx
    │   │   │   │   ├─▶ salespersons
    │   │   │   │   │   └─▶ page.tsx
    │   │   │   │   ├─▶ supervisors
    │   │   │   │   │   └─▶ page.tsx
    │   │   │   │   └─▶ visits
    │   │   │   │       └─▶ page.tsx
    │   │   │   └─▶ salesperson
    │   │   │       ├─▶ layout.tsx
    │   │   │       ├─▶ page.tsx
    │   │   │       ├─▶ distributors
    │   │   │       │   ├─▶ page.tsx
    │   │   │       │   └─▶ _components
    │   │   │       ├─▶ orders
    │   │   │       │   ├─▶ page.tsx
    │   │   │       │   └─▶ _components
    │   │   │       └─▶ visits
    │   │   │           ├─▶ page.tsx
    │   │   │           └─▶ _components
    │   ├─▶ components
    │   │   ├─▶ layout
    │   │   │   ├─▶ AdminShell.tsx
    │   │   │   ├─▶ SalespersonShell.tsx
    │   │   │   ├─▶ SalespersonSidebar.tsx
    │   │   │   ├─▶ Sidebar.tsx
    │   │   │   └─▶ Topbar.tsx
    │   │   └─▶ ui
    │   │       ├─▶ badge.tsx
    │   │       ├─▶ button.tsx
    │   │       ├─▶ card.tsx
    │   │       ├─▶ input.tsx
    │   │       ├─▶ modal.tsx
    │   │       ├─▶ select.tsx
    │   │       └─▶ table.tsx
    │   ├─▶ lib
    │   │   ├─▶ auth.ts
    │   │   ├─▶ constants.ts
    │   │   ├─▶ firebase.ts
    │   │   ├─▶ useAuth.ts
    │   │   ├─▶ useCoupons.ts
    │   │   ├─▶ useDistributors.ts
    │   │   ├─▶ useOrders.ts
    │   │   ├─▶ useSalespersonDistributors.ts
    │   │   ├─▶ useSalespersonOrders.ts
    │   │   ├─▶ useSalespersons.ts
    │   │   ├─▶ useSupervisors.ts
    │   │   ├─▶ useUsers.ts
    │   │   ├─▶ useVisits.ts
    │   │   ├─▶ actions
    │   │   │   └─▶ createSalesperson.ts
    │   │   ├─▶ api
    │   │   │   └─▶ admin.ts
    │   │   ├─▶ services
    │   │   │   ├─▶ distributorService.ts
    │   │   │   ├─▶ orderService.ts
    │   │   │   ├─▶ userService.ts
    │   │   │   └─▶ visitService.ts
    │   │   └─▶ validation
    │   │       └─▶ formSchemas.ts
    │   ├─▶ public
    │   └─▶ types
    │       ├─▶ distributor.ts
    │       ├─▶ order.ts
    │       ├─▶ user.ts
    │       └─▶ visit.ts
    ```
````
