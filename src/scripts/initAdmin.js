const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = 'solutionsdata@outlook.com';
const ADMIN_PASSWORD = 'Ester9983@';
const ADMIN_NAME = 'Super Admin';

async function initAdmin(db, auth) {
  try {
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const snap = await db.collection('users').where('email', '==', ADMIN_EMAIL).limit(1).get();

    if (!snap.empty) {
      // User exists — always force correct role + password (handles null password case)
      const uid = snap.docs[0].id;
      await db.collection('users').doc(uid).update({
        role: 'admin',
        password: hashedPassword,
        emailVerified: true,
        disabled: false,
        updatedAt: new Date().toISOString(),
      });
      try { await auth.updateUser(uid, { password: ADMIN_PASSWORD, emailVerified: true }); } catch (_) {}
      console.log('[Admin] Admin account synced — uid:', uid);
      return;
    }

    // New user — create in Firebase Auth + Firestore
    let firebaseUser;
    try {
      firebaseUser = await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: ADMIN_NAME, emailVerified: true });
    } catch (e) {
      if (e.code === 'auth/email-already-exists') {
        firebaseUser = await auth.getUserByEmail(ADMIN_EMAIL);
        // If found in Firebase Auth but not in Firestore, create the Firestore record
      } else {
        throw e;
      }
    }

    await db.collection('users').doc(firebaseUser.uid).set({
      uid: firebaseUser.uid,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin',
      phone: null,
      avatar: null,
      bio: 'Administrador da plataforma Frilex.',
      location: null,
      address: null,
      profession: null,
      disabled: false,
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log('[Admin] Super admin created — uid:', firebaseUser.uid);
  } catch (err) {
    console.error('[Admin] initAdmin failed:', err.message);
  }
}

module.exports = initAdmin;
