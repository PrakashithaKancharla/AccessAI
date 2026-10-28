# AccessAI — Accessible City Assistant

> "The shortest route isn't always the most accessible route."

AccessAI is a personalized, accessibility-first pedestrian navigation web application designed to help individuals with mobility, physical, or visual impairments navigate urban environments safely.

---

## Problem Statement

Standard navigation engines prioritize distance or motorized travel speed, often directing pedestrians toward routes with physical barriers such as steep inclines, missing curb cuts, long staircases, or unverified terrain. For individuals using wheelchairs, crutches, strollers, or those with limited walking stamina, these undetected obstacles can turn a short trip into an impassable barrier.

---

## Core Solution

AccessAI evaluates real-world pedestrian walking routes against a user's individual accessibility profile (e.g. step-free requirement, avoidance of stairs, avoidance of steep slopes, and maximum extra walking tolerance). The platform computes an accessibility score (0–100) for all discovered routes, recommends the safest accessible path, and provides turn-by-turn live navigation with an optional multimodal voice assistant.

---

## Key Implemented Features

### 1. In-App Accessibility Profile Creation
* **Method A (Natural Language)**: Enter custom accessibility requirements (e.g. *"I use a wheelchair, I cannot use stairs, I need ramps"*) to extract a structured profile.
* **Method B (Category Questionnaire)**: Quick setup for specific profiles (Wheelchair user, Crutch / walking support, Senior citizen, Blind / visually impaired, Parent with stroller/wheelchair, Mobility difficulty).
* **Profile Management**: Editable dropdown controls to review, fine-tune, and persist accessibility parameters in browser storage.

### 2. Multi-Route Accessibility Comparison
* **Multiple Real Alternatives**: Queries real walking routes via OSRM, returning genuine pedestrian alternatives (Route A and Route B).
* **Independent Evaluation**: Each route geometry and maneuver list is independently analyzed by the deterministic scoring engine.
* **Transparent Recommendation**: The highest-scoring route is flagged as "Recommended", while alternative routes remain fully selectable.
* **Distinct Visuals**: Active routes render in prominent Blue (`#2563eb`), with secondary routes in distinct Violet (`#7c3aed`).

### 3. Google-Maps-Style Navigation Mode
* **Turn-by-Turn HUD**: Floating navigation overlay with maneuver icons, current instruction text, step counter (`Step X of Y`), and distance to next maneuver.
* **Live Location Marker**: Pulsing blue position indicator placed along route waypoints with automatic map panning.
* **Dynamic Distance & ETA**: Real-time remaining distance (km) and walking time (min) updated at each step.
* **Step Progression**: Advance or backtrack through maneuver instructions via on-screen buttons or voice commands.
* **Off-Route Recalculation**: Automated re-routing helper triggered when deviation occurs.

### 4. Conversational Voice Assistant
* **Optional 3-State Operation**:
  1. *Voice OFF (Normal Mode)*: Default silent visual interface.
  2. *Voice ON (Conversational Mode)*: Push-to-talk speech recognition and spoken guidance.
  3. *Muted Mode*: Silences speech synthesis while continuing visual navigation.
* **Speech Recognition & Synthesis**: Native browser Web Speech API (`SpeechRecognition` and `SpeechSynthesis`).
* **Natural Voice Commands**:
  - *Route Planning*: *"I want to go from King's Cross Station to British Museum"* / *"Take me to British Museum"*
  - *Route Selection*: *"Choose Route A"* / *"Select Route B"*
  - *Navigation Control*: *"Start navigation"* / *"Stop navigation"* / *"Next step"* / *"Previous step"*
  - *Information Queries*: *"Where am I?"* / *"How far is it?"* / *"What is the ETA?"* / *"Repeat that"*
  - *Voice Controls*: *"Turn on voice"* / *"Turn off voice"* / *"Mute"* / *"Unmute"*
* **Audio Spam Prevention**: Built-in deduplication suppresses duplicate announcements for identical steps.

