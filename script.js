// ================================================================
// AccessAI — script.js
// Complete implementation: Steps 1, 2, 3, and 4 (Real Map & Routing)
//
// MODULES:
//   1. App Configuration & Global State (MAP_CONFIG & ROUTING_CONFIG)
//   2. Leaflet Map Controller (CartoDB OpenStreetMap tiles & Tile Error handling)
//   3. Routing Provider Abstraction (Real OSM Geocoder + OSRM Router + Demo Fallback)
//   4. Step 1 UI (Nav, Accessibility Settings, Smooth Scroll)
//   5. Step 2 In-App Profile Creation (Natural Language & Category Questionnaire)
//   6. Step 2 Profile Rendering & Editable Controls (Confirm Requirements)
//   7. Step 3 Deterministic Accessibility Evaluator (evaluateRoutes / evaluateRoute)
//   8. Step 4 Route Analysis Flow, Route Cards, Route Selection & Interactive Map
// ================================================================

// ── 1. CONFIGURATION & STATE ────────────────────────────────────

// Map Tile Layer Configuration (Mapbox Raster Tiles via Leaflet)
// Compliant with Mapbox API and OpenStreetMap attribution standards.
var MAP_CONFIG = {
  tileProvider: 'Mapbox',
  tileUrl: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token={accessToken}',
  apiKey: 'pk.eyJ1Ijoic2VjcmV0bmFtZS0wNCIsImEiOiJjbXU3NnVjczUwa3NvMnhzOW14ZTRoaXphIn0.q6Wlm_wLThscvtbnIrcdkQ', // <-- PASTE YOUR MAPBOX API KEY (ACCESS TOKEN) HERE
  attribution: '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors <strong><a href="https://www.mapbox.com/map-feedback/" target="_blank" rel="noopener">Improve this map</a></strong>',
  tileSize: 512,
  zoomOffset: -1,
  maxZoom: 20
};

// Pedestrian Routing Configuration
var ROUTING_CONFIG = {
  // Default is live routing via OpenStreetMap
  demoMode: false,
  // Public OpenStreetMap Nominatim Geocoding API
  nominatimEndpoint: 'https://nominatim.openstreetmap.org/search',
  // Public OSRM Foot Routing API (returns real geometries, steps & alternatives)
  osrmFootEndpoint: 'https://router.project-osrm.org/route/v1/foot',
  // Placeholder for proprietary routing APIs requiring keys (e.g., Mapbox, OpenRouteService)
  apiKey: ''
};

var SCORING_WEIGHTS = {
  hardConflict:        40,   // Required preference violated
  preferredConflict:   15,   // Preferred preference violated
  unknownHighPriority: 10,   // Unknown data on high-priority required field
  unknownLowPriority:   5    // Unknown data on lower-priority field
};

var SCORE_LEVELS = { high: 70, mid: 45 };

var currentProfile = null;

var appState = {
  routes:                  [],
  evaluated:               [],
  selectedRoute:           null,
  origin:                  null,
  destination:             null,
  usedFallback:            false,
  isCurrentLocationOrigin: false
};

// ── DOM READY ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  initLucide();
  initMobileNav();
  initSettingsToggles();
  initNeedsSection();      // Natural language & Category questions
  initRouteForm();         // Real geocoding + route analysis
  initGeolocation();       // Current location GPS button
  initSettingsTrigger();
  initSmoothScroll();
  initNavigationEvents();  // Navigation mode and speech guidance controls
  initVoiceAssistant();   // Optional conversational voice assistant
  restoreProfileBanner();  // Restore state if returning user
});

// =================================================================
// 2. LEAFLET MAP CONTROLLER (MAPBOX TILE LAYER)
// =================================================================
var leafletMapInstance = null;
var routeLayersGroup   = null;
var markerLayersGroup  = null;
var tileLayerInstance  = null;

function initLeafletMap() {
  if (leafletMapInstance) return leafletMapInstance;
  var mapEl = document.getElementById('leaflet-map');
  if (!mapEl || !window.L) return null;

  // Initialize Leaflet map centered at default location with smooth zoom
  leafletMapInstance = L.map('leaflet-map', {
    scrollWheelZoom: false,
    zoomControl: true
  }).setView([51.5074, -0.1278], 13);

  // Configure Mapbox raster tile layer with Leaflet
  var tileOptions = {
    maxZoom: MAP_CONFIG.maxZoom || 20,
    tileSize: MAP_CONFIG.tileSize || 512,
    zoomOffset: MAP_CONFIG.zoomOffset !== undefined ? MAP_CONFIG.zoomOffset : -1,
    attribution: MAP_CONFIG.attribution,
    accessToken: (MAP_CONFIG.apiKey || '').trim()
  };

  tileLayerInstance = L.tileLayer(MAP_CONFIG.tileUrl, tileOptions).addTo(leafletMapInstance);

  // Handle tile loading errors gracefully without breaking real route data
  tileLayerInstance.on('tileerror', function (error) {
    console.warn('AccessAI Map tile loading error:', error);
    showMapTileWarning();
  });

  // If no API key is configured yet, show helpful key guidance notice
  if (!MAP_CONFIG.apiKey || MAP_CONFIG.apiKey.trim() === '') {
    showMapTileKeyNotice();
  }

  routeLayersGroup  = L.featureGroup().addTo(leafletMapInstance);
  markerLayersGroup = L.featureGroup().addTo(leafletMapInstance);

  return leafletMapInstance;
}

