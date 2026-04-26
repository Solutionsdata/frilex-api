const { getFirestore } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const COLLECTION = 'jobPosts';

const JobModel = {
  async create({ clientId, clientName, clientAvatar, title, description, category, price, priceType, city, state, neighborhood, notes }) {
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
      price: price || null,
      priceType: priceType || 'fixed',
      city: city || '',
      state: state || '',
      neighborhood: neighborhood || '',
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

  // Applicant directly accepts job at stated price
  async accept(id, professionalId) {
    const db = getFirestore();
    const job = await this.getById(id);
    await db.collection(COLLECTION).doc(id).update({
      status: 'awaiting_payment',
      acceptedBy: professionalId,
      confirmedPrice: job?.price || null,
      pixKey: process.env.PLATFORM_PIX_KEY || null,
      acceptedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },

  // Applicant sends a proposal with initial round
  async addProposal(jobId, { professionalId, professionalName, professionalAvatar, proposedPrice, observation }) {
    const db = getFirestore();
    const id = uuidv4();
    const now = new Date().toISOString();
    const firstRound = {
      from: 'applicant',
      price: proposedPrice ? Number(proposedPrice) : null,
      message: observation || '',
      createdAt: now,
    };
    const proposal = {
      id,
      jobId,
      professionalId,
      professionalName,
      professionalAvatar: professionalAvatar || null,
      rounds: [firstRound],
      currentPrice: firstRound.price,
      status: 'pending',
      createdAt: now,
    };
    await db.collection(COLLECTION).doc(jobId).collection('proposals').doc(id).set(proposal);
    await db.collection(COLLECTION).doc(jobId).update({
      hasProposals: true,
      updatedAt: now,
    });
    return proposal;
  },

  async getProposalById(jobId, proposalId) {
    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(jobId).collection('proposals').doc(proposalId).get();
    return doc.exists ? doc.data() : null;
  },

  async getProposals(jobId) {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).doc(jobId).collection('proposals').get();
    return snap.docs.map((d) => d.data()).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  // Add a counter-proposal round (poster or applicant)
  async counterProposal(jobId, proposalId, { from, price, message }) {
    const db = getFirestore();
    const propRef = db.collection(COLLECTION).doc(jobId).collection('proposals').doc(proposalId);
    const propDoc = await propRef.get();
    if (!propDoc.exists) throw Object.assign(new Error('Proposta não encontrada.'), { status: 404 });
    const proposal = propDoc.data();
    if (proposal.status !== 'pending') throw Object.assign(new Error('Proposta não está mais ativa.'), { status: 400 });

    const round = {
      from,
      price: price ? Number(price) : proposal.currentPrice,
      message: message || '',
      createdAt: new Date().toISOString(),
    };
    const rounds = [...(proposal.rounds || []), round];
    await propRef.update({ rounds, currentPrice: round.price, updatedAt: new Date().toISOString() });
    return { ...proposal, rounds, currentPrice: round.price };
  },

  // Accept a proposal (poster or applicant can accept) — job goes to awaiting_payment
  async acceptProposal(jobId, proposalId) {
    const db = getFirestore();
    const propDoc = await db.collection(COLLECTION).doc(jobId).collection('proposals').doc(proposalId).get();
    if (!propDoc.exists) throw Object.assign(new Error('Proposta não encontrada.'), { status: 404 });
    const proposal = propDoc.data();

    const batch = db.batch();
    batch.update(db.collection(COLLECTION).doc(jobId).collection('proposals').doc(proposalId), { status: 'accepted' });
    const othersSnap = await db.collection(COLLECTION).doc(jobId).collection('proposals')
      .where('status', '==', 'pending').get();
    othersSnap.docs.forEach((d) => {
      if (d.id !== proposalId) batch.update(d.ref, { status: 'rejected' });
    });
    batch.update(db.collection(COLLECTION).doc(jobId), {
      status: 'awaiting_payment',
      acceptedBy: proposal.professionalId,
      confirmedPrice: proposal.currentPrice ?? null,
      pixKey: process.env.PLATFORM_PIX_KEY || null,
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await batch.commit();
    return proposal;
  },

  // Poster confirms PIX payment — job moves to confirmed
  async confirmPayment(id) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({
      status: 'confirmed',
      pixConfirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },

  async startJob(id) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },

  async completeByProfessional(id, completionNote) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).update({
      status: 'awaiting_confirmation',
      completionNote: completionNote || null,
      completedByProfessionalAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },

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
