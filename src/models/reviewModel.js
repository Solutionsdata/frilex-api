const { getFirestore } = require('../config/firebase');

const COLLECTION = 'reviews';

const ReviewModel = {
  async create(data) {
    const db = getFirestore();
    const ref = db.collection(COLLECTION).doc();
    const review = {
      id: ref.id,
      scheduleId: data.scheduleId,
      clientId: data.clientId,
      professionalId: data.professionalId,
      rating: data.rating,
      comment: data.comment || null,
      createdAt: new Date().toISOString(),
    };
    await ref.set(review);
    return review;
  },

  async findByProfessional(professionalId, limit = 20) {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION)
      .where('professionalId', '==', professionalId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getAverageRating(professionalId) {
    const reviews = await this.findByProfessional(professionalId, 1000);
    if (reviews.length === 0) return { rating: 0, total: 0 };
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return { rating: Math.round((sum / reviews.length) * 10) / 10, total: reviews.length };
  },
};

module.exports = ReviewModel;
