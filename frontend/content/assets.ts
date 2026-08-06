// File: frontend/content/assets.ts
// Client brand assets (logo, contact details, imagery) are pending. This file
// is the single, obvious place to swap in finals when they arrive — nothing
// below should be duplicated as inline strings elsewhere.

export const ASSETS = {
  logoSrc: "/logo-no_bg.png",

  // Contact details from Gaurav (flyer footer + WhatsApp, Jul 2026).
  contact: {
    address:
      "Lube Chem Industries, Adjoining Central Warehouse, Near Gaushala Road, Matak Majri, Karnal-132001, Haryana",
    phone: "+91 88148 85245",
    email: "info@technofluidlubricants.in",
    website: "technofluidlubricants.in",
    hours: "Mon–Sat: 9:00 AM – 6:00 PM · Sun: Closed",
  },

  // TODO(asset): replace with real photography once client supplies it.
  heroImage: null as string | null,
  categoryImages: {
    "automotive-lubricants": null as string | null,
    "industrial-oils": null as string | null,
    "specialty-lubricants-process-oils": null as string | null,
    "agricultural-lubricants": null as string | null,
    grease: null as string | null,
  },
};
