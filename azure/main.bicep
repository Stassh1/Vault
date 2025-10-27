// Main Bicep template for deploying Papermark to Azure
// This creates all necessary resources for running Papermark in Azure

@description('The name of the application')
param appName string = 'papermark'

@description('The Azure region for resource deployment')
param location string = resourceGroup().location

@description('Environment name (dev, staging, prod)')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string = 'prod'

@description('The pricing tier for the App Service Plan')
@allowed([
  'B1'
  'B2'
  'B3'
  'S1'
  'S2'
  'S3'
  'P1V2'
  'P2V2'
  'P3V2'
])
param appServicePlanSku string = 'B2'

@description('PostgreSQL administrator login')
@secure()
param postgresAdminLogin string

@description('PostgreSQL administrator password')
@secure()
param postgresAdminPassword string

@description('Azure AD Client ID for authentication')
param azureAdClientId string

@description('Azure AD Client Secret for authentication')
@secure()
param azureAdClientSecret string

@description('Azure AD Tenant ID (use "common" for multi-tenant)')
param azureAdTenantId string = 'common'

@description('NextAuth secret for session encryption')
@secure()
param nextAuthSecret string

@description('Resend API key for email')
@secure()
param resendApiKey string = ''

var resourcePrefix = '${appName}-${environment}'
var appServicePlanName = '${resourcePrefix}-plan'
var webAppName = '${resourcePrefix}-app'
var storageAccountName = replace('${resourcePrefix}storage', '-', '')
var postgresServerName = '${resourcePrefix}-db'
var redisCacheName = '${resourcePrefix}-redis'
var containerNameDocuments = 'papermark-documents'
var containerNameAdvanced = 'papermark-advanced'

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
  tags: {
    environment: environment
  }
}

// Web App (App Service)
resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: webAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|18-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      appSettings: [
        {
          name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE'
          value: 'false'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '18-lts'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'NEXTAUTH_URL'
          value: 'https://${webAppName}.azurewebsites.net'
        }
        {
          name: 'NEXTAUTH_SECRET'
          value: nextAuthSecret
        }
        {
          name: 'NEXT_PUBLIC_BASE_URL'
          value: 'https://${webAppName}.azurewebsites.net'
        }
        {
          name: 'NEXT_PUBLIC_MARKETING_URL'
          value: 'https://${webAppName}.azurewebsites.net'
        }
        // Azure AD Authentication
        {
          name: 'AZURE_AD_CLIENT_ID'
          value: azureAdClientId
        }
        {
          name: 'AZURE_AD_CLIENT_SECRET'
          value: azureAdClientSecret
        }
        {
          name: 'AZURE_AD_TENANT_ID'
          value: azureAdTenantId
        }
        // Azure Blob Storage
        {
          name: 'AZURE_STORAGE_ACCOUNT_NAME'
          value: storageAccount.name
        }
        {
          name: 'AZURE_STORAGE_CONTAINER_NAME'
          value: containerNameDocuments
        }
        {
          name: 'AZURE_STORAGE_ADVANCED_CONTAINER_NAME'
          value: containerNameAdvanced
        }
        {
          name: 'AZURE_USE_MANAGED_IDENTITY'
          value: 'true'
        }
        // PostgreSQL Database
        {
          name: 'POSTGRES_PRISMA_URL'
          value: 'postgresql://${postgresAdminLogin}@${postgresServer.name}:${postgresAdminPassword}@${postgresServer.properties.fullyQualifiedDomainName}:5432/${postgresServerName}?sslmode=require'
        }
        {
          name: 'POSTGRES_PRISMA_URL_NON_POOLING'
          value: 'postgresql://${postgresAdminLogin}@${postgresServer.name}:${postgresAdminPassword}@${postgresServer.properties.fullyQualifiedDomainName}:5432/${postgresServerName}?sslmode=require'
        }
        // Redis Configuration - Azure Cache for Redis (native protocol)
        // The app automatically detects and uses Azure Redis when these are set
        {
          name: 'REDIS_URL'
          value: 'rediss://:${listKeys(redisCache.id, redisCache.apiVersion).primaryKey}@${redisCache.properties.hostName}:${redisCache.properties.sslPort}'
        }
        {
          name: 'REDIS_HOST'
          value: redisCache.properties.hostName
        }
        {
          name: 'REDIS_PORT'
          value: string(redisCache.properties.sslPort)
        }
        {
          name: 'REDIS_PASSWORD'
          value: listKeys(redisCache.id, redisCache.apiVersion).primaryKey
        }
        {
          name: 'REDIS_TLS'
          value: 'true'
        }
        // Email
        {
          name: 'RESEND_API_KEY'
          value: resendApiKey
        }
      ]
    }
  }
  tags: {
    environment: environment
  }
}

// Storage Account for Azure Blob Storage
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
  tags: {
    environment: environment
  }
}

// Blob Service
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: [
            'https://${webAppName}.azurewebsites.net'
          ]
          allowedMethods: [
            'GET'
            'POST'
            'PUT'
            'DELETE'
            'HEAD'
            'OPTIONS'
          ]
          allowedHeaders: [
            '*'
          ]
          exposedHeaders: [
            '*'
          ]
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

// Documents Container
resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: containerNameDocuments
  properties: {
    publicAccess: 'None'
  }
}

// Advanced Container
resource advancedContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: containerNameAdvanced
  properties: {
    publicAccess: 'None'
  }
}

// PostgreSQL Flexible Server
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-03-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B2s'
    tier: 'Burstable'
  }
  properties: {
    version: '15'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
  tags: {
    environment: environment
  }
}

// PostgreSQL Database
resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-03-01-preview' = {
  parent: postgresServer
  name: postgresServerName
}

// PostgreSQL Firewall Rule - Allow Azure Services
resource postgresFirewallRule 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-03-01-preview' = {
  parent: postgresServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Azure Cache for Redis (alternative to Upstash)
resource redisCache 'Microsoft.Cache/redis@2023-08-01' = {
  name: redisCacheName
  location: location
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
  tags: {
    environment: environment
  }
}

// Role Assignment: Grant Web App access to Storage Account
resource storageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, webApp.id, 'Storage Blob Data Contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') // Storage Blob Data Contributor
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Outputs
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output webAppName string = webApp.name
output storageAccountName string = storageAccount.name
output postgresServerFqdn string = postgresServer.properties.fullyQualifiedDomainName
output redisCacheName string = redisCache.name