---

## Accessibility Scoring Methodology

The evaluation engine uses a deterministic, rule-based mathematical scoring model:
* **Base Score**: 100 points.
* **Hard Violations (-40 pts)**: Penalizes required constraints violated (e.g. stairs on a wheelchair-required profile).
* **Soft Violations (-15 pts)**: Penalizes preferred preferences violated (e.g. steep slopes, extra distance beyond tolerance).
* **Unverified Data Penalty (-10 pts / -5 pts)**: Missing or unverified OSM accessibility data (e.g. unknown ramp availability) is penalized. **Unverified data is never assumed to be accessible.**
* **Score Tiers**: High (70–100, Green), Moderate (45–69, Amber), Low (0–44, Red).

---

## Current Technology Stack

| Layer | Technologies & Services Used |
| :--- | :--- |
| **Frontend UI** | Semantic HTML5, CSS3 (Custom Properties, Flexbox, CSS Grid, Responsive Animations), Vanilla JavaScript (ES6+), Lucide Icons |
| **Mapping & GIS** | [Leaflet.js](https://leafletjs.com/) (`v1.9.4`) with [Mapbox Streets-v12](https://www.mapbox.com/) raster tiles |
| **Geocoding** | [OpenStreetMap Nominatim API](https://nominatim.openstreetmap.org/) (Forward & Reverse geocoding) |
| **Pedestrian Routing** | [Project OSRM Foot Routing API](https://project-osrm.org/) (Real geometries, step maneuvers, alternatives) |
| **Geolocation** | Browser `navigator.geolocation` API (Device GPS tracking) |
| **Voice & Speech** | Browser Web Speech API (`window.SpeechRecognition` / `window.speechSynthesis`) |
| **State & Persistence** | Client-side `localStorage` (`accessAI_profile`, `accessAI_selectedRoute`) |

---

## AI & Intelligence Reality Check

AccessAI maintains full technical transparency regarding its current architecture:
* **Deterministic Rules Engine**: Accessibility scoring, route evaluation, and conflict explanations are computed using transparent mathematical weighting rules.
* **Client-Side Intent Matching**: Natural language profile extraction and voice assistant commands currently use client-side regular expressions and deterministic state machines.
* **No External LLM / RAG Integrated**: The current codebase does not make live calls to external LLMs (such as Google Gemini or OpenAI) or vector databases.
* **Future Roadmap**: Future versions will integrate Google Gemini for multimodal document understanding (e.g. parsing disability certificates or transit passes) and Retrieval-Augmented Generation (RAG) over municipal curb-ramp and elevator outage databases.

---

## How to Run & Test

1. **Clone or Download** the repository to your local machine.
2. **Configure Map Tiles** (Optional):
   - Open `script.js` and paste your Mapbox access token into `MAP_CONFIG.apiKey` (line 23).
   - *(If left blank, all real route geometries, coordinates, scoring, and markers continue to render on the canvas).*
3. **Open `index.html`** in any modern web browser (Chrome, Edge, Firefox, Safari).
4. **Step-by-Step Demo Flow**:
   - **Set Profile**: Type accessibility needs in the text box (or select a category) $\rightarrow$ Click **Confirm Requirements**.
   - **Analyze Routes**: Enter `King's Cross Station, London` (or click *Use my current location*) to `British Museum, London` $\rightarrow$ Click **Find Accessible Routes**.
   - **Compare Routes**: Review Route A and Route B cards and click any card to highlight on the map.
   - **Start Navigation**: Click **Start Live Navigation** (or say *"Start navigation"*) to enter turn-by-turn HUD mode.
   - **Voice Assistant**: Click the **Voice: OFF** header toggle to enable voice mode, then click **Listen** or use voice commands.

---

## Architecture Reference

For a complete technical specification, data-flow diagrams, and component breakdown, see [`ARCHITECTURE.md`](ARCHITECTURE.md).