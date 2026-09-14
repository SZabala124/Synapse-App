const DEVICE_ID_KEY = "synapse-browser-device-id-v1";

export function getBrowserDeviceId() {
  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = window.crypto?.randomUUID?.() ?? `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function getBrowserLabel() {
  const userAgent = navigator.userAgent;
  const browser = userAgent.includes("Edg/") ? "Edge" : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Firefox/") ? "Firefox" : userAgent.includes("Safari/") ? "Safari" : "Navegador";
  const device = /Android|iPhone|iPad|Mobile/i.test(userAgent) ? "móvil" : "computadora";
  return `${browser} · ${device}`;
}
