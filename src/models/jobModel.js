const { getFirestore } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const COLLECTION = 'jobPosts';

const JobModel = {
  async create({ clientId, clientName, clientAvatar, title, description, category, budget, city, state, notes }) {
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
      notes: notes || null,
      status: 'open',
      acceptedBy: null,
      confirmedPrice: null,
      hasProposals: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

  async listByProfessional(professionalId) {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).where('acceptedBy', '==', professionalId).get();
    const jobs = snap.docs.map((d) => d.data());
    return jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async getById(id) {
    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? doc.data() : null;
  },

  // Professional directly accepts job at stated budget
  async accept(id, professionalId) {
    const db = getFirestore();
    const job = await this.getById(id);
    await db.collection(COLLECTION).doc(id).update({
      status: 'confirmed',
      acceptedBy: professionalId,
      confirmedPrice: job?.budget || null,
      acceptedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },

  // Professional sends a counter-proposal
  async addProposal(jobId, { professionalId, professionalName, professionalAvatar, proposedPrice, observation }) {
    const db = getFirestore();
    const id = uuidv4();
    const proposal = {
      id,
      jobId,
      professionalId,
      professionalName,
      professionalAvatar: professionalAvatar || null,
      proposedPrice: proposedPrice ? Number(proposedPrice) : null,
      observation: observation || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await db.collection(COLLECTION).doc(jobId).collection('proposals').doc(id).set(proposal);
    await db.collection(COLLECTION).doc(jobId).update({
      hasProposals: true,
      updatedAt: new Date().toISOString(),
    });
    return proposal;
  },

  async getProposals(jobId) {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).doc(jobId).collection('proposals').get();
    return snap.docs.map((d) => d.data()).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  // Client accepts a specific proposal
  async acceptProposal(jobId, proposalId) {
    const db = getFirestore();
    const propDoc = await db.collection(COLLECTION).doc(jobId).collection('proposals').doc(proposalId).get();
    if (!propDoc.exists) throw Object.assign(new Error('Proposta não encontrada.'), { status: 404 });
    const proposal = propDoc.data();

    const batch = db.batch();
    // Mark the accepted proposal
    batch.update(db.collection(COLLECTION).doc(jobId).collection('proposals').doc(proposalId), { status: 'accepted' });
    // Reject all other pending proposals for this job
    const othersSnap = await db.collection(COLLECTION).doc(jobId).collection('proposals')
      .where('status', '==', 'pending').get();
    othersSnap.docs.forEach((d) => {
      if (d.id !== proposalId) batch.update(d.ref, { status: 'rejected' });
    });
    // Confirm the job
    batch.update(db.collection(COLLECTION).doc(jobId), {
      status: 'confirmed',
      acceptedBy: proposal.professionalId,
      confirmedPrice: proposal.proposedPrice,
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await batch.commit();
    return proposal;
  },

  // Professional marks job as in progress
  async startJob(id) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },

  // Professional marks job as completed (with optional evidence text)
  async completeByProfessional(id, completionNote) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({
      status: 'awaiting_confirmation',
      completionNote: completionNote || null,
      completedByProfessionalAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },

  // Client confirms job completion and releases payment
  async confirmCompletion(id) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },

  async cancel(id) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },
};

module.exports = JobModel;
