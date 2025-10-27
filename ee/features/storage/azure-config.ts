export interface AzureStorageConfig {
  accountName: string;
  accountKey?: string;
  containerName: string;
  advancedContainerName?: string;
  endpoint?: string;
  cdnEndpoint?: string;
  advancedCdnEndpoint?: string;
  useManagedIdentity?: boolean;
}

export type AzureStorageRegion = "eastus" | "westeurope";

/**
 * Gets Azure Blob Storage configuration based on the storage region.
 * Uses environment variables with _US suffix for US region, no suffix for EU region.
 *
 * @param storageRegion - The storage region ('eastus' for US, defaults to 'westeurope' for EU)
 * @returns AzureStorageConfig object with all necessary Azure configuration
 */
export function getAzureStorageConfig(storageRegion?: string): AzureStorageConfig {
  const isUS = storageRegion === "eastus";
  const suffix = isUS ? "_US" : "";

  // Get base environment variables with optional suffix
  const getAccountName = () => {
    const accountVar = `AZURE_STORAGE_ACCOUNT_NAME${suffix}`;
    const account = process.env[accountVar];
    if (!account) {
      throw new Error(`Missing environment variable: ${accountVar}`);
    }
    return account;
  };

  const getContainerName = () => {
    const containerVar = `AZURE_STORAGE_CONTAINER_NAME${suffix}`;
    const container = process.env[containerVar];
    if (!container) {
      throw new Error(`Missing environment variable: ${containerVar}`);
    }
    return container;
  };

  // Check if using managed identity (recommended for Azure deployments)
  const useManagedIdentity = process.env[`AZURE_USE_MANAGED_IDENTITY${suffix}`] === "true";

  const getAccountKey = () => {
    // Account key is not needed when using managed identity
    if (useManagedIdentity) {
      return undefined;
    }

    const keyVar = `AZURE_STORAGE_ACCOUNT_KEY${suffix}`;
    const key = process.env[keyVar];
    if (!key) {
      throw new Error(`Missing environment variable: ${keyVar} (or enable AZURE_USE_MANAGED_IDENTITY)`);
    }
    return key;
  };

  return {
    accountName: getAccountName(),
    accountKey: getAccountKey(),
    containerName: getContainerName(),
    advancedContainerName: process.env[`AZURE_STORAGE_ADVANCED_CONTAINER_NAME${suffix}`],
    endpoint: process.env[`AZURE_STORAGE_ENDPOINT${suffix}`],
    cdnEndpoint: process.env[`AZURE_CDN_ENDPOINT${suffix}`],
    advancedCdnEndpoint: process.env[`AZURE_ADVANCED_CDN_ENDPOINT${suffix}`],
    useManagedIdentity,
  };
}

/**
 * Gets Azure storage configuration for a team using feature flags.
 * This is the main function that should be used by file operations.
 *
 * @param teamId - The team ID to get storage configuration for
 * @returns Promise<AzureStorageConfig> - The storage configuration for the team
 */
export async function getTeamAzureStorageConfigById(
  teamId: string,
): Promise<AzureStorageConfig> {
  try {
    // For now, default to EU region
    // In the future, you can add feature flags for US region
    const storageRegion = undefined; // or check team feature flags

    return getAzureStorageConfig(storageRegion);
  } catch (error) {
    console.warn(
      "Failed to resolve Azure storage region for team %s:",
      teamId,
      error,
    );
    return getAzureStorageConfig(); // Default to EU region on error
  }
}
