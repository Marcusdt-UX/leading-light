/* ===== emergency.js — Swipe-to-Send Emergency SOS ===== */

const EmergencyModule = (() => {
  let countdownInterval = null;
  let countdownValue = 5;
  let selectedEmergencyType = 'I need help';

  /* Swipe state */
  let swipeDragging = false;
  let swipeStartX = 0;
  let swipeThumbX = 0;
  let swipeTrackWidth = 0;
  let swipeThumbWidth = 0;
  let swipeConfirmed = false;
  const SWIPE_THRESHOLD = 0.95; /* 95% of track = confirmed */

  /* Get contacts from shared store */
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
    bindSwipe();
  }

  function bindEvents() {
    document.getElementById('sosBtn')?.addEventListener('click', openSOS);
    document.getElementById('sosSendNow')?.addEventListener('click', sendAlert);
    document.getElementById('sosCancel')?.addEventListener('click', closeSOS);
    document.getElementById('sosModalClose')?.addEventListener('click', closeSOS);

    document.getElementById('sosModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeSOS();
    });

    document.querySelectorAll('.sos-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sos-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedEmergencyType = btn.dataset.type;
      });
    });
  }

  /* ===== SWIPE-TO-SEND LOGIC ===== */
  function bindSwipe() {
    const thumb = document.getElementById('sosSwipeThumb');
    const track = document.getElementById('sosSwipeTrack');
    if (!thumb || !track) return;

    /* Touch events */
    thumb.addEventListener('touchstart', onSwipeStart, { passive: true });
    document.addEventListener('touchmove', onSwipeMove, { passive: false });
    document.addEventListener('touchend', onSwipeEnd);

    /* Mouse events (for desktop testing) */
    thumb.addEventListener('mousedown', onSwipeStart);
    document.addEventListener('mousemove', onSwipeMove);
    document.addEventListener('mouseup', onSwipeEnd);
  }

  function onSwipeStart(e) {
    if (swipeConfirmed) return;
    const track = document.getElementById('sosSwipeTrack');
    const thumb = document.getElementById('sosSwipeThumb');
    if (!track || !thumb) return;

    swipeDragging = true;
    swipeTrackWidth = track.offsetWidth;
    swipeThumbWidth = thumb.offsetWidth;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    swipeStartX = clientX - swipeThumbX;

    thumb.style.transition = 'none';
    document.getElementById('sosSwipeFill').style.transition = 'none';
  }

  function onSwipeMove(e) {
    if (!swipeDragging || swipeConfirmed) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const maxX = swipeTrackWidth - swipeThumbWidth - 8;
    let x = clientX - swipeStartX;
    x = Math.max(0, Math.min(x, maxX));
    swipeThumbX = x;

    const thumb = document.getElementById('sosSwipeThumb');
    const fill = document.getElementById('sosSwipeFill');
    const label = document.getElementById('sosSwipeLabel');

    if (thumb) thumb.style.transform = `translateX(${x}px)`;
    if (fill) fill.style.width = `${x + swipeThumbWidth}px`;

    /* Fade out label as user swipes */
    const progress = x / maxX;
    if (label) label.style.opacity = Math.max(0, 1 - progress * 1.8);

    /* If past threshold → confirm */
    if (progress >= SWIPE_THRESHOLD) {
      swipeConfirmed = true;
      swipeDragging = false;
      onSwipeConfirmed();
    }

    if (e.cancelable) e.preventDefault();
  }

  function onSwipeEnd() {
    if (!swipeDragging || swipeConfirmed) return;
    swipeDragging = false;

    /* Snap back */
    const thumb = document.getElementById('sosSwipeThumb');
    const fill = document.getElementById('sosSwipeFill');
    const label = document.getElementById('sosSwipeLabel');

    if (thumb) {
      thumb.style.transition = 'transform .3s ease';
      thumb.style.transform = 'translateX(0)';
    }
    if (fill) {
      fill.style.transition = 'width .3s ease';
      fill.style.width = '0';
    }
    if (label) {
      label.style.transition = 'opacity .3s ease';
      label.style.opacity = '1';
    }

    swipeThumbX = 0;
  }

  function onSwipeConfirmed() {
    const thumb = document.getElementById('sosSwipeThumb');
    const fill = document.getElementById('sosSwipeFill');
    const label = document.getElementById('sosSwipeLabel');
    const container = document.getElementById('sosSwipeContainer');
    const maxX = swipeTrackWidth - swipeThumbWidth - 8;

    /* Snap thumb to end */
    if (thumb) {
      thumb.style.transition = 'transform .2s ease';
      thumb.style.transform = `translateX(${maxX}px)`;
    }
    if (fill) {
      fill.style.transition = 'width .2s ease';
      fill.style.width = '100%';
    }
    if (label) label.style.opacity = '0';

    /* Haptic confirmation */
    if (navigator.vibrate) navigator.vibrate([50, 30, 100]);

    /* Hide slider first, then show countdown after animation completes */
    setTimeout(() => {
      if (container) {
        container.style.transition = 'opacity .3s ease, max-height .3s ease';
        container.style.opacity = '0';
        container.style.maxHeight = '0';
        container.style.overflow = 'hidden';
      }

      /* Wait for slide-out animation to fully finish before starting countdown */
      setTimeout(() => {
        const countdown = document.getElementById('sosCountdownContent');
        const sendNow = document.getElementById('sosSendNow');
        if (countdown) countdown.style.display = '';
        if (sendNow) sendNow.style.display = '';

        startCountdown();
      }, 350);
    }, 300);
  }

  /* ===== SOS OPEN / CLOSE ===== */
  function openSOS() {
    const modal = document.getElementById('sosModal');
    if (!modal) return;

    resetState();
    renderSOSContacts();
    modal.classList.add('active');

    if (navigator.vibrate) navigator.vibrate(100);
    /* No auto-countdown — user must swipe first */
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

  /* ===== COUNTDOWN ===== */
  function startCountdown() {
    countdownValue = 5;
    updateCountdownDisplay();

    countdownInterval = setInterval(() => {
      countdownValue--;
      updateCountdownDisplay();

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

  /* ===== SEND ALERT ===== */
  function sendAlert() {
    stopCountdown();

    const sosContent = document.getElementById('sosCountdownContent');
    const sosSent = document.getElementById('sosSent');
    const typeSelector = document.getElementById('sosEmergencyType');
    const sendNow = document.getElementById('sosSendNow');
    const cancelBtn = document.getElementById('sosCancel');

    if (sosContent) sosContent.style.display = 'none';
    if (typeSelector) typeSelector.style.display = 'none';
    if (sendNow) sendNow.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (sosSent) sosSent.classList.add('active');

    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);

    /* ===== SEND REAL EMAILS ===== */
    const contacts = getContacts();
    const pos = MapModule.getUserPosition();
    const userName = getProfileName();
    const mapsLink = `https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    const now = new Date().toLocaleString();

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

    const emails = contacts.filter(c => c.email).map(c => c.email);

    if (emails.length > 0) {
      const mailto = `mailto:${emails.join(',')}?subject=${subject}&body=${body}`;
      window.open(mailto, '_blank');
      console.log('[SOS] Email opened for:', emails.join(', '));
    } else {
      const shareText = decodeURIComponent(body);
      if (navigator.share) {
        navigator.share({
          title: `Emergency Alert from ${userName}`,
          text: shareText,
          url: mapsLink
        }).catch(() => {});
      } else {
        const mailto = `mailto:?subject=${subject}&body=${body}`;
        window.open(mailto, '_blank');
      }
      console.log('[SOS] No contact emails found — opened share/mailto fallback');
    }

    console.log('[SOS] Alert dispatched to contacts:', contacts.map(c => c.name).join(', '));
    console.log('[SOS] Location:', pos, 'Type:', selectedEmergencyType);

    setTimeout(() => { closeSOS(); }, 3000);
  }

  /* ===== RESET ===== */
  function resetState() {
    const sosContent = document.getElementById('sosCountdownContent');
    const sosSent = document.getElementById('sosSent');
    const typeSelector = document.getElementById('sosEmergencyType');
    const sendNow = document.getElementById('sosSendNow');
    const cancelBtn = document.getElementById('sosCancel');
    const swipeContainer = document.getElementById('sosSwipeContainer');
    const thumb = document.getElementById('sosSwipeThumb');
    const fill = document.getElementById('sosSwipeFill');
    const label = document.getElementById('sosSwipeLabel');

    /* Hide countdown & send-now, show swipe */
    if (sosContent) sosContent.style.display = 'none';
    if (sendNow) sendNow.style.display = 'none';
    if (sosSent) sosSent.classList.remove('active');
    if (typeSelector) typeSelector.style.display = '';
    if (cancelBtn) cancelBtn.style.display = '';

    /* Reset swipe slider */
    if (swipeContainer) {
      swipeContainer.style.transition = '';
      swipeContainer.style.opacity = '1';
      swipeContainer.style.maxHeight = '';
      swipeContainer.style.overflow = '';
    }
    if (thumb) {
      thumb.style.transition = '';
      thumb.style.transform = 'translateX(0)';
    }
    if (fill) {
      fill.style.transition = '';
      fill.style.width = '0';
    }
    if (label) {
      label.style.transition = '';
      label.style.opacity = '1';
    }

    swipeConfirmed = false;
    swipeDragging = false;
    swipeThumbX = 0;

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
