export function chooseRandomBackgroundImage(images) {
  const candidates = Array.isArray(images) ? images.filter(Boolean) : [];
  if (!candidates.length) return "";
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function applyBackgroundImage(image) {
  if (!image) {
    document.documentElement.style.setProperty("--background-image", "none");
    return;
  }
  const imagePath = new URL(image, window.location.href).href;
  document.documentElement.style.setProperty("--background-image", `url("${imagePath}")`);
}