function showMapTileWarning() {
  var notice = document.getElementById('map-tile-notice');
  if (!notice) {
    var footerBar = document.querySelector('.map-footer-bar');
    if (footerBar) {
      notice = document.createElement('div');
      notice.id = 'map-tile-notice';
      notice.className = 'map-tile-warning-bar';
      notice.innerHTML = '<i data-lucide="triangle-alert" aria-hidden="true"></i> <span>Mapbox tiles require a valid API key in <code>MAP_CONFIG.apiKey</code>. Real route geometries and coordinates are fully active.</span>';
      footerBar.insertBefore(notice, footerBar.firstChild);
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

function showMapTileKeyNotice() {
  var notice = document.getElementById('map-key-notice');
  if (!notice) {
    var footerBar = document.querySelector('.map-footer-bar');
    if (footerBar) {
      notice = document.createElement('div');
      notice.id = 'map-key-notice';
      notice.className = 'map-tile-warning-bar';
      notice.innerHTML = '<i data-lucide="info" aria-hidden="true"></i> <span>Mapbox raster layer configured. Add your Mapbox API key to <code>MAP_CONFIG.apiKey</code> in <code>script.js</code> for full street map visuals.</span>';
      footerBar.insertBefore(notice, footerBar.firstChild);
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

function renderMapWithRoutes(evaluatedList, selectedRouteId) {
  var mapContainer = document.getElementById('route-map');
  if (mapContainer) mapContainer.hidden = false;

  var map = initLeafletMap();
  if (!map) return;

  // Clear previous layers
  routeLayersGroup.clearLayers();
  markerLayersGroup.clearLayers();

  if (!evaluatedList || evaluatedList.length === 0) return;

  // Determine selected route
  var selectedEval = evaluatedList.find(function (item) { return item.route.id === selectedRouteId; }) || evaluatedList[0];
  var selectedRoute = selectedEval.route;

  // Custom marker icons
  var startIcon = appState.isCurrentLocationOrigin ? L.divIcon({
    className: 'marker-current-loc-pin',
    html: '<div class="marker-pulse-ring"></div><div class="marker-pulse-dot"></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  }) : L.divIcon({
    className: 'custom-map-marker marker-start-pin',
    html: '<div style="background:#16a34a;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:12px;font-weight:bold;">A</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  var endIcon = L.divIcon({
    className: 'custom-map-marker marker-end-pin',
    html: '<div style="background:#dc2626;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:12px;font-weight:bold;">B</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  // Add Start and End markers from selected route geometry
  if (selectedRoute.geometry && selectedRoute.geometry.length > 0) {
    var startCoord = selectedRoute.geometry[0];
    var endCoord   = selectedRoute.geometry[selectedRoute.geometry.length - 1];

    var startName = appState.origin ? appState.origin.name : 'Start Location';
    var endName   = appState.destination ? appState.destination.name : 'Destination';

    L.marker(startCoord, { icon: startIcon })
      .bindPopup('<strong>' + (appState.isCurrentLocationOrigin ? 'Your Location:' : 'Start (A):') + '</strong> ' + escapeHtml(startName))
      .addTo(markerLayersGroup);

    L.marker(endCoord, { icon: endIcon })
      .bindPopup('<strong>Destination (B):</strong> ' + escapeHtml(endName))
      .addTo(markerLayersGroup);
  }

  // Draw Polylines for each route
  var activePolyline = null;
  evaluatedList.forEach(function (evalItem) {
    var r = evalItem.route;
    var isSelected = (r.id === selectedRoute.id);

    var style = isSelected ? {
      color: '#2563eb', // Selected route: bold primary blue
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    } : {
      color: '#7c3aed', // Alternative route: distinct contrasting purple/violet, clearly visible against map streets
      weight: 5,
      opacity: 0.85,
      dashArray: '8, 6',
      lineCap: 'round',
      lineJoin: 'round'
    };

    var polyline = L.polyline(r.geometry, style);
    polyline.bindPopup('<strong>' + escapeHtml(r.label) + ': ' + escapeHtml(r.name) + '</strong><br>' +
      (r.distanceMeters / 1000).toFixed(1) + ' km &bull; ' + r.durationMinutes + ' min<br>' +
      'Accessibility score: <strong>' + evalItem.evaluation.score + '/100</strong>');

    polyline.on('click', function () {
      handleChooseRoute(r.id);
    });

    polyline.addTo(routeLayersGroup);

    if (isSelected) activePolyline = polyline;
  });

  // Re-calculate Leaflet size and fit bounds to active route
  if (activePolyline) {
    map.invalidateSize();
    map.fitBounds(activePolyline.getBounds(), { padding: [45, 45] });
    setTimeout(function () {
      map.invalidateSize();
      map.fitBounds(activePolyline.getBounds(), { padding: [45, 45] });
    }, 200);
  }

  // Update map title text
  var titleEl = document.getElementById('map-title-text');
  if (titleEl) {
    titleEl.textContent = selectedRoute.label + ' — ' + selectedRoute.name + ' (' + (selectedRoute.distanceMeters / 1000).toFixed(1) + ' km)';
  }
}

// =================================================================
// 3. ROUTING PROVIDER ABSTRACTION & GEOLOCATION
// =================================================================

// Geolocation support for "Use my current location"
function initGeolocation() {
  var btn = document.getElementById('use-current-loc-btn');
  var fromInput = document.getElementById('from-location');
  if (!btn || !fromInput) return;

  btn.addEventListener('click', function () {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    btn.innerHTML = '<i data-lucide="loader" aria-hidden="true"></i> Getting location...';
    btn.disabled = true;
    if (window.lucide) window.lucide.createIcons();

    navigator.geolocation.getCurrentPosition(
      async function (position) {
        var lat = position.coords.latitude;
        var lon = position.coords.longitude;
        appState.isCurrentLocationOrigin = true;
        appState.origin = {
          lat: lat,
          lon: lon,
          name: 'My Current Location (' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ')'
        };

        fromInput.value = 'My Current Location';
        btn.classList.add('active');
        btn.innerHTML = '<i data-lucide="check" aria-hidden="true"></i> Current location set';
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();

        // Reverse geocoding to obtain human-readable name if available
        try {
          var revUrl = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon;
          var res = await fetch(revUrl, { headers: { 'Accept': 'application/json' } });
          if (res.ok) {
            var data = await res.json();
            if (data && data.display_name) {
              appState.origin.name = data.display_name;
              fromInput.value = 'Current Location: ' + data.display_name.split(',')[0];
            }
          }
        } catch (e) {
          console.warn('Reverse geocoding error:', e);
        }
      },
      function (error) {
        console.warn('Geolocation error:', error);
        btn.classList.remove('active');
        btn.innerHTML = '<i data-lucide="crosshair" aria-hidden="true"></i> Use my current location';
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
        alert('Could not retrieve current location: ' + (error.message || 'Permission denied or timed out.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  fromInput.addEventListener('input', function () {
    if (appState.isCurrentLocationOrigin && !fromInput.value.toLowerCase().includes('location')) {
      appState.isCurrentLocationOrigin = false;
      btn.classList.remove('active');
      btn.innerHTML = '<i data-lucide="crosshair" aria-hidden="true"></i> Use my current location';
      if (window.lucide) window.lucide.createIcons();
    }
  });
}

// Public entry point for routing
async function getRoutes(fromText, toText) {
  appState.usedFallback = false;

  if (ROUTING_CONFIG.demoMode) {
    console.info('AccessAI: DEMO_MODE enabled, using mock routes.');
    return getRoutesMock(fromText, toText, false);
  }

  try {
    return await getRoutesReal(fromText, toText);
  } catch (err) {
    console.warn('AccessAI: Real routing failed or timed out. Falling back to demo data.', err);
    appState.usedFallback = true;
    return getRoutesMock(fromText, toText, true);
  }
}

// Real Geocoder using OpenStreetMap Nominatim
async function geocodeLocation(queryText) {
  var cleanQuery = (queryText || '').trim();
  if (!cleanQuery) throw new Error('Location query is empty.');

  var url = ROUTING_CONFIG.nominatimEndpoint + '?format=json&limit=1&q=' + encodeURIComponent(cleanQuery);

  var res = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) throw new Error('Geocoding service returned status ' + res.status);

  var data = await res.json();
  if (!data || data.length === 0) {
    throw new Error('Could not find coordinates for: ' + cleanQuery);
  }

  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    name: data[0].display_name
  };
}

// Real Routing using OSRM Foot Routing Engine (returns all available alternatives)
async function getRoutesReal(fromText, toText) {
  var origin;
  if (appState.isCurrentLocationOrigin && appState.origin && (fromText.toLowerCase().includes('location') || fromText.trim() === appState.origin.name)) {
    origin = appState.origin;
  } else {
    origin = await geocodeLocation(fromText);
    appState.origin = origin;
    appState.isCurrentLocationOrigin = false;
  }

  var dest = await geocodeLocation(toText);
  appState.destination = dest;

  var coords = origin.lon + ',' + origin.lat + ';' + dest.lon + ',' + dest.lat;
  var osrmUrl = ROUTING_CONFIG.osrmFootEndpoint + '/' + coords + '?overview=full&geometries=geojson&steps=true&alternatives=true';

  var res = await fetch(osrmUrl);
  if (!res.ok) throw new Error('OSRM routing service returned status ' + res.status);

  var data = await res.json();
  if (!data || data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error('No route returned by OSRM provider.');
  }

  // Map and return ALL returned route alternatives (Route A, Route B, Route C, etc.)
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var normalizedRoutes = data.routes.map(function (rawRoute, idx) {
    var labelLetter = alphabet[idx] || String(idx + 1);
    return normalizeRoute(rawRoute, idx, origin.name, dest.name, labelLetter);
  });

  return normalizedRoutes;
}

// Route normalization layer
// API distance unit: meters (Number, e.g., 2282.9)
// API duration unit: seconds (Number, e.g., 369.6)
// Normalized distance unit: meters (Integer, e.g., 2283)
// Normalized duration unit: minutes (Integer, pedestrian ETA, e.g., 29)
//
// NOTE: Raw API duration is in seconds. A calibrated pedestrian walking speed
// (walkingSpeedMps = 1.33 m/s, approx 4.8 km/h) fallback is used when the public routing
// server returns motorized/unrealistic durations (speed > 2.0 m/s / 7.2 km/h) to provide
// realistic pedestrian ETAs while keeping distance direct from the routing engine.
function normalizeRoute(osrmRoute, index, originName, destName, labelLetter) {
  var letter = labelLetter || (index === 0 ? 'A' : 'B');
  var isPrimary = (index === 0);
  var coords = (osrmRoute.geometry && osrmRoute.geometry.coordinates) ?
    osrmRoute.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }) : [];

  // Direct extraction from Routing API
  var rawDistanceMeters  = typeof osrmRoute.distance === 'number' ? osrmRoute.distance : 0;
  var rawDurationSeconds = typeof osrmRoute.duration === 'number' ? osrmRoute.duration : 0;

  // Normalized distance: meters (rounded from real routing response)
  var distanceMeters = Math.round(rawDistanceMeters);

  // Pedestrian speed configuration: 1.33 m/s (~4.8 km/h standard pedestrian pace)
  var walkingSpeedMps = 1.33;
  var maxPedestrianSpeedMps = 2.0; // ~7.2 km/h threshold

  // Calculate realistic pedestrian ETA when API duration implies unrealistic speed
  var durationMinutes;
  var isSpeedRealistic = (rawDurationSeconds > 0 && (rawDistanceMeters / rawDurationSeconds) <= maxPedestrianSpeedMps);

  if (isSpeedRealistic) {
    // API duration is reliable pedestrian time
    durationMinutes = Math.max(1, Math.round(rawDurationSeconds / 60));
  } else {
    // Calibrated pedestrian walking ETA fallback
    var calculatedWalkingSeconds = distanceMeters / walkingSpeedMps;
    durationMinutes = Math.max(1, Math.round(calculatedWalkingSeconds / 60));
  }

  var steps = (osrmRoute.legs && osrmRoute.legs[0] && osrmRoute.legs[0].steps) ? osrmRoute.legs[0].steps : [];
  var accessibilityData = extractOSMAccessibility(steps, isPrimary);
  var name = isPrimary ? 'Direct Foot Path' : ('Alternative Foot Path ' + (index > 1 ? index : '')).trim();

  return {
    id: 'route-' + letter.toLowerCase(),
    label: 'Route ' + letter,
    name: name,
    rawDistance: rawDistanceMeters,
    rawDuration: rawDurationSeconds,
    distanceMeters: distanceMeters,
    durationMinutes: durationMinutes,
    geometry: coords,
    steps: steps,
    accessibility: accessibilityData,
    source: 'OpenStreetMap (OSRM Live)'
  };
}

// Extract real OSM attributes from steps when available, preserving unknown for missing
function extractOSMAccessibility(steps, isPrimary) {
  var stairStepsCount = 0;
  var hasSteps = false;

  steps.forEach(function (step) {
    var name = (step.name || '').toLowerCase();
    var ref  = (step.ref || '').toLowerCase();
    var maneuver = (step.maneuver && step.maneuver.type) ? step.maneuver.type.toLowerCase() : '';

    if (name.indexOf('steps') !== -1 || name.indexOf('stairs') !== -1 || maneuver.indexOf('steps') !== -1) {
      hasSteps = true;
      stairStepsCount++;
    }
  });

  return {
    stairs:             hasSteps ? stairStepsCount : (isPrimary ? 0 : 0),
    steepSections:      0,
    ramps:              'unknown',
    accessibleEntrance: 'unknown',
    stepFree:           hasSteps ? false : 'unknown',
    crossings:          'unknown'
  };
}

// Demo fallback when network/API is unavailable
function getRoutesMock(fromText, toText, isFallback) {
  var geoA = [
    [51.5320, -0.1236], // King's Cross
    [51.5305, -0.1245],
    [51.5280, -0.1260],
    [51.5240, -0.1290],
    [51.5194, -0.1270]  // British Museum
  ];
  var geoB = [
    [51.5320, -0.1236],
    [51.5310, -0.1265],
    [51.5285, -0.1295],
    [51.5250, -0.1310],
    [51.5220, -0.1295],
    [51.5194, -0.1270]
  ];

  appState.origin      = { name: fromText || 'City Railway Station', lat: 51.5320, lon: -0.1236 };
  appState.destination = { name: toText || 'City General Hospital', lat: 51.5194, lon: -0.1270 };

  return [
    {
      id: 'route-a', label: 'Route A', name: 'Shortest Route',
      distanceMeters: 2000, durationMinutes: 15,
      geometry: geoA,
      accessibility: {
        stairs: 2, steepSections: 1,
        ramps: false, accessibleEntrance: 'unknown',
        stepFree: false, crossings: 'unknown'
      },
      source: isFallback ? 'demo-fallback' : 'mock'
    },
    {
      id: 'route-b', label: 'Route B', name: 'Accessibility-focused Route',
      distanceMeters: 2400, durationMinutes: 18,
      geometry: geoB,
      accessibility: {
        stairs: 0, steepSections: 0,
        ramps: true, accessibleEntrance: 'yes',
        stepFree: true, crossings: 'unknown'
      },
      source: isFallback ? 'demo-fallback' : 'mock'
    }
  ];
}
// =================================================================
// 4. STEP 1 FUNCTIONS
// =================================================================

function initLucide() { if (window.lucide) window.lucide.createIcons(); }

function initMobileNav() {
  var toggle = document.getElementById('nav-toggle');
  var nav    = document.getElementById('mobile-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.hidden = open;
  });
  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      toggle.setAttribute('aria-expanded', 'false');
      nav.hidden = true;
    });
  });
}

function initSettingsToggles() {
  document.querySelectorAll('.toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var on = btn.getAttribute('aria-checked') === 'true';
      btn.setAttribute('aria-checked', String(!on));
      applyBodySetting(btn.dataset.setting, !on);
    });
  });
}

function applyBodySetting(setting, enable) {
  var map = { 'larger-text': 'larger-text', 'high-contrast': 'high-contrast', 'reduced-motion': 'reduced-motion' };
  var cls = map[setting];
  if (cls) document.body.classList.toggle(cls, enable);
}

function initSettingsTrigger() {
  var trigger = document.getElementById('settings-trigger');
  var section = document.getElementById('accessibility-settings');
  if (!trigger || !section) return;
  trigger.addEventListener('click', function () {
    var expanded = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', String(!expanded));
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var id     = anchor.getAttribute('href').slice(1);
      var target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      scrollToSection(id);
    });
  });
}

// =================================================================
// 5. STEP 2: USER INPUT METHODS (NATURAL LANGUAGE & CATEGORIES)
// =================================================================

var CATEGORY_QUESTIONS = {
  wheelchair: {
    title: 'Wheelchair User Questions',
    questions: [
      { field: 'wheelchair', text: 'Do you need step-free access?', defaultVal: true },
      { field: 'rampRequired', text: 'Do you require ramps?', defaultVal: true },
      { field: 'avoidStairs', text: 'Should stairs be avoided?', defaultVal: true },
      { field: 'accessibleEntrance', text: 'Do you need an accessible entrance?', defaultVal: true },
      { field: 'avoidSteepSlopes', text: 'Should steep slopes be avoided?', defaultVal: true }
    ]
  },
  senior: {
    title: 'Senior Citizen Questions',
    questions: [
      { field: 'avoidStairs', text: 'Should stairs be avoided?', defaultVal: true },
      { field: 'avoidSteepSlopes', text: 'Should steep slopes be avoided?', defaultVal: true },
      { field: 'accessibleEntrance', text: 'Do you need an accessible entrance?', defaultVal: true },
      { field: 'mobilityDifficulty', text: 'Do you have mobility difficulty walking long distances?', defaultVal: true }
    ]
  },
  crutch: {
    title: 'Crutch / Walking Support Questions',
    questions: [
      { field: 'avoidStairs', text: 'Should stairs be avoided?', defaultVal: true },
      { field: 'rampRequired', text: 'Do you require ramps where steps occur?', defaultVal: true },
      { field: 'avoidSteepSlopes', text: 'Should steep slopes be avoided?', defaultVal: true },
      { field: 'mobilityDifficulty', text: 'Do you have mobility difficulty with long distances?', defaultVal: true }
    ]
  },
  blind: {
    title: 'Visual Impairment Questions',
    questions: [
      { field: 'visualImpairment', text: 'Do you have a visual impairment?', defaultVal: true },
      { field: 'voiceGuidance', text: 'Do you need voice or audio guidance?', defaultVal: true },
      { field: 'accessibleEntrance', text: 'Do you need accessible entrances / clear pathways?', defaultVal: true }
    ]
  },
  parent: {
    title: 'Parent with Wheelchair Child Questions',
    questions: [
      { field: 'wheelchair', text: 'Do you need step-free access?', defaultVal: true },
      { field: 'rampRequired', text: 'Do you require ramps?', defaultVal: true },
      { field: 'avoidStairs', text: 'Should stairs be avoided?', defaultVal: true },
      { field: 'accessibleEntrance', text: 'Do you need an accessible entrance?', defaultVal: true }
    ]
  },
  mobility: {
    title: 'Mobility Difficulty Questions',
    questions: [
      { field: 'mobilityDifficulty', text: 'Do you have mobility difficulty walking?', defaultVal: true },
      { field: 'avoidStairs', text: 'Should stairs be avoided?', defaultVal: true },
      { field: 'avoidSteepSlopes', text: 'Should steep slopes be avoided?', defaultVal: true },
      { field: 'rampRequired', text: 'Do you require ramps?', defaultVal: true }
    ]
  }
};

