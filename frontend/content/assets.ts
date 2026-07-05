// File: frontend/content/assets.ts
// Client brand assets (logo, contact details, imagery) are pending. This file
// is the single, obvious place to swap in finals when they arrive — nothing
// below should be duplicated as inline strings elsewhere.

export const ASSETS = {
  logoSrc: "/logo-no_bg.png",

  // TODO(asset): replace with confirmed registered office / plant address.
  contact: {
    address: "Address available on request",
    phone: "+91 00000 00000",
    email: "info@technofluid.com",
  },

  // TODO(asset): replace with real photography once client supplies it.
  heroImage: null as string | null,
  categoryImages: {
    "industrial-oils": null as string | null,
    "automotive-lubricants": null as string | null,
    greases: null as string | null,
    "specialty-oils": null as string | null,
  },
};
