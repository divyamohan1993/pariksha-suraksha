import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Firestore, Settings, CollectionReference, DocumentData, Query } from '@google-cloud/firestore';

export interface FirestoreQueryFilter {
  field: string;
  operator: FirebaseFirestore.WhereFilterOp;
  value: unknown;
}

export interface FirestoreListOptions {
  filters?: FirestoreQueryFilter[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  startAfterDocId?: string;
}

@Injectable()
export class FirestoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FirestoreService.name);
  private firestore!: Firestore;

  async onModuleInit(): Promise<void> {
    const settings: Settings = {
      projectId: process.env['GCP_PROJECT_ID'] || 'pariksha-suraksha',
      ...(process.env['FIRESTORE_EMULATOR_HOST']
        ? {}
        : { keyFilename: process.env['GOOGLE_APPLICATION_CREDENTIALS'] }),
      maxIdleChannels: 10,
      preferRest: false,
    };

    this.firestore = new Firestore(settings);
    this.logger.log('Firestore client initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.firestore.terminate();
    this.logger.log('Firestore client terminated');
  }

  getCollection(collectionPath: string): CollectionReference<DocumentData> {
    return this.firestore.collection(collectionPath);
  }

  async create<T extends DocumentData>(
    collectionPath: string,
    docId: string,
    data: T,
  ): Promise<T> {
    const docRef = this.firestore.collection(collectionPath).doc(docId);
    await docRef.set(data);
    this.logger.debug(`Created document ${collectionPath}/${docId}`);
    return data;
  }

  async getById<T>(collectionPath: string, docId: string): Promise<T | null> {
    const docRef = this.firestore.collection(collectionPath).doc(docId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return null;
    }
    return { id: snapshot.id, ...snapshot.data() } as T;
  }

  async update<T extends DocumentData>(
    collectionPath: string,
    docId: string,
    data: Partial<T>,
  ): Promise<void> {
    const docRef = this.firestore.collection(collectionPath).doc(docId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      throw new Error(`Document ${collectionPath}/${docId} not found`);
    }
    await docRef.update(data as DocumentData);
    this.logger.debug(`Updated document ${collectionPath}/${docId}`);
  }

  async delete(collectionPath: string, docId: string): Promise<void> {
    const docRef = this.firestore.collection(collectionPath).doc(docId);
    await docRef.delete();
    this.logger.debug(`Deleted document ${collectionPath}/${docId}`);
  }

  async softDelete(collectionPath: string, docId: string): Promise<void> {
    await this.update(collectionPath, docId, {
      'metadata.isDeleted': true,
      'metadata.updatedAt': new Date().toISOString(),
    });
    this.logger.debug(`Soft-deleted document ${collectionPath}/${docId}`);
  }

  async list<T>(
    collectionPath: string,
    options: FirestoreListOptions = {},
  ): Promise<{ items: T[]; lastDocId: string | null }> {
    let query: Query<DocumentData> = this.firestore.collection(collectionPath);

    if (options.filters) {
      for (const filter of options.filters) {
        query = query.where(filter.field, filter.operator, filter.value);
      }
    }

    if (options.orderBy) {
      query = query.orderBy(options.orderBy.field, options.orderBy.direction);
    } else {
      query = query.orderBy('metadata.createdAt', 'desc');
    }

    if (options.startAfterDocId) {
      const startAfterDoc = await this.firestore
        .collection(collectionPath)
        .doc(options.startAfterDocId)
        .get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    const limit = options.limit || 20;
    query = query.limit(limit);

    const snapshot = await query.get();
    const items: T[] = [];
    let lastDocId: string | null = null;

    snapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() } as T);
      lastDocId = doc.id;
    });

    return { items, lastDocId: items.length === limit ? lastDocId : null };
  }

  async runTransaction<T>(
    fn: (transaction: FirebaseFirestore.Transaction) => Promise<T>,
  ): Promise<T> {
    return this.firestore.runTransaction(fn);
  }

  getFirestore(): Firestore {
    return this.firestore;
  }
}
