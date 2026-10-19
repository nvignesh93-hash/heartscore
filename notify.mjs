// Heartscore notifier. GitHub runs this every few minutes.
// 1. Sends any queued notifications (requests, answers, day closed, challenges).
// 2. Sends Uma the morning reminder if today's opening score isn't set by the reminder time.
// 3. Closes yesterday if nobody did, and tells Vignesh the final score.
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

  // 1. Queued notifications
  const out = await db.collection("outbox").where("sent", "==", false).limit(50).get();
  for (const doc of out.docs) {
    const n = doc.data();
    await send(n.to, n.title, n.body);
    await doc.ref.update({ sent: true, sentAt: new Date().toISOString() });
  }
  console.log(`Outbox: ${out.size} sent`);

  // 2. Morning reminder for Uma (window: reminder time to 3 hours after)
  const rem = toMins(cfg.reminder || "07:30");
  if (mins >= rem && mins < rem + 180) {
    const ref = db.doc("days/" + date);
    const snap = await ref.get();
    const d = snap.exists ? snap.data() : {};
    if (typeof d.opening !== "number" && !d.reminderSent) {
      await send("Uma", "Good morning, Uma", "Time to set today's opening score for Vignesh.");
      await ref.set({ date, reminderSent: true }, { merge: true });
      console.log("Morning reminder sent");
    }
  }

  // 3. Close yesterday if it was left open, and tell Vignesh
  const y = addDays(date, -1);
  const yRef = db.doc("days/" + y);
  const ySnap = await yRef.get();
  if (ySnap.exists) {
    const yd = ySnap.data();
    if (!yd.closeNotified) {
      const r = await scoreFor(y, yd, bands);
      if (r) {
        await send("Vignesh", `Yesterday closed at ${r.score} · ${r.band.name}`, r.band.fail ? "That was a fail day." : "Open Heartscore for the full report.");
        await yRef.set({ closed: true, final: r.score, closeNotified: true, closedAt: new Date().toISOString() }, { merge: true });
        console.log("Yesterday auto-closed");
      } else {
        await yRef.set({ closeNotified: true }, { merge: true });
      }
    }
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
