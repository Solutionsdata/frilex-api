const { getFirestore } = require('../config/firebase');

const COLLECTION = 'users';

const UserModel = {
  async create(uid, data) {
    const db = getFirestore();
    const user = {
      uid,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      role: data.role || 'user',
      avatar: data.avatar || null,
      bio: null,
      location: data.address ? { city: data.address.cidade, state: data.address.estado, country: 'BR' } : null,
      address: data.address || null,
      profession: data.profession || null,
      password: data.password || null,
      disabled: false,
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.collection(COLLECTION).doc(uid).set(user);
    return user;
  },

  async findById(uid) {
    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(uid).get();
    return doc.exists ? { uid: doc.id, ...doc.data() } : null;
  },

  async findByEmail(email) {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).where('email', '==', email).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { uid: doc.id, ...doc.data() };
  },

  async update(uid, data) {
    const db = getFirestore();
    const payload = { ...data, updatedAt: new Date().toISOString() };
    await db.collection(COLLECTION).doc(uid).update(payload);
    return this.findById(uid);
  },

  async searchProfessionals({ category, location, maxPrice, page = 1, limit = 20 }) {
    const db = getFirestore();
    let query = db.collection(COLLECTION)
      .where('role', '==', 'professional')
      .where('documentsStatus', '==', 'approved')
      .where('disabled', '==', false);

    if (category) {
      query = query.where('services', 'array-contains', category);
    }

    const offset = (page - 1) * limit;
    const snap = await query.limit(limit).get();

    let professionals = snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));

    if (location) {
      professionals = professionals.filter((p) =>
        p.location?.city?.toLowerCase().includes(location.toLowerCase())
      );
    }

    return professionals.map((p) => ({
      uid: p.uid,
      name: p.name,
      avatar: p.avatar,
      bio: p.bio,
      services: p.services,
      location: p.location,
      rating: p.rating,
      totalReviews: p.totalReviews,
    }));
  },

  async updateFCMToken(uid, token) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(uid).update({
      fcmToken: token,
      updatedAt: new Date().toISOString(),
    });
  },
};

module.exports = UserModel;