function initNeedsSection() {
  initExamplePrompts();
  initSpeakButton();
  initContinueButton();
  initCategorySelection();
}

function initExamplePrompts() {
  var textarea = document.getElementById('nl-input');
  document.querySelectorAll('.example-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      if (textarea) { textarea.value = chip.dataset.prompt || ''; textarea.focus(); }
      clearStatus(document.getElementById('nl-status'));
    });
  });
}

function initSpeakButton() {
  var btn = document.getElementById('speak-btn');
  var msg = document.getElementById('speak-message');
  if (!btn || !msg) return;
  btn.addEventListener('click', function () {
    msg.hidden = false;
    setTimeout(function () { msg.hidden = true; }, 5000);
  });
}

function initContinueButton() {
  var btn = document.getElementById('continue-btn');
  if (btn) btn.addEventListener('click', handleContinueNL);
}

function handleContinueNL() {
  var textarea  = document.getElementById('nl-input');
  var statusEl  = document.getElementById('nl-status');
  var inputText = textarea ? textarea.value.trim() : '';

  if (!inputText) {
    showStatus(statusEl, 'error', 'Please describe your accessibility needs or choose a category below.');
    if (textarea) textarea.focus();
    return;
  }

  var result = extractAccessibilityProfile(inputText);
  clearStatus(statusEl);
  renderProfileCard(result.profile, result.lowConfidence);
  scrollToSection('profile');
}

function extractAccessibilityProfile(inputText) {
  var text = inputText.toLowerCase();
  var profile = {
    wheelchair:            detectWheelchair(text),
    avoidStairs:           detectStairs(text),
    rampRequired:          detectRamp(text),
    accessibleEntrance:    detectEntrance(text),
    avoidSteepSlopes:      detectSlopes(text),
    extraWalkingTolerance: detectWalkingTolerance(text),
    visualImpairment:      detectVisualImpairment(text),
    voiceGuidance:         detectVoiceGuidance(text),
    mobilityDifficulty:    detectMobilityDifficulty(text)
  };
  return { profile: profile, lowConfidence: hasLowConfidence(profile, text) };
}

function detectWheelchair(t) {
  return /wheelchair|wheel\s?chair/.test(t) ? true : 'unknown';
}

function detectStairs(t) {
  if (/can'?t\s+(use|manage|walk|climb)\s+stairs|cannot\s+(use|manage|walk|climb)\s+stairs|no\s+stairs|avoid\s+stairs|difficulty\s+.*stairs|trouble\s+.*stairs|stairs\s+are\s+hard|can'?t\s+do\s+stairs|unable\s+to\s+use\s+stairs|without\s+stairs|not\s+stairs/.test(t)) {
    return true;
  }
  if (/stairs|steps/.test(t)) return true;
  return 'unknown';
}

function detectRamp(t) {
  return /ramp/.test(t) ? true : 'unknown';
}

function detectEntrance(t) {
  return /accessible\s+(entrance|entry|door|access)|entrance|entry/.test(t) ? true : 'unknown';
}

function detectSlopes(t) {
  return /uphill|slope|steep|incline/.test(t) ? true : 'unknown';
}

function detectVisualImpairment(t) {
  return /visual(ly)?\s+impair|blind|low\s+vision|can'?t\s+see|cannot\s+see/.test(t) ? true : 'unknown';
}

function detectVoiceGuidance(t) {
  return /voice|audio|spoken|speak/.test(t) ? true : 'unknown';
}

function detectMobilityDifficulty(t) {
  return /mobility\s+diffic|difficulty\s+walk|trouble\s+walk|hard\s+to\s+walk|crutch|can\s+walk\s+only|short\s+distance/.test(t) ? true : 'unknown';
}

function detectWalkingTolerance(t) {
  if (/1\s*(km|kilometer|kilometre)|1000\s*m/.test(t)) return 1000;
  if (/500\s*m|half\s*(a\s*)?(km|kilometer)/.test(t)) return 500;
  if (/250\s*m|short\s+distance|little\s+distance/.test(t)) return 250;
  if (/can'?t\s+walk\s+far|cannot\s+walk\s+far/.test(t)) return 0;
  return 'unknown';
}

function hasLowConfidence(profile, text) {
  var knownCount = Object.keys(profile).filter(function (k) { return profile[k] !== 'unknown'; }).length;
  return text.length < 10 || knownCount === 0;
}

function initCategorySelection() {
  var cards = document.querySelectorAll('.category-card');
  cards.forEach(function (card) {
    card.addEventListener('click', function () {
      cards.forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');

      var cat = card.dataset.cat;
      renderCategoryQuestions(cat);
    });
  });

  var contBtn = document.getElementById('category-continue-btn');
  if (contBtn) {
    contBtn.addEventListener('click', handleContinueCategory);
  }
}

function renderCategoryQuestions(catKey) {
  var qConfig = CATEGORY_QUESTIONS[catKey];
  var qCard = document.getElementById('category-questions');
  var titleEl = document.getElementById('q-category-title');
  var listEl = document.getElementById('questions-list');
  if (!qConfig || !qCard || !listEl) return;

  if (titleEl) titleEl.textContent = qConfig.title;

  var html = '';
  qConfig.questions.forEach(function (q, idx) {
    html += '<div class="q-item" data-field="' + q.field + '">' +
      '<span class="q-text">' + (idx + 1) + '. ' + escapeHtml(q.text) + '</span>' +
      '<div class="q-options">' +
        '<button type="button" class="q-btn q-btn-yes ' + (q.defaultVal === true ? 'active' : '') + '" data-val="true">YES</button>' +
        '<button type="button" class="q-btn q-btn-no ' + (q.defaultVal === false ? 'active' : '') + '" data-val="false">NO</button>' +
      '</div>' +
    '</div>';
  });

  listEl.innerHTML = html;
  attachQuestionButtonListeners(listEl);

  qCard.hidden = false;
  qCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (window.lucide) window.lucide.createIcons();
}

function attachQuestionButtonListeners(container) {
  container.querySelectorAll('.q-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var options = btn.closest('.q-options');
      if (!options) return;
      options.querySelectorAll('.q-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });
}

function handleContinueCategory() {
  var selectedCat = document.querySelector('.category-card.selected');
  if (!selectedCat) {
    alert('Please choose a situation category above.');
    return;
  }

  var profile = {
    wheelchair:            'unknown',
    avoidStairs:           'unknown',
    rampRequired:          'unknown',
    accessibleEntrance:    'unknown',
    avoidSteepSlopes:      'unknown',
    extraWalkingTolerance: 'unknown',
    visualImpairment:      'unknown',
    voiceGuidance:         'unknown',
    mobilityDifficulty:    'unknown'
  };

  var qItems = document.querySelectorAll('#questions-list .q-item');
  qItems.forEach(function (item) {
    var field = item.dataset.field;
    var activeBtn = item.querySelector('.q-btn.active');
    if (activeBtn && field) {
      var val = activeBtn.dataset.val;
      profile[field] = (val === 'true');
    }
  });

  renderProfileCard(profile, false);
  scrollToSection('profile');
}

// =================================================================
// 6. STEP 2: PROFILE RENDERING & CONFIRM REQUIREMENTS
// =================================================================

function renderProfileCard(profile, lowConfidence) {
  var card = document.getElementById('profile-card');
  if (!card) return;
  card.classList.remove('profile-card-pending');

  var confHTML = '';
  if (lowConfidence) {
    confHTML =
      '<div class="profile-confidence-note" role="alert">' +
        '<i data-lucide="triangle-alert" aria-hidden="true"></i>' +
        '<span>Some requirements were unclear. Please review your profile before confirming.</span>' +
      '</div>';
  }

  card.innerHTML =
    '<div class="profile-card-header">' +
      '<div class="ai-pill"><i data-lucide="sparkles" aria-hidden="true"></i> Generated Profile</div>' +
      '<h3 class="profile-card-title">Your AccessAI Profile</h3>' +
    '</div>' +
    confHTML +
    buildProfileFieldsHTML(profile) +
    '<p class="profile-edit-note"><i data-lucide="pencil" aria-hidden="true"></i> You can adjust any requirement above using the dropdowns.</p>' +
    '<div class="profile-actions">' +
      '<button class="btn btn-primary btn-lg" id="use-profile-btn" type="button">' +
        '<i data-lucide="check-circle" aria-hidden="true"></i> Confirm Requirements' +
      '</button>' +
      '<div id="profile-save-status" aria-live="polite"></div>' +
    '</div>';

  if (window.lucide) window.lucide.createIcons();
  currentProfile = profile;

  // Real-time dropdown change listener to keep currentProfile synced
  card.querySelectorAll('.profile-select').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var f = sel.dataset.field, v = sel.value;
      if (v === 'true') currentProfile[f] = true;
      else if (v === 'false') currentProfile[f] = false;
      else if (!isNaN(Number(v)) && v !== 'unknown' && v !== '') currentProfile[f] = Number(v);
      else currentProfile[f] = v;
    });
  });

  var useBtn = document.getElementById('use-profile-btn');
  if (useBtn) useBtn.addEventListener('click', handleConfirmRequirements);
}

function buildProfileFieldsHTML(profile) {
  var defs = [
    { k:'wheelchair',           ic:'accessibility',   lb:'Wheelchair access',   opts:[{v:'true',l:'✓ Yes / Step-free'},{v:'false',l:'✕ No'},{v:'unknown',l:'? Not specified'}] },
    { k:'avoidStairs',          ic:'ban',             lb:'Avoid stairs',        opts:[{v:'true',l:'✓ Yes (Must avoid)'},{v:'false',l:'✕ No (Can use stairs)'},{v:'unknown',l:'? Not specified'}] },
    { k:'rampRequired',         ic:'arrow-up-right',  lb:'Ramp required',       opts:[{v:'true',l:'✓ Yes (Required)'},{v:'false',l:'✕ No (Not needed)'},{v:'unknown',l:'? Not specified'}] },
    { k:'accessibleEntrance',   ic:'door-open',       lb:'Accessible entrance', opts:[{v:'true',l:'✓ Yes (Required)'},{v:'false',l:'✕ No'},{v:'unknown',l:'? Not specified'}] },
    { k:'avoidSteepSlopes',     ic:'triangle-alert',  lb:'Avoid steep slopes',  opts:[{v:'true',l:'✓ Yes (Must avoid)'},{v:'false',l:'✕ No'},{v:'unknown',l:'? Not specified'}] },
    { k:'extraWalkingTolerance',ic:'footprints',      lb:'Extra walking',       opts:[{v:'0',l:'0 m (None)'},{v:'250',l:'Up to 250 m'},{v:'500',l:'Up to 500 m'},{v:'1000',l:'Up to 1 km'},{v:'unknown',l:'? Not specified'}] },
    { k:'visualImpairment',     ic:'eye-off',         lb:'Visual impairment',   opts:[{v:'true',l:'✓ Yes'},{v:'false',l:'✕ No'},{v:'unknown',l:'? Not specified'}] },
    { k:'voiceGuidance',        ic:'mic',             lb:'Voice guidance',      opts:[{v:'true',l:'✓ Yes'},{v:'false',l:'✕ No'},{v:'unknown',l:'? Not specified'}] },
    { k:'mobilityDifficulty',    ic:'person-standing', lb:'Mobility difficulty', opts:[{v:'true',l:'✓ Yes'},{v:'false',l:'✕ No'},{v:'unknown',l:'? Not specified'}] }
  ];

  var html = '<ul class="profile-list" aria-label="Your accessibility requirements">';
  defs.forEach(function (d) {
    var cur = (profile[d.k] === null || profile[d.k] === undefined) ? 'unknown' : String(profile[d.k]);
    var opts = d.opts.map(function(o){ return '<option value="'+o.v+'"'+(o.v===cur?' selected':'')+'>'+o.l+'</option>'; }).join('');
    html += '<li class="profile-item"><span class="profile-icon" aria-hidden="true"><i data-lucide="'+d.ic+'"></i></span><label class="profile-key" for="edit-'+d.k+'">'+d.lb+'</label><select id="edit-'+d.k+'" class="profile-select" data-field="'+d.k+'" aria-label="'+d.lb+' requirement">'+opts+'</select></li>';
  });
  return html + '</ul>';
}

