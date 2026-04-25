const { getFirestore } = require('../config/firebase');

const COLLECTION = 'schedules';

const ScheduleModel = {
  async create(data) {
    const db = getFirestore();
    const ref = db.collection(COLLECTION).doc();
    const schedule = {
      id: ref.id,
      clientId: data.clientId,
      professionalId: data.professionalId,
      serviceId: data.serviceId,
      date: data.date,
      status: 'pending', // 'pending' | 'confirmed' | 'completed' | 'cancelled'
      notes: data.notes || null,
      price: data.price || null,
      paymentStatus: 'unpaid', // 'unpaid' | 'paid' | 'refunded'
      paymentId: null,
      reviewed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await ref.set(schedule);
    return schedule;
  },

  async findById(id) {
    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async findByClient(clientId, page = 1, limit = 20) {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION)
      .where('clientId', '==', clientId)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async findByProfessional(professionalId, page = 1, limit = 20) {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION)
      .where('professionalId', '==', professionalId)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async update(id, data) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({
      ...data,
      updatedAt: new Date().toISOString(),
    });
    return this.findById(id);
  },
};

module.exports = ScheduleModel;
