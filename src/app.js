if (window.top !== window.self) {
  document.documentElement.hidden = true
  document.documentElement.style.display = 'none'
} else {
  await import('./portal.js')
}
