import {SecretManagerServiceClient} from "@google-cloud/secret-manager";

const client = new SecretManagerServiceClient();

export async function getSecretValue(secretName: string): Promise<string | null> {
  if (process.env[secretName]) {
    return process.env[secretName] as string;
  }
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    return null;
  }
  const fullName = `projects/${projectId}/secrets/${secretName}/versions/latest`;
  try {
    const [version] = await client.accessSecretVersion({name: fullName});
    return version.payload?.data?.toString("utf8") ?? null;
  } catch {
    return null;
  }
}
