// Heartscore settings. Fill these in once; they are not passwords.
self.HS_CONFIG = {
  // From Firebase: Project settings → Your apps → Web app → firebaseConfig
  firebaseConfig: {
    apiKey: "AIzaSyBaK1BjAmInGKh3AxtzQ79EHtsWWnQE8WQ",
    authDomain: "heartscore-f50b9.firebaseapp.com",
    projectId: "heartscore-f50b9",
    storageBucket: "heartscore-f50b9.firebasestorage.app",
    messagingSenderId: "456851771533",
    appId: "1:456851771533:web:c2278207ae7c66b98552c4"
  },
  // From Firebase: Project settings → Cloud Messaging → Web Push certificates → Key pair
  vapidKey: "BCRu2dyJ634S0-lZYjIGXI2AdTTYPxDG6rYwuc526NogeRttWpB_xLVCp-qq1evwe7dxxRLevGkObiTaJ0BKxkA",
  // The two Google accounts allowed in. Must match the emails in firestore.rules.
  emails: {
    wife: "amu7792@gmail.com",
    husband: "nvignesh93@gmail.com"
  },
  // Starting names. You can change them any time in the app's Settings.
  names: {
    wife: "Uma",
    husband: "Vignesh"
  }
};
