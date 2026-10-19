// Heartscore notifier. GitHub runs this every few minutes.
// 1. Sends any queued notifications (requests, answers, day closed, challenges).
// 2. Sends the wife the morning reminder if today's opening score isn't set by the reminder time.
// 3. Closes the day at the close time (and any earlier day left open), and tells the husband the final score.
// Names, times and which notifications are on all come from the app's Settings (config/main).
import admin from "firebase-admin";

const TZ = "Asia/Kolkata";
const APP_URL = process.env.APP_URL || "";
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.project_id) {
  console.log("FIREBASE_SERVICE_ACCOUNT secret is missing; nothing to do.");
  process.exit(0);
}
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const DEFAULT_BANDS = [
  { name: "Fail", min: 0, max: 40, fail: true },
  { name: "Needs work", min: 41, max: 60 },
  { name: "Good", min: 61, max: 80 },
  { name: "Great", min: 81, max: null },
];

function nowIST() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, mins: Number(parts.hour) * 60 + Number(parts.minute) };
}
function addDays(k, n) {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
const toMins = (hhmm) => { const [h, m] = String(hhmm || "07:30").split(":").map(Number); return h * 60 + (m || 0); };

async function send(who, title, body) {
  const snap = await db.collection("tokens").where("who", "==", who).get();
  if (snap.empty) { console.log(`No phones registered for ${who}`); return 0; }
  let ok = 0;
  for (const doc of snap.docs) {
    try {
      await admin.messaging().send({
        token: doc.id,
        notification: { title, body: body || "" },
        webpush: {
          notification: { icon: APP_URL ? APP_URL + "icon-192.png" : undefined, badge: APP_URL ? APP_URL + "icon-192.png" : undefined },
          fcmOptions: APP_URL ? { link: APP_URL } : undefined,
        },
      });
      ok++;
    } catch (e) {
      const code = e && e.code;
      console.log(`Send to ${who} failed: ${code}`);
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token" || code === "messaging/invalid-argument") {
        await doc.ref.delete();
      }
    }
  }
  return ok;
}

async function scoreFor(date, day, bands) {
  const q = await db.collection("entries").where("date", "==", date).get();
  const approved = q.docs.map((d) => d.data()).filter((e) => e.status === "approved");
  const hasOpen = typeof day.opening === "number";
  if (!hasOpen && !approved.length) return null;
  const s = (hasOpen ? day.opening : 0) + approved.reduce((t, e) => t + (Number(e.points) || 0), 0);
  const score = Math.max(0, s);
  const sorted = bands.slice().sort((a, b) => a.min - b.min);
  const band = sorted.find((b) => score >= b.min && (b.max == null || b.max === "" || score <= b.max)) || (score < sorted[0].min ? sorted[0] : sorted[sorted.length - 1]);
  return { score, band };
}

async function main() {
  const { date, mins } = nowIST();
  const cfgSnap = await db.doc("config/main").get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};
  const bands = Array.isArray(cfg.bands) && cfg.bands.length ? cfg.bands : DEFAULT_BANDS;
  const names = Object.assign({ wife: "Wife", husband: "Husband" }, cfg.names || {});
  const on = (k) => !cfg.notify || cfg.notify[k] !== false;

  // 1. Queued notifications
  const out = await db.collection("outbox").where("sent", "==", false).limit(50).get();
  for (const doc of out.docs) {
    const n = doc.data();
    await send(n.to, n.title, n.body);
    await doc.ref.update({ sent: true, sentAt: new Date().toISOString() });
  }
  console.log(`Outbox: ${out.size} sent`);

  if (!cfgSnap.exists) { console.log("Heartscore isn't set up yet"); return; }

  // 2. Morning reminder for the wife (window: reminder time to 3 hours after)
  const rem = toMins(cfg.reminder || "07:30");
  if (on("morning") && mins >= rem && mins < rem + 180) {
    const ref = db.doc("days/" + date);
    const snap = await ref.get();
    const d = snap.exists ? snap.data() : {};
    if (typeof d.opening !== "number" && !d.reminderSent) {
      await send("wife", `Good morning, ${names.wife}`, `Time to set today's opening score for ${names.husband}.`);
      await ref.set({ date, reminderSent: true }, { merge: true });
      console.log("Morning reminder sent");
    }
  }

  // 3. Close today at the close time, and catch up on yesterday if it was left open
  const closeAt = toMins(cfg.close || "22:00");
  const toClose = [addDays(date, -1)];
  if (mins >= closeAt) toClose.push(date);
  for (const k of toClose) {
    const ref = db.doc("days/" + k);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const d = snap.data();
    if (d.closeNotified) continue;
    const r = await scoreFor(k, d, bands);
    if (r) {
      if (on("dayClosed")) {
        const when = k === date ? "Today" : "Yesterday";
        await send("husband", `${when} closed at ${r.score} · ${r.band.name}`, r.band.fail ? "That was a fail day." : "Open Heartscore for the full report.");
      }
      await ref.set({ closed: true, final: r.score, closeNotified: true, closedAt: new Date().toISOString() }, { merge: true });
      console.log(`Closed ${k} at ${r.score}`);
    } else if (k !== date) {
      await ref.set({ closeNotified: true }, { merge: true });
    }
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
