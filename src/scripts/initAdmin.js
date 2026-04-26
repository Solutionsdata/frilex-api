const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = 'solutionsdata@outlook.com';
const ADMIN_PASSWORD = 'Ester9983@';
const ADMIN_NAME = 'Super Admin';

async function initAdmin(db, auth) {
  try {
    const snap = await db.collection('users').where('email', '==', ADMIN_EMAIL).limit(1).get();

    if (!snap.empty) {
      const uid = snap.docs[0].id;
      const data = snap.docs[0].data();
      if (data.role !== 'admin') {
        await db.collection('users').doc(uid).update({ role: 'admin', updatedAt: new Date().toISOString() });
        console.log('[Admin] Existing user promoted to admin:', uid);
      } else {
        console.log('[Admin] Super admin already exists:', uid);
      }
      return;
    }

    let firebaseUser;
    try {
      firebaseUser = await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: ADMIN_NAME, emailVerified: true });
    } catch (e) {
      if (e.code === 'auth/email-already-exists') {
        firebaseUser = await auth.getUserByEmail(ADMIN_EMAIL);
      } else {
        throw e;
      }
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
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

    console.log('[Admin] Super admin created:', firebaseUser.uid);
  } catch (err) {
    console.error('[Admin] Failed to init admin:', err.message);
  }
}

module.exports = initAdmin;
