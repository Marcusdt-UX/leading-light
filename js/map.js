/* ===== map.js — Interactive Safety Map ===== */

const MapModule = (() => {
  let map;
  let userMarker;
  let dangerZones = [];
  let reportMarkers = [];

  /* Ann Arbor campus center */
  const DEFAULT_CENTER = [42.2808, -83.7430];
  const DEFAULT_ZOOM = 15;

  /* Simulated safety zone data */
  const ZONES = [
    {
      lat: 42.2780,
      lng: -83.7382,
      radius: 120,
      level: 'danger',
      label: 'Poor lighting — Packard & State'
    },
    {
      lat: 42.2835,
      lng: -83.7485,
      radius: 100,
      level: 'caution',
      label: 'Reported incidents near S Division'
    },
    {
      lat: 42.2760,
      lng: -83.7450,
      radius: 90,
      level: 'danger',
      label: 'Unlit pathway — Burns Park'
    },
    {
      lat: 42.2830,
      lng: -83.7400,
      radius: 150,
      level: 'caution',
      label: 'Construction zone — E Liberty'
    },
    {
      lat: 42.2795,
      lng: -83.7455,
      radius: 130,
      level: 'safe',
      label: 'Well-lit shopping district — Main St'
    },
    {
      lat: 42.2818,
      lng: -83.7418,
      radius: 160,
      level: 'safe',
      label: 'U-M Central Campus — high foot traffic'
    }
  ];

  const ZONE_STYLES = {
    danger: { color: '#FF3D71', fillColor: '#FF3D71', fillOpacity: 0.18, weight: 1.5 },
    caution: { color: '#FFD600', fillColor: '#FFD600', fillOpacity: 0.14, weight: 1.5 },
    safe:   { color: '#00E676', fillColor: '#00E676', fillOpacity: 0.10, weight: 1.5 }
  };

  function init() {
    map = L.map('map', {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true
    });

    /* Jawg.Dark — beautiful free dark tile layer */
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19
    }).addTo(map);

    /* Draw safety zones */
    ZONES.forEach(zone => {
      const circle = L.circle([zone.lat, zone.lng], {
        radius: zone.radius,
        ...ZONE_STYLES[zone.level]
      }).addTo(map);

      circle.bindPopup(`
        <div style="font-family:Inter,sans-serif;font-size:13px;">
          <strong style="color:${ZONE_STYLES[zone.level].color}">${zone.level.toUpperCase()}</strong><br>
          ${zone.label}
        </div>
      `);

      dangerZones.push(circle);
    });

    /* Try to get user location */
    locateUser();
  }

  function locateUser() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        setUserPosition(latlng);
        map.setView(latlng, DEFAULT_ZOOM);
      },
      () => {
        /* Permission denied or error — stay at default */
        setUserPosition(DEFAULT_CENTER);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function setUserPosition(latlng) {
    if (userMarker) {
      userMarker.setLatLng(latlng);
      return;
    }

    const userIcon = L.divIcon({
      className: 'user-marker',
      html: `
        <div style="
          width:16px;height:16px;
          border-radius:50%;
          background:#6C63FF;
          border:3px solid #E8E8F0;
          box-shadow:0 0 12px rgba(108,99,255,0.5);
        "></div>
        <div style="
          position:absolute;top:-4px;left:-4px;
          width:24px;height:24px;
          border-radius:50%;
          border:2px solid rgba(108,99,255,0.3);
          animation:sosPulse 3s ease-out infinite;
        "></div>
      `,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    userMarker = L.marker(latlng, { icon: userIcon }).addTo(map);
  }

  function getMap() {
    return map;
  }

  function getUserPosition() {
    return userMarker ? userMarker.getLatLng() : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
  }

  function addReportMarker(latlng, category, emoji) {
    const icon = L.divIcon({
      className: 'report-marker',
      html: `<div style="
        font-size:20px;
        background:rgba(26,26,46,0.9);
        border:1px solid rgba(255,214,0,0.3);
        border-radius:8px;
        padding:4px 6px;
        box-shadow:0 2px 12px rgba(0,0,0,0.4);
      ">${emoji}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker(latlng, { icon }).addTo(map);
    marker.bindPopup(`
      <div style="font-family:Inter,sans-serif;font-size:13px;">
        <strong>${emoji} ${category}</strong><br>
        <span style="color:#9090A8;">Reported just now</span>
      </div>
    `);
    reportMarkers.push(marker);
    return marker;
  }

  function flyTo(latlng, zoom) {
    map.flyTo(latlng, zoom || DEFAULT_ZOOM, { duration: 1 });
  }

  return { init, locateUser, getMap, getUserPosition, addReportMarker, flyTo };
})();
