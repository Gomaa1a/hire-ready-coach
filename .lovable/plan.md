

## Plan: Mobile Responsiveness Fixes

After reviewing the key pages, here are the mobile layout issues and fixes needed:

### 1. Dashboard (`src/pages/Dashboard.tsx`)

**Problems:**
- Interview list items (line 167) cram score, badge, download button, and "View" link into one row — overflows on mobile
- Nav has no mobile menu (links hidden below `md` breakpoint with no hamburger)
- "New Interview" CTA button text is too large on small screens

**Fixes:**
- Stack interview list items vertically on mobile: role/date on top, score + actions below
- Add a mobile-friendly nav with hamburger or simplified links
- Scale down CTA button padding/text on mobile (`text-base px-6 py-3 sm:text-lg sm:px-8 sm:py-4`)

### 2. Live Interview (`src/pages/interview/LiveInterview.tsx`)

**Problems:**
- Top overlay bar has 3 items in a row (timer, filler/wpm stats, role badge) — wraps awkwardly on narrow screens
- Interviewer avatar is fixed at `h-36 w-36` — too large on small phones, leaves little room for transcript
- Webcam self-view circle at `bottom-24 right-5` overlaps with controls on short screens
- Transcript area `max-w-xl` + controls don't adapt to very small screens

**Fixes:**
- Make top bar wrap-friendly: stack timer left, role right, analytics below on mobile
- Scale avatar: `h-24 w-24 sm:h-36 sm:w-36`
- Move webcam self-view higher or smaller on mobile: `h-[80px] w-[80px] sm:h-[120px] sm:w-[120px]`
- Reduce transcript padding and max-height on mobile

### 3. Report Page (`src/pages/Report.tsx`)

**Problems:**
- Overall score card (line 364-395): grade + score bars in `md:flex-row` — fine, but the `text-7xl` grade is huge on mobile
- Score mini-cards grid `sm:grid-cols-3 lg:grid-cols-6` — on very small screens, single column cards are too tall
- "How We Scored You" rubric items have dense layouts that don't breathe on mobile
- Market insights salary numbers `text-2xl` are fine but the grid spacing is tight
- Debrief stats (line 389) use `gap-8` which overflows on narrow phones

**Fixes:**
- Scale grade text: `text-5xl sm:text-7xl`
- Score mini-cards: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`
- Add `text-sm` base size adjustments to rubric items on mobile
- Debrief stats: `gap-4 sm:gap-8` and allow wrapping with `flex-wrap`

### Files Changed

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Responsive interview list items, mobile nav links, scaled CTA button |
| `src/pages/interview/LiveInterview.tsx` | Responsive top bar, smaller avatar on mobile, scaled webcam, adjusted transcript area |
| `src/pages/Report.tsx` | Responsive grade size, 2-col score grid on mobile, breathing room in rubric, wrapping debrief stats |