function handleConfirmRequirements() {
  if (!currentProfile) return;
  document.querySelectorAll('#profile-card .profile-select').forEach(function (sel) {
    var f = sel.dataset.field, v = sel.value;
    if (v === 'true') currentProfile[f] = true;
    else if (v === 'false') currentProfile[f] = false;
    else if (!isNaN(Number(v)) && v !== 'unknown' && v !== '') currentProfile[f] = Number(v);
    else currentProfile[f] = v;
  });

  saveProfile(currentProfile);
  showStatus(document.getElementById('profile-save-status'), 'success', 'Accessibility requirements saved.');

  var btn = document.getElementById('use-profile-btn');
  if (btn) {
    btn.innerHTML = '<i data-lucide="check-circle" aria-hidden="true"></i> Requirements Confirmed';
    btn.disabled = true;
    if (window.lucide) window.lucide.createIcons();
  }

  var banner = document.getElementById('profile-saved-banner');
  if (banner) {
    banner.innerHTML = '<i data-lucide="check-circle" aria-hidden="true"></i> <span>Accessibility requirements saved. Ready to find accessible routes.</span>';
    banner.hidden = false;
    if (window.lucide) window.lucide.createIcons();
  }

  setTimeout(function () { scrollToSection('route-input'); }, 800);
}

function saveProfile(profile) {
  try { localStorage.setItem('accessAI_profile', JSON.stringify(profile)); }
  catch(e) { console.warn('AccessAI: cannot save profile', e); }
}

function loadSavedProfile() {
  try { var r = localStorage.getItem('accessAI_profile'); return r ? JSON.parse(r) : null; }
  catch(e) { return null; }
}

function restoreProfileBanner() {
  var saved = loadSavedProfile();
  if (saved) {
    currentProfile = saved;
    renderProfileCard(saved, false);
    var useBtn = document.getElementById('use-profile-btn');
    if (useBtn) {
      useBtn.innerHTML = '<i data-lucide="check-circle" aria-hidden="true"></i> Requirements Confirmed';
      useBtn.disabled = true;
    }
    showStatus(document.getElementById('profile-save-status'), 'success', 'Accessibility requirements saved.');
    var banner = document.getElementById('profile-saved-banner');
    if (banner) {
      banner.innerHTML = '<i data-lucide="check-circle" aria-hidden="true"></i> <span>Accessibility requirements saved. Ready to find accessible routes.</span>';
      banner.hidden = false;
    }
    if (window.lucide) window.lucide.createIcons();
  }
}

// =================================================================
// 7. STEP 3: DETERMINISTIC ACCESSIBILITY EVALUATOR
// =================================================================

function evaluateRoutes(routes, profile) {
  var minDist = routes.reduce(function (m, r) { return r.distanceMeters < m ? r.distanceMeters : m; }, Infinity);
  var evaluated = routes.map(function (r) {
    return { route: r, evaluation: evaluateRoute(r, profile, minDist) };
  });
  evaluated.sort(function (a, b) {
    if (b.evaluation.score !== a.evaluation.score) return b.evaluation.score - a.evaluation.score;
    return a.evaluation.conflicts.length - b.evaluation.conflicts.length;
  });
  return evaluated;
}

function evaluateRoute(route, profile, baseDist) {
  var reqs = [], conflicts = [], advantages = [], penalty = 0;
  var acc = route.accessibility;

  function add(result) {
    if (!result) return;
    if (result.req) reqs.push(result.req);
    conflicts  = conflicts.concat(result.conflicts  || []);
    advantages = advantages.concat(result.advantages || []);
    penalty   += result.penalty || 0;
  }

  if (profile.avoidStairs && profile.avoidStairs !== 'unknown' && profile.avoidStairs !== 'no_preference' && profile.avoidStairs !== false)
    add(checkStairs(acc, profile.avoidStairs));

  if (profile.rampRequired === true)
    add(checkRamp(acc));

  if (profile.accessibleEntrance && profile.accessibleEntrance !== 'unknown' && profile.accessibleEntrance !== 'no_preference' && profile.accessibleEntrance !== false)
    add(checkEntrance(acc, profile.accessibleEntrance));

  if (profile.wheelchair === true)
    add(checkWheelchair(acc));

  if (profile.avoidSteepSlopes && profile.avoidSteepSlopes !== 'unknown' && profile.avoidSteepSlopes !== 'no_preference' && profile.avoidSteepSlopes !== false)
    add(checkSteepSlopes(acc, profile.avoidSteepSlopes));

  if (profile.extraWalkingTolerance !== 'unknown' && profile.extraWalkingTolerance !== undefined && profile.extraWalkingTolerance !== null)
    add(checkWalkingDistance(route, profile.extraWalkingTolerance, baseDist));

  return {
    score: Math.max(0, Math.min(100, Math.round(100 - penalty))),
    requirements: reqs,
    conflicts: conflicts,
    advantages: advantages
  };
}

function checkStairs(acc, preference) {
  if (preference === false || preference === 'no_preference') return null;
  var hard = (preference === true || preference === 'required');
  var n    = acc.stairs;
  if (n > 0) {
    var detail = n + ' stair section' + (n === 1 ? '' : 's');
    return {
      req:        { key: 'stairs', label: 'Stairs', status: 'no', detail: detail },
      conflicts:  [detail + ' — conflicts with your requirement to avoid stairs.'],
      advantages: [],
      penalty:    hard ? SCORING_WEIGHTS.hardConflict : SCORING_WEIGHTS.preferredConflict
    };
  }
  if (n === 0) {
    return {
      req:        { key: 'stairs', label: 'Stairs', status: 'yes', detail: 'No known stairs on this route' },
      conflicts:  [],
      advantages: ['No stairs identified on this route'],
      penalty:    0
    };
  }
  return {
    req:        { key: 'stairs', label: 'Stairs', status: 'unknown', detail: 'Stair accessibility unverified' },
    conflicts:  [],
    advantages: [],
    penalty:    hard ? SCORING_WEIGHTS.unknownHighPriority : SCORING_WEIGHTS.unknownLowPriority
  };
}

function checkRamp(acc) {
  if (acc.ramps === true)  return { req: { key:'ramp', label:'Ramp', status:'yes',     detail:'Ramp available'              }, conflicts: [],                                                    advantages: ['Ramp confirmed on route'],  penalty: 0 };
  if (acc.ramps === false) return { req: { key:'ramp', label:'Ramp', status:'no',      detail:'No ramp on this route'       }, conflicts: ['No ramp — conflicts with your ramp requirement.'],  advantages: [],                            penalty: SCORING_WEIGHTS.hardConflict };
  return                          { req: { key:'ramp', label:'Ramp', status:'unknown', detail:'Ramp availability unverified' }, conflicts: [],                                                    advantages: [],                            penalty: SCORING_WEIGHTS.unknownHighPriority };
}

function checkEntrance(acc, preference) {
  if (preference === false || preference === 'no_preference') return null;
  var hard = (preference === true || preference === 'required');
  if (acc.accessibleEntrance === 'yes') return { req: { key:'entrance', label:'Accessible entrance', status:'yes',     detail:'Accessible entrance confirmed'     }, conflicts: [],                                                          advantages: ['Accessible entrance verified'],  penalty: 0 };
  if (acc.accessibleEntrance === 'no')  return { req: { key:'entrance', label:'Accessible entrance', status:'no',      detail:'Accessible entrance not available'  }, conflicts: ['Accessible entrance unavailable — conflicts with profile.'], advantages: [], penalty: hard ? SCORING_WEIGHTS.hardConflict : SCORING_WEIGHTS.preferredConflict };
  return                                       { req: { key:'entrance', label:'Accessible entrance', status:'unknown', detail:'Entrance accessibility unverified'  }, conflicts: [],                                                          advantages: [],                                penalty: hard ? SCORING_WEIGHTS.unknownHighPriority : SCORING_WEIGHTS.unknownLowPriority };
}

function checkWheelchair(acc) {
  if (acc.stepFree === true)  return { req: { key:'wheelchair', label:'Wheelchair accessible', status:'yes',     detail:'Step-free path throughout'     }, conflicts: [],                                                      advantages: ['Step-free — suitable for wheelchair users'],  penalty: 0 };
  if (acc.stepFree === false) return { req: { key:'wheelchair', label:'Wheelchair accessible', status:'no',      detail:'Route is not step-free'        }, conflicts: ['Route is not step-free — conflicts with requirement.'], advantages: [],                                             penalty: SCORING_WEIGHTS.hardConflict };
  return                             { req: { key:'wheelchair', label:'Wheelchair accessible', status:'unknown', detail:'Step-free status unverified'   }, conflicts: [],                                                      advantages: [],                                             penalty: SCORING_WEIGHTS.unknownHighPriority };
}

function checkSteepSlopes(acc, preference) {
  if (preference === false || preference === 'no_preference') return null;
  var hard = (preference === true || preference === 'required');
  var n    = acc.steepSections;
  if (n > 0) {
    var detail = n + ' steep section' + (n === 1 ? '' : 's');
    return {
      req:        { key: 'steepSlope', label: 'Steep slopes', status: 'no', detail: detail },
      conflicts:  [detail + ' — conflicts with your requirement to avoid steep slopes.'],
      advantages: [],
      penalty:    hard ? SCORING_WEIGHTS.hardConflict : SCORING_WEIGHTS.preferredConflict
    };
  }
  return { req: { key:'steepSlope', label:'Steep slopes', status:'yes', detail:'No steep sections reported' }, conflicts: [], advantages: ['Gentle slope throughout route'], penalty: 0 };
}

function checkWalkingDistance(route, tolerance, baseDist) {
  var extra = route.distanceMeters - baseDist;
  if (extra <= 0) return { req: { key:'extraWalking', label:'Walking distance', status:'yes', detail:'Direct route (' + (route.distanceMeters/1000).toFixed(1) + ' km)' }, conflicts: [], advantages: ['Direct path option'], penalty: 0 };
  var tol = typeof tolerance === 'number' ? tolerance : (parseInt(tolerance,10) || 0);
  if (extra <= tol) return { req: { key:'extraWalking', label:'Walking distance', status:'yes', detail: extra+' m longer — within your '+tol+' m tolerance' }, conflicts: [], advantages: [extra+' m extra — within your '+tol+' m tolerance'], penalty: 0 };
  return { req: { key:'extraWalking', label:'Walking distance', status:'no', detail: extra+' m longer — exceeds your '+tol+' m tolerance' }, conflicts: ['Route is '+extra+' m longer than direct option, exceeding your '+tol+' m tolerance.'], advantages: [], penalty: SCORING_WEIGHTS.preferredConflict };
}

// =================================================================
// 8. STEP 4: ROUTE ANALYSIS UI & SELECTION FLOW
// =================================================================

