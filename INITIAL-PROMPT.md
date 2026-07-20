Act as an expert Fullstack Developer. Your task is to architect and build "PoopMap", a mobile-first web application to find, add, and rate public toilets in France.

Focus on clean architecture, performance, security, and a strict adherence to the requested UI/UX style.

---


### 1. TECH STACK & DEPLOYMENT
- **Framework:** Next.js (App Router, React 19)
- **Styling:** Tailwind CSS (configured for the custom UI style)
- **Database & ORM:** PostgreSQL + Prisma (Optimized for geospatial queries if possible, or standard Lat/Lon float storage)
- **Map Library:** React-Leaflet (OpenStreetMap)
- **Icons:** Lucide React
- **Containerization:** Docker & Docker Compose (Production-ready, multi-stage build)

---

### 2. CORE FEATURES
#### A. Map & OSM Integration (Geolocated & Restricted)
- **Bounding Box
- :** Restrict map panning/zooming strictly to metropolitan France coordinates.
- **Base Layer:** Use a clean, minimalist OSM tile layer (e.g., CartoDB Positron) to naturally hide superfluous POIs (shops, restaurants).
- **OSM Seeding:** Write a script or seed function using the Overpass API to fetch and insert existing public toilets in France into our DB on first launch.

#### B. User Experience & Synchronization
- **On-launch Sync:** Client fetches updated toilet data from the centralized DB on startup and caches it locally (localStorage or IndexedDB).
- **Add Toilet:** UI flow to drop a pin, fill in details, and upload up to 3 photos (mocked or base64/S3).
- **Toilet Details Dialog:** Clicking a marker opens a bottom sheet (mobile) or modal (PC) showing:
  - Average rating (3 criteria: Cleanliness, Comfort, Experience).
  - 5 latest reviews.
  - Fun navigation button (e.g., "Launch Emergency Guidance", "Navigate to the Throne").
  - QoL transitions and micro-animations (Framer Motion recommended).

#### C. Auth & Review System
- **Optional Accounts:** Sign up/Login via Email/Password.
- **Anonymous Posting:** Users can post reviews without an account but MUST provide a pseudonym.
- **Data Security:** Strict encryption for sensitive user data (passwords hashed with bcrypt, emails encrypted at rest).

#### D. Admin Panel
- **Verification Queue:** Interface to approve or reject newly added toilets.
- **User Management:** Basic CRUD on user accounts, password reset flag.

---

### 3. ART DIRECTION: "PASTEL SOFT-BRUTALISM / STICKER UI"
Match the reference image exactly: playful, high-contrast "sticker" aesthetic with thick black outlines, hard offset shadows, and rounded pastel blocks. No flat minimalism.
- **Palette:** Cream/off-white backgrounds (`#FFFDF5`), muted sage green (`#B5D99C`), soft pastel yellow (`#FFE66D`), clay terracotta (`#E58C6A`), stark black (`#1A1A1A`).
- **Shapes:** Extreme border-radius (`rounded-3xl`), pill-shaped buttons, thick black borders (`border-[3px] border-black`).
- **Shadows:** Hard, offset black drop-shadows only (`box-shadow: 6px 6px 0px 0px #000`). No blur, no gradients. Active/pressed state shifts shadow inwards (`translate-x-[2px] translate-y-[2px] shadow-[2px_2px_0px_#000]`).
- **Typography:** Heavy rounded sans-serif (font-sans, `font-extrabold`), tight tracking, high contrast black on pastel.
- **UI Elements:** Emoji-forward icons (💩), card "stickers" with black outline + offset shadow, colorful segmented progress bars (cleanliness/comfort/experience), bottom-sheet modals with rounded top corners (`rounded-t-[2.5rem]`).
- **Vibe:** Fun, friendly, slightly absurd — every interactive element feels like a tactile paper cut-out.
Specific UI Elements to replicate:
Filter Chips: A horizontal scrollable row of pill-shaped tags (e.g., "Tous", "Gratuits", "Payants") overlapping the map.
Rating Bars: Use horizontal progress bars with rounded ends for the 3 criteria (Cleanliness, Comfort, Experience).
Custom Map Markers: Teardrop/Pin shapes with a colored background, white border, an icon inside, and a small overlapping rating badge.

---

### 4. IMPLEMENTATION PROTOCOL (Token-Efficient Instructions)

To save tokens and ensure quality, execute the project in steps. Do not dump the entire codebase at once.

**Step 1: Architecture & DB Schema**
1. Generate the Prisma Schema (handling Users, Toilets, Reviews, and Admins).
2. Generate the Dockerfile and docker-compose.yml.
3. Show the folder structure.

**Step 2: API & Core Logic**
1. Create the API routes for syncing toilets, posting reviews, and OSM seeding script.
2. Implement password hashing and data encryption utilities.

**Step 3: Frontend (Map & UI Components)**
1. Implement the Map component with France restrictions and custom tile layer.
2. Build the Soft Neo-brutalist / Neumorphic UI design system tokens in Tailwind.
3. Implement the Add Toilet & Details Bottom Sheet.

**Step 4: Admin Panel**
1. Implement the admin dashboard routes and moderation actions.

Begin by outputting **Step 1** only. Ask for my validation before moving to Step 2.