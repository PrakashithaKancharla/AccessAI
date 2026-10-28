# AccessAI Architecture

## 1. System Overview
AccessAI is a personalized, accessibility-aware pedestrian navigation prototype. Unlike conventional mapping engines that optimize strictly for distance or travel time, AccessAI evaluates real urban walking routes against individual accessibility requirements (such as step-free paths, stair avoidance, ramp requirements, slope tolerances, and extra distance limits) to recommend safe, tailored pedestrian journeys.

---

## 2. End-to-End Workflow
The application operates through the following deterministic end-to-end data pipeline:

```
[User Accessibility Requirements]
               │
               ▼
[Accessibility Profile Extraction]
  (Natural Language Parsing or Category Selection)
               │
               ▼
[Profile Review & Confirmation]
  (Editable UI Dropdowns -> localStorage Persistence)
               │
               ▼
[Origin & Destination Geocoding]
  (OpenStreetMap Nominatim Forward / Reverse Geocoding)
               │
               ▼
[Real Pedestrian Route Retrieval]
  (OSRM Foot Routing Engine -> Geometry, Steps & Maneuvers)
               │
               ▼
[Multiple Route Alternatives Extraction]
  (Route A, Route B -> Normalized Coordinates, Distance & Calibrated ETA)
               │
               ▼
[Deterministic Accessibility Evaluation]
  (Scoring Engine -> Rule Checking, Penalty Calculation & Weighting)
               │
               ▼
[Accessibility Score & Explanation]
  (0-100 Score, Positive Highlights & Conflict Explanations)
               │
               ▼
[User Route Selection & Map Visualization]
  (Interactive Leaflet + Mapbox Polylines with Visual Distinction)
               │
               ▼
[Live Navigation Mode]
  (Turn-by-Turn Maneuvers, Live Location Marker & Real-Time Distance/ETA)
               │
               ▼
[Conversational Voice Guidance]
  (Web Speech Recognition & Speech Synthesis)
```

---

## 3. Components

1. **Profile Extraction Module**:
   - Parses natural-language user descriptions (e.g., *"I use a wheelchair, I cannot use stairs, I need ramps"*) via client-side keyword matching into a structured profile object.
   - Provides a category-based questionnaire (Wheelchair user, Crutch, Senior citizen, Blind/visually impaired, Parent, Mobility difficulty) to generate profiles.
2. **Accessibility Profile Management**:
   - Renders interactive dropdown controls allowing fine-grained customization of individual requirements.
   - Persists confirmed settings to browser storage (`accessAI_profile`).
3. **Deterministic Accessibility Scoring Engine**:
   - Analyzes real route steps and attributes against user requirements.
   - Computes weighted penalties for hard conflicts (e.g. stairs on a wheelchair route) and preferred tolerances (e.g. steep slopes, extra distance).
4. **Map Rendering Layer**:
   - Leaflet.js map controller hosting Mapbox Streets cartographic raster tiles.
   - Manages responsive zoom, custom waypoint markers (Origin, Destination, Live Location), and polyline layers.
5. **Geocoding Service**:
   - Converts natural-language landmark and address queries into geographic coordinates `[lat, lon]`.
   - Supports reverse-geocoding coordinates from browser GPS geolocation into human-readable street names.
6. **Pedestrian Routing Service**:
   - Queries real pedestrian foot networks to obtain walking paths with high-density coordinate waypoints and step-by-step turn maneuvers.
7. **Multi-Route Comparison**:
   - Renders parallel route cards with distinct visual indicators, individual scores, distance, and walking travel times.
   - Supports independent route selection, updating the primary route polyline on the map.
8. **Navigation Engine**:
   - Turn-by-turn navigation HUD overlay displaying maneuver icons, instruction text, step counters, remaining distance, and remaining ETA.
   - Live location pulsing pin tracking current navigation step position with manual advancement and recalculation support.
9. **Voice Interaction Layer**:
   - Optional, multimodal voice assistant with three operating states: Voice OFF (normal), Voice ON (conversational), and Muted.
   - Single-shot push-to-talk speech recognition and spoken audio feedback with duplicate audio suppression.

---

## 4. External Services & Browser APIs

