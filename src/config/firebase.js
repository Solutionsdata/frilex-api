const admin = require('firebase-admin');

let firebaseApp;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      clientId: process.env.FIREBASE_CLIENT_ID,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`,
  });

  return firebaseApp;
};

const getFirestore = () => admin.firestore();
const getAuth = () => admin.auth();
const getStorage = () => admin.storage();
const getMessaging = () => admin.messaging();
const getDatabase = () => admin.database();

module.exports = { initFirebase, getFirestore, getAuth, getStorage, getMessaging, getDatabase };
