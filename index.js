const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Configuration, OpenAIApi } = require("openai");
admin.initializeApp();

const db = admin.firestore();
const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_KEY }));

// Generate plan
exports.generatePlan = functions.https.onCall(async (data, context) => {
  const uid = context.auth.uid;
  const profile = data.profile;
  const goal = data.goal;

  const prompt = `Generate a 7-day personalized fitness plan for ${profile.name} to achieve ${goal}. Return JSON with goal, dailyCalories, and exercises.`;
  const res = await openai.createChatCompletion({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  });

  const plan = JSON.parse(res.data.choices[0].message.content);
  const planRef = db.collection("users").doc(uid).collection("plans").doc();
  await planRef.set(plan);
  return { success: true, planId: planRef.id };
});

// onLogWrite trigger
exports.onLogWrite = functions.firestore
  .document("users/{uid}/logs/{date}")
  .onWrite(async (change, context) => {
    const { uid, date } = context.params;
    const log = change.after.exists ? change.after.data() : null;
    if (!log) return;

    const adherence = Math.round(
      (Math.max(0, 1 - Math.abs(log.consumed - log.target) / log.target) * 0.7 +
        Math.min(1, log.workoutDone / log.workoutTarget) * 0.3) * 100
    );
    const userGameRef = db.doc(`users/${uid}/game`);
    const gameSnap = await userGameRef.get();
    const game = gameSnap.exists ? gameSnap.data() : { xp: 0, streak: 0 };

    const streak = adherence >= 70 ? game.streak + 1 : 0;
    const xp = Math.min(50, 10 + Math.floor(adherence / 10) + Math.floor(streak / 3) * 2);
    await userGameRef.set(
      { xp: game.xp + xp, streak, lastActiveDate: date },
      { merge: true }
    );
  });
