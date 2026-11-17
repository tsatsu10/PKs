try {
  var t = localStorage.getItem('pks-theme');
  var resolved = 'dark';
  if (t === 'light') resolved = 'light';
  else if (t === 'system' || !t) {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', resolved);
} catch {
  // localStorage unavailable (disabled storage, private mode) — keep the default dark theme.
}
