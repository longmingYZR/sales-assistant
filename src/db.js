import { openDB } from 'idb';

const DB_NAME = 'salesAssistant';
const DB_VERSION = 6;

let dbPromise = null;

export async function getDB() {
  if (dbPromise) return dbPromise;

  try {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, tx) {
        if (oldVersion < 1) {
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
        }
        if (oldVersion < 2) {
          try { tx.objectStore('followUps').createIndex('type', 'type'); } catch (e) { /* exists */ }
        }
        if (oldVersion < 3) {
          try { tx.objectStore('followUps').createIndex('type', 'type'); } catch (e) { /* exists */ }
        }
        if (oldVersion < 4) {
          db.createObjectStore('priceLists', { keyPath: 'id', autoIncrement: true });
          db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
        }
        if (oldVersion < 5) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id', autoIncrement: true });
          convStore.createIndex('updatedAt', 'updatedAt');
        }
      },
      blocked() {
        dbPromise = null;
      },
    });
    return dbPromise;
  } catch (err) {
    console.warn('DB open failed, recreating database...', err);
    dbPromise = null;
    await indexedDB.deleteDatabase(DB_NAME);
    return getDB();
  }
}

// --- Customers ---

export async function getAllCustomers() {
  const db = await getDB();
  const all = await db.getAll('customers');
  return all.filter((c) => !c._deleted);
}

/** 包含已删除的客户（同步导出用） */
export async function getAllCustomersRaw() {
  const db = await getDB();
  return db.getAll('customers');
}

export async function getCustomer(id) {
  const db = await getDB();
  const c = await db.get('customers', id);
  if (c && c._deleted) return null;
  return c;
}

/** 获取已删除的客户列表（回收站） */
export async function getDeletedCustomers() {
  const db = await getDB();
  const all = await db.getAll('customers');
  return all.filter((c) => c._deleted);
}

/** 获取客户（含已删除，用于详情页查看回收站记录） */
export async function getCustomerRaw(id) {
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
  const customer = await db.get('customers', id);
  if (!customer) return;
  customer._deleted = true;
  customer.updatedAt = Date.now();
  await db.put('customers', customer);
}

export async function restoreCustomer(id) {
  const db = await getDB();
  const customer = await db.get('customers', id);
  if (!customer || !customer._deleted) return;
  delete customer._deleted;
  customer.updatedAt = Date.now();
  await db.put('customers', customer);
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

export async function getLastFollowUp(customerId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('followUps', 'customerId', customerId);
  if (all.length === 0) return null;
  all.sort((a, b) => b.date - a.date);
  return all[0];
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

// --- Price Lists (Excel 价格表) ---

export async function getAllPriceLists() {
  const db = await getDB();
  return db.getAll('priceLists');
}

export async function addPriceList(pl) {
  const db = await getDB();
  return db.add('priceLists', { ...pl, uploadedAt: Date.now() });
}

export async function deletePriceList(id) {
  const db = await getDB();
  return db.delete('priceLists', id);
}

// --- Templates (Excel 报价模板) ---

export async function getAllTemplates() {
  const db = await getDB();
  return db.getAll('templates');
}

export async function getTemplate(id) {
  const db = await getDB();
  return db.get('templates', id);
}

export async function addTemplate(tpl) {
  const db = await getDB();
  return db.add('templates', { ...tpl, uploadedAt: Date.now() });
}

export async function deleteTemplate(id) {
  const db = await getDB();
  return db.delete('templates', id);
}

// --- Conversations ---

export async function getAllConversations() {
  const db = await getDB();
  const all = await db.getAll('conversations');
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return all;
}

export async function getConversation(id) {
  const db = await getDB();
  return db.get('conversations', id);
}

export async function addConversation(conv) {
  const db = await getDB();
  const now = Date.now();
  return db.add('conversations', { ...conv, createdAt: now, updatedAt: now });
}

export async function updateConversation(id, changes) {
  const db = await getDB();
  const conv = await db.get('conversations', id);
  if (!conv) return;
  Object.assign(conv, changes, { updatedAt: Date.now() });
  return db.put('conversations', conv);
}

export async function deleteConversation(id) {
  const db = await getDB();
  return db.delete('conversations', id);
}
