// thoughtdesk.org: the download buttons for the visitor's system, the tour's
// tabs, and the header's hairline once the page scrolls.

// The system this computer runs, as the Worker's /download tells them apart
// (src/index.ts: systemOf). An iPad says it's a Mac, but has a touch screen.
const ua = navigator.userAgent;
const system = /iPhone|iPad|Android|CrOS/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  ? null
  : /Macintosh|Mac OS X/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'linux' : 'windows';
const NAMES = { windows: 'Windows', mac: 'Mac', linux: 'Linux' };
const FOR = { windows: 'Windows 10 and 11', mac: 'macOS, Apple silicon and Intel', linux: 'AppImage, for most Linux systems' };

if (system) for (const el of document.querySelectorAll('[data-download-label]')) el.textContent = `Download for ${NAMES[system]}`;
// A phone or a tablet: there's no app for it.
else for (const el of document.querySelectorAll('[data-os-note]')) el.hidden = false;

// The version and the size of this system's installer, from the Worker.
if (system)
  fetch('/api/release')
    .then((res) => (res.ok ? res.json() : null))
    .then((release) => {
      const file = release?.installers?.[system];
      if (!file) return;
      for (const el of document.querySelectorAll('[data-release]')) el.textContent = `Version ${release.version} · ${(file.size / 1e6).toFixed(1)} MB · ${FOR[system]}`;
    })
    .catch(() => {});

// Tabs, with arrow keys, Home and End as the ARIA pattern has them.
for (const list of document.querySelectorAll('[role="tablist"]')) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab, false));
    tab.addEventListener('keydown', (e) => {
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(tabs[(to + tabs.length) % tabs.length], true);
    });
  });
  select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0], false);
}

const nav = document.querySelector('.nav');
const onScroll = () => nav?.classList.toggle('scrolled', scrollY > 4);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
