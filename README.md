# Heartscore

Uma's daily score for Vignesh, as a phone app with its own web address.

- **App:** `index.html` (plus `config.js`, icons, `manifest.json`, `firebase-messaging-sw.js`), served free by GitHub Pages.
- **Data and sign-in:** Firebase (Firestore + Authentication), free Spark plan. `firestore.rules` lets only the two email addresses in.
- **Notifications:** `.github/workflows/notify.yml` runs `notify.mjs` every 5 minutes on GitHub Actions (free for public repositories). It sends:
  - Uma: the morning reminder if the opening score isn't set by the reminder time; Vignesh's point requests and challenges
  - Vignesh: Uma's answers, challenge results, and the day's final score

## Setup (one time)

1. **Firebase:** create a project; enable Authentication (Google, Email/Password); create Firestore (asia-south1, production mode); register a web app and copy its `firebaseConfig`; generate a Web Push key under Cloud Messaging.
2. **config.js:** paste the `firebaseConfig`, the Web Push key and both email addresses.
3. **Firestore rules:** paste `firestore.rules` (with the two real emails) into Firestore → Rules → Publish.
4. **GitHub:** create a public repository named `heartscore`, upload these files, then Settings → Pages → Deploy from branch `main`, folder `/ (root)`.
5. **Authorized domain:** Firebase → Authentication → Settings → Authorized domains → add `YOUR-USERNAME.github.io`.
6. **Notifications secret:** Firebase → Project settings → Service accounts → Generate new private key. In GitHub → Settings → Secrets and variables → Actions → New repository secret named `FIREBASE_SERVICE_ACCOUNT`, paste the whole JSON file's contents.
7. Open `https://YOUR-USERNAME.github.io/heartscore/` on each phone, sign in, turn on notifications, and add it to the home screen (iPhone: Safari → Share → Add to Home Screen, then open from the icon to turn on notifications).

Notifications can arrive a few minutes late because GitHub runs scheduled jobs on a best-effort basis.
