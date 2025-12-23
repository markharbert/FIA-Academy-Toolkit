# Video Confidence Coach - Design Guidelines

## Design Approach

**System Selection: Material Design 3** with productivity tool optimization (similar to Google Workspace, Loom, or Descript).

**Rationale:** This is a utility-focused coaching tool where clarity, readability of detailed feedback, and intuitive recording workflows are paramount. The app handles complex information (transcripts, multi-part scoring, metrics) requiring strong information hierarchy and data-dense layouts.

## Core Design Elements

### Typography
- **Primary Font:** Inter or Roboto from Google Fonts
- **Display/Headers (H1-H2):** 32-40px, font-weight-600
- **Section Headers (H3):** 24px, font-weight-600
- **Body Text:** 16px, font-weight-400, line-height-relaxed
- **Metadata/Labels:** 14px, font-weight-500
- **Code/Transcript:** 'Roboto Mono' or 'Courier New', 14px

### Layout System
**Spacing Primitives:** Use Tailwind units of **2, 4, 6, 8, 12, and 16** consistently
- Component padding: p-4 to p-8
- Section spacing: py-12 to py-16
- Card gaps: gap-6
- Form field spacing: space-y-4

**Container Widths:**
- Dashboard/main content: max-w-7xl
- Recording page split: Two-column grid with 60/40 split (video left, formula right)
- Results page: max-w-5xl for optimal reading

## Component Library

### Landing Page
**Hero Section:**
- Full-width with subtle gradient background
- Centered layout with max-w-4xl
- Large headline (text-4xl md:text-5xl)
- 3-step process cards in grid-cols-1 md:grid-cols-3 below hero
- Each step card: icon, number badge, title, description
- Primary CTA button (large size) + secondary "Learn More" link

### Dashboard
**Layout:**
- Top bar: Welcome message + "New Practice Session" primary button (top-right)
- Sessions list: Card-based layout with shadow-md
- Each card displays: thumbnail placeholder, date, duration badge, score meter (circular or linear), status chip, action buttons row
- Use grid-cols-1 md:grid-cols-2 lg:grid-cols-3 for cards
- Empty state: centered icon, message, and CTA when no sessions exist

### Recording Page
**Two-Column Split (lg:grid-cols-5):**
- Left column (col-span-3): Video recorder area
  - Camera preview: aspect-video, rounded-lg, shadow-lg
  - Control buttons below: Record (primary, large), Stop (danger), Save Session (success)
  - After recording: Video player replaces preview
  - Recording tips: Small card with bullet list, subtle background
- Right column (col-span-2): Sticky sidebar
  - "5-Part Formula" title
  - Accordion or stacked cards for each part
  - Each part: number badge, title, goal statement, 2-3 example bullets
  - Goal type dropdown at bottom

### Session Results Page
**Single-Column Flow with Distinct Sections:**

1. **Video Section:** 
   - Player: aspect-video, max-w-3xl, centered
   - Below player: Download button + expiration timer badge

2. **Transcript Section:**
   - Card with white background, p-6
   - Header with "Transcript" title + Copy button
   - Monospace text area (editable)
   - "Re-score with Edited Transcript" button

3. **Score Summary Card:**
   - Prominent total score display: Large circular progress (120px diameter) or score bar
   - Five part scores: grid-cols-5 with mini score indicators
   - "Strengths" and "Top 3 Improvements" in two columns below

4. **Detailed Feedback:**
   - Each part as expandable accordion or separate card
   - Part header: Score badge + title
   - Sub-sections: "What Worked" (green accent), "What's Missing" (amber accent), "Suggestions" (blue accent)
   - Example lines: quoted text blocks with subtle left border

5. **Delivery Metrics:**
   - Grid layout: WPM stat card, Filler words card, Clarity notes card
   - Each metric: large number display, icon, label

### Forms & Auth
- Max-w-md centered containers
- Input fields: h-12, rounded-lg, border, px-4
- Labels: mb-2, font-medium
- Submit buttons: w-full, h-12
- Error messages: text-sm, red text below fields
- "Or" dividers between options

### Navigation
- Top navbar: app logo (left), user menu dropdown (right)
- Footer: Privacy note, links row

### Buttons
- Primary: h-10 to h-12, px-6, rounded-lg, font-medium
- Secondary: outlined variant
- Danger (Stop): red treatment
- Icon buttons: square, p-2
- Buttons on images: backdrop-blur-md with semi-transparent background

### Progress Indicators
- Processing stepper: Horizontal step indicator with 4 steps (Upload → Transcribe → Score → Done)
- Active step: accent treatment
- Loading spinners: 24px for inline, 48px for full-page

### Icons
**Library:** Heroicons (CDN)
- Recording: video-camera, microphone
- Actions: play, stop, download, trash, pencil
- Status: check-circle, clock, x-circle
- Navigation: home, user-circle, cog

## Images

**Hero Section:**
- Large background image showing person confidently recording video on laptop/phone
- Semi-transparent overlay for text readability
- Alternative: Abstract gradient with floating video UI elements

**Empty States:**
- Illustration or icon for "No sessions yet" dashboard state
- Camera icon for recording preview placeholder

**No additional imagery needed** - focus on clean, data-rich interfaces with strong typography and clear visual hierarchy.