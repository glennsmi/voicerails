import {randomUUID} from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
import type {CallDocument, SessionDocument, TenantContext, WorkflowDocument} from "../types.js";

export class FirestoreRepository {
  constructor(private readonly db: Firestore) {}

  private envRoot(tenant: TenantContext): string {
    return `orgs/${tenant.orgId}/apps/${tenant.appId}/envs/${tenant.envId}`;
  }

  sessionsCollection(tenant: TenantContext) {
    return this.db.collection(`${this.envRoot(tenant)}/sessions`);
  }

  callsCollection(tenant: TenantContext) {
    return this.db.collection(`${this.envRoot(tenant)}/calls`);
  }

  workflowsCollection(tenant: TenantContext) {
    return this.db.collection(`orgs/${tenant.orgId}/apps/${tenant.appId}/workflows`);
  }

  webhooksCollection(tenant: TenantContext) {
    return this.db.collection(`orgs/${tenant.orgId}/apps/${tenant.appId}/webhooks`);
  }

  numbersCollection(tenant: TenantContext) {
    return this.db.collection(`orgs/${tenant.orgId}/apps/${tenant.appId}/phoneNumbers`);
  }

  async createSession(tenant: TenantContext, document: Omit<SessionDocument, "id">): Promise<SessionDocument> {
    const id = `ses_${randomUUID()}`;
    const payload: SessionDocument = {id, ...document};
    await this.sessionsCollection(tenant).doc(id).set(payload);
    return payload;
  }

  async getSession(tenant: TenantContext, sessionId: string): Promise<SessionDocument | null> {
    const snapshot = await this.sessionsCollection(tenant).doc(sessionId).get();
    return snapshot.exists ? (snapshot.data() as SessionDocument) : null;
  }

  async listSessions(tenant: TenantContext): Promise<SessionDocument[]> {
    const snapshot = await this.sessionsCollection(tenant).orderBy("startedAt", "desc").limit(100).get();
    return snapshot.docs.map((doc) => doc.data() as SessionDocument);
  }

  async updateSession(tenant: TenantContext, sessionId: string, patch: Partial<SessionDocument>): Promise<void> {
    await this.sessionsCollection(tenant).doc(sessionId).set(patch, {merge: true});
  }

  async createCall(tenant: TenantContext, document: Omit<CallDocument, "id">): Promise<CallDocument> {
    const id = `call_${randomUUID()}`;
    const payload: CallDocument = {id, ...document};
    await this.callsCollection(tenant).doc(id).set(payload);
    return payload;
  }

  async getCall(tenant: TenantContext, callId: string): Promise<CallDocument | null> {
    const snapshot = await this.callsCollection(tenant).doc(callId).get();
    return snapshot.exists ? (snapshot.data() as CallDocument) : null;
  }

  async listCalls(tenant: TenantContext): Promise<CallDocument[]> {
    const snapshot = await this.callsCollection(tenant).orderBy("startedAt", "desc").limit(100).get();
    return snapshot.docs.map((doc) => doc.data() as CallDocument);
  }

  async createWorkflow(
    tenant: TenantContext,
    input: Omit<WorkflowDocument, "id" | "createdAt" | "updatedAt">,
  ): Promise<WorkflowDocument> {
    const id = `wf_${randomUUID()}`;
    const now = new Date().toISOString();
    const payload: WorkflowDocument = {
      id,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    await this.workflowsCollection(tenant).doc(id).set(payload);
    return payload;
  }

  async listWorkflows(tenant: TenantContext): Promise<WorkflowDocument[]> {
    const snapshot = await this.workflowsCollection(tenant).orderBy("updatedAt", "desc").limit(200).get();
    return snapshot.docs.map((doc) => doc.data() as WorkflowDocument);
  }

  async getWorkflow(tenant: TenantContext, workflowId: string): Promise<WorkflowDocument | null> {
    const snapshot = await this.workflowsCollection(tenant).doc(workflowId).get();
    return snapshot.exists ? (snapshot.data() as WorkflowDocument) : null;
  }

  async updateWorkflow(
    tenant: TenantContext,
    workflowId: string,
    patch: Partial<WorkflowDocument>,
  ): Promise<void> {
    await this.workflowsCollection(tenant)
      .doc(workflowId)
      .set({...patch, updatedAt: new Date().toISOString()}, {merge: true});
  }
}
