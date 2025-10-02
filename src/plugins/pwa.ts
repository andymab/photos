export function registerSW() {
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(console.error);
  }
}
