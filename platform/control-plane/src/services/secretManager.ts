import {SecretManagerServiceClient} from "@google-cloud/secret-manager";

const client = new SecretManagerServiceClient();

export async function getSecretValue(secretName: string): Promise<string | null> {
  if (process.env[secretName]) {
    return process.env[secretName] as string;
  }
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT ??
    readProjectIdFromFirebaseConfig();
  if (!projectId) {
    return null;
  }
  const fullName = `projects/${projectId}/secrets/${secretName}/versions/latest`;
  try {
    const [version] = await (client as any).accessSecretVersion({name: fullName});
    return version.payload?.data?.toString("utf8") ?? null;
  } catch {
    return null;
  }
}

function readProjectIdFromFirebaseConfig(): string | null {
  const raw = process.env.FIREBASE_CONFIG;
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as {projectId?: string};
    return parsed.projectId ?? null;
  } catch {
    return null;
  }
}
