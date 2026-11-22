# Office — UI design reference (from Aromex desktop, in Technofluid colours)

Source: Ansh's Aromex KMP session, 22 Nov 2026. Aromex desktop uses the same stack as Technofluid Office: Electron + React 19 + Tailwind v4 (@theme tokens) + lucide-react; Aromex also uses React Aria Components for focus, keyboard and dialogs. **Built on `feat/office-ui-refresh` (22 Nov 2026)** with the choices in §6; dark mode is still to come.

Aromex references (on Ansh's machine; the repo isn't readable from Sharnya's GitHub account):
- `Aromex-KMP/electronApp/src/renderer/src/ui/theme.css`: every token, light and dark
- `ui/index.ts`: the component kit
- `app/ShellLayout.tsx`: the app shell
- `docs/electron-design-system.md`: the rules (see its "clean pass" section)
- the in-app gallery at `#/design`
- screenshots: dashboard, contacts list, sales history, contact detail, money workspace

## 1. What makes it feel clean (Aromex's rules)
1. **One white sheet per screen.** Everything on it shares one left edge and one right edge.
2. **Flat inside the sheet.** No cards inside cards; hierarchy comes from type size, whitespace and hairlines.
3. **Colour only for meaning, and only for exceptions.** Figures are plain text colour. The brand colour marks "where you are" and the single primary action.
4. **One primary action per page,** one or two secondary, everything rarer in a "⋯" menu (destructive items in red there, still confirmed).
5. **Desktop density:** 32px controls, 14px body text, 44px table rows.
6. **Sentence case, short labels.** No UPPERCASE headings and no keyboard-hint footers.
7. **Icons:** lucide at 16px in controls, nav and tables; 14px in badges; 70% opacity in the sidebar.
8. **Every screen that loads data has all four states:** loading, empty, error and stale. A failed refresh keeps the old figures on screen under a banner.
9. **Screens use only the kit.** If something's missing, it's added to the kit: no one-off colours or sizes in screens.

## 2. Tokens
| | Aromex | Technofluid (proposed) |
|---|---|---|
| Font | Inter Variable | Inter Variable (today: Geist). **Decision needed.** |
| Type scale | 12 · 13 · 14 · 15 · 20 · 24 · 28 (captions · labels/table head · body · section/dialog title · page title · headline · stat figure) | same |
| Weights | 400 body, 500 labels/nav, 600 titles/figures | same |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32 · 40; sections 40 apart; page side padding 32 | same |
| Radii | control 8, sheet 12, dialog 14, badge 6 | same |
| Borders | `#E4E7EC` edge · `#ECEEF2` row dividers · `#D5D9E1` control outline | same greys |
| Shadows | card / control / popover / modal (very light) | same |

### Colour roles: Aromex → Technofluid
Ansh's warnings about our brand colours:
- **Orange #F37021 with white text fails readability (about 3:1),** so it can't be the button/link colour as-is.
- **Our brand red sits right on top of "danger".**
- **Aromex's "warning" is orange,** which would clash with an orange brand.

| Role | Aromex | Technofluid proposal |
|---|---|---|
| canvas (behind the sheet) | #F3F4F6 | #F4F4F5 (neutral; the dark sidebar sits beside it) |
| surface (the sheet) | #FFFFFF | #FFFFFF |
| surface-alt (hover, wells, segmented track) | #F4F5F7 | #F6F5F4 |
| text / muted / subtle / faint | #1A1F2B / #5A6172 / #6E7586 / #99A0B0 | same neutrals |
| **accent** (primary button, links, active rule) | #40548A | **deep Technofluid orange #B8460F** (white text passes; hover #9C3A0B, pressed #82300A) |
| accent-50 (selected row) | #F1F4FA | #FFF3EA |
| focus ring | #4E63A0 | #F37021 (the bright brand orange) |
| brand gradient (dialog header band, logo tile) | blue 600 → 800 | **orange #F37021 → red #C8101E** |
| success (money in) | #2E9E66 / text #1E7A4E | same |
| warning (money out, attention) | #CC6633 (orange) | **amber #B7791F / text #8A5A12 / tint #FDF6E3**, so it doesn't look like the brand |
| danger | #D64545 / text #B83232 | #D64545 / #B83232 (stays clear of the brand red, since the accent is orange); always with an icon and words |
| sidebar | light (on canvas), active row = white pill | **dark charcoal #2B2B2B** (today's look); active row = lighter #3A3A3A + white text + a thin orange bar; groups in 12px faint text |
| dark mode | yes (`data-theme="dark"`, follows the OS, toggle) | **later** (the tokens make it a single swap) |

## 3. Layout shell
- **Sidebar, 232px:**
  - logo tile + "Technofluid Office" + company at the top;
  - 32px nav rows with a 16px icon, under group headings (Overview · Sales · Stock · Money · Admin);
  - user, shortcuts and sign-out at the foot.
- **Content:** ONE white sheet inset 8px from the window, radius 12, hairline edge, light shadow. No orange top bar.
- **Page:** a header and body in one centred column (max 1152px, 32px side padding).
  - The header has a 20px semibold title, an optional 13px subtitle, actions on the right and an optional toolbar row (search + filter buttons).
  - Record pages get a "‹ Sales" back link above the title.
- **"Workspace" screens** (New sale, New purchase, Money in & out, Expenses): the list on the left, and a full-height 384px form panel on the right with the total and the main button pinned at its foot.

## 4. Components
- **Buttons:**
  - heights 28 (small) and 32 (default); radius 8; 16px icon on the left;
  - variants: primary (accent), secondary (white + outline), ghost, danger;
  - a pending button keeps its label ("Saving…") with a spinner.
- **Inputs:**
  - 32px, radius 8, labels **above** (13px), hint or error below;
  - money fields have ₹ in front, right-aligned digits, and select all on focus;
  - selects are searchable (type to filter); dates are a field plus a calendar button.
- **Tables:**
  - header 40px (13px, sticky, sortable by clicking a header); rows 44px, hairline dividers, **no stripes**;
  - hover in a light grey; the selected row gets the accent tint plus a 2px accent bar;
  - money right-aligned with tabular digits;
  - Enter/click opens a row; rare actions sit in a "⋯" menu at the end of the row;
  - footer: "8 of 14" + Load more.
- **Figures at the top of a screen:** not cards. A row of equal tiles, each with a hairline on top, a 13px label and a 28px figure. Tiles that filter act as tabs.
- **Badges:** 22px, tinted. **The normal state shows no badge.** For example, "In the books" shows nothing; only "Saving to books…" and "Not saved" show.
- **Dialogs:**
  - centred, 384 / 512 / 704 wide, with the orange→red header band;
  - destructive ones get a red icon; focus starts on the safe choice; Esc closes.
- **Toasts:** bottom-right; auto-dismiss after 5 s; errors stay until dismissed.
- **Empty, loading and error states:** an icon, one line and an action.

## 5. Patterns
- **List → detail:** the full-width table opens the record as its own page (back link, Esc goes back). Returning finds the list as it was.
- **Forms:**
  - labels above; an invalid field says why under itself;
  - Save stays disabled with the reason beside it;
  - irreversible actions confirm in a dialog that states the exact consequence.
- **Filters:** compact buttons in the header toolbar (date range, pills reading "Label: value"), never a row of open fields. Search is on the left (Ctrl+F).
- **Money:** one ₹ formatter and tabular digits. Colour is used only for exceptions (owed, negative, failed), always together with a word or arrow.
- **Keyboard:** Ctrl+1…9 sections, Ctrl+N new, Ctrl+F search, Ctrl+R refresh, ↑↓/Enter/Esc everywhere, Ctrl+/ for the shortcut list.

## 6. Decisions (Sharnya, 22 Nov 2026)
1. **Font:** Inter.
2. **Accent:** deep orange #B8460F.
3. **Sidebar:** stays dark charcoal.
4. **Top bar:** dropped for the single white sheet.
5. **Dark mode:** later.
6. **Order:** tokens + kit, then the shell, then every screen.
