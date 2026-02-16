/* ===== map.js — Interactive Safety Map ===== */

const MapModule = (() => {
  let map;
  let userMarker;
  let destinationMarker;
  let poiMarkers = [];
  let reportMarkers = [];
  let crimeMarkers = [];
  let poiLoaded = false;
  let watchId = null;
  let userLatLng = null;   /* most-recent real position */
  let crimeLoaded = false;

  /* Default center (Ann Arbor) — will move to user's real location */
  const DEFAULT_CENTER = [42.2808, -83.7430];
  const DEFAULT_ZOOM = 15;

  function init() {
    if (map) return; /* prevent double-init */
    map = L.map('map', {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true
    });

    /* CARTO dark_all — clean dark tiles, no CSS filter needed */
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19
    }).addTo(map);

    /* Try to get user location */
    locateUser();

    /* Load POIs when map becomes idle after initial load */
    map.once('moveend', () => {
      loadNearbyPOIs();
      loadBuildings();
      renderHotspots();
    });

    /* Reload POIs when user pans significantly */
    map.on('moveend', debounce(() => {
      if (poiLoaded) loadNearbyPOIs();
      if (crimeLoaded) loadCrimeData();
      loadBuildings();
      renderHotspots();
    }, 1500));

    /* ===== LONG-PRESS TO ROUTE ===== */
    let _lpTimer = null;
    let _lpMoved = false;

    function startLongPress(e) {
      _lpMoved = false;
      _lpTimer = setTimeout(() => {
        if (_lpMoved) return;
        handleLongPress(e.latlng);
      }, 600);
    }
    function cancelLongPress() {
      _lpMoved = true;
      clearTimeout(_lpTimer);
    }

    map.on('mousedown',  startLongPress);
    map.on('touchstart', (e) => {
      if (e.originalEvent && e.originalEvent.touches && e.originalEvent.touches.length === 1) {
        startLongPress(e);
      }
    });
    map.on('mousemove',  cancelLongPress);
    map.on('touchmove',  cancelLongPress);
    map.on('mouseup',    cancelLongPress);
    map.on('touchend',   cancelLongPress);
    map.on('dragstart',  cancelLongPress);

    function handleLongPress(latlng) {
      /* Reverse-geocode the tapped point */
      const lat = latlng.lat.toFixed(6);
      const lng = latlng.lng.toFixed(6);

      /* Drop a destination marker immediately */
      clearDestination();
      setDestination([latlng.lat, latlng.lng], `${lat}, ${lng}`);

      /* Show bottom sheet with placeholder while reverse-geocoding */
      const userPos = getUserPosition();
      const dist = map.distance([userPos.lat, userPos.lng], [latlng.lat, latlng.lng]);
      const distStr = dist < 1000 ? `${Math.round(dist)}m away` : `${(dist / 1609.34).toFixed(1)} mi away`;

      showBottomSheet({
        title: '\ud83d\udccd Dropped Pin',
        desc: 'Resolving address\u2026',
        time: '',
        distance: distStr,
        lat: latlng.lat,
        lng: latlng.lng,
        routable: true
      });

      /* Attempt reverse geocode */
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' }
      })
        .then(r => r.json())
        .then(data => {
          const name = data.display_name || `${lat}, ${lng}`;
          const short = data.address
            ? [data.address.road, data.address.city || data.address.town || data.address.village].filter(Boolean).join(', ') || name
            : name;
          clearDestination();
          setDestination([latlng.lat, latlng.lng], short);
          showBottomSheet({
            title: '\ud83d\udccd ' + short,
            desc: name,
            time: '',
            distance: distStr,
            lat: latlng.lat,
            lng: latlng.lng,
            routable: true
          });
        })
        .catch(() => { /* keep the coordinate-based sheet */ });
    }
  }

  /* ===== USER LOCATION ===== */
  function locateUser() {
    /* Check if geolocation is available AND we're on a secure context */
    const secureCtx = window.isSecureContext !== false; /* true on localhost, HTTPS, or older browsers */

    if (navigator.geolocation && secureCtx) {
      /* One-shot high-accuracy fix first (fast feedback) */
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const latlng = [pos.coords.latitude, pos.coords.longitude];
          setUserPosition(latlng);
          map.setView(latlng, DEFAULT_ZOOM);
          if (!crimeLoaded) loadCrimeData();
        },
        (err) => {
          console.warn('[Geo] Browser geolocation failed:', err.message);
          /* Fall back to IP geolocation */
          ipGeolocate();
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );

      /* Continuous watch — keeps the dot moving in real time */
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const latlng = [pos.coords.latitude, pos.coords.longitude];
          setUserPosition(latlng);
        },
        () => { /* ignore watch errors */ },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    } else {
      console.warn('[Geo] Geolocation unavailable (not secure context or no API). Using IP lookup.');
      ipGeolocate();
    }
  }

  /* IP-based geolocation fallback — works over plain HTTP / LAN */
  async function ipGeolocate() {
    try {
      const resp = await fetch('https://ip-api.com/json/?fields=lat,lon,city,regionName,country');
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();
      if (data.lat && data.lon) {
        const latlng = [data.lat, data.lon];
        console.info(`[Geo] IP location: ${data.city || ''}, ${data.regionName || ''} (${latlng})`);
        setUserPosition(latlng);
        map.setView(latlng, DEFAULT_ZOOM);
        if (!crimeLoaded) loadCrimeData();
        return;
      }
    } catch (err) {
      console.warn('[Geo] IP geolocation failed:', err);
    }
    /* Last resort: default center */
    setUserPosition(DEFAULT_CENTER);
    if (!crimeLoaded) loadCrimeData();
  }

  /* Re-center map on current real position (homing button) */
  function goHome() {
    const pos = userLatLng || DEFAULT_CENTER;
    map.flyTo(pos, DEFAULT_ZOOM, { duration: 0.8 });
  }

  function setUserPosition(latlng) {
    userLatLng = latlng;   /* cache for homing */
    if (userMarker) {
      userMarker.setLatLng(latlng);
      return;
    }

    /* Navigation arrow pointer — matches reference design */
    const userIcon = L.divIcon({
      className: 'user-marker',
      html: `
        <div style="position:relative;width:52px;height:52px;">
          <!-- Outer glow ring -->
          <div style="
            position:absolute;
            top:0;left:0;
            width:52px;height:52px;
            border-radius:50%;
            background:radial-gradient(circle, rgba(108,99,255,0.2) 0%, rgba(108,99,255,0) 70%);
            animation:userGlow 3s ease-in-out infinite;
          "></div>
          <!-- Pulse ring -->
          <div style="
            position:absolute;
            top:6px;left:6px;
            width:40px;height:40px;
            border-radius:50%;
            border:2px solid rgba(108,99,255,0.25);
            animation:userPulse 3s ease-out infinite;
          "></div>
          <!-- Arrow body -->
          <div style="
            position:absolute;
            top:10px;left:10px;
            width:32px;height:32px;
            display:flex;
            align-items:center;
            justify-content:center;
            background:rgba(108,99,255,0.9);
            border-radius:50%;
            box-shadow:0 0 24px rgba(108,99,255,0.6), 0 0 48px rgba(108,99,255,0.25);
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none">
              <polygon points="12,2 22,22 12,17 2,22"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [52, 52],
      iconAnchor: [26, 26]
    });

    userMarker = L.marker(latlng, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
  }

  /* ===== HOLLOW POI CIRCLES ===== */
  /* Fetch real POIs from Overpass API and show as hollow purple circles */
  async function loadNearbyPOIs() {
    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();

    /* Only fetch at reasonable zoom levels */
    if (map.getZoom() < 13) return;

    try {
      const query = `
        [out:json][timeout:10];
        (
          node["amenity"~"restaurant|cafe|bar|library|university|hospital|pharmacy|police|fire_station|bank|cinema|theatre"](${south},${west},${north},${east});
          node["tourism"~"museum|hotel|attraction|viewpoint"](${south},${west},${north},${east});
          node["shop"~"supermarket|mall|convenience"](${south},${west},${north},${east});
        );
        out body 80;
      `;

      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query)
      });

      if (!resp.ok) return;

      const data = await resp.json();

      /* Clear old POI markers */
      poiMarkers.forEach(m => m.remove());
      poiMarkers = [];

      data.elements.forEach(el => {
        if (!el.lat || !el.lon) return;

        const name = el.tags?.name || '';
        const type = el.tags?.amenity || el.tags?.tourism || el.tags?.shop || '';

        /* Hollow purple circle matching reference */
        const dotIcon = L.divIcon({
          className: 'poi-marker',
          html: `
            <div style="
              width:12px;height:12px;
              border-radius:50%;
              background:transparent;
              border:2px solid #6C63FF;
              box-shadow:0 0 6px rgba(108,99,255,0.35);
            "></div>
          `,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });

        const marker = L.marker([el.lat, el.lon], { icon: dotIcon }).addTo(map);

        /* Clicking a POI opens the bottom sheet with details */
        marker.on('click', () => {
          const userPos = getUserPosition();
          const dist = map.distance([userPos.lat, userPos.lng], [el.lat, el.lon]);
          let distStr;
          if (dist < 1000) distStr = `${Math.round(dist)}m away`;
          else distStr = `${(dist / 1609.34).toFixed(1)} mi away`;

          const displayType = type.replace(/_/g, ' ');
          const displayName = name || displayType || 'Point of Interest';

          showBottomSheet({
            title: displayName,
            desc: displayType && name ? displayType.charAt(0).toUpperCase() + displayType.slice(1) : '',
            time: 'Nearby',
            distance: distStr,
            lat: el.lat,
            lng: el.lon
          });
        });

        poiMarkers.push(marker);
      });

      poiLoaded = true;
    } catch (err) {
      console.warn('[Map] POI fetch failed:', err);
    }
  }

  /* ===== BUILDING FOOTPRINTS ===== */
  let buildingLayer = null;
  let _buildingAbort = null;

  async function loadBuildings() {
    const zoom = map.getZoom();
    /* Only load buildings at zoom >= 16 to avoid huge queries */
    if (zoom < 16) {
      if (buildingLayer) { buildingLayer.remove(); buildingLayer = null; }
      return;
    }

    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

    /* Abort previous request if still pending */
    if (_buildingAbort) _buildingAbort.abort();
    _buildingAbort = new AbortController();

    const query = `[out:json][timeout:10];(way["building"](${bbox}););out body;>;out skel qt;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
      const resp = await fetch(url, { signal: _buildingAbort.signal });
      if (!resp.ok) return;
      const data = await resp.json();

      /* Build a node lookup (id → {lat, lon}) */
      const nodes = {};
      data.elements.forEach(el => {
        if (el.type === 'node') nodes[el.id] = [el.lat, el.lon];
      });

      /* Clear old layer */
      if (buildingLayer) { buildingLayer.remove(); buildingLayer = null; }

      const polygons = [];
      data.elements.forEach(el => {
        if (el.type !== 'way' || !el.nodes) return;
        const coords = el.nodes.map(nid => nodes[nid]).filter(Boolean);
        if (coords.length < 3) return;
        polygons.push(L.polygon(coords, {
          color: '#3a3a5c',
          fillColor: '#1e1e34',
          fillOpacity: 0.55,
          weight: 0.8,
          interactive: false
        }));
      });

      if (polygons.length > 0) {
        buildingLayer = L.layerGroup(polygons).addTo(map);
        /* Keep buildings behind markers */
        buildingLayer.eachLayer(l => l.bringToBack && l.bringToBack());
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('[Map] Building fetch failed:', err);
    }
  }

  /* ===== DESTINATION MARKER ===== */
  function setDestination(latlng, name) {
    clearDestination();

    const destIcon = L.divIcon({
      className: 'dest-marker',
      html: `
        <div style="position:relative;width:20px;height:20px;">
          <div style="
            width:16px;height:16px;
            margin:2px;
            border-radius:50%;
            background:#FF3D71;
            border:3px solid #E8E8F0;
            box-shadow:0 0 16px rgba(255,61,113,0.5);
          "></div>
        </div>
        <div style="
          position:absolute;top:22px;left:50%;
          transform:translateX(-50%);
          white-space:nowrap;
          font-family:Inter,sans-serif;
          font-size:11px;
          font-weight:600;
          color:#E8E8F0;
          background:rgba(10,10,20,0.85);
          padding:3px 10px;
          border-radius:8px;
          border:1px solid rgba(255,61,113,0.3);
          pointer-events:none;
          backdrop-filter:blur(8px);
        ">${name}</div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    destinationMarker = L.marker(latlng, { icon: destIcon, zIndexOffset: 900 }).addTo(map);
    map.flyTo(latlng, 15, { duration: 0.8 });
  }

  function clearDestination() {
    if (destinationMarker) {
      destinationMarker.remove();
      destinationMarker = null;
    }
  }

  /* ===== REPORT MARKERS ===== */
  function addReportMarker(latlng, category, emoji) {
    const icon = L.divIcon({
      className: 'report-marker',
      html: `<div style="
        font-size:18px;
        background:rgba(20,20,34,0.9);
        border:1px solid rgba(255,214,0,0.3);
        border-radius:8px;
        padding:4px 6px;
        box-shadow:0 2px 12px rgba(0,0,0,0.4);
        backdrop-filter:blur(8px);
      ">${emoji}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    const marker = L.marker(latlng, { icon }).addTo(map);
    reportMarkers.push(marker);

    /* Clicking a report marker opens the bottom sheet */
    marker.on('click', () => {
      const userPos = getUserPosition();
      const dist = map.distance([userPos.lat, userPos.lng], latlng);
      let distStr;
      if (dist < 1000) distStr = `${Math.round(dist)}m away`;
      else distStr = `${(dist / 1609.34).toFixed(1)} mi away`;

      showBottomSheet({
        title: `${emoji} ${category}`,
        desc: 'Community safety report in this area.',
        time: 'Just now',
        distance: distStr,
        lat: latlng[0],
        lng: latlng[1],
        routable: false
      });
    });

    /* Auto-show after filing the report */
    const userPos = getUserPosition();
    const dist = map.distance([userPos.lat, userPos.lng], latlng);
    let distStr;
    if (dist < 1000) distStr = `${Math.round(dist)}m away`;
    else distStr = `${(dist / 1609.34).toFixed(1)} mi away`;

    showBottomSheet({
      title: `${emoji} ${category}`,
      desc: 'Your report has been submitted. Thank you for keeping the community safe.',
      time: 'Just now',
      distance: distStr,
      lat: latlng[0],
      lng: latlng[1],
      routable: false
    });

    return marker;
  }

  /* ===== BOTTOM SHEET HELPER ===== */
  function showBottomSheet({ title, desc, time, distance, lat, lng, routable }) {
    const sheet = document.getElementById('bottomSheet');
    const titleEl = document.getElementById('sheetTitle');
    const descEl = document.getElementById('sheetDesc');
    const timeEl = document.getElementById('sheetTime');
    const distEl = document.getElementById('sheetDistance');
    const routeBtn = document.getElementById('sheetRouteBtn');
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc || '';
    if (timeEl) timeEl.textContent = time || '';
    if (distEl) distEl.textContent = distance || '';

    /* Show or hide the route button */
    if (routeBtn) routeBtn.style.display = (routable === false) ? 'none' : '';

    /* Store coords so "Get the Route" can use them */
    if (sheet) {
      sheet.dataset.lat = lat;
      sheet.dataset.lng = lng;
    }
    sheet?.classList.remove('hidden');
  }

  function hideBottomSheet() {
    document.getElementById('bottomSheet')?.classList.add('hidden');
  }

  /* ===== REAL CRIME DATA ===== */
  /*
   * Two data sources:
   *   1) UK Police API  — free, no key, street-level incidents (England/Wales/NI)
   *   2) FBI Crime Data Explorer — US, keyed, agency-level stats
   * We reverse-geocode the user to pick the right source automatically.
   */

  const FBI_KEY = 'ody84hVzAvaJ7qrxasROnT7X8cDUFc7XURNSYF7Z';
  const FBI_BASE = 'https://api.usa.gov/crime/fbi/sapi';

  /* shared icon/color map for both UK + FBI categories */
  const CRIME_ICONS = {
    /* UK Police categories */
    'anti-social-behaviour':   { emoji: '🗣️', color: '#FFA726' },
    'burglary':                { emoji: '🏠', color: '#EF5350' },
    'criminal-damage-arson':   { emoji: '🔥', color: '#FF7043' },
    'drugs':                   { emoji: '💊', color: '#AB47BC' },
    'other-theft':             { emoji: '👜', color: '#FFCA28' },
    'possession-of-weapons':   { emoji: '🔪', color: '#F44336' },
    'public-order':            { emoji: '📢', color: '#FFA000' },
    'robbery':                 { emoji: '💰', color: '#E53935' },
    'shoplifting':             { emoji: '🛒', color: '#FFB300' },
    'theft-from-the-person':   { emoji: '🎒', color: '#FB8C00' },
    'vehicle-crime':           { emoji: '🚗', color: '#FF5722' },
    'violent-crime':           { emoji: '⚠️', color: '#D32F2F' },
    'bicycle-theft':           { emoji: '🚲', color: '#FF9800' },
    'other-crime':             { emoji: '❓', color: '#78909C' },
    /* FBI / generic US categories */
    'aggravated-assault':      { emoji: '🤛', color: '#D32F2F' },
    'homicide':                { emoji: '💀', color: '#B71C1C' },
    'rape':                    { emoji: '⚠️', color: '#C62828' },
    'arson':                   { emoji: '🔥', color: '#FF7043' },
    'motor-vehicle-theft':     { emoji: '🚗', color: '#FF5722' },
    'larceny':                 { emoji: '👜', color: '#FFCA28' },
    'property-crime':          { emoji: '🏚️', color: '#FF8F00' },
    'violent-crime-us':        { emoji: '⚠️', color: '#D32F2F' },
  };

  let _cachedCountry = null;   /* { code, state } — avoids re-geocoding on every pan */

  /*
   * Spatial thinning — keep only items that are at least `minDist` metres apart.
   * Items earlier in the array have priority (so sort by severity first).
   * Each item must expose lat/lng via the `latFn`/`lngFn` accessors.
   */
  function thinByDistance(items, minDist, latFn, lngFn) {
    const kept = [];
    for (const item of items) {
      const lat = latFn(item);
      const lng = lngFn(item);
      if (isNaN(lat) || isNaN(lng)) continue;
      let tooClose = false;
      for (const k of kept) {
        const dlat = lat - latFn(k);
        const dlng = lng - lngFn(k);
        /* Quick Euclidean approximation in metres (good enough for short distances) */
        const d = Math.sqrt(dlat * dlat + dlng * dlng) * 111320;
        if (d < minDist) { tooClose = true; break; }
      }
      if (!tooClose) kept.push(item);
    }
    return kept;
  }

  /* ---- dispatcher ---- */
  async function loadCrimeData() {
    const pos = getUserPosition();

    try {
      /* Reverse-geocode to detect country + state + city (cached after first call) */
      if (!_cachedCountry) {
        const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json&zoom=10&addressdetails=1`;
        const geoResp = await fetch(geoUrl, { headers: { 'Accept-Language': 'en' } });
        const geoData = geoResp.ok ? await geoResp.json() : null;
        _cachedCountry = {
          code: geoData?.address?.country_code || '',
          state: geoData?.address?.state || '',
          city: (geoData?.address?.city || geoData?.address?.town || geoData?.address?.county || '').toLowerCase()
        };
      }

      const { code: countryCode, state, city } = _cachedCountry;

      if (countryCode === 'gb') {
        await loadUKCrimeData(pos);
      } else if (countryCode === 'us' && city.includes('detroit')) {
        /* Detroit has street-level open data — much richer than FBI agency stats */
        await loadDetroitCrimeData(pos);
      } else if (countryCode === 'us') {
        await loadFBICrimeData(pos, state);
      } else {
        console.info('[Crime] Location not in UK or US — using community reports only.');
        crimeLoaded = true;
      }
    } catch (err) {
      console.warn('[Crime] Country detection failed, trying both sources:', err);
      /* Fallback: try UK first, then FBI */
      await loadUKCrimeData(pos);
      if (crimeMarkers.length === 0) {
        await loadFBICrimeData(pos, '');
      }
    }
  }

  /* ---- UK Police API (street-level incidents) ---- */
  async function loadUKCrimeData(pos) {
    try {
      const url = `https://data.police.uk/api/crimes-street/all-crime?lat=${pos.lat}&lng=${pos.lng}`;
      const resp = await fetch(url);

      if (!resp.ok) {
        crimeLoaded = true;
        return;
      }

      const crimes = await resp.json();
      if (!Array.isArray(crimes) || crimes.length === 0) { crimeLoaded = true; return; }

      crimeMarkers.forEach(m => m.remove());
      crimeMarkers = [];

      const priority = ['violent-crime', 'robbery', 'possession-of-weapons', 'burglary', 'criminal-damage-arson'];
      crimes.sort((a, b) => {
        const ai = priority.indexOf(a.category);
        const bi = priority.indexOf(b.category);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      /* Thin out spatially — keep ≥80 m apart, cap at 60 markers */
      const thinned = thinByDistance(
        crimes,
        80,
        c => parseFloat(c.location?.latitude),
        c => parseFloat(c.location?.longitude)
      ).slice(0, 60);

      thinned.forEach(crime => {
        const clat = parseFloat(crime.location?.latitude);
        const clng = parseFloat(crime.location?.longitude);
        if (isNaN(clat) || isNaN(clng)) return;

        const info = CRIME_ICONS[crime.category] || CRIME_ICONS['other-crime'];
        const streetName = crime.location?.street?.name || 'Unknown street';
        const month = crime.month || '';

        const icon = L.divIcon({
          className: 'crime-marker',
          html: `<div style="
            font-size:14px;width:28px;height:28px;
            display:flex;align-items:center;justify-content:center;
            background:rgba(20,20,34,0.92);
            border:1.5px solid ${info.color}55;border-radius:50%;
            box-shadow:0 0 8px ${info.color}40;
          ">${info.emoji}</div>`,
          iconSize: [28, 28], iconAnchor: [14, 14]
        });

        const marker = L.marker([clat, clng], { icon }).addTo(map);
        marker.on('click', () => {
          const d = map.distance([pos.lat, pos.lng], [clat, clng]);
          const distStr = d < 1000 ? `${Math.round(d)}m away` : `${(d / 1609.34).toFixed(1)} mi away`;
          const cat = crime.category.replace(/-/g, ' ');
          showBottomSheet({
            title: `${info.emoji} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
            desc: `Reported on or near ${streetName}.${crime.outcome_status ? ' Outcome: ' + crime.outcome_status.category + '.' : ''}`,
            time: month || 'Recent',
            distance: distStr, lat: clat, lng: clng,
            routable: false
          });
        });
        crimeMarkers.push(marker);
      });

      crimeLoaded = true;
      console.info(`[Crime] UK: ${crimeMarkers.length} street-level incidents loaded.`);
    } catch (err) {
      console.warn('[Crime] UK API error:', err);
      crimeLoaded = true;
    }
  }

  /* ---- Detroit Open Data (street-level incidents via SODA API) ---- */
  async function loadDetroitCrimeData(pos) {
    try {
      /* Detroit Open Data — RMS Crime Incidents
       * Dataset: data.detroitmi.gov  resource id: wgv9-drfc
       * Fields: offense_description, offense_category, latitude, longitude,
       *         incident_address, incident_timestamp, council_district, etc.
       * Public Socrata SODA endpoint — no key required. */

      const bounds = map.getBounds();
      const south = bounds.getSouth(), north = bounds.getNorth();
      const west = bounds.getWest(), east = bounds.getEast();

      /* Fetch incidents within the current map viewport, last 90 days, up to 200 */
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const url = `https://data.detroitmi.gov/resource/wgv9-drfc.json?` +
        `$where=latitude IS NOT NULL ` +
        `AND latitude > ${south} AND latitude < ${north} ` +
        `AND longitude > ${west} AND longitude < ${east} ` +
        `AND incident_timestamp > '${since}'` +
        `&$order=incident_timestamp DESC` +
        `&$limit=200`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Detroit SODA returned ${resp.status}`);
      const incidents = await resp.json();

      if (!Array.isArray(incidents) || incidents.length === 0) {
        console.info('[Crime] Detroit: no recent incidents in viewport.');
        crimeLoaded = true;
        return;
      }

      crimeMarkers.forEach(m => m.remove());
      crimeMarkers = [];

      /* Thin out spatially — keep ≥80 m apart, cap at 60 markers */
      const thinned = thinByDistance(
        incidents,
        80,
        i => parseFloat(i.latitude),
        i => parseFloat(i.longitude)
      ).slice(0, 60);

      thinned.forEach(inc => {
        const clat = parseFloat(inc.latitude);
        const clng = parseFloat(inc.longitude);
        if (isNaN(clat) || isNaN(clng)) return;

        const cat = (inc.offense_category || inc.category || '').toLowerCase();
        const desc = inc.offense_description || inc.description || cat || 'Unknown offense';
        const address = inc.incident_address || inc.address || 'Unknown location';
        const ts = inc.incident_timestamp || inc.report_timestamp || '';

        const info = detroitCategoryIcon(cat, desc);

        const icon = L.divIcon({
          className: 'crime-marker',
          html: `<div style="
            font-size:14px;width:28px;height:28px;
            display:flex;align-items:center;justify-content:center;
            background:rgba(20,20,34,0.92);
            border:1.5px solid ${info.color}55;border-radius:50%;
            box-shadow:0 0 8px ${info.color}40;
          ">${info.emoji}</div>`,
          iconSize: [28, 28], iconAnchor: [14, 14]
        });

        const marker = L.marker([clat, clng], { icon }).addTo(map);

        marker.on('click', () => {
          const d = map.distance([pos.lat, pos.lng], [clat, clng]);
          const distStr = d < 1000 ? `${Math.round(d)}m away` : `${(d / 1609.34).toFixed(1)} mi away`;

          let timeStr = 'Recent';
          if (ts) {
            const dt = new Date(ts);
            const diff = Date.now() - dt.getTime();
            if (diff < 3600000) timeStr = `${Math.round(diff / 60000)}m ago`;
            else if (diff < 86400000) timeStr = `${Math.round(diff / 3600000)}h ago`;
            else timeStr = `${Math.round(diff / 86400000)}d ago`;
          }

          const title = desc.length > 40 ? desc.slice(0, 37) + '…' : desc;
          showBottomSheet({
            title: `${info.emoji} ${title}`,
            desc: `${desc}\n📍 ${address}${ts ? '\n🕐 ' + new Date(ts).toLocaleString() : ''}`,
            time: timeStr,
            distance: distStr,
            lat: clat, lng: clng,
            routable: false
          });
        });

        crimeMarkers.push(marker);
      });

      crimeLoaded = true;
      console.info(`[Crime] Detroit: ${crimeMarkers.length} street-level incidents loaded.`);
    } catch (err) {
      console.warn('[Crime] Detroit API error:', err);
      /* Fall back to FBI for Michigan */
      await loadFBICrimeData(pos, 'Michigan');
    }
  }

  /* Map Detroit offense categories/descriptions to icons */
  function detroitCategoryIcon(cat, desc) {
    const d = (cat + ' ' + desc).toLowerCase();
    if (d.includes('homicide') || d.includes('murder'))          return { emoji: '💀', color: '#B71C1C' };
    if (d.includes('csc') || d.includes('rape') || d.includes('sexual')) return { emoji: '⚠️', color: '#C62828' };
    if (d.includes('robbery'))                                   return { emoji: '💰', color: '#E53935' };
    if (d.includes('assault') || d.includes('battery'))          return { emoji: '🤛', color: '#D32F2F' };
    if (d.includes('shooting') || d.includes('weapon') || d.includes('firearm')) return { emoji: '🔫', color: '#F44336' };
    if (d.includes('burglary') || d.includes('breaking'))        return { emoji: '🏠', color: '#EF5350' };
    if (d.includes('arson'))                                     return { emoji: '🔥', color: '#FF7043' };
    if (d.includes('vehicle') || d.includes('carjack'))          return { emoji: '🚗', color: '#FF5722' };
    if (d.includes('larceny') || d.includes('theft') || d.includes('steal')) return { emoji: '👜', color: '#FFCA28' };
    if (d.includes('drug') || d.includes('narcotic'))            return { emoji: '💊', color: '#AB47BC' };
    if (d.includes('fraud') || d.includes('forgery'))            return { emoji: '📄', color: '#78909C' };
    if (d.includes('vandal') || d.includes('damage'))            return { emoji: '🔨', color: '#FF8F00' };
    if (d.includes('kidnap'))                                    return { emoji: '🚨', color: '#D32F2F' };
    return { emoji: '❓', color: '#78909C' };
  }

  /* ---- FBI Crime Data Explorer (US agency-level stats) ---- */

  /* Map US state name → 2-letter abbreviation */
  const US_STATES = {
    'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
    'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
    'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
    'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
    'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
    'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
    'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
    'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
    'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
    'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
    'district of columbia':'DC'
  };

  async function loadFBICrimeData(pos, stateName) {
    try {
      const stateAbbr = US_STATES[stateName.toLowerCase()] || '';
      if (!stateAbbr) {
        console.warn('[Crime] Could not determine US state abbreviation for:', stateName);
        crimeLoaded = true;
        return;
      }

      console.info(`[Crime] FBI: Loading agencies for ${stateAbbr}…`);

      /* 1) Fetch all agencies in this state */
      const agUrl = `${FBI_BASE}/api/agencies/byStateAbbr/${stateAbbr}?API_KEY=${FBI_KEY}`;
      const agResp = await fetch(agUrl);
      if (!agResp.ok) throw new Error(`FBI agencies endpoint returned ${agResp.status}`);
      const agData = await agResp.json();

      /* The response may have different shapes depending on API version */
      let agencies = Array.isArray(agData) ? agData : (agData?.results || agData?.data || []);

      /* Filter to agencies with coordinates near the user (within ~15 km / ~9 mi) */
      const MAX_DIST = 15000; /* metres */
      const nearby = agencies.filter(a => {
        const alat = parseFloat(a.latitude);
        const alng = parseFloat(a.longitude);
        if (isNaN(alat) || isNaN(alng)) return false;
        const d = map.distance([pos.lat, pos.lng], [alat, alng]);
        return d <= MAX_DIST;
      }).slice(0, 30); /* cap for performance */

      if (nearby.length === 0) {
        console.info('[Crime] FBI: No agencies found within 15 km.');
        crimeLoaded = true;
        return;
      }

      crimeMarkers.forEach(m => m.remove());
      crimeMarkers = [];

      /* 2) For each nearby agency, place a marker and lazily load crime stats on click */
      const currentYear = new Date().getFullYear();
      /* FBI data is usually 1-2 years delayed; try recent years */
      const dataYear = currentYear - 2;

      for (const agency of nearby) {
        const alat = parseFloat(agency.latitude);
        const alng = parseFloat(agency.longitude);
        const ori = agency.ori || agency.ORI || '';
        const agencyName = agency.agency_name || agency.agency_type_name || 'Law Enforcement Agency';

        const icon = L.divIcon({
          className: 'crime-marker',
          html: `<div style="
            font-size:14px;width:30px;height:30px;
            display:flex;align-items:center;justify-content:center;
            background:rgba(20,20,34,0.92);
            border:1.5px solid #EF535055;border-radius:50%;
            box-shadow:0 0 10px rgba(239,83,80,0.35);
          ">🚔</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15]
        });

        const marker = L.marker([alat, alng], { icon }).addTo(map);

        /* On click — fetch crime stats for this specific agency */
        marker.on('click', async () => {
          const d = map.distance([pos.lat, pos.lng], [alat, alng]);
          const distStr = d < 1000 ? `${Math.round(d)}m away` : `${(d / 1609.34).toFixed(1)} mi away`;

          /* Show agency name immediately while stats load */
          showBottomSheet({
            title: `🚔 ${agencyName}`,
            desc: 'Loading FBI crime data…',
            time: `${stateAbbr}`,
            distance: distStr,
            lat: alat, lng: alng,
            routable: false
          });

          if (!ori) return;

          /* Try to fetch summarized crime data for this agency */
          try {
            const statsUrl = `${FBI_BASE}/api/summarized/agency/${ori}/offenses/${dataYear}/${dataYear}?API_KEY=${FBI_KEY}`;
            const statsResp = await fetch(statsUrl);
            if (!statsResp.ok) throw new Error(statsResp.status);
            const statsData = await statsResp.json();

            const rows = Array.isArray(statsData) ? statsData : (statsData?.results || statsData?.data || []);
            if (rows.length === 0) {
              showBottomSheet({
                title: `🚔 ${agencyName}`,
                desc: `No detailed crime breakdown available for ${dataYear}. The agency may not have reported to the FBI UCR program this year.`,
                time: stateAbbr,
                distance: distStr,
                lat: alat, lng: alng,
                routable: false
              });
              return;
            }

            /* Build a human-readable summary from the offense rows */
            const summary = buildFBICrimeSummary(rows, dataYear);
            showBottomSheet({
              title: `🚔 ${agencyName}`,
              desc: summary,
              time: `${dataYear} data · ${stateAbbr}`,
              distance: distStr,
              lat: alat, lng: alng,
              routable: false
            });
          } catch (statsErr) {
            /* Try state-level estimates as fallback */
            try {
              const estUrl = `${FBI_BASE}/api/estimates/states/${stateAbbr}/${dataYear}/${dataYear}?API_KEY=${FBI_KEY}`;
              const estResp = await fetch(estUrl);
              if (estResp.ok) {
                const estData = await estResp.json();
                const est = Array.isArray(estData) ? estData[0] : (estData?.results?.[0] || estData);
                if (est) {
                  showBottomSheet({
                    title: `🚔 ${agencyName}`,
                    desc: buildStateEstimateSummary(est, stateAbbr, dataYear),
                    time: `${dataYear} state data · ${stateAbbr}`,
                    distance: distStr,
                    lat: alat, lng: alng,
                    routable: false
                  });
                  return;
                }
              }
              showBottomSheet({
                title: `🚔 ${agencyName}`,
                desc: 'Crime statistics temporarily unavailable for this agency.',
                time: stateAbbr,
                distance: distStr,
                lat: alat, lng: alng,
                routable: false
              });
            } catch {
              /* already showing something, just leave it */
            }
          }
        });

        crimeMarkers.push(marker);
      }

      crimeLoaded = true;
      console.info(`[Crime] FBI: ${crimeMarkers.length} agency markers placed for ${stateAbbr}.`);
    } catch (err) {
      console.warn('[Crime] FBI API error:', err);
      crimeLoaded = true;
    }
  }

  /* Format FBI agency offense rows into a readable string */
  function buildFBICrimeSummary(rows, year) {
    /* rows are typically objects with offense + actual/cleared counts */
    const offenses = {};
    rows.forEach(r => {
      const name = r.offense || r.offense_name || r.key || 'Unknown';
      const actual = r.actual || r.reported || r.value || 0;
      const cleared = r.cleared || 0;
      if (actual > 0) {
        offenses[name] = (offenses[name] || 0) + actual;
      }
    });

    const entries = Object.entries(offenses)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (entries.length === 0) return `No reported offenses for ${year}.`;

    const total = entries.reduce((s, [, v]) => s + v, 0);
    const lines = entries.map(([k, v]) => {
      const label = k.replace(/-|_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `${label}: ${v.toLocaleString()}`;
    });

    return `${total.toLocaleString()} total reported offenses (${year}):\n${lines.join(' · ')}`;
  }

  /* Format state estimate data */
  function buildStateEstimateSummary(est, abbr, year) {
    const parts = [];
    if (est.violent_crime)      parts.push(`Violent crime: ${est.violent_crime.toLocaleString()}`);
    if (est.homicide)           parts.push(`Homicide: ${est.homicide.toLocaleString()}`);
    if (est.robbery)            parts.push(`Robbery: ${est.robbery.toLocaleString()}`);
    if (est.aggravated_assault) parts.push(`Aggravated assault: ${est.aggravated_assault.toLocaleString()}`);
    if (est.property_crime)     parts.push(`Property crime: ${est.property_crime.toLocaleString()}`);
    if (est.burglary)           parts.push(`Burglary: ${est.burglary.toLocaleString()}`);
    if (est.larceny)            parts.push(`Larceny: ${est.larceny.toLocaleString()}`);
    if (est.motor_vehicle_theft) parts.push(`Vehicle theft: ${est.motor_vehicle_theft.toLocaleString()}`);

    if (parts.length === 0) return `State-level crime estimates not available for ${abbr} (${year}).`;

    const pop = est.population ? ` (pop. ${est.population.toLocaleString()})` : '';
    return `${abbr} statewide estimates${pop} — ${year}:\n${parts.join(' · ')}`;
  }

  /* ===== SIMULATED CRIME HOTSPOTS ===== */
  /*
   * Deterministic seeded random generator so hotspots are consistent
   * for any given area (same lat/lng grid cell → same hotspots).
   * This replaces random safety scores with real geometry-based scoring.
   */
  let hotspotMarkers = [];
  let hotspotLayer = null;
  const _hotspotCache = {};  /* grid-key → hotspot[] */

  /* Simple seeded PRNG (mulberry32) */
  function seededRng(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* Hash a string to a 32-bit int */
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h;
  }

  const HOTSPOT_TYPES = [
    { type: 'theft',       emoji: '👜', label: 'Theft',              severity: 3, color: '#FFCA28' },
    { type: 'assault',     emoji: '⚠️', label: 'Assault',            severity: 5, color: '#F44336' },
    { type: 'robbery',     emoji: '💰', label: 'Robbery',            severity: 5, color: '#EF5350' },
    { type: 'vandalism',   emoji: '🔨', label: 'Vandalism',          severity: 2, color: '#FF7043' },
    { type: 'drugs',       emoji: '💊', label: 'Drug Activity',      severity: 3, color: '#AB47BC' },
    { type: 'burglary',    emoji: '🏠', label: 'Burglary',           severity: 4, color: '#FF5722' },
    { type: 'harassment',  emoji: '🚨', label: 'Harassment',         severity: 4, color: '#FF6F00' },
    { type: 'auto_theft',  emoji: '🚗', label: 'Vehicle Theft',      severity: 3, color: '#FFA726' },
    { type: 'disturbance', emoji: '🗣️', label: 'Public Disturbance', severity: 1, color: '#78909C' },
    { type: 'weapons',     emoji: '🔪', label: 'Weapons Offense',    severity: 5, color: '#D32F2F' },
  ];

  /* Generate hotspots for a grid cell (~0.01° ≈ 1km) */
  function generateHotspotsForCell(cellKey, cellLat, cellLng) {
    if (_hotspotCache[cellKey]) return _hotspotCache[cellKey];

    const rng = seededRng(hashStr(cellKey));
    const count = Math.floor(rng() * 2) + (rng() < 0.4 ? 1 : 0);  /* 0-2 hotspots per cell */
    const hotspots = [];

    for (let i = 0; i < count; i++) {
      const lat = cellLat + rng() * 0.01;
      const lng = cellLng + rng() * 0.01;
      const typeIdx = Math.floor(rng() * HOTSPOT_TYPES.length);
      const ht = HOTSPOT_TYPES[typeIdx];
      const recentCount = Math.floor(rng() * 8) + 1; /* 1-8 recent incidents */
      const radius = 40 + rng() * 120; /* 40-160 meter danger radius */

      hotspots.push({
        lat, lng, radius,
        ...ht,
        recentCount,
        id: `${cellKey}_${i}`
      });
    }

    _hotspotCache[cellKey] = hotspots;
    return hotspots;
  }

  /* Get all hotspots visible in current bounds (+ buffer) */
  function getHotspotsForBounds(bounds) {
    const buf = 0.005; /* small buffer */
    const south = bounds.getSouth() - buf;
    const west = bounds.getWest() - buf;
    const north = bounds.getNorth() + buf;
    const east = bounds.getEast() + buf;

    const step = 0.01;
    const hotspots = [];

    for (let lat = Math.floor(south / step) * step; lat <= north; lat += step) {
      for (let lng = Math.floor(west / step) * step; lng <= east; lng += step) {
        const key = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
        hotspots.push(...generateHotspotsForCell(key, lat, lng));
      }
    }
    return hotspots;
  }

  /* Show hotspot markers on the map */
  function renderHotspots() {
    /* Remove old */
    hotspotMarkers.forEach(m => m.remove());
    hotspotMarkers = [];
    if (hotspotLayer) { hotspotLayer.remove(); hotspotLayer = null; }

    if (map.getZoom() < 14) return; /* only show when zoomed in */

    const bounds = map.getBounds();
    const hotspots = getHotspotsForBounds(bounds);
    const circles = [];

    hotspots.forEach(hs => {
      /* Danger zone circle */
      circles.push(L.circle([hs.lat, hs.lng], {
        radius: hs.radius,
        color: hs.color,
        fillColor: hs.color,
        fillOpacity: 0.10,
        weight: 1,
        opacity: 0.25,
        interactive: false
      }));

      /* Small marker */
      const icon = L.divIcon({
        className: 'crime-hotspot-marker',
        html: `<div style="
          font-size:14px;
          background:rgba(20,20,34,0.85);
          border:1px solid ${hs.color}40;
          border-radius:8px;
          padding:3px 5px;
          box-shadow:0 2px 8px rgba(0,0,0,0.4);
          cursor:pointer;
        ">${hs.emoji}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([hs.lat, hs.lng], { icon }).addTo(map);
      marker.on('click', () => {
        const userPos = getUserPosition();
        const dist = map.distance([userPos.lat, userPos.lng], [hs.lat, hs.lng]);
        const distStr = dist < 1000 ? `${Math.round(dist)}m away` : `${(dist / 1609.34).toFixed(1)} mi away`;
        showBottomSheet({
          title: `${hs.emoji} ${hs.label}`,
          desc: `${hs.recentCount} incident${hs.recentCount > 1 ? 's' : ''} reported recently. Severity: ${'●'.repeat(hs.severity)}${'○'.repeat(5 - hs.severity)}`,
          time: 'Simulated data',
          distance: distStr,
          lat: hs.lat, lng: hs.lng,
          routable: false
        });
      });
      hotspotMarkers.push(marker);
    });

    if (circles.length > 0) {
      hotspotLayer = L.layerGroup(circles).addTo(map);
      hotspotLayer.eachLayer(l => l.bringToBack && l.bringToBack());
    }
  }

  /* ===== DANGER ZONES — combined real + simulated ===== */
  /**
   * Return an array of { lat, lng, radius (meters), severity } covering
   * both *real* crime markers already on the map and simulated hotspots.
   * @param {L.LatLngBounds} [bounds] — optional; defaults to current map view
   */
  function getDangerZones(bounds) {
    if (!bounds) bounds = map.getBounds();
    const zones = [];

    /* Real crime markers (UK/Detroit/FBI already on the map) */
    crimeMarkers.forEach(m => {
      try {
        const ll = m.getLatLng();
        if (bounds.contains(ll)) {
          zones.push({ lat: ll.lat, lng: ll.lng, radius: 100, severity: 3 });
        }
      } catch (_) { /* marker may have been removed */ }
    });

    /* Simulated hotspots */
    const hotspots = getHotspotsForBounds(bounds);
    hotspots.forEach(hs => {
      zones.push({ lat: hs.lat, lng: hs.lng, radius: hs.radius, severity: hs.severity });
    });

    return zones;
  }

  /* Public: score a route's safety based on hotspot + real crime proximity */
  function scoreRouteSafety(coords) {
    if (!coords || coords.length === 0) return 85;

    /* Build a bounding box around the route */
    const lats = coords.map(c => c[0]);
    const lngs = coords.map(c => c[1]);
    const bounds = L.latLngBounds(
      [Math.min(...lats) - 0.005, Math.min(...lngs) - 0.005],
      [Math.max(...lats) + 0.005, Math.max(...lngs) + 0.005]
    );

    /* Use combined danger zones (real + simulated) */
    const zones = getDangerZones(bounds);
    let dangerScore = 0;

    /* Sample every 5th coord to keep it fast */
    const step = Math.max(1, Math.floor(coords.length / 60));
    for (let i = 0; i < coords.length; i += step) {
      const [lat, lng] = coords[i];
      for (const z of zones) {
        const d = quickDist(lat, lng, z.lat, z.lng);
        const dangerRadius = z.radius / 111320; /* meters → degrees approx */
        if (d < dangerRadius * 2) {
          const proximity = 1 - Math.min(d / (dangerRadius * 2), 1);
          const incidents = z.recentCount || 1;
          dangerScore += proximity * z.severity * incidents * 0.4;
        }
      }
    }

    /* Convert danger score → safety score (0-100) */
    const safety = Math.max(15, Math.min(98, Math.round(90 - dangerScore)));
    return safety;
  }

  /* Fast approximate distance in degrees */
  function quickDist(lat1, lng1, lat2, lng2) {
    const dlat = lat1 - lat2;
    const dlng = (lng1 - lng2) * Math.cos(lat1 * Math.PI / 180);
    return Math.sqrt(dlat * dlat + dlng * dlng);
  }

  /* ===== UTILITIES ===== */
  function getMap() { return map; }

  function getUserPosition() {
    if (userLatLng) return { lat: userLatLng[0], lng: userLatLng[1] };
    return userMarker ? userMarker.getLatLng() : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
  }

  function flyTo(latlng, zoom) {
    map.flyTo(latlng, zoom || DEFAULT_ZOOM, { duration: 1 });
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  return {
    init, locateUser, goHome, getMap, getUserPosition,
    addReportMarker, flyTo, setDestination, clearDestination,
    showBottomSheet, hideBottomSheet,
    scoreRouteSafety, getHotspotsForBounds, getDangerZones, renderHotspots
  };
})();

/* User marker animations (injected into document) */
(function injectMapStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes userGlow {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(1.15); opacity: 1; }
    }
    @keyframes userPulse {
      0% { transform: scale(1); opacity: 0.5; }
      100% { transform: scale(1.8); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
})();
