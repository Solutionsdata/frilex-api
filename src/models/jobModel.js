const { getFirestore } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const COLLECTION = 'jobPosts';

const JobModel = {
  async create({ clientId, clientName, clientAvatar, title, description, category, budget, city, state }) {
    const db = getFirestore();
    const id = uuidv4();
    const job = {
      id,
      clientId,
      clientName,
      clientAvatar: clientAvatar || null,
      title,
      description,
      category,
      budget: budget || null,
      city: city || '',
      state: state || '',
      status: 'open',
      acceptedBy: null,
      createdAt: new Date().toISOString(),
    };
    await db.collection(COLLECTION).doc(id).set(job);
    return job;
  },

  async listOpen() {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).where('status', '==', 'open').get();
    const jobs = snap.docs.map((d) => d.data());
    return jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async listByClient(clientId) {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).where('clientId', '==', clientId).get();
    const jobs = snap.docs.map((d) => d.data());
    return jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async getById(id) {
    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? doc.data() : null;
  },

  async accept(id, professionalId) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({ status: 'accepted', acceptedBy: professionalId });
  },

  async cancel(id) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({ status: 'cancelled' });
  },
};

module.exports = JobModel;
