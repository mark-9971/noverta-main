import type { File } from "@google-cloud/storage";

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclPolicy {
  visibility: "public" | "private";
  allowedUserIds?: string[];
}

export async function getObjectAclPolicy(_file: File): Promise<ObjectAclPolicy | null> {
  return null;
}

export async function setObjectAclPolicy(_file: File, _policy: ObjectAclPolicy): Promise<void> {
  return;
}

export async function canAccessObject(_opts: {
  userId?: string;
  objectFile: File;
  requestedPermission?: ObjectPermission;
}): Promise<boolean> {
  return true;
}
