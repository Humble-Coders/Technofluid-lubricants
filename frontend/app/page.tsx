import Link from "next/link";
import Navbar from "@/components/layout/Navbar";

const STATS = [
  { value: "500+", label: "Active Distributors" },
  { value: "50+", label: "Product SKUs" },
  { value: "15+", label: "Years Operating" },
  { value: "99%", label: "On-time Delivery" },
];

const PRODUCTS = [
  {
    num: "01",
    name: "Engine Oils",
    tag: "Automotive",
    description:
      "High-performance engine oils engineered to extend engine life and maximise efficiency across all vehicle types.",
  },
  {
    num: "02",
    name: "Hydraulic Fluids",
    tag: "Industrial",
    description:
      "Premium hydraulic fluids designed for industrial machinery, ensuring smooth operation under high pressure.",
  },
  {
    num: "03",
    name: "Gear Lubricants",
    tag: "Drivetrain",
    description:
      "Specialty gear lubricants that reduce friction, prevent wear, and protect your drivetrain in extreme conditions.",
  },
  {
    num: "04",
    name: "Industrial Greases",
    tag: "Maintenance",
    description:
      "Long-lasting greases formulated for bearing and chassis applications in automotive and industrial use.",
  },
];

const FEATURES = [
  {
    num: "01",
    title: "Nationwide Distribution",
    description:
      "Our network of verified distributors ensures timely, reliable delivery to every corner of the country.",
  },
  {
    num: "02",
    title: "Quality Assured",
    description:
      "Every product is tested against stringent quality standards before it reaches your operations.",
  },
  {
    num: "03",
    title: "Expert Support",
    description:
      "Our lubricant specialists guide you toward the right product for every specific application.",
  },
  {
    num: "04",
    title: "Integrated Order Platform",
    description:
      "Track orders, manage distributors, and access real-time reports — all in one system.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_380px]">

        {/* Left — white */}
        <div className="flex flex-col justify-between px-6 py-10 lg:border-r lg:border-black/[0.06] lg:px-16 lg:py-14">

          {/* Top label */}
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/30">
            Technofluid Lubricants
          </span>

          {/* Headline + body + CTAs */}
          <div>
            <h1
              className="font-extrabold leading-[0.93] tracking-tight text-textPrimary"
              style={{ fontSize: "clamp(2.8rem, 7vw, 6.5rem)" }}
            >
              Keep Every
              <br />
              Machine
              <br />
              Running
              <br />
              <span className="text-accent">at Peak.</span>
            </h1>

            <p className="mt-8 max-w-md text-[14px] leading-[1.75] text-textSecondary">
              Premium oils and industrial lubricants supplied to distributors
              and businesses nationwide — backed by specialist expertise and a
              seamless digital order platform.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Access Dashboard
              </Link>
              <a
                href="/#products"
                className="rounded-lg border border-black/[0.12] px-5 py-2.5 text-[13px] font-semibold text-textPrimary transition-colors hover:bg-textPrimary hover:text-white"
              >
                Explore Products
              </a>
            </div>

            {/* Stats — mobile only */}
            <div className="mt-10 grid grid-cols-2 gap-px border border-border bg-border lg:hidden">
              {STATS.map((s) => (
                <div key={s.label} className="bg-white px-5 py-6">
                  <p className="text-[2rem] font-extrabold leading-none text-textPrimary">
                    {s.value}
                  </p>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-textSecondary">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom — product category strip */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-black/[0.06] pt-6">
            {PRODUCTS.map((p) => (
              <span
                key={p.num}
                className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/25"
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>

        {/* Right — dark stats panel, desktop only */}
        <div className="hidden flex-col justify-between bg-[#0a1628] px-10 py-14 lg:flex">
          <div className="divide-y divide-white/[0.07]">
            {STATS.map((s) => (
              <div key={s.label} className="py-9 first:pt-0">
                <p className="text-[3.5rem] font-extrabold leading-none text-white">
                  {s.value}
                </p>
                <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-white/[0.07] pt-8">
            <Link
              href="/login"
              className="block w-full rounded-lg bg-accent py-3.5 text-center text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Login to Dashboard
            </Link>
            <p className="mt-3 text-center text-[11px] text-white/25">
              Distributors · Salespersons · Admin
            </p>
          </div>
        </div>
      </section>

      {/* ── Products ──────────────────────────────────────── */}
      <section id="products" className="bg-white px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 border-b border-black/[0.07] pb-10 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-[2rem] font-extrabold tracking-tight text-textPrimary sm:text-[2.5rem]">
              Products
            </h2>
            <p className="max-w-xs text-[13px] leading-relaxed text-textSecondary sm:text-right">
              A comprehensive lineup engineered for every industrial and
              automotive application.
            </p>
          </div>

          <div className="divide-y divide-black/[0.06]">
            {PRODUCTS.map((p) => (
              <div
                key={p.num}
                className="group grid grid-cols-[36px_1fr] items-start gap-5 py-8 md:grid-cols-[36px_1fr_auto] md:items-center"
              >
                <span className="pt-1 text-[11px] font-bold text-black/20">
                  {p.num}
                </span>
                <div>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="text-[1.25rem] font-bold tracking-tight text-textPrimary">
                      {p.name}
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-textSecondary">
                      {p.tag}
                    </span>
                  </div>
                  <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-textSecondary">
                    {p.description}
                  </p>
                </div>
                {/* Arrow */}
                <span className="hidden h-8 w-8 items-center justify-center rounded-full border border-border text-textSecondary transition-all group-hover:border-accent group-hover:bg-accent group-hover:text-white md:flex">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Technofluid ───────────────────────────────── */}
      <section className="bg-page px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 md:grid-cols-[280px_1fr]">
            {/* Sticky label */}
            <div>
              <h2 className="text-[1.6rem] font-extrabold leading-tight tracking-tight text-textPrimary md:sticky md:top-24 md:text-[2rem]">
                Why
                <br />
                Technofluid?
              </h2>
            </div>

            {/* Feature list */}
            <div className="divide-y divide-black/[0.07] md:border-l md:border-black/[0.07] md:pl-12">
              {FEATURES.map((f) => (
                <div key={f.num} className="py-8 first:pt-0">
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-textSecondary">
                    {f.num}
                  </span>
                  <h3 className="mt-3 text-[1rem] font-bold text-textPrimary">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-textSecondary">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── About ─────────────────────────────────────────── */}
      <section id="about" className="bg-white px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 border-b border-black/[0.07] pb-14 md:grid-cols-2 md:gap-20">
            <h2
              className="font-extrabold leading-tight tracking-tight text-textPrimary"
              style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)" }}
            >
              Powering Industry
              <br />
              Since Day One.
            </h2>
            <div>
              <p className="text-[14px] leading-[1.85] text-textSecondary">
                Technofluid Lubricants is a dedicated lubricant distribution
                company committed to delivering high-quality products to
                businesses and distributors nationwide. Our platform connects
                administrators, sales teams, and distributors on a single
                seamless system.
              </p>
              <p className="mt-4 text-[14px] leading-[1.85] text-textSecondary">
                We believe the right lubricant is the difference between
                machinery that fails and machinery that lasts. Quality is at the
                heart of everything we do — from formulation to final delivery.
              </p>
              <Link
                href="/login"
                className="mt-7 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.2em] text-accent transition-opacity hover:opacity-70"
              >
                Get Started
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                  />
                </svg>
              </Link>
            </div>
          </div>

          {/* Product category strip */}
          <div className="grid grid-cols-2 divide-x divide-black/[0.06] pt-2 md:grid-cols-4">
            {PRODUCTS.map((p) => (
              <div key={p.num} className="px-0 py-8 md:px-8 md:first:pl-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-textSecondary">
                  {p.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────── */}
      <section id="contact" className="bg-page px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 md:grid-cols-2 md:items-start">
            <h2
              className="font-extrabold leading-tight tracking-tight text-textPrimary"
              style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)" }}
            >
              Ready to
              <br />
              Work Together?
            </h2>
            <div>
              <div className="space-y-6 border-b border-black/[0.07] pb-8">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-textSecondary">
                    Email
                  </p>
                  <a
                    href="mailto:info@technofluid.com"
                    className="mt-1.5 block text-[1.05rem] font-semibold text-textPrimary transition-colors hover:text-accent"
                  >
                    info@technofluid.com
                  </a>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-textSecondary">
                    Phone
                  </p>
                  <a
                    href="tel:+18005550100"
                    className="mt-1.5 block text-[1.05rem] font-semibold text-textPrimary transition-colors hover:text-accent"
                  >
                    +1 (800) 555-0100
                  </a>
                </div>
              </div>
              <div className="pt-8">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Login to Your Account
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-black/[0.07] bg-[#0a1628] px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <p className="text-[12px] font-bold text-white">
            Technofluid{" "}
            <span className="font-normal text-white/35">Lubricants</span>
          </p>
          <nav className="flex flex-wrap gap-8">
            {[
              { label: "Products", href: "/#products" },
              { label: "About", href: "/#about" },
              { label: "Contact", href: "/#contact" },
              { label: "Login", href: "/login" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[11px] text-white/35 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="text-[11px] text-white/25">
            &copy; {new Date().getFullYear()} Technofluid Lubricants
          </p>
        </div>
      </footer>
    </div>
  );
}