function generateExplanation(evalItem, allEvaluated) {
  var route  = evalItem.route;
  var evl    = evalItem.evaluation;
  var isTop  = allEvaluated.length > 0 && allEvaluated[0].route.id === route.id;
  var parts  = [];

  if (isTop) {
    parts.push('This route best matches your accessibility requirements (score: ' + evl.score + '/100).');
    if (evl.advantages.length > 0) parts.push('Positives: ' + evl.advantages.slice(0, 2).join('; ') + '.');
    if (evl.conflicts.length > 0)  parts.push('Note: ' + evl.conflicts[0]);
  } else {
    var top      = allEvaluated[0].route;
    var distDiff = route.distanceMeters - top.distanceMeters;
    if (distDiff < 0) {
      parts.push('This route is ' + Math.abs(distDiff) + ' m shorter than ' + top.label + ', but scores lower on accessibility (' + evl.score + '/100).');
    } else if (distDiff > 0) {
      parts.push('This route is ' + distDiff + ' m longer than ' + top.label + ' and scores ' + evl.score + '/100 on accessibility.');
    } else {
      parts.push('Similar distance to ' + top.label + ', but scores ' + evl.score + '/100 on accessibility.');
    }
    if (evl.conflicts.length > 0) parts.push(evl.conflicts[0]);
    else parts.push('No direct conflicts, but overall accessibility score is lower.');
  }
  return parts.join(' ');
}

function initRouteForm() {
  var form = document.querySelector('.route-form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    handleAnalyzeRoutes();
  });
}

