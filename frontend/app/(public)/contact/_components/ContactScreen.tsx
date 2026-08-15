// File: frontend/app/(public)/contact/_components/ContactScreen.tsx
"use client";

import { useState } from "react";
import { motion } from "motion/react";
import company from "@/content/company.json";
import { ASSETS } from "@/content/assets";
import { BRAND } from "@/content/brand";
import type { CompanyContent } from "@/types/content";
import { useContactForm } from "@/lib/hooks/useContactForm";

const COMPANY = company as CompanyContent;

const WHATSAPP_NUMBER = "918814885245";
const WHATSAPP_TEXT =
  "Hello TECHNOFLUID! I visited your website and would like to enquire about your lubricants. Please get in touch.";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;

// Path per detail row, in order (Address, Phone, Email, Hours).
const DETAIL_ICON_PATHS = [
  "M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  "M4 4.5c0-.6.4-1 1-1h2.7c.5 0 .9.3 1 .8l.7 3a1 1 0 0 1-.3 1L7.8 9.6a12 12 0 0 0 5.6 5.6l1.3-1.3a1 1 0 0 1 1-.3l3 .7c.5.1.8.5.8 1V18c0 .6-.4 1-1 1h-1C9.5 19 4 13.5 4 6.5v-1z",
  "M4 6h16v12H4V6z M4 6l8 7 8-7",
  "M12 7v5.5l3.5 2 M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
];

const DETAIL_ITEMS = [
  { label: "Address", value: ASSETS.contact.address },
  { label: "Phone", value: ASSETS.contact.phone },
  { label: "Email", value: ASSETS.contact.email },
  { label: "Hours", value: ASSETS.contact.hours },
];

const inputClasses =
  "w-full rounded-xl border border-border bg-white px-4 py-3 text-[14px] text-textPrimary placeholder:text-textSecondary/60 outline-none transition-shadow focus:ring-2";

export default function ContactScreen() {
  const { status, fieldErrors, submit, reset } = useContactForm();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ name, phone, message });
    if (ok) {
      setName("");
      setPhone("");
      setMessage("");
    }
  }

  return (
    <section
      className="relative overflow-hidden py-16 lg:py-24"
      style={{
        background: `linear-gradient(135deg, ${BRAND.red}, ${BRAND.orange})`,
      }}
    >
      {/* Diagonal graphic bands, matching the site's CTA styling */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${BRAND.peach} 0 0)`,
          opacity: 0.1,
          clipPath: "polygon(0 20%, 45% 0, 60% 0, 15% 100%, 0 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${BRAND.charcoal} 0 0)`,
          opacity: 0.08,
          clipPath: "polygon(70% 0, 85% 0, 40% 100%, 25% 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/70">
            Get In Touch
          </p>
          <h1 className="mt-3 text-[2.2rem] font-extrabold leading-tight tracking-tight text-white sm:text-[3rem]">
            Ready to cut the friction?
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/80">
            {COMPANY.tagline}
          </p>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left — contact details + WhatsApp */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
            className="flex flex-col gap-4 lg:col-span-2"
          >
            <div className="rounded-3xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.2em] text-white/70">
                Reach us directly
              </h2>
              <div className="mt-5 flex flex-col gap-5">
                {DETAIL_ITEMS.map((item, i) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="white"
                        strokeWidth="1.6"
                      >
                        <path
                          d={DETAIL_ICON_PATHS[i % DETAIL_ICON_PATHS.length]}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                        {item.label}
                      </p>
                      <p className="mt-1 text-[13.5px] font-medium leading-relaxed text-white">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center gap-3 rounded-3xl px-6 py-5 text-[15px] font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: "#25D366" }}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white" aria-hidden>
                <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.13-2.9-7C17.17 3.03 14.69 2 12.04 2Zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.05-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.23 8.24Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.73-.66-1.23-1.47-1.38-1.72-.14-.24-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
              </svg>
              Chat on WhatsApp
            </a>
          </motion.div>

          {/* Right — enquiry form */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
            className="lg:col-span-3"
          >
            <div className="rounded-3xl bg-white p-6 shadow-xl sm:p-8">
              {status === "success" ? (
                <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${BRAND.orange}1A` }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-8 w-8"
                      fill="none"
                      stroke={BRAND.orange}
                      strokeWidth="2.5"
                    >
                      <path
                        d="M4 12.5 9.5 18 20 6.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <h2 className="mt-6 text-[1.5rem] font-extrabold text-textPrimary">
                    Message sent!
                  </h2>
                  <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-textSecondary">
                    Thank you for reaching out. Our team will get back to you
                    shortly.
                  </p>
                  <button
                    type="button"
                    onClick={reset}
                    className="mt-8 rounded-lg border border-border px-6 py-2.5 text-[13px] font-semibold text-textPrimary transition-colors hover:bg-page"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate>
                  <h2 className="text-[1.3rem] font-extrabold text-textPrimary">
                    Send us a message
                  </h2>
                  <p className="mt-1 text-[13px] text-textSecondary">
                    Tell us what you need and we&apos;ll respond quickly.
                  </p>

                  <div className="mt-6 flex flex-col gap-4">
                    <div>
                      <label
                        htmlFor="contact-name"
                        className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em] text-textSecondary"
                      >
                        Your name
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Full name"
                        autoComplete="name"
                        className={inputClasses}
                        style={{ ["--tw-ring-color" as string]: `${BRAND.orange}66` }}
                      />
                      {fieldErrors.name && (
                        <p className="mt-1.5 text-[12px] font-medium" style={{ color: BRAND.red }}>
                          {fieldErrors.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="contact-phone"
                        className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em] text-textSecondary"
                      >
                        Phone number
                      </label>
                      <input
                        id="contact-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 XXXXX XXXXX"
                        autoComplete="tel"
                        className={inputClasses}
                        style={{ ["--tw-ring-color" as string]: `${BRAND.orange}66` }}
                      />
                      {fieldErrors.phone && (
                        <p className="mt-1.5 text-[12px] font-medium" style={{ color: BRAND.red }}>
                          {fieldErrors.phone}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="contact-message"
                        className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em] text-textSecondary"
                      >
                        Message
                      </label>
                      <textarea
                        id="contact-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Which products or applications are you interested in?"
                        rows={5}
                        className={`${inputClasses} resize-none`}
                        style={{ ["--tw-ring-color" as string]: `${BRAND.orange}66` }}
                      />
                      {fieldErrors.message && (
                        <p className="mt-1.5 text-[12px] font-medium" style={{ color: BRAND.red }}>
                          {fieldErrors.message}
                        </p>
                      )}
                    </div>
                  </div>

                  {status === "error" && (
                    <p
                      className="mt-4 rounded-xl px-4 py-3 text-[13px] font-medium"
                      style={{ backgroundColor: `${BRAND.red}12`, color: BRAND.red }}
                    >
                      Something went wrong while sending your message. Please try
                      again, or reach us on WhatsApp.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="mt-6 w-full rounded-xl px-6 py-3.5 text-[14px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: BRAND.orange }}
                  >
                    {status === "submitting" ? "Sending…" : "Send message"}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
