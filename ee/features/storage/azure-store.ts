import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  ContainerClient,
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import type { Upload } from "@tus/server";
import type { Readable } from "stream";
import {
  type AzureStorageConfig,
  getAzureStorageConfig,
} from "@/ee/features/storage/azure-config";

/**
 * Azure Blob Storage adapter for tus upload protocol.
 * Supports multi-region deployments and managed identity authentication.
 */
export class AzureBlobStore {
  private euConfig: AzureStorageConfig;
  private usConfig: AzureStorageConfig;
  private euClient: BlobServiceClient;
  private usClient: BlobServiceClient;
  private currentClient: BlobServiceClient;
  private currentContainerName: string;
  private teamStorageCache = new Map<string, boolean>(); // teamId -> useUSStorage

  constructor() {
    // Initialize with EU config as default
    const euConfig = getAzureStorageConfig();
    this.euConfig = euConfig;
    this.euClient = this.createBlobServiceClient(euConfig);

    // Initialize US configuration and client
    try {
      this.usConfig = getAzureStorageConfig("eastus");
      this.usClient = this.createBlobServiceClient(this.usConfig);
    } catch (error) {
      this.usConfig = euConfig;
      this.usClient = this.euClient;
    }

    // Set defaults
    this.currentClient = this.euClient;
    this.currentContainerName = this.euConfig.containerName;
  }

  /**
   * Creates a BlobServiceClient with appropriate authentication method
   */
  private createBlobServiceClient(config: AzureStorageConfig): BlobServiceClient {
    const accountUrl = config.endpoint ||
      `https://${config.accountName}.blob.core.windows.net`;

    if (config.useManagedIdentity) {
      // Use managed identity (recommended for Azure deployments)
      return new BlobServiceClient(accountUrl, new DefaultAzureCredential());
    } else if (config.accountKey) {
      // Use account key
      const sharedKeyCredential = new StorageSharedKeyCredential(
        config.accountName,
        config.accountKey
      );
      return new BlobServiceClient(accountUrl, sharedKeyCredential);
    } else {
      throw new Error(
        `Azure storage authentication not configured for ${config.accountName}`
      );
    }
  }

  /**
   * Extracts teamId from upload ID (format: teamId/docId/filename)
   */
  private extractTeamIdFromUploadId(uploadId: string): string | null {
    const parts = uploadId.split("/");
    return parts.length > 0 ? parts[0] : null;
  }

  /**
   * Determines if team should use US storage (placeholder for future feature flags)
   */
  private async shouldUseUSStorage(teamId: string): Promise<boolean> {
    // Check cache first
    if (this.teamStorageCache.has(teamId)) {
      return this.teamStorageCache.get(teamId)!;
    }

    // For now, default to EU (false)
    // In the future, integrate with feature flags like the S3 store
    const useUS = false;

    // Cache the result for 5 minutes
    this.teamStorageCache.set(teamId, useUS);
    setTimeout(() => this.teamStorageCache.delete(teamId), 5 * 60 * 1000);

    return useUS;
  }

  /**
   * Sets the correct client and container for the appropriate region
   */
  private async ensureCorrectRegion(uploadId: string): Promise<void> {
    const teamId = this.extractTeamIdFromUploadId(uploadId);

    if (!teamId) {
      this.currentClient = this.euClient;
      this.currentContainerName = this.euConfig.containerName;
      return;
    }

    const useUS = await this.shouldUseUSStorage(teamId);
    if (useUS) {
      this.currentClient = this.usClient;
      this.currentContainerName = this.usConfig.containerName;
    } else {
      this.currentClient = this.euClient;
      this.currentContainerName = this.euConfig.containerName;
    }
  }

  /**
   * Gets the container client for the current region
   */
  private getContainerClient(): ContainerClient {
    return this.currentClient.getContainerClient(this.currentContainerName);
  }

  /**
   * Creates a new upload
   */
  async create(upload: Upload): Promise<Upload> {
    await this.ensureCorrectRegion(upload.id);
    const containerClient = this.getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(upload.id);

    // Initialize the blob with metadata
    await blockBlobClient.setMetadata({
      upload_length: upload.size?.toString() || "0",
      upload_offset: "0",
      creation_date: new Date().toISOString(),
    });

    return upload;
  }

  /**
   * Writes data to an upload
   */
  async write(stream: Readable, id: string, offset: number): Promise<number> {
    await this.ensureCorrectRegion(id);
    const containerClient = this.getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(id);

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    // Upload the data
    if (offset === 0) {
      // First write - create the blob
      await blockBlobClient.upload(buffer, buffer.length);
    } else {
      // Append to existing blob
      const appendBlobClient = containerClient.getAppendBlobClient(id);
      await appendBlobClient.appendBlock(buffer, buffer.length);
    }

    // Update metadata with new offset
    const newOffset = offset + buffer.length;
    await blockBlobClient.setMetadata({
      upload_offset: newOffset.toString(),
    });

    return buffer.length;
  }

  /**
   * Gets upload information
   */
  async getUpload(id: string): Promise<Upload> {
    await this.ensureCorrectRegion(id);
    const containerClient = this.getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(id);

    try {
      const properties = await blockBlobClient.getProperties();
      const metadata = properties.metadata || {};

      return {
        id,
        size: parseInt(metadata.upload_length || "0"),
        offset: parseInt(metadata.upload_offset || "0"),
        metadata: metadata,
      } as Upload;
    } catch (error: any) {
      if (error?.statusCode === 404) {
        throw new Error(`Upload ${id} not found`);
      }
      throw error;
    }
  }

  /**
   * Removes an upload
   */
  async remove(id: string): Promise<void> {
    await this.ensureCorrectRegion(id);
    const containerClient = this.getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(id);

    // Clean up cache entry
    const teamId = this.extractTeamIdFromUploadId(id);
    if (teamId) {
      this.teamStorageCache.delete(teamId);
    }

    await blockBlobClient.deleteIfExists();
  }

  /**
   * Declares the upload length
   */
  async declareUploadLength(id: string, length: number): Promise<void> {
    await this.ensureCorrectRegion(id);
    const containerClient = this.getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(id);

    await blockBlobClient.setMetadata({
      upload_length: length.toString(),
    });
  }

  /**
   * Reads upload data
   */
  async read(id: string): Promise<Readable> {
    await this.ensureCorrectRegion(id);
    const containerClient = this.getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(id);

    const downloadResponse = await blockBlobClient.download();

    if (!downloadResponse.readableStreamBody) {
      throw new Error(`Failed to download blob ${id}`);
    }

    return downloadResponse.readableStreamBody as Readable;
  }

  /**
   * Gets a public URL for a blob (useful for serving files)
   */
  async getPublicUrl(id: string): Promise<string> {
    await this.ensureCorrectRegion(id);
    const config = this.currentClient === this.usClient ? this.usConfig : this.euConfig;

    // Use CDN endpoint if configured, otherwise use direct blob URL
    if (config.cdnEndpoint) {
      return `${config.cdnEndpoint}/${this.currentContainerName}/${id}`;
    }

    const containerClient = this.getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(id);
    return blockBlobClient.url;
  }
}