| Service / API | Integration Role | Technical Detail |
| :--- | :--- | :--- |
| **Mapbox Streets Raster Tiles** | Basemap Cartography | Serves raster map tiles (`streets-v12`) rendered in Leaflet canvas with Mapbox attribution. |
| **OpenStreetMap Nominatim** | Geocoding & Reverse Geocoding | Resolves address queries (e.g. *"King's Cross Station, London"*) to coordinates and converts GPS coordinates to street addresses. |
| **OSRM Foot Routing Engine** | Pedestrian Route Generation | Computes pedestrian routes with full geometry coordinates, step maneuvers, and route alternatives (`alternatives=true`). |
| **Browser Geolocation API** | Current Location | Retrieves device GPS coordinates on user demand via `navigator.geolocation.getCurrentPosition`. |
| **Web Speech Recognition API** | Voice Command Input | Captures spoken voice commands via `SpeechRecognition` / `webkitSpeechRecognition`. |
| **Web Speech Synthesis API** | Spoken Guidance | Synthesizes spoken route feedback and turn instructions via `speechSynthesis` and `SpeechSynthesisUtterance`. |

---

## 5. Accessibility Scoring
The accessibility scoring engine is deterministic and rule-based:
* **Base Score**: Starts at 100 points.
* **Hard Violations**: Penalized heavily (-40 points per hard conflict, e.g. steps or stairs on a step-free/wheelchair required route).
* **Soft Violations**: Penalized moderately (-15 points per preference violation, e.g. steep slopes, exceeding extra walking distance limits).
* **Unverified / Unknown Data**:
  - Missing or unverified accessibility information (e.g. unverified ramp status or accessible entrances in standard OSM data) is penalized (-10 points for high-priority required fields, -5 points for lower-priority fields).
  - **Unknown attributes are never assumed to be accessible.**
* **Score Ranges**:
  - `70 – 100`: High accessibility match (Green).
  - `45 – 69`: Moderate match with minor caveats (Amber).
  - `0 – 44`: Significant conflicts or barriers detected (Red).

---

## 6. Multi-Route Decision Flow
1. The routing provider returns all valid pedestrian alternatives discovered for the requested origin and destination.
2. Each route alternative (e.g. Route A, Route B) is independently evaluated against the user's active accessibility profile.
3. The route with the highest accessibility score is highlighted as the recommended route.
4. All route alternatives are rendered on the map and displayed in comparison cards, giving users the freedom to select any alternative route for inspection and live navigation.

---

## 7. Navigation Flow
* **HUD Overlay**: Activating navigation displays a top-level overlay with maneuver arrow icons, street names, distance to next turn, total remaining distance, and remaining walking time.
* **Step Progression**: Users can advance (`Next step`) or backtrack (`Previous step`) through turn-by-turn maneuvers via on-screen controls or voice commands.
* **Map Tracking**: The map smoothly pans and centers on the active waypoint coordinate, updating the pulsing location marker.
* **Voice Guidance**: Turn instructions are announced automatically when Voice Mode is ON, with built-in deduplication to prevent audio spam.

---

## 8. AI & Intelligence Reality
To ensure complete transparency during technical evaluation:
* **No External LLM in Current Runtime**: The prototype does not currently call external Large Language Model APIs (e.g. Google Gemini or OpenAI endpoints).
* **No Vector Database / RAG**: No vector embeddings or Retrieval-Augmented Generation systems are currently implemented.
* **No Autonomous Multi-Agent Framework**: No agentic orchestration frameworks (e.g. LangChain, CrewAI, AutoGen) are currently running in code.
* **Current NLP Logic**: Natural-language profile extraction and voice command intent matching are implemented via client-side regex pattern matchers and deterministic state transitions.
* **Current Evaluation**: Accessibility route scoring and explanations are calculated through pure deterministic rules and structured explanation templates.

---

## 9. Current Limitations & Future Extensions

### Current Limitations
1. **OSM Data Granularity**: Public OpenStreetMap street data does not universally contain micro-accessibility tags (exact sidewalk incline percentages, tactile paving, curb ramp slopes) for all urban regions.
2. **Client-Side Persistence**: Profiles and route states are saved in browser `localStorage` rather than a centralized cloud database.
3. **Regex Intent Parsing**: Command recognition is bounded by client-side regex patterns.

### Future Roadmap
* **LLM Integration (e.g., Google Gemini 2.5 Flash)**:
  - Multimodal document parsing of official accessibility passes, medical certificates, or disability cards to auto-generate verified profiles.
  - Generative, conversational AI explanations detailing complex route comparisons tailored to nuanced user needs.
* **RAG & Rich Accessibility Knowledge Base**:
  - Vector indexing of municipal curb-cut registries, elevator outage feeds, construction alerts, and community barrier reports.
* **Autonomous Multi-Agent Architecture**:
  - Multi-agent orchestration (Intent Classifier Agent $\rightarrow$ Route Optimizer Agent $\rightarrow$ Safety Verifier Agent $\rightarrow$ Voice Synthesizer Agent).
* **Cloud Persistence & PWA**:
  - User authentication, cross-device profile syncing, and offline vector tile caching.
