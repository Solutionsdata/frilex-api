const { getFirestore } = require('../config/firebase');

const COLLECTION = 'serviceCategories';

const ServiceModel = {
  async create(data) {
    const db = getFirestore();
    const ref = db.collection(COLLECTION).doc();
    const service = {
      id: ref.id,
      name: data.name,
      description: data.description,
      icon: data.icon || null,
      basePrice: data.basePrice || null,
      status: 'pending', // 'pending' | 'approved' | 'rejected'
      suggestedBy: data.suggestedBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await ref.set(service);
    return service;
  },

  async findById(id) {
    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async findAll(status = 'approved') {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION)
      .where('status', '==', status)
      .orderBy('name')
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async findPending() {
    return this.findAll('pending');
  },

  async updateStatus(id, status, reviewedBy) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({
      status,
      reviewedBy,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return this.findById(id);
  },
};

module.exports = ServiceModel;
