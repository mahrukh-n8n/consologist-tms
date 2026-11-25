export interface DriveConnection {
  id: string;
  companyId: number;
  folderId: string;
  folderName: string;
  connectedByUserId: number;
  connectedAt: Date;
}

export interface DriveFile {
  fileId: string;
  webViewLink: string;
  downloadUrl: string;
  name: string;
  mimeType: string;
}

export interface SharePermission {
  permissionId: string;
  role: "reader" | "writer";
  type: "user" | "anyone";
  emailAddress?: string;
}

export interface DriveUploadOptions {
  name: string;
  mimeType: string;
  subfolder?: string;
}

export interface DriveShareOptions {
  email?: string;
  makePublic?: boolean;
  role?: "reader" | "writer";
}

export interface EncryptedToken {
  iv: string;
  tag: string;
  ciphertext: string;
}
