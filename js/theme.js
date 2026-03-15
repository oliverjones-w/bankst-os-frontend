export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("theme", theme);
}

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

export function toggleTheme() {
  applyTheme(getTheme() === "dark" ? "light" : "dark");
}
