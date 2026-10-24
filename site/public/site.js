// thoughtdesk.org: the download line's version, the tour's tabs, and the
// header's hairline once the page scrolls.

// The latest release, from the Worker (src/index.ts).
fetch('/api/release')
  .then((res) => (res.ok ? res.json() : null))
  .then((release) => {
    if (!release) return;
    const size = `${(release.size / 1e6).toFixed(1)} MB`;
    for (const el of document.querySelectorAll('[data-release]')) el.textContent = `Version ${release.version} · ${size} · Windows 10 and 11`;
  })
  .catch(() => {});

// Not on Windows: say so beside the download buttons.
const platform = navigator.userAgentData?.platform ?? navigator.platform ?? '';
if (!/^win/i.test(platform) && !/Windows/.test(navigator.userAgent)) {
  for (const el of document.querySelectorAll('[data-os-note]')) el.hidden = false;
}

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
