require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { initFirebase, getAuth, getFirestore } = require('../config/firebase');

async function seedAdmin() {
  initFirebase();

  const email = 'solutionsdata@outlook.com';
  const password = 'Ester9983@';
  const name = 'Super Admin';

  const db = getFirestore();
  const auth = getAuth();

  // Check if user already exists in Firestore
  const snap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (!snap.empty) {
    const uid = snap.docs[0].id;
    await db.collection('users').doc(uid).update({ role: 'admin', emailVerified: true, updatedAt: new Date().toISOString() });
    console.log('✅ Admin already exists — role updated to admin. UID:', uid);
    process.exit(0);
  }

  // Create in Firebase Auth (or get existing)
  let firebaseUser;
  try {
    firebaseUser = await auth.createUser({ email, password, displayName: name, emailVerified: true });
    console.log('Firebase Auth user created:', firebaseUser.uid);
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      firebaseUser = await auth.getUserByEmail(email);
      console.log('Firebase Auth user already exists:', firebaseUser.uid);
    } else {
      throw e;
    }
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await db.collection('users').doc(firebaseUser.uid).set({
    uid: firebaseUser.uid,
    name,
    email,
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

  console.log(`✅ Super Admin criado com sucesso!`);
  console.log(`   Email: ${email}`);
  console.log(`   UID:   ${firebaseUser.uid}`);
  process.exit(0);
}

seedAdmin().catch((e) => {
  console.error('❌ Erro ao criar admin:', e.message);
  process.exit(1);
});