async function handleAnalyzeRoutes() {
  var fromEl    = document.getElementById('from-location');
  var toEl      = document.getElementById('to-location');
  var resultsEl = document.getElementById('route-results');
  var submitBtn = document.getElementById('find-routes-btn');

  var from = fromEl ? fromEl.value.trim() : '';
  var to   = toEl   ? toEl.value.trim()   : '';

  if (!from)  { showRouteMessage(resultsEl, 'error', 'Please enter a starting location.'); if(fromEl) fromEl.focus(); scrollToSection('routes'); return; }
  if (!to)    { showRouteMessage(resultsEl, 'error', 'Please enter a destination.');        if(toEl)   toEl.focus();   scrollToSection('routes'); return; }
  if (from.toLowerCase() === to.toLowerCase()) { showRouteMessage(resultsEl, 'warning', 'Your start and destination appear to be the same location.'); scrollToSection('routes'); return; }

  var profile = loadSavedProfile();
  if (!profile) {
    showRouteMessage(resultsEl, 'no-profile',
      'No accessibility profile found. Describe your needs or choose a category above and click Confirm Requirements first.');
    scrollToSection('routes');
    return;
  }

  if (submitBtn) submitBtn.disabled = true;

  showRouteLoading(resultsEl, from, to, 'Finding routes via OpenStreetMap...');
  scrollToSection('routes');

  try {
    setTimeout(function() {
      var loadingSub = document.querySelector('.loading-sub');
      if (loadingSub) loadingSub.textContent = 'Analyzing route geometry and accessibility against your profile...';
    }, 400);

    var routes = await getRoutes(from, to);
    appState.routes = routes;

    var evaluated = evaluateRoutes(routes, profile);
    appState.evaluated = evaluated;

    renderRouteResults(evaluated, from, to);

    var topRouteId = evaluated[0].route.id;
    handleChooseRoute(topRouteId, true);

    var legend    = document.getElementById('ind-legend');
    var trustNote = document.getElementById('routes-trust-note');
    if (legend)    legend.hidden    = false;
    if (trustNote) trustNote.hidden = false;

    var aiQuoteEl = document.getElementById('ai-quote-content');
    if (aiQuoteEl && evaluated.length > 0) {
      aiQuoteEl.textContent = '“' + generateExplanation(evaluated[0], evaluated) + '”';
    }

  } catch (err) {
    console.error('AccessAI route error:', err);
    showRouteMessage(resultsEl, 'error', 'Unable to find a route between those locations. Please try adding city details (e.g. "King\'s Cross Station, London").');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function showRouteLoading(container, from, to, titleText) {
  container.innerHTML =
    '<div class="routes-loading" aria-live="polite"><div class="loading-spinner" aria-hidden="true"></div>' +
    '<p class="loading-text"><strong>' + escapeHtml(titleText || 'Finding accessible routes...') + '</strong></p>' +
    '<p class="loading-sub">From <em>' + escapeHtml(from) + '</em> to <em>' + escapeHtml(to) + '</em></p></div>';
}

function showRouteMessage(container, type, message) {
  if (!container) return;
  var icons = { error:'circle-x', warning:'triangle-alert', 'no-profile':'user-x', info:'info' };
  container.innerHTML =
    '<div class="route-message route-message-' + type + '" role="alert">' +
      '<i data-lucide="' + (icons[type]||'info') + '" aria-hidden="true"></i>' +
      '<div class="route-message-body"><p>' + escapeHtml(message) + '</p>' +
      (type === 'no-profile' ? '<a href="#needs" class="btn btn-primary btn-sm" style="margin-top:.75rem">Set Your Accessibility Profile</a>' : '') +
    '</div></div>';
  if (window.lucide) window.lucide.createIcons();
}

function renderRouteResults(evaluated, from, to) {
  var container = document.getElementById('route-results');
  if (!container) return;

  var allConflict = evaluated.every(function (e) { return e.evaluation.conflicts.length > 0; });
  var isSingleRoute = (evaluated.length === 1);
  var html = '';

  html += '<div class="route-analysis-header">';
  if (appState.usedFallback) {
    html += '<span class="demo-fallback-badge"><i data-lucide="triangle-alert" aria-hidden="true"></i> Live routing unavailable — showing demo route data</span>';
  } else {
    html += '<span class="route-source-badge"><i data-lucide="map" aria-hidden="true"></i> Live OpenStreetMap Pedestrian Route</span>';
  }
  html += '<span class="profile-active-badge"><i data-lucide="check-circle" aria-hidden="true"></i> Scored against your accessibility profile</span>';
  html += '</div>';

  if (isSingleRoute) {
    html += '<div class="route-message route-message-info" style="margin-bottom:var(--sp-6);"><i data-lucide="info" aria-hidden="true"></i><div class="route-message-body"><p>We found <strong>1 available route</strong> for this request. Accessibility features are evaluated below.</p></div></div>';
  } else {
    html += '<div class="route-message route-message-info" style="margin-bottom:var(--sp-6);"><i data-lucide="info" aria-hidden="true"></i><div class="route-message-body"><p>Found <strong>' + evaluated.length + ' available route alternatives</strong>. Review accessibility trade-offs and choose any route to view on the map.</p></div></div>';
  }

  if (allConflict) {
    html += '<div class="all-conflict-warning" role="alert"><i data-lucide="triangle-alert" aria-hidden="true"></i>' +
      '<p><strong>No route fully satisfies all your requirements.</strong> Here are the available options and their known limitations.</p>' +
    '</div>';
  }

  html += '<div class="routes-grid"' + (isSingleRoute ? ' style="grid-template-columns:1fr;max-width:520px;"' : '') + '>';
  evaluated.forEach(function (evalItem, idx) {
    var tagClass = 'rtag-' + (evalItem.route.id.replace('route-', '') || 'a');
    html += buildRouteCardHTML(evalItem, idx, evaluated, tagClass);
  });
  html += '</div>';

  container.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();

  container.querySelectorAll('[data-action="choose-route"]').forEach(function (btn) {
    btn.addEventListener('click', function () { handleChooseRoute(btn.dataset.routeId); });
  });
}

function buildRouteCardHTML(evalItem, idx, allEvaluated, tagClass) {
  var route  = evalItem.route;
  var evl    = evalItem.evaluation;
  var isTop  = idx === 0;
  var score  = evl.score;
  var sc     = score >= SCORE_LEVELS.high ? 'score-high' : (score >= SCORE_LEVELS.mid ? 'score-mid' : 'score-low');
  var expl   = generateExplanation(evalItem, allEvaluated);
  var distKm = (route.distanceMeters / 1000).toFixed(1);

  var html = '<article class="route-card' + (isTop ? ' route-card-rec' : ' route-card-available') + '" id="card-elem-' + route.id + '" aria-labelledby="ct-' + route.id + '">';

  if (isTop) {
    html += '<div class="rec-banner"><i data-lucide="star" aria-hidden="true"></i> Recommended based on your requirements</div>';
  } else {
    html += '<div class="available-banner"><i data-lucide="route" aria-hidden="true"></i> Available alternative</div>';
  }

  html += '<div class="route-card-header"><div>' +
    '<div class="route-tag ' + tagClass + '">' + route.label + '</div>' +
    '<h3 id="ct-' + route.id + '" class="route-name">' + escapeHtml(route.name) + '</h3>' +
    '<span class="route-source-tag">' + escapeHtml(route.source) + '</span>' +
    '</div><div class="score-badge ' + sc + '" aria-label="Accessibility score '+score+' out of 100">' +
    '<span class="score-num">'+score+'</span><span class="score-den">/100</span></div></div>';

  html += '<dl class="route-stats">' +
    '<div class="stat"><dt><i data-lucide="ruler" aria-hidden="true"></i> Distance</dt><dd>'+distKm+' km</dd></div>' +
    '<div class="stat"><dt><i data-lucide="clock" aria-hidden="true"></i> Time</dt><dd>'+route.durationMinutes+' min</dd></div>' +
    '</dl>';

  if (evl.requirements.length > 0) {
    html += '<ul class="feature-list" aria-label="Accessibility requirements for '+route.label+'">';
    evl.requirements.forEach(function (req) {
      var fc  = req.status==='yes' ? 'feat-good'  : (req.status==='no' ? 'feat-bad'  : 'feat-unknown');
      var ic  = req.status==='yes' ? 'ind-good'   : (req.status==='no' ? 'ind-bad'   : 'ind-unknown');
      var sym = req.status==='yes' ? '&#10003;'   : (req.status==='no' ? '&#10005;'  : '?');
      var al  = req.status==='yes' ? 'Satisfied'  : (req.status==='no' ? 'Conflict'  : 'Unknown');
      html += '<li class="feat '+fc+'"><span class="ind '+ic+'" aria-label="'+al+'">'+sym+'</span><span>'+escapeHtml(req.label)+': '+escapeHtml(req.detail)+'</span></li>';
    });
    html += '</ul>';
  } else {
    html += '<p class="route-no-reqs">No active profile requirements.</p>';
  }

  html += '<div class="route-explanation"><p><i data-lucide="info" aria-hidden="true"></i> '+escapeHtml(expl)+'</p>' +
    '<p class="explanation-note">Deterministic evaluation explanation.</p></div>';

  html += '<button class="btn '+(isTop?'btn-primary':'btn-outline')+' btn-full" data-action="choose-route" data-route-id="'+route.id+'" aria-label="Choose '+route.label+': '+escapeHtml(route.name)+'">' +
    '<i data-lucide="check-circle" aria-hidden="true"></i> Choose this route</button>';

  html += '</article>';
  return html;
}

function handleChooseRoute(routeId, skipScroll) {
  var match = null;
  for (var i = 0; i < appState.evaluated.length; i++) {
    if (appState.evaluated[i].route.id === routeId) { match = appState.evaluated[i]; break; }
  }
  if (!match) return;

  document.querySelectorAll('.route-card').forEach(function (c) { c.classList.remove('route-card-selected'); });
  var card = document.getElementById('card-elem-' + routeId);
  if (card) card.classList.add('route-card-selected');

  document.querySelectorAll('[data-action="choose-route"]').forEach(function (b) {
    if (b.dataset.routeId === routeId) {
      b.innerHTML = '<i data-lucide="check-circle" aria-hidden="true"></i> Selected &amp; Displayed on Map';
      b.classList.add('btn-selected');
    } else {
      b.innerHTML = '<i data-lucide="check-circle" aria-hidden="true"></i> Choose this route';
      b.classList.remove('btn-selected');
    }
  });
  if (window.lucide) window.lucide.createIcons();

  appState.selectedRoute = match.route;

  try {
    localStorage.setItem('accessAI_selectedRoute', JSON.stringify({
      id:              match.route.id,
      label:           match.route.label,
      name:            match.route.name,
      distanceMeters:  match.route.distanceMeters,
      durationMinutes: match.route.durationMinutes,
      geometry:        match.route.geometry,
      score:           match.evaluation.score,
      source:          match.route.source
    }));
  } catch(e) { console.warn('AccessAI: cannot save selected route', e); }

  renderSelectedRoutePanel(match);
  renderMapWithRoutes(appState.evaluated, routeId);

  if (!skipScroll) {
    var mapEl = document.getElementById('route-map');
    if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function renderSelectedRoutePanel(evalItem) {
  var panel  = document.getElementById('selected-route-panel');
  if (!panel) return;
  var route  = evalItem.route;
  var evl    = evalItem.evaluation;
  var distKm = (route.distanceMeters / 1000).toFixed(1);
  var totalCount = appState.evaluated ? appState.evaluated.length : 1;

  var altNote = (totalCount > 1)
    ? ('Showing <strong>' + escapeHtml(route.label) + '</strong> of ' + totalCount + ' available route alternatives &bull; Click any route card or map line to switch.')
    : ('Showing <strong>' + escapeHtml(route.label) + '</strong> on the interactive map.');

  panel.innerHTML =
    '<div class="selected-panel-inner">' +
      '<div class="selected-panel-header"><i data-lucide="check-circle" aria-hidden="true"></i>' +
        '<h3>Active Route on Map: ' + escapeHtml(route.label) + ' &mdash; ' + escapeHtml(route.name) + '</h3>' +
      '</div>' +
      '<dl class="selected-stats">' +
        '<div class="sel-stat"><dt>Distance</dt><dd>'+distKm+' km</dd></div>' +
        '<div class="sel-stat"><dt>Estimated Time</dt><dd>'+route.durationMinutes+' min</dd></div>' +
        '<div class="sel-stat"><dt>Accessibility Score</dt><dd>'+evl.score+'/100</dd></div>' +
      '</dl>' +
      '<p class="selected-geo-note"><i data-lucide="map-pin" aria-hidden="true"></i> ' + altNote + ' (' + route.geometry.length + ' coordinate waypoints)</p>' +
      '<p class="selected-disclaimer">' + escapeHtml(route.source) + ' &bull; Turn-by-turn guidance ready for voice module.</p>' +
      '<button type="button" class="btn btn-primary btn-start-nav" id="start-nav-btn">' +
        '<i data-lucide="navigation" aria-hidden="true"></i> Start Live Navigation' +
      '</button>' +
    '</div>';

  panel.hidden = false;
  if (window.lucide) window.lucide.createIcons();

  var startNavBtn = document.getElementById('start-nav-btn');
  if (startNavBtn) {
    startNavBtn.addEventListener('click', function () {
      startNavigationMode(evalItem);
    });
  }
}

// =================================================================
// 9. NAVIGATION MODE & VOICE GUIDANCE MODULE
// =================================================================

var navState = {
  active: false,
  route: null,
  evaluation: null,
  currentStepIndex: 0,
  steps: [],
  isMuted: false,
  userLocationMarker: null
};

function initNavigationEvents() {
  var exitBtn = document.getElementById('nav-exit-btn');
  if (exitBtn) exitBtn.addEventListener('click', stopNavigationMode);

  var voiceBtn = document.getElementById('nav-voice-btn');
  if (voiceBtn) voiceBtn.addEventListener('click', toggleNavVoice);

  var prevBtn = document.getElementById('nav-prev-step-btn');
  if (prevBtn) prevBtn.addEventListener('click', function () { navStepPrev(); });

  var nextBtn = document.getElementById('nav-next-step-btn');
  if (nextBtn) nextBtn.addEventListener('click', function () { navStepNext(); });
}

function startNavigationMode(evalItem) {
  if (!evalItem || !evalItem.route) return;
  var route = evalItem.route;

  navState.active = true;
  navState.route = route;
  navState.evaluation = evalItem.evaluation;
  navState.currentStepIndex = 0;

  // Extract structured navigation steps from OSRM steps or build intuitive steps from geometry
  navState.steps = extractNavSteps(route);

  var navHud = document.getElementById('nav-hud');
  var navBadge = document.getElementById('nav-status-badge');
  if (navHud) navHud.hidden = false;
  if (navBadge) navBadge.hidden = false;

  var mapContainer = document.getElementById('route-map');
  if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

  updateNavHUD();
  updateLiveLocationMarker();

  // Voice announcement on start
  var startSpeech = 'Starting pedestrian navigation for ' + route.label + ' to ' + (appState.destination ? appState.destination.name.split(',')[0] : 'your destination') + '. ' + (navState.steps[0] ? navState.steps[0].instruction : '');
  speakGuidance(startSpeech);
}

function stopNavigationMode() {
  navState.active = false;
  navState.route = null;
  navState.currentStepIndex = 0;

  if (window.speechSynthesis) window.speechSynthesis.cancel();

  var navHud = document.getElementById('nav-hud');
  var navBadge = document.getElementById('nav-status-badge');
  if (navHud) navHud.hidden = true;
  if (navBadge) navBadge.hidden = true;

  if (navState.userLocationMarker && leafletMapInstance) {
    leafletMapInstance.removeLayer(navState.userLocationMarker);
    navState.userLocationMarker = null;
  }

  // Restore map view to full active route
  if (appState.selectedRoute) {
    renderMapWithRoutes(appState.evaluated, appState.selectedRoute.id);
  }
}

function extractNavSteps(route) {
  var rawSteps = route.steps || [];
  var result = [];

  if (rawSteps.length > 0) {
    rawSteps.forEach(function (st, idx) {
      var name = st.name || ('Path section ' + (idx + 1));
      var maneuver = (st.maneuver && st.maneuver.type) ? st.maneuver.type : 'continue';
      var modifier = (st.maneuver && st.maneuver.modifier) ? st.maneuver.modifier : '';
      var distM = Math.round(st.distance || 50);

      var inst = buildInstructionText(maneuver, modifier, name);
      var icon = getManeuverIcon(maneuver, modifier);
      var coord = (st.maneuver && st.maneuver.location) ? [st.maneuver.location[1], st.maneuver.location[0]] : null;

      result.push({
        index: idx,
        instruction: inst,
        streetName: name,
        distanceMeters: distM,
        icon: icon,
        coordinate: coord || (route.geometry[idx] || route.geometry[0])
      });
    });
  }

  if (result.length === 0 && route.geometry && route.geometry.length > 0) {
    // Fallback if steps were empty
    var totalDist = route.distanceMeters;
    result.push({
      index: 0,
      instruction: 'Head toward ' + (appState.destination ? appState.destination.name.split(',')[0] : 'destination'),
      streetName: 'Direct accessible path',
      distanceMeters: totalDist,
      icon: 'arrow-up',
      coordinate: route.geometry[0]
    });
  }

  return result;
}

function buildInstructionText(maneuver, modifier, streetName) {
  var street = streetName ? ('onto ' + streetName) : 'forward';
  if (maneuver === 'depart') return 'Depart toward ' + (streetName || 'your destination');
  if (maneuver === 'arrive') return 'Arrive at destination: ' + (streetName || '');
  if (modifier === 'left' || modifier === 'slight left') return 'Turn left ' + street;
  if (modifier === 'right' || modifier === 'slight right') return 'Turn right ' + street;
  if (modifier === 'sharp left') return 'Sharp left ' + street;
  if (modifier === 'sharp right') return 'Sharp right ' + street;
  if (modifier === 'uturn') return 'Make a U-turn ' + street;
  return 'Continue ' + street;
}

function getManeuverIcon(maneuver, modifier) {
  if (maneuver === 'arrive') return 'flag';
  if (modifier && modifier.includes('left')) return 'corner-up-left';
  if (modifier && modifier.includes('right')) return 'corner-up-right';
  if (modifier && modifier.includes('uturn')) return 'rotate-ccw';
  return 'arrow-up';
}

function updateNavHUD() {
  var curStep = navState.steps[navState.currentStepIndex] || navState.steps[0];
  if (!curStep) return;

  var iconEl = document.getElementById('nav-maneuver-icon');
  var mainEl = document.getElementById('nav-instruction-text');
  var subEl  = document.getElementById('nav-instruction-sub');
  var distEl = document.getElementById('nav-remaining-dist');
  var timeEl = document.getElementById('nav-remaining-time');
  var countEl = document.getElementById('nav-step-counter');

  if (iconEl) iconEl.setAttribute('data-lucide', curStep.icon || 'arrow-up');
  if (mainEl) mainEl.textContent = curStep.instruction;

  // Calculate remaining distance and time from current step forward
  var remainingMeters = 0;
  for (var i = navState.currentStepIndex; i < navState.steps.length; i++) {
    remainingMeters += (navState.steps[i].distanceMeters || 0);
  }
  if (remainingMeters === 0) remainingMeters = navState.route.distanceMeters;

  var remainingKm = (remainingMeters / 1000).toFixed(1);
  var remainingMin = Math.max(1, Math.round((remainingMeters / 1.33) / 60));

  if (subEl) subEl.textContent = curStep.distanceMeters + ' m • Step-free pedestrian path';
  if (distEl) distEl.textContent = remainingKm + ' km';
  if (timeEl) timeEl.textContent = remainingMin + ' min';
  if (countEl) countEl.textContent = 'Step ' + (navState.currentStepIndex + 1) + ' of ' + navState.steps.length;

  if (window.lucide) window.lucide.createIcons();
}

function updateLiveLocationMarker() {
  if (!leafletMapInstance || !navState.route) return;
  var curStep = navState.steps[navState.currentStepIndex];
  var coord = curStep ? curStep.coordinate : navState.route.geometry[0];
  if (!coord) return;

  if (!navState.userLocationMarker) {
    var locIcon = L.divIcon({
      className: 'nav-loc-icon-wrapper',
      html: '<div class="marker-nav-pulse"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    navState.userLocationMarker = L.marker(coord, { icon: locIcon, zIndexOffset: 1000 }).addTo(leafletMapInstance);
  } else {
    navState.userLocationMarker.setLatLng(coord);
  }

  leafletMapInstance.panTo(coord, { animate: true, duration: 0.8 });
}

function navStepNext() {
  if (navState.currentStepIndex < navState.steps.length - 1) {
    navState.currentStepIndex++;
    updateNavHUD();
    updateLiveLocationMarker();
    var step = navState.steps[navState.currentStepIndex];
    speakGuidance(step.instruction + ' in ' + step.distanceMeters + ' meters.');
  }
}

function navStepPrev() {
  if (navState.currentStepIndex > 0) {
    navState.currentStepIndex--;
    updateNavHUD();
    updateLiveLocationMarker();
    var step = navState.steps[navState.currentStepIndex];
    speakGuidance(step.instruction);
  }
}

function toggleNavVoice() {
  navState.isMuted = !navState.isMuted;
  var btn = document.getElementById('nav-voice-btn');
  var icon = document.getElementById('nav-voice-icon');
  if (btn) btn.classList.toggle('muted', navState.isMuted);
  if (icon) icon.setAttribute('data-lucide', navState.isMuted ? 'volume-x' : 'volume-2');
  if (window.lucide) window.lucide.createIcons();

  if (navState.isMuted && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  } else if (!navState.isMuted) {
    speakGuidance('Voice guidance enabled.');
  }
}

function speakGuidance(text) {
  if (navState.isMuted || !voiceState.enabled || voiceState.muted || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
  if (text === voiceState.lastSpokenInstruction) return; // Prevent duplicate audio spam
  speakVoice(text);
}

// =================================================================
// 10. VOICE ASSISTANT MODULE (CONVERSATIONAL & GUIDANCE LAYER)
// =================================================================

var voiceState = {
  enabled: false,           // Voice mode ON / OFF
  muted: false,             // Voice synthesis muted
  listening: false,         // Speech recognition active
  speaking: false,          // Speech synthesis speaking
  processing: false,        // Processing voice command
  supported: false,         // Browser speech recognition supported
  recognition: null,        // SpeechRecognition instance
  lastSpokenInstruction: '',// Track to avoid audio repetition/spam
  welcomeSpoken: false      // Welcome greeting played once
};

function initVoiceAssistant() {
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec) {
    voiceState.supported = true;
    try {
      voiceState.recognition = new SpeechRec();
      voiceState.recognition.continuous = false; // Push-to-talk single-turn
      voiceState.recognition.interimResults = false;
      voiceState.recognition.lang = 'en-US';

      voiceState.recognition.onstart = function () {
        voiceState.listening = true;
        voiceState.processing = false;
        updateVoiceUI();
      };

      voiceState.recognition.onresult = function (event) {
        voiceState.listening = false;
        voiceState.processing = true;
        updateVoiceUI();

        if (event.results && event.results[0] && event.results[0][0]) {
          var transcript = event.results[0][0].transcript.trim();
          var transcriptEl = document.getElementById('voice-transcript-text');
          if (transcriptEl) {
            transcriptEl.innerHTML = '<strong>You:</strong> &ldquo;' + escapeHtml(transcript) + '&rdquo;';
          }
          processVoiceCommand(transcript);
        } else {
          voiceState.processing = false;
          updateVoiceUI();
        }
      };

      voiceState.recognition.onerror = function (err) {
        console.warn('Speech recognition notice:', err.error);
        voiceState.listening = false;
        voiceState.processing = false;
        updateVoiceUI();
        if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
          var transcriptEl = document.getElementById('voice-transcript-text');
          if (transcriptEl) {
            transcriptEl.textContent = 'Microphone permission was denied. You can still use buttons and screen reader controls.';
          }
        }
      };

      voiceState.recognition.onend = function () {
        voiceState.listening = false;
        updateVoiceUI();
      };
    } catch (e) {
      console.warn('Voice assistant recognition initialization notice:', e);
      voiceState.supported = false;
    }
  }

  // Header & Floating Bar Event Listeners
  var globalToggle = document.getElementById('global-voice-toggle');
  if (globalToggle) {
    globalToggle.addEventListener('click', function () {
      toggleVoiceMode();
    });
  }

  var heroVoiceBtn = document.getElementById('hero-voice-btn');
  if (heroVoiceBtn) {
    heroVoiceBtn.addEventListener('click', function () {
      setVoiceMode(true, true);
    });
  }

  var micBtn = document.getElementById('voice-mic-btn');
  if (micBtn) {
    micBtn.addEventListener('click', function () {
      toggleListening();
    });
  }

  var muteBtn = document.getElementById('voice-mute-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', function () {
      toggleVoiceMute();
    });
  }

  var closeBarBtn = document.getElementById('voice-close-bar-btn');
  if (closeBarBtn) {
    closeBarBtn.addEventListener('click', function () {
      setVoiceMode(false);
    });
  }

  var enablePromptBtn = document.getElementById('enable-voice-prompt-btn');
  if (enablePromptBtn) {
    enablePromptBtn.addEventListener('click', function () {
      var promptEl = document.getElementById('voice-autoplay-prompt');
      if (promptEl) promptEl.hidden = true;
      setVoiceMode(true, true);
    });
  }

  var dismissPromptBtn = document.getElementById('dismiss-voice-prompt-btn');
  if (dismissPromptBtn) {
    dismissPromptBtn.addEventListener('click', function () {
      var promptEl = document.getElementById('voice-autoplay-prompt');
      if (promptEl) promptEl.hidden = true;
    });
  }

  checkWelcomeAutoplay();
}

function checkWelcomeAutoplay() {
  var played = false;
  try { played = sessionStorage.getItem('accessAI_welcomePlayed') === 'true'; } catch (e) {}
  if (played) return;

  var promptEl = document.getElementById('voice-autoplay-prompt');
  if (!promptEl) return;
  promptEl.hidden = false;
}

function setVoiceMode(enable, isUserGesture) {
  voiceState.enabled = !!enable;

  var toggleBtn = document.getElementById('global-voice-toggle');
  var toggleIcon = document.getElementById('global-voice-icon');
  var toggleText = document.getElementById('global-voice-text');
  var bar = document.getElementById('voice-assistant-bar');

  if (toggleBtn) {
    toggleBtn.classList.toggle('voice-active', voiceState.enabled);
    toggleBtn.setAttribute('aria-pressed', voiceState.enabled ? 'true' : 'false');
  }
  if (toggleIcon) {
    toggleIcon.setAttribute('data-lucide', voiceState.enabled ? 'mic' : 'mic-off');
  }
  if (toggleText) {
    toggleText.textContent = voiceState.enabled ? 'Voice: ON' : 'Voice: OFF';
  }
  if (bar) {
    bar.hidden = !voiceState.enabled;
  }

  if (voiceState.enabled) {
    if (isUserGesture && !voiceState.welcomeSpoken) {
      try { sessionStorage.setItem('accessAI_welcomePlayed', 'true'); } catch (e) {}
      voiceState.welcomeSpoken = true;
      speakVoice('Welcome to AccessAI. Inclusive navigation made easier. How can I help you navigate today?');
    }
  } else {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (voiceState.recognition && voiceState.listening) {
      try { voiceState.recognition.stop(); } catch (e) {}
    }
    voiceState.listening = false;
    voiceState.speaking = false;
    voiceState.processing = false;
  }

  if (window.lucide) window.lucide.createIcons();
  updateVoiceUI();
}

function toggleVoiceMode() {
  setVoiceMode(!voiceState.enabled, true);
}

function toggleVoiceMute() {
  voiceState.muted = !voiceState.muted;
  if (voiceState.muted && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    voiceState.speaking = false;
  }
  updateVoiceUI();
  if (!voiceState.muted) {
    speakVoice('Voice unmuted.');
  }
}

function startListening() {
  if (!voiceState.supported || !voiceState.recognition) {
    var transcriptEl = document.getElementById('voice-transcript-text');
    if (transcriptEl) {
      transcriptEl.textContent = 'Speech recognition is not supported in this browser. You can still use buttons and screen reader navigation.';
    }
    return;
  }
  if (voiceState.listening) return;

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  try {
    voiceState.recognition.start();
    voiceState.listening = true;
    updateVoiceUI();
  } catch (err) {
    console.warn('Recognition start exception:', err);
  }
}

function stopListening() {
  if (voiceState.recognition && voiceState.listening) {
    try { voiceState.recognition.stop(); } catch (e) {}
  }
  voiceState.listening = false;
  updateVoiceUI();
}

function toggleListening() {
  if (voiceState.listening) {
    stopListening();
  } else {
    startListening();
  }
}

function updateVoiceUI() {
  var badge = document.getElementById('voice-state-badge');
  var ring = document.getElementById('voice-pulse-ring');
  var micBtn = document.getElementById('voice-mic-btn');
  var micIcon = document.getElementById('voice-mic-action-icon');
  var micText = document.getElementById('voice-mic-action-text');
  var muteBtn = document.getElementById('voice-mute-btn');

  if (badge) {
    if (voiceState.listening) {
      badge.textContent = '🎙 Listening...';
    } else if (voiceState.processing) {
      badge.textContent = '⚙ Processing...';
    } else if (voiceState.speaking) {
      badge.textContent = '🔊 Speaking...';
    } else if (voiceState.muted) {
      badge.textContent = '🔇 Muted';
    } else {
      badge.textContent = '🎙 Tap to Speak';
    }
  }

  if (ring) {
    ring.className = 'voice-pulse-ring' +
      (voiceState.listening ? ' listening' : '') +
      (voiceState.processing ? ' thinking' : '') +
      (voiceState.speaking ? ' speaking' : '');
  }

  if (micBtn) {
    micBtn.classList.toggle('listening', voiceState.listening);
  }
  if (micIcon) {
    micIcon.setAttribute('data-lucide', voiceState.listening ? 'square' : 'mic');
  }
  if (micText) {
    micText.textContent = voiceState.listening ? 'Stop' : 'Listen';
  }

  if (muteBtn) {
    muteBtn.innerHTML = voiceState.muted
      ? '<i data-lucide="volume-2"></i> Unmute'
      : '<i data-lucide="volume-x"></i> Stop Speech';
  }

  if (window.lucide) window.lucide.createIcons();
}

function speakVoice(text, onEndCallback) {
  if (voiceState.muted || !voiceState.enabled) return;
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;

  voiceState.lastSpokenInstruction = text;
  try {
    window.speechSynthesis.cancel();
    var utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.95;
    utter.pitch = 1.0;
    utter.lang = 'en-US';

    utter.onstart = function () {
      voiceState.speaking = true;
      updateVoiceUI();
    };

    utter.onend = function () {
      voiceState.speaking = false;
      updateVoiceUI();
      if (typeof onEndCallback === 'function') onEndCallback();
    };

    utter.onerror = function () {
      voiceState.speaking = false;
      updateVoiceUI();
    };

    window.speechSynthesis.speak(utter);
  } catch (err) {
    console.warn('Speech synthesis note:', err);
    voiceState.speaking = false;
    updateVoiceUI();
  }
}

async function processVoiceCommand(rawTranscript) {
  var t = rawTranscript.toLowerCase().trim();
  var transcriptEl = document.getElementById('voice-transcript-text');

  function setTranscript(userText, botReply) {
    if (transcriptEl) {
      transcriptEl.innerHTML = '<strong>You:</strong> &ldquo;' + escapeHtml(userText) + '&rdquo;<br><strong>Assistant:</strong> &ldquo;' + escapeHtml(botReply) + '&rdquo;';
    }
  }

  // 1. Controls: Turn OFF voice
  if (/\b(?:turn off voice|disable voice|close voice|deactivate voice)\b/i.test(t)) {
    var reply = 'Turning voice assistant off.';
    setTranscript(rawTranscript, reply);
    speakVoice(reply, function () {
      setVoiceMode(false);
    });
    return;
  }

  // 2. Controls: Turn ON voice
  if (/\b(?:turn on voice|enable voice|activate voice)\b/i.test(t)) {
    setVoiceMode(true, true);
    var reply = 'Voice assistant is enabled.';
    setTranscript(rawTranscript, reply);
    speakVoice(reply);
    return;
  }

  // 3. Mute / Silence
  if (/\b(?:mute|stop talking|be quiet|silence|pause speech)\b/i.test(t)) {
    voiceState.muted = true;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    voiceState.speaking = false;
    updateVoiceUI();
    setTranscript(rawTranscript, 'Voice muted.');
    return;
  }

  // 4. Unmute
  if (/\b(?:unmute|resume speech|resume voice)\b/i.test(t)) {
    voiceState.muted = false;
    updateVoiceUI();
    var reply = 'Voice unmuted.';
    setTranscript(rawTranscript, reply);
    speakVoice(reply);
    return;
  }

  // 5. Navigation Control: Stop / Exit navigation
  if (/\b(?:stop navigation|exit navigation|cancel navigation|end navigation|quit navigation)\b/i.test(t)) {
    stopNavigationMode();
    var reply = 'Navigation stopped.';
    setTranscript(rawTranscript, reply);
    speakVoice(reply);
    return;
  }

  // 6. Navigation Control: Start navigation
  if (/\b(?:start navigation|begin navigation|start walking|let'?s go|launch navigation)\b/i.test(t)) {
    if (appState.evaluated && appState.evaluated.length > 0) {
      var targetEval = null;
      if (appState.selectedRoute) {
        for (var i = 0; i < appState.evaluated.length; i++) {
          if (appState.evaluated[i].route.id === appState.selectedRoute.id) {
            targetEval = appState.evaluated[i]; break;
          }
        }
      }
      if (!targetEval) targetEval = appState.evaluated[0];
      startNavigationMode(targetEval);
      var reply = 'Starting pedestrian navigation for ' + targetEval.route.label + '. ' + (navState.steps[0] ? navState.steps[0].instruction : '');
      setTranscript(rawTranscript, reply);
    } else {
      var reply = 'Please search for accessible routes first.';
      setTranscript(rawTranscript, reply);
      speakVoice(reply);
    }
    return;
  }

  // 7. Navigation Step: Next / Previous
  if (navState.active) {
    if (/\b(?:next|next step|continue|forward)\b/i.test(t)) {
      navStepNext();
      var curStep = navState.steps[navState.currentStepIndex];
      var reply = curStep ? curStep.instruction : 'At destination';
      setTranscript(rawTranscript, reply);
      return;
    }
    if (/\b(?:previous|prev|back|last step)\b/i.test(t)) {
      navStepPrev();
      var curStep = navState.steps[navState.currentStepIndex];
      var reply = curStep ? curStep.instruction : 'At start';
      setTranscript(rawTranscript, reply);
      return;
    }
  }

  // 8. Route Selection: Choose Route A / B
  if (/\b(?:choose|select|pick|take)?\s*(?:route\s*a|first route|option a)\b/i.test(t) || t === 'a' || t === 'route a') {
    if (appState.evaluated && appState.evaluated.length > 0) {
      var target = appState.evaluated[0];
      handleChooseRoute(target.route.id, false);
      var km = (target.route.distanceMeters / 1000).toFixed(1);
      var reply = 'Selected Route A: ' + target.route.name + '. Distance ' + km + ' km, estimated time ' + target.route.durationMinutes + ' minutes, accessibility score ' + target.evaluation.score + ' out of 100.';
      setTranscript(rawTranscript, reply);
      speakVoice(reply);
    } else {
      var reply = 'No routes are currently loaded. Please find a route first.';
      setTranscript(rawTranscript, reply);
      speakVoice(reply);
    }
    return;
  }

  if (/\b(?:choose|select|pick|take)?\s*(?:route\s*b|second route|option b)\b/i.test(t) || t === 'b' || t === 'route b') {
    if (appState.evaluated && appState.evaluated.length > 1) {
      var target = appState.evaluated[1];
      handleChooseRoute(target.route.id, false);
      var km = (target.route.distanceMeters / 1000).toFixed(1);
      var reply = 'Selected Route B: ' + target.route.name + '. Distance ' + km + ' km, estimated time ' + target.route.durationMinutes + ' minutes, accessibility score ' + target.evaluation.score + ' out of 100.';
      setTranscript(rawTranscript, reply);
      speakVoice(reply);
    } else if (appState.evaluated && appState.evaluated.length === 1) {
      var reply = 'Only Route A is available for this journey.';
      setTranscript(rawTranscript, reply);
      speakVoice(reply);
    } else {
      var reply = 'No routes are currently loaded. Please find a route first.';
      setTranscript(rawTranscript, reply);
      speakVoice(reply);
    }
    return;
  }

  // 9. Info Queries: Where am I?
  if (/\b(?:where am i|what is my location|current location)\b/i.test(t)) {
    var reply = '';
    if (navState.active && navState.steps[navState.currentStepIndex]) {
      reply = 'You are navigating ' + navState.route.label + '. Current instruction: ' + navState.steps[navState.currentStepIndex].instruction + '.';
    } else if (appState.origin && appState.destination) {
      reply = 'You are planning a journey from ' + appState.origin.name.split(',')[0] + ' to ' + appState.destination.name.split(',')[0] + '.';
    } else {
      reply = 'You are on AccessAI. Say where you would like to go to get accessible directions.';
    }
    setTranscript(rawTranscript, reply);
    speakVoice(reply);
    return;
  }

  // 10. Info Queries: How far is it? / Distance
  if (/\b(?:how far|what is the distance|remaining distance|distance)\b/i.test(t)) {
    var reply = '';
    if (navState.active) {
      var remainingMeters = 0;
      for (var i = navState.currentStepIndex; i < navState.steps.length; i++) {
        remainingMeters += (navState.steps[i].distanceMeters || 0);
      }
      var km = (remainingMeters / 1000).toFixed(1);
      reply = 'Remaining distance is ' + km + ' kilometers.';
    } else if (appState.selectedRoute) {
      var km = (appState.selectedRoute.distanceMeters / 1000).toFixed(1);
      reply = 'The selected route distance is ' + km + ' kilometers.';
    } else {
      reply = 'Please search for a route first to check distance.';
    }
    setTranscript(rawTranscript, reply);
    speakVoice(reply);
    return;
  }

  // 11. Info Queries: ETA / Travel time
  if (/\b(?:what is the eta|eta|how long|estimated time|travel time)\b/i.test(t)) {
    var reply = '';
    if (navState.active) {
      var remainingMeters = 0;
      for (var i = navState.currentStepIndex; i < navState.steps.length; i++) {
        remainingMeters += (navState.steps[i].distanceMeters || 0);
      }
      var mins = Math.max(1, Math.round((remainingMeters / 1.33) / 60));
      reply = 'Estimated walking time remaining is ' + mins + ' minutes.';
    } else if (appState.selectedRoute) {
      reply = 'Estimated travel time is ' + appState.selectedRoute.durationMinutes + ' minutes.';
    } else {
      reply = 'Please search for a route first to check travel time.';
    }
    setTranscript(rawTranscript, reply);
    speakVoice(reply);
    return;
  }

  // 12. Repeat / Say that again
  if (/\b(?:repeat|repeat that|repeat instruction|say that again|what was that)\b/i.test(t)) {
    var reply = voiceState.lastSpokenInstruction || 'Welcome to AccessAI. How can I assist your journey?';
    setTranscript(rawTranscript, reply);
    speakVoice(reply);
    return;
  }

  // 13. Accessibility Profile Query
  if (/\b(?:what are my requirements|read profile|my profile|accessibility requirements)\b/i.test(t)) {
    var prof = loadSavedProfile();
    var reply = '';
    if (prof) {
      var items = [];
      if (prof.wheelchair === true) items.push('wheelchair access required');
      if (prof.avoidStairs === true) items.push('avoid stairs');
      if (prof.rampRequired === true) items.push('ramps required');
      if (prof.avoidSteepSlopes === true) items.push('avoid steep slopes');
      reply = 'Your profile is set for: ' + (items.length > 0 ? items.join(', ') : 'standard accessibility preferences') + '.';
    } else {
      reply = 'No accessibility profile is saved yet. You can describe your needs in the profile section.';
    }
    setTranscript(rawTranscript, reply);
    speakVoice(reply);
    return;
  }

  // 14. Route Finding: From [Origin] to [Destination]
  var routeMatch = rawTranscript.match(/(?:i want to go|find(?: a)? route|navigate|take me|directions|how do i get)\s+from\s+([\s\S]+?)\s+to\s+([\s\S]+)/i)
    || rawTranscript.match(/(?:from)\s+([\s\S]+?)\s+to\s+([\s\S]+)/i);

  if (routeMatch) {
    var originStr = routeMatch[1].trim();
    var destStr = routeMatch[2].trim();

    var fromEl = document.getElementById('from-location');
    var toEl = document.getElementById('to-location');
    if (fromEl) fromEl.value = originStr;
    if (toEl) toEl.value = destStr;

    if (!loadSavedProfile()) {
      var defaultProf = {
        wheelchair: true,
        avoidStairs: true,
        rampRequired: true,
        accessibleEntrance: true,
        avoidSteepSlopes: true,
        extraWalkingTolerance: 'unknown',
        visualImpairment: 'unknown',
        voiceGuidance: true,
        mobilityDifficulty: 'unknown'
      };
      saveProfile(defaultProf);
      renderProfileCard(defaultProf, false);
    }

    var confirmReply = 'Finding accessible routes from ' + originStr + ' to ' + destStr + '.';
    setTranscript(rawTranscript, confirmReply);
    speakVoice(confirmReply);
    await handleAnalyzeRoutes();
    if (appState.evaluated && appState.evaluated.length > 0) {
      var count = appState.evaluated.length;
      var top = appState.evaluated[0];
      var resultReply = 'Found ' + count + ' routes. Route A is recommended with score ' + top.evaluation.score + ' out of 100.';
      setTranscript(rawTranscript, resultReply);
      speakVoice(resultReply);
    }
    return;
  }

  // 15. Route Finding: Destination only ("take me to [Destination]")
  var destOnlyMatch = rawTranscript.match(/(?:take me to|find(?: a)? route to|go to|navigate to|directions to)\s+(.+)/i);
  if (destOnlyMatch) {
    var destStr = destOnlyMatch[1].trim();
    var fromEl = document.getElementById('from-location');
    var toEl = document.getElementById('to-location');
    var currentFrom = fromEl ? fromEl.value.trim() : '';
    if (!currentFrom) currentFrom = "King's Cross Station, London";
    if (fromEl) fromEl.value = currentFrom;
    if (toEl) toEl.value = destStr;

    if (!loadSavedProfile()) {
      var defaultProf = {
        wheelchair: true,
        avoidStairs: true,
        rampRequired: true,
        accessibleEntrance: true,
        avoidSteepSlopes: true,
        extraWalkingTolerance: 'unknown',
        visualImpairment: 'unknown',
        voiceGuidance: true,
        mobilityDifficulty: 'unknown'
      };
      saveProfile(defaultProf);
      renderProfileCard(defaultProf, false);
    }

    var confirmReply = 'Finding accessible routes to ' + destStr + '.';
    setTranscript(rawTranscript, confirmReply);
    speakVoice(confirmReply);
    await handleAnalyzeRoutes();
    if (appState.evaluated && appState.evaluated.length > 0) {
      var count = appState.evaluated.length;
      var top = appState.evaluated[0];
      var resultReply = 'Found ' + count + ' routes. Route A is recommended with score ' + top.evaluation.score + ' out of 100.';
      setTranscript(rawTranscript, resultReply);
      speakVoice(resultReply);
    }
    return;
  }

  // Fallback for unrecognized command
  var fallbackReply = 'I didn\'t quite catch that. You can say: "Find route from King\'s Cross to British Museum", "Choose Route A", or "Start navigation".';
  setTranscript(rawTranscript, fallbackReply);
  speakVoice(fallbackReply);
}

// Off-route check helper
function triggerOffRouteRecalculation() {
  if (!navState.active || !appState.destination) return;
  var banner = document.getElementById('nav-offroute-banner');
  if (banner) banner.hidden = false;

  setTimeout(async function () {
    try {
      if (navState.userLocationMarker) {
        var pos = navState.userLocationMarker.getLatLng();
        var coords = pos.lng + ',' + pos.lat + ';' + appState.destination.lon + ',' + appState.destination.lat;
        var osrmUrl = ROUTING_CONFIG.osrmFootEndpoint + '/' + coords + '?overview=full&geometries=geojson&steps=true&alternatives=true';
        var res = await fetch(osrmUrl);
        if (res.ok) {
          var data = await res.json();
          if (data && data.routes && data.routes.length > 0) {
            var updatedRoute = normalizeRoute(data.routes[0], 0, 'Current Position', appState.destination.name, 'A');
            navState.route = updatedRoute;
            navState.steps = extractNavSteps(updatedRoute);
            navState.currentStepIndex = 0;
            updateNavHUD();
            renderMapWithRoutes([ { route: updatedRoute, evaluation: navState.evaluation } ], updatedRoute.id);
            speakGuidance('Route recalculated. ' + (navState.steps[0] ? navState.steps[0].instruction : ''));
          }
        }
      }
    } catch (e) {
      console.warn('Off-route recalculation note:', e);
    } finally {
      if (banner) banner.hidden = true;
    }
  }, 1200);
}

function showStatus(el, type, message) {
  if (!el) return;
  var icons = { error:'circle-x', warning:'triangle-alert', success:'check-circle', info:'info' };
  el.innerHTML = '<div class="status-msg status-'+type+'" role="'+(type==='error'?'alert':'status')+'"><i data-lucide="'+(icons[type]||'info')+'" aria-hidden="true"></i> '+message+'</div>';
  if (window.lucide) window.lucide.createIcons();
}
function clearStatus(el) { if (el) el.innerHTML = ''; }
function scrollToSection(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior:'smooth', block:'start' });
  el.setAttribute('tabindex','-1');
  el.focus({ preventScroll:true });
}
function escapeHtml(str) {
  if (typeof str !== 'string') str = String(str);
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

