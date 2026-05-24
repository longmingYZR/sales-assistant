import { openDB } from 'idb';

const DB_NAME = 'salesAssistant';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const customers = db.createObjectStore('customers', {
          keyPath: 'id',
          autoIncrement: true,
        });
        customers.createIndex('stage', 'stage');
        customers.createIndex('updatedAt', 'updatedAt');

        const followUps = db.createObjectStore('followUps', {
          keyPath: 'id',
          autoIncrement: true,
        });
        followUps.createIndex('customerId', 'customerId');
        followUps.createIndex('date', 'date');

        db.createObjectStore('documents', {
          keyPath: 'id',
          autoIncrement: true,
        });
      },
    });
  }
  return dbPromise;
}

// --- Customers ---

export async function getAllCustomers() {
  const db = await getDB();
  return db.getAll('customers');
}

export async function getCustomer(id) {
  const db = await getDB();
  return db.get('customers', id);
}

export async function addCustomer(customer) {
  const db = await getDB();
  const now = Date.now();
  return db.add('customers', { ...customer, createdAt: now, updatedAt: now });
}

export async function updateCustomer(id, changes) {
  const db = await getDB();
  const customer = await db.get('customers', id);
  if (!customer) return;
  Object.assign(customer, changes, { updatedAt: Date.now() });
  return db.put('customers', customer);
}

export async function deleteCustomer(id) {
  const db = await getDB();
  await db.delete('customers', id);
  const allFollowUps = await db.getAllFromIndex('followUps', 'customerId', id);
  for (const f of allFollowUps) {
    await db.delete('followUps', f.id);
  }
}

// --- Follow-ups ---

export async function getFollowUps(customerId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('followUps', 'customerId', customerId);
  all.sort((a, b) => b.date - a.date);
  return all;
}

export async function addFollowUp(followUp) {
  const db = await getDB();
  const now = Date.now();
  await db.add('followUps', { ...followUp, createdAt: now });
  const tx = db.transaction('customers', 'readwrite');
  const customer = await tx.store.get(followUp.customerId);
  if (customer) {
    customer.updatedAt = now;
    await tx.store.put(customer);
  }
  await tx.done;
}

export async function getAllFollowUps() {
  const db = await getDB();
  return db.getAll('followUps');
}

export async function getLastFollowUpDate(customerId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('followUps', 'customerId', customerId);
  if (all.length === 0) return 0;
  return Math.max(...all.map((f) => f.date));
}

// --- Documents ---

export async function getAllDocuments() {
  const db = await getDB();
  return db.getAll('documents');
}

export async function getDocument(id) {
  const db = await getDB();
  return db.get('documents', id);
}

export async function addDocument(doc) {
  const db = await getDB();
  return db.add('documents', { ...doc, uploadedAt: Date.now() });
}

export async function deleteDocument(id) {
  const db = await getDB();
  return db.delete('documents', id);
}

export async function getAllChunks() {
  const docs = await getAllDocuments();
  const chunks = [];
  for (const doc of docs) {
    for (const chunk of doc.chunks) {
      chunks.push({ ...chunk, fileName: doc.fileName, documentId: doc.id });
    }
  }
  return chunks;
}
