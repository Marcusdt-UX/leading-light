/* ===== routes.js — Real Route Fetching via OSRM ===== */

const RoutesModule = (() => {
  let routeLines = [];
  let activeRoute = null;
  let selectedRouteIdx = null;  /* previewed route (not yet navigating) */
  let currentRoutes = [];
  let rawOsrmRoutes = [];   /* keep raw OSRM responses for step data */
  function init() {
    bindEvents();
  }

  function bindEvents() {
    /* Route card clicks — preview only, don't start nav */
    document.getElementById('routeOptions')?.addEventListener('click', (e) => {
      const card = e.target.closest('.route-card');
      if (!card) return;
      const idx = parseInt(card.dataset.routeIdx, 10);
      previewRoute(idx);
    });

    /* Start Navigation button — use both click and touchend for reliable mobile taps */
    const startNavBtn = document.getElementById('routeStartNav');
    const handleStartNav = (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('[Routes] Start Nav tapped, selectedRouteIdx:', selectedRouteIdx);
      if (selectedRouteIdx !== null) {
        try {
          startNavigation(selectedRouteIdx);
        } catch(err) {
          console.error('[Routes] startNavigation error:', err);
        }
      } else {
        console.warn('[Routes] No route selected — tap a route card first');
      }
    };
    startNavBtn?.addEventListener('click', handleStartNav);

    /* Close button */
    document.getElementById('routePanelClose')?.addEventListener('click', closePanel);

    /* Directions page — End navigation */
    document.getElementById('directionsEnd')?.addEventListener('click', endNavigation);

    /* Directions page — Back (show map with route still active) */
    document.getElementById('directionsBack')?.addEventListener('click', showMapWithRoute);

    /* Directions page — Show on Map button */
    document.getElementById('directionsShowMap')?.addEventListener('click', showMapWithRoute);
  }

  /* Fetch real routes from OSRM (free, no API key) */
  async function fetchRoutes(origin, destination) {
    const container = document.getElementById('routeOptions');
    if (!container) return;

    /* Show loading state in panel */
    showPanel();
    container.innerHTML = `
      <div class="route-card route-card--loading">
        <div class="route-card__info" style="text-align:center;width:100%;">
          <div class="route-card__name">Finding safest routes…</div>
          <div class="route-card__meta">Calculating distance & time</div>
        </div>
      </div>
    `;

    try {
      /* OSRM demo server — request alternatives */
      const url = `https://router.project-osrm.org/route/v1/foot/` +
        `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
        `?overview=full&geometries=geojson&alternatives=true&steps=true`;

      console.log('[Routes] Fetching:', url);
      console.log('[Routes] Origin:', origin, 'Dest:', destination);

      /* Try with a timeout — OSRM demo can be slow */
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      console.log('[Routes] Response status:', resp.status);
      if (!resp.ok) throw new Error(`Routing request failed (HTTP ${resp.status})`);

      const data = await resp.json();

      if (!data.routes || data.routes.length === 0) {
        container.innerHTML = `
          <div class="route-card">
            <div class="route-card__info" style="text-align:center;width:100%;">
              <div class="route-card__name" style="color:var(--red)">No walking route found</div>
              <div class="route-card__meta">Try a closer destination</div>
            </div>
          </div>
        `;
        return;
      }

      /* Process routes — score safety using simulated crime hotspot proximity */
      rawOsrmRoutes = data.routes;   /* stash raw for turn-by-turn later */
      console.log('[Routes] ✅ Stored', rawOsrmRoutes.length, 'raw OSRM routes, indices:', rawOsrmRoutes.map((r,i) => i));
      currentRoutes = data.routes.map((route, i) => {
        const durationMin = Math.round(route.duration / 60);
        const distanceKm = (route.distance / 1000).toFixed(1);
        const distanceMi = (route.distance / 1609.34).toFixed(1);

        /* Extract coordinates from GeoJSON */
        const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

        /* Real safety score based on crime hotspot proximity along route */
        const safetyScore = MapModule.scoreRouteSafety(coords);

        /* Determine route labels based on actual safety score */
        let badgeClass, safetyClass;

        if (safetyScore >= 75) safetyClass = 'high';
        else if (safetyScore >= 55) safetyClass = 'medium';
        else safetyClass = 'low';

        /* Build route name from street names in steps */
        const streetNames = extractStreetNames(route);
        const routeName = streetNames.length > 0
          ? streetNames.slice(0, 3).join(' → ')
          : `Route ${i + 1}`;

        const colors = ['#6C63FF', '#8B83FF', '#A59BFF', '#FFD600'];

        return {
          idx: i,
          name: routeName,
          badge: '',       /* assigned after sorting */
          badgeClass: '',
          safetyScore,
          safetyClass,
          time: durationMin < 60 ? `${durationMin} min` : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`,
          distance: `${distanceMi} mi`,
          durationSec: route.duration,
          recommended: false,
          color: colors[i % colors.length],
          coords
        };
      });

      /* Sort by safety score (highest first) */
      currentRoutes.sort((a, b) => b.safetyScore - a.safetyScore);

      /* Assign badges after sorting — safest first, then fastest, then alternatives */
      const fastestIdx = currentRoutes.reduce((min, c) => c.durationSec < min.durationSec ? c : min, currentRoutes[0]).idx;
      currentRoutes.forEach((r, i) => {
        if (i === 0) {
          r.badge = 'Safest';
          r.badgeClass = 'safe';
          r.recommended = true;
        } else if (r.idx === fastestIdx && fastestIdx !== currentRoutes[0].idx) {
          r.badge = 'Fastest';
          r.badgeClass = 'fast';
        } else {
          r.badge = r.safetyScore >= 55 ? 'Alternative' : 'Avoid';
          r.badgeClass = r.safetyScore >= 55 ? 'caution' : 'danger';
        }
      });

      /* Render route cards */
      renderRouteCards(container);

      /* Draw routes on map */
      drawAllRoutes();

      /* Auto-preview the recommended (safest) route so Start Nav is immediately visible */
      const recommended = currentRoutes.find(r => r.recommended);
      console.log('[Routes] Recommended route:', recommended ? `idx=${recommended.idx}, name=${recommended.name}` : 'NONE');
      console.log('[Routes] rawOsrmRoutes available indices:', Array.from({length: rawOsrmRoutes.length}, (_,i) => i));
      console.log('[Routes] currentRoutes indices:', currentRoutes.map(r => r.idx));
      if (recommended) previewRoute(recommended.idx);

    } catch (err) {
      console.error('[Routes] OSRM error:', err.name, err.message);

      let errorMsg = 'Route calculation failed';
      let errorHint = 'Check your connection and try again';

      if (err.name === 'AbortError') {
        errorMsg = 'Request timed out';
        errorHint = 'The routing server is slow — tap "Get the Route" again';
      } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        errorMsg = 'Network error';
        errorHint = 'Check your internet connection';
      } else if (err.message.includes('HTTP')) {
        errorMsg = 'Routing server error';
        errorHint = err.message;
      }

      container.innerHTML = `
        <div class="route-card" style="flex-direction:column;gap:12px;">
          <div class="route-card__info" style="text-align:center;width:100%;">
            <div class="route-card__name" style="color:var(--red)">${errorMsg}</div>
            <div class="route-card__meta">${errorHint}</div>
          </div>
          <button id="routeRetry" style="padding:10px 24px;border:1px solid var(--primary);border-radius:var(--rs);background:transparent;color:var(--primary-light);font-size:14px;font-weight:600;font-family:var(--font);cursor:pointer;">Retry</button>
        </div>
      `;
      /* Retry button */
      document.getElementById('routeRetry')?.addEventListener('click', () => {
        fetchRoutes(origin, destination);
      });
    }
  }

  /* Extract notable street names from OSRM route steps */
  function extractStreetNames(route) {
    const names = new Set();
    if (!route.legs) return [];
    route.legs.forEach(leg => {
      if (!leg.steps) return;
      leg.steps.forEach(step => {
        if (step.name && step.name.trim() && step.name !== '') {
          names.add(step.name);
        }
      });
    });
    return [...names].filter(n => n.length > 1);
  }

  function renderRouteCards(container) {
    container.innerHTML = currentRoutes.map(route => `
      <div class="route-card ${route.recommended ? 'route-card--recommended' : ''}" data-route-idx="${route.idx}">
        <div class="route-card__safety route-card__safety--${route.safetyClass}">
          ${route.safetyScore}
        </div>
        <div class="route-card__info">
          <span class="route-card__badge route-card__badge--${route.badgeClass}">${route.badge}</span>
          <div class="route-card__name">${route.name}</div>
          <div class="route-card__meta">${route.time} · ${route.distance}</div>
        </div>
        <svg class="route-card__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    `).join('');
  }

  function showPanel() {
    const panel = document.getElementById('routePanel');
    if (panel) {
      /* Clear any stale inline styles from swipe gestures */
      panel.style.transform = '';
      panel.style.transition = '';
      panel.classList.add('active');
      /* Hide the bottom sheet when routes are open */
      MapModule.hideBottomSheet();
    }
    /* Reset start button */
    const startBtn = document.getElementById('routeStartNav');
    if (startBtn) startBtn.classList.remove('visible');
    selectedRouteIdx = null;
    /* Let the map recalculate its size */
    try { MapModule.getMap()?.invalidateSize(); } catch(e) {}
  }

  function closePanel() {
    const panel = document.getElementById('routePanel');
    if (panel) {
      panel.style.transform = '';
      panel.style.transition = '';
      panel.classList.remove('active');
    }
    clearRoutes();
    MapModule.clearDestination();

    /* Clear search input */
    const input = document.getElementById('searchInput');
    if (input) input.value = '';

    /* Let the map recalculate its size */
    try { MapModule.getMap()?.invalidateSize(); } catch(e) {}
  }

  /* Is routing UI active (route panel or directions page)? */
  function isRoutingActive() {
    return document.getElementById('routePanel')?.classList.contains('active') ||
           document.getElementById('directionsPage')?.classList.contains('active');
  }

  function clearRouteLines() {
    routeLines.forEach(({ line }) => line.remove());
    routeLines = [];
  }

  function drawAllRoutes() {
    clearRouteLines();
    const map = MapModule.getMap();

    currentRoutes.forEach((route, i) => {
      const line = L.polyline(route.coords, {
        color: route.color,
        weight: route.recommended ? 5 : 4,
        opacity: route.recommended ? 0.85 : 0.35,
        dashArray: route.recommended ? null : '8, 6',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      routeLines.push({ idx: route.idx, line });
    });

    /* Fit bounds to show all routes */
    const allCoords = currentRoutes.flatMap(r => r.coords);
    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords).pad(0.15), { duration: 0.8 });
    }
  }

  /* --- Preview route (highlight on map + card) without entering navigation --- */
  function previewRoute(routeIdx) {
    selectedRouteIdx = routeIdx;

    /* Highlight selected, dim others */
    routeLines.forEach(({ idx, line }) => {
      if (idx === routeIdx) {
        line.setStyle({ opacity: 0.9, weight: 6, dashArray: null });
        line.bringToFront();
      } else {
        line.setStyle({ opacity: 0.15, weight: 3 });
      }
    });

    /* Highlight selected card */
    document.querySelectorAll('.route-card').forEach(card => {
      const cardIdx = parseInt(card.dataset.routeIdx, 10);
      card.classList.toggle('route-card--selected', cardIdx === routeIdx);
    });

    /* Fit to selected route */
    const route = currentRoutes.find(r => r.idx === routeIdx);
    if (route && route.coords.length > 0) {
      MapModule.getMap().fitBounds(L.latLngBounds(route.coords).pad(0.2), { duration: 0.6 });
    }

    /* Show the Start Navigation button */
    const startBtn = document.getElementById('routeStartNav');
    if (startBtn) startBtn.classList.add('visible');
  }

  /* --- Enter full turn-by-turn directions page for the selected route --- */
  function startNavigation(routeIdx) {
    console.log('[Routes] ========= START NAVIGATION =========');
    console.log('[Routes] routeIdx:', routeIdx, 'type:', typeof routeIdx);
    console.log('[Routes] rawOsrmRoutes length:', rawOsrmRoutes.length);
    console.log('[Routes] rawOsrmRoutes keys:', Object.keys(rawOsrmRoutes));
    console.log('[Routes] currentRoutes:', JSON.stringify(currentRoutes.map(r => ({idx:r.idx, name:r.name, badge:r.badge}))));
    console.log('[Routes] rawOsrmRoutes[routeIdx] exists?', !!rawOsrmRoutes[routeIdx]);
    activeRoute = routeIdx;

    const raw = rawOsrmRoutes[routeIdx];
    if (!raw) {
      console.error('[Routes] ❌ No raw OSRM route for idx', routeIdx);
      console.error('[Routes] rawOsrmRoutes is', rawOsrmRoutes.length === 0 ? 'EMPTY' : `length ${rawOsrmRoutes.length}`);
      console.error('[Routes] Available indices:', Array.from({length:rawOsrmRoutes.length},(_,i)=>i));
      /* Fallback: try index 0 if available */
      if (rawOsrmRoutes.length > 0 && routeIdx !== 0) {
        console.warn('[Routes] Falling back to rawOsrmRoutes[0]');
        return startNavigation(0);
      }
      return;
    }

    const route = currentRoutes.find(r => r.idx === routeIdx);
    if (!route) { console.error('[Routes] No processed route for idx', routeIdx); return; }

    /* Populate header */
    const titleEl = document.getElementById('directionsTitle');
    const subtitleEl = document.getElementById('directionsSubtitle');
    if (titleEl) titleEl.textContent = route.name || 'Directions';
    if (subtitleEl) subtitleEl.textContent = `${route.badge} Route · Safety ${route.safetyScore}`;

    /* Summary stats */
    const mins = Math.round(raw.duration / 60);
    const timeStr = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
    const distMi = (raw.distance / 1609.34).toFixed(1);
    const dirTimeEl = document.getElementById('dirTime');
    const dirDistEl = document.getElementById('dirDist');
    if (dirTimeEl) dirTimeEl.textContent = timeStr;
    if (dirDistEl) dirDistEl.textContent = `${distMi} mi`;

    /* Safety score with color */
    const safetyEl = document.getElementById('dirSafety');
    const scoreEl = document.getElementById('dirSafetyScore');
    if (scoreEl) scoreEl.textContent = route.safetyScore;
    if (safetyEl) {
      safetyEl.className = 'directions-page__safety';
      if (route.safetyScore >= 75) {
        safetyEl.classList.add('directions-page__safety--high');
        if (scoreEl) scoreEl.style.color = 'var(--green)';
      } else if (route.safetyScore >= 55) {
        safetyEl.classList.add('directions-page__safety--medium');
        if (scoreEl) scoreEl.style.color = 'var(--yellow)';
      } else {
        safetyEl.classList.add('directions-page__safety--low');
        if (scoreEl) scoreEl.style.color = 'var(--red)';
      }
    }

    /* Collect all steps from all legs */
    const steps = [];
    (raw.legs || []).forEach(leg => {
      (leg.steps || []).forEach(step => steps.push(step));
    });

    /* Set first step as hero */
    if (steps.length > 0) {
      const first = steps[0];
      const heroIcon = document.getElementById('dirHeroIcon');
      const heroInstr = document.getElementById('dirHeroInstruction');
      const heroDist = document.getElementById('dirHeroDist');
      if (heroIcon) heroIcon.innerHTML = maneuverSVG(first.maneuver);
      if (heroInstr) heroInstr.textContent = stepInstruction(first);
      if (heroDist) heroDist.textContent = formatDist(first.distance);
    }

    /* Build full step list */
    const stepsContainer = document.getElementById('dirSteps');
    if (!stepsContainer) { console.error('[Routes] #dirSteps not found'); }
    if (stepsContainer) stepsContainer.innerHTML = steps.map((step, i) => {
      const m = step.maneuver || {};
      const mType = m.type || '';
      let iconClass = '';
      if (mType === 'arrive')  iconClass = ' dir-step__icon--arrive';
      if (mType === 'depart')  iconClass = ' dir-step__icon--depart';

      const instruction = stepInstruction(step);
      const dist = formatDist(step.distance);
      const streetName = step.name || '';

      return `
        <div class="dir-step">
          <div class="dir-step__icon${iconClass}">${maneuverSVG(step.maneuver)}</div>
          <div class="dir-step__body">
            <div class="dir-step__instruction">${instruction}</div>
            <div class="dir-step__meta">
              ${dist ? `<span class="dir-step__dist">${dist}</span>` : ''}
              ${streetName && !instruction.includes(streetName) ? `<span class="dir-step__street">${streetName}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    /* Highlight only the active route line on map */
    routeLines.forEach(({ idx, line }) => {
      if (idx === routeIdx) {
        line.setStyle({ opacity: 0.9, weight: 6, dashArray: null });
        line.bringToFront();
      } else {
        line.setStyle({ opacity: 0.1, weight: 2 });
      }
    });

    /* Hide route panel, show directions page */
    const rp = document.getElementById('routePanel');
    if (rp) { rp.style.transform = ''; rp.style.transition = ''; rp.classList.remove('active'); }
    const dp = document.getElementById('directionsPage');
    if (dp) {
      dp.classList.add('active');
      /* Belt-and-suspenders: force inline styles in case CSS class isn't taking effect */
      dp.style.visibility = 'visible';
      dp.style.opacity = '1';
      dp.style.pointerEvents = 'auto';
      console.log('[Routes] ✅ directionsPage opened, classList:', dp.classList.toString());
    } else {
      console.error('[Routes] #directionsPage element not found!');
    }
  }

  /* --- Show map with the active route still displayed (back from directions) --- */
  function showMapWithRoute() {
    const dp = document.getElementById('directionsPage');
    if (dp) {
      dp.classList.remove('active');
      dp.style.visibility = '';
      dp.style.opacity = '';
      dp.style.pointerEvents = '';
    }
    /* Don't restore route panel — just show the map with the active route line */
    try { MapModule.getMap()?.invalidateSize(); } catch(e) {}
  }

  /* --- End navigation completely and return to clean map --- */
  function endNavigation() {
    const dp = document.getElementById('directionsPage');
    if (dp) { dp.classList.remove('active'); dp.style.visibility = ''; dp.style.opacity = ''; dp.style.pointerEvents = ''; }
    clearRoutes();
    MapModule.clearDestination();
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    try { MapModule.getMap()?.invalidateSize(); } catch(e) {}
  }

  /* --- Maneuver icon SVGs --- */
  function maneuverSVG(m) {
    if (!m) return arrowUp();
    const type = m.type || '';
    const mod  = m.modifier || '';

    if (type === 'arrive')  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>`;
    if (type === 'depart')  return arrowUp();
    if (mod.includes('left')  && mod.includes('sharp')) return arrowTurn('sharp-left');
    if (mod.includes('right') && mod.includes('sharp')) return arrowTurn('sharp-right');
    if (mod.includes('left'))  return arrowTurn('left');
    if (mod.includes('right')) return arrowTurn('right');
    if (mod.includes('uturn')) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/></svg>`;
    if (type === 'roundabout' || type === 'rotary') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v6"/><path d="M12 16v6"/></svg>`;
    return arrowUp(); /* straight / continue */
  }
  function arrowUp() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="12 19 12 5"/><polyline points="5 12 12 5 19 12"/></svg>`;
  }
  function arrowTurn(dir) {
    if (dir === 'left')        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18v-6a3 3 0 0 0-3-3H5"/><polyline points="9 5 5 9 9 13"/></svg>`;
    if (dir === 'right')       return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18v-6a3 3 0 0 1 3-3h7"/><polyline points="15 5 19 9 15 13"/></svg>`;
    if (dir === 'sharp-left')  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 18V8H7"/><polyline points="11 4 7 8 11 12"/></svg>`;
    if (dir === 'sharp-right') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 18V8h10"/><polyline points="13 4 17 8 13 12"/></svg>`;
    return arrowUp();
  }

  /* --- Step instruction text --- */
  function stepInstruction(step) {
    const m = step.maneuver || {};
    const name = step.name || '';
    const type = m.type || '';
    const mod  = m.modifier || '';

    if (type === 'depart')  return name ? `Head on ${name}` : 'Depart';
    if (type === 'arrive')  return 'Arrive at destination';

    let action = 'Continue';
    if (mod.includes('left')  && mod.includes('sharp')) action = 'Sharp left';
    else if (mod.includes('right') && mod.includes('sharp')) action = 'Sharp right';
    else if (mod.includes('left'))  action = 'Turn left';
    else if (mod.includes('right')) action = 'Turn right';
    else if (mod.includes('straight')) action = 'Continue straight';
    else if (mod.includes('uturn')) action = 'Make a U-turn';
    if (type === 'roundabout' || type === 'rotary') action = 'Enter roundabout';

    return name ? `${action} onto ${name}` : action;
  }

  /* --- Distance formatting --- */
  function formatDist(meters) {
    if (!meters || meters < 1) return '';
    const ft = meters * 3.28084;
    if (ft < 1000) return `${Math.round(ft)} ft`;
    return `${(meters / 1609.34).toFixed(1)} mi`;
  }

  /* --- Close directions page and go back to route panel --- */
  function closeNavView() {
    const dirPage = document.getElementById('directionsPage');
    if (!dirPage || !dirPage.classList.contains('active')) return;
    dirPage.classList.remove('active');
    dirPage.style.visibility = ''; dirPage.style.opacity = ''; dirPage.style.pointerEvents = '';
    /* Restore route panel with preview state reset */
    showPanel();
    /* Clear card selection highlights */
    document.querySelectorAll('.route-card').forEach(card => {
      card.classList.remove('route-card--selected');
    });
    /* Reset line styles */
    routeLines.forEach(({ idx, line }) => {
      const route = currentRoutes.find(r => r.idx === idx);
      if (route) {
        line.setStyle({
          opacity: route.recommended ? 0.85 : 0.35,
          weight: route.recommended ? 5 : 4,
          dashArray: route.recommended ? null : '8, 6'
        });
      }
    });
    activeRoute = null;
    selectedRouteIdx = null;
  }

  function clearRoutes() {
    clearRouteLines();
    activeRoute = null;
    selectedRouteIdx = null;
    currentRoutes = [];
    rawOsrmRoutes = [];
    const dpEl = document.getElementById('directionsPage');
    if (dpEl) { dpEl.classList.remove('active'); dpEl.style.visibility = ''; dpEl.style.opacity = ''; dpEl.style.pointerEvents = ''; }
    const startBtn = document.getElementById('routeStartNav');
    if (startBtn) startBtn.classList.remove('visible');
  }

  return { init, showPanel, closePanel, closeNavView, fetchRoutes, isRoutingActive };
})();
