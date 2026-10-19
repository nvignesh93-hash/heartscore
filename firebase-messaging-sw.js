/* Heartscore service worker: shows notifications when the app is closed */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
importScripts("config.js");

firebase.initializeApp(self.HS_CONFIG.firebaseConfig);
firebase.messaging();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// A fetch handler lets Android offer "Install app"; requests go straight to the network.
self.addEventListener("fetch", () => {});
