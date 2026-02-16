/* ===== emergency.js — One-Tap Emergency SOS ===== */

const EmergencyModule = (() => {
  let countdownInterval = null;
  let countdownValue = 5;
  let selectedEmergencyType = 'I need help';

  /* Get contacts from shared store (App module) */
  function getContacts() {
    if (typeof App !== 'undefined' && App.getContacts) {
      return App.getContacts();
    }
    return [
      { id: 1, name: 'Mom', phone: '(555) 123-4567', email: '', relationship: 'Mother' },
      { id: 2, name: 'Jake', phone: '(555) 987-6543', email: '', relationship: 'Roommate' }
    ];
  }

  function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function getProfileName() {
    try {
      const p = JSON.parse(localStorage.getItem('leadinglight_profile'));
      return (p && p.name) ? p.name : 'A Leading Light user';
    } catch { return 'A Leading Light user'; }
  }

  function init() {
    bindEvents();
  }

  function bindEvents() {
    /* SOS button */
    document.getElementById('sosBtn')?.addEventListener('click', openSOS);

    /* Send Now */
    document.getElementById('sosSendNow')?.addEventListener('click', sendAlert);

    /* Cancel */
    document.getElementById('sosCancel')?.addEventListener('click', closeSOS);

    /* Close button */
    document.getElementById('sosModalClose')?.addEventListener('click', closeSOS);

    /* Close on overlay click */
    document.getElementById('sosModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeSOS();
    });

    /* Emergency type buttons */
    document.querySelectorAll('.sos-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sos-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedEmergencyType = btn.dataset.type;
      });
    });
  }

  function openSOS() {
    const modal = document.getElementById('sosModal');
    if (!modal) return;

    /* Reset state */
    resetState();

    /* Populate contacts list from store */
    renderSOSContacts();

    modal.classList.add('active');

    /* Haptic feedback if available */
    if (navigator.vibrate) navigator.vibrate(100);

    /* Start countdown */
    startCountdown();
  }

  function renderSOSContacts() {
    const list = document.getElementById('sosContactsList');
    if (!list) return;
    const contacts = getContacts();
    if (contacts.length === 0) {
      list.innerHTML = '<p style="color:var(--text-m);font-size:13px;text-align:center;padding:8px 0;">No emergency contacts set up.</p>';
      return;
    }
    list.innerHTML = contacts.map(c => `
      <div class="sos-contact">
        <div class="sos-contact__avatar">${getInitials(c.name)}</div>
        <div class="sos-contact__info">
          <span class="sos-contact__name">${c.name}</span>
          <span class="sos-contact__number">${c.phone}${c.email ? ' · ' + c.email : ''}</span>
        </div>
      </div>
    `).join('');
  }

  function closeSOS() {
    const modal = document.getElementById('sosModal');
    if (!modal) return;

    stopCountdown();
    modal.classList.remove('active');
    resetState();
  }

  function startCountdown() {
    countdownValue = 5;
    updateCountdownDisplay();

    countdownInterval = setInterval(() => {
      countdownValue--;
      updateCountdownDisplay();

      /* Haptic tick */
      if (navigator.vibrate) navigator.vibrate(50);

      if (countdownValue <= 0) {
        stopCountdown();
        sendAlert();
      }
    }, 1000);
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function updateCountdownDisplay() {
    const el = document.getElementById('sosCountdownNumber');
    if (el) el.textContent = countdownValue;
  }

  function sendAlert() {
    stopCountdown();

    /* Hide countdown content, show sent confirmation */
    const sosContent = document.getElementById('sosCountdownContent');
    const sosSent = document.getElementById('sosSent');
    const typeSelector = document.getElementById('sosEmergencyType');

    if (sosContent) sosContent.style.display = 'none';
    if (typeSelector) typeSelector.style.display = 'none';
    if (sosSent) sosSent.classList.add('active');

    /* Strong haptic feedback */
    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);

    /* ===== SEND REAL EMAILS ===== */
    const contacts = getContacts();
    const pos = MapModule.getUserPosition();
    const userName = getProfileName();
    const mapsLink = `https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    const now = new Date().toLocaleString();

    /* Build email body */
    const subject = encodeURIComponent(`🚨 EMERGENCY ALERT from ${userName} — ${selectedEmergencyType}`);
    const body = encodeURIComponent(
      `⚠️ EMERGENCY ALERT — ${selectedEmergencyType.toUpperCase()}\n\n` +
      `${userName} has triggered an emergency alert from Leading Light.\n\n` +
      `🕐 Time: ${now}\n` +
      `📍 Location: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}\n` +
      `🗺️ View on map: ${mapsLink}\n\n` +
      `Emergency type: ${selectedEmergencyType}\n\n` +
      `Please check on them immediately or contact local emergency services.\n\n` +
      `— Sent via Leading Light Safety App`
    );

    /* Collect email addresses from contacts */
    const emails = contacts.filter(c => c.email).map(c => c.email);

    if (emails.length > 0) {
      /* Open email client with all contacts in To field */
      const mailto = `mailto:${emails.join(',')}?subject=${subject}&body=${body}`;
      window.open(mailto, '_blank');
      console.log('[SOS] Email opened for:', emails.join(', '));
    } else {
      /* No emails — try Web Share API as fallback */
      const shareText = decodeURIComponent(body);
      if (navigator.share) {
        navigator.share({
          title: `Emergency Alert from ${userName}`,
          text: shareText,
          url: mapsLink
        }).catch(() => {});
      } else {
        /* Last resort: open generic mailto */
        const mailto = `mailto:?subject=${subject}&body=${body}`;
        window.open(mailto, '_blank');
      }
      console.log('[SOS] No contact emails found — opened share/mailto fallback');
    }

    console.log('[SOS] Alert dispatched to contacts:', contacts.map(c => c.name).join(', '));
    console.log('[SOS] Location:', pos, 'Type:', selectedEmergencyType);

    /* Auto-close after 3 seconds */
    setTimeout(() => {
      closeSOS();
    }, 3000);
  }

  function resetState() {
    const sosContent = document.getElementById('sosCountdownContent');
    const sosSent = document.getElementById('sosSent');
    const typeSelector = document.getElementById('sosEmergencyType');

    if (sosContent) sosContent.style.display = '';
    if (sosSent) sosSent.classList.remove('active');
    if (typeSelector) typeSelector.style.display = '';

    /* Reset emergency type to default */
    selectedEmergencyType = 'I need help';
    document.querySelectorAll('.sos-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === 'I need help');
    });

    countdownValue = 5;
    updateCountdownDisplay();
  }

  return { init, openSOS, closeSOS };
})();
