# Azure B2B Integration - Quick Start Guide

This guide helps you quickly set up Papermark with Azure AD B2B guest user support.

## What's New?

This fork adds comprehensive Azure integration to Papermark:

✅ **Azure AD Authentication** - Sign in with Microsoft accounts
✅ **B2B Guest Users** - Support for external organization users
✅ **Azure Blob Storage** - Alternative to AWS S3
✅ **Azure Cache for Redis** - Auto-detected, works seamlessly with App Services
✅ **Multi-tenant Support** - Link teams to Azure AD tenants
✅ **Managed Identity** - Secure, passwordless Azure resource access
✅ **Infrastructure as Code** - Bicep templates for easy deployment

## Database Schema Changes

The following fields were added to support Azure B2B:

### User Model
- `azureTenantId` - Azure AD tenant ID
- `azureObjectId` - Immutable Azure AD object ID
- `userType` - "Member" or "Guest" (for B2B guests)
- `guestInviter` - ID of user who invited the guest
- `externalEmail` - Original email for B2B guests

### Team Model
- `azureTenantId` - Link team to specific Azure tenant
- `azureGroupId` - Sync membership with Azure AD group

## Quick Setup (3 Steps)

### 1. Register Azure AD Application

```bash
# Using Azure CLI
az ad app create \
  --display-name "Papermark" \
  --sign-in-audience "AzureADMultipleOrgs" \
  --web-redirect-uris "https://your-app.azurewebsites.net/api/auth/callback/azure-ad"

# Save the output appId and generate a client secret
az ad app credential reset --id <appId>
```

### 2. Configure Environment

Add to your `.env` file:

```env
# Azure AD Authentication
AZURE_AD_CLIENT_ID=your-app-id
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_TENANT_ID=common

# Azure Blob Storage
AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
AZURE_USE_MANAGED_IDENTITY=true
AZURE_STORAGE_CONTAINER_NAME=papermark-documents
```

### 3. Run Database Migration

```bash
npx prisma migrate deploy
```

## Deploy to Azure

### Option A: One-Click Deploy

```bash
cd azure
./deploy.sh
```

This script will:
1. Create all necessary Azure resources
2. Configure networking and security
3. Deploy the application
4. Set up managed identity

### Option B: Manual Deploy

```bash
# Login to Azure
az login

# Create resource group
az group create --name papermark-rg --location eastus

# Deploy infrastructure
az deployment group create \
  --resource-group papermark-rg \
  --template-file azure/main.bicep \
  --parameters azure/parameters.json
```

## Testing B2B Guest Flow

1. **Invite a guest user** in Azure Portal:
   - Azure AD → Users → New guest user
   - Enter external email (e.g., guest@otherdomain.com)
   - Send invitation

2. **Guest accepts invitation** via email link

3. **Guest signs in to Papermark**:
   - Click "Sign in with Azure AD"
   - Use their external credentials
   - Automatically detected as Guest user

4. **Verify in database**:
   ```sql
   SELECT email, userType, azureTenantId, externalEmail
   FROM "User"
   WHERE userType = 'Guest';
   ```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Azure AD (Entra ID)                   │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │ Organization │    │ Guest Users  │                   │
│  │   Members    │    │  (B2B)       │                   │
│  └──────────────┘    └──────────────┘                   │
└─────────────────────────┬───────────────────────────────┘
                          │ OAuth 2.0 / OpenID Connect
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Papermark (Next.js)                     │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │  NextAuth.js │───▶│ Azure AD     │                   │
│  │              │    │ Provider     │                   │
│  └──────────────┘    └──────────────┘                   │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │  User Model  │───▶│ PostgreSQL   │                   │
│  │  + Azure B2B │    │ (Azure DB)   │                   │
│  └──────────────┘    └──────────────┘                   │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │ File Storage │───▶│ Azure Blob   │                   │
│  │              │    │ Storage      │                   │
│  └──────────────┘    └──────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## Storage Options

### Azure Blob Storage (Recommended for Azure deployments)

**Pros:**
- Managed Identity authentication (no keys needed)
- Better integration with Azure services
- Azure CDN support
- Cost-effective with reserved capacity

**Setup:**
```env
AZURE_STORAGE_ACCOUNT_NAME=youraccount
AZURE_USE_MANAGED_IDENTITY=true
```

### AWS S3 (Original)

**Pros:**
- More mature feature set
- Global edge locations
- Compatible with existing S3 tools

**Setup:**
```env
NEXT_PRIVATE_UPLOAD_BUCKET=your-bucket
NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID=xxx
NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY=xxx
```

## Common Use Cases

### 1. Partner Collaboration
Share documents with users from partner organizations without requiring them to create new accounts.

**Setup:**
- Enable B2B in Azure AD
- Invite partners as guests
- Grant team access based on email domain

### 2. Enterprise SSO
Allow employees to sign in with their corporate Microsoft accounts.

**Setup:**
- Set `azureAdTenantId` to your organization's tenant ID
- Users automatically sign in with SSO

### 3. Multi-Organization Platform
Support multiple independent organizations, each with their own Azure AD.

**Setup:**
- Keep `azureAdTenantId` as "common"
- Track user's origin tenant in database
- Use `Team.azureTenantId` to group users by organization

## Monitoring

View B2B user analytics:

```sql
-- Count users by type
SELECT userType, COUNT(*) as count
FROM "User"
GROUP BY userType;

-- Recent guest signups
SELECT email, externalEmail, azureTenantId, createdAt
FROM "User"
WHERE userType = 'Guest'
ORDER BY createdAt DESC
LIMIT 10;

-- Teams with Azure integration
SELECT
  t.name,
  t.azureTenantId,
  COUNT(ut.userId) as member_count
FROM "Team" t
LEFT JOIN "UserTeam" ut ON t.id = ut.teamId
WHERE t.azureTenantId IS NOT NULL
GROUP BY t.id, t.name, t.azureTenantId;
```

## Security Considerations

1. **Guest User Permissions**: Configure appropriate guest access restrictions in Azure AD
2. **Conditional Access**: Use Azure AD Conditional Access policies for additional security
3. **MFA**: Enforce Multi-Factor Authentication for sensitive teams
4. **Audit Logs**: Enable Azure AD audit logs to track guest user activity
5. **Data Residency**: Choose Azure region based on compliance requirements

## Troubleshooting

### "Redirect URI mismatch"
- Verify the redirect URI in Azure AD exactly matches your app URL
- Format: `https://your-app.azurewebsites.net/api/auth/callback/azure-ad`

### "AADSTS50020: User account does not exist"
- User is not invited as guest yet
- Invite them via Azure Portal: Azure AD → Users → New guest user

### "Guest users cannot access storage"
- Ensure application has "Storage Blob Data Contributor" role
- Check managed identity is enabled on App Service

### "Database connection failed"
- Verify PostgreSQL firewall allows Azure services
- Check connection string format

## Next Steps

1. ✅ [Set up custom domain](./azure/README.md#custom-domain)
2. ✅ [Configure SSL certificate](./azure/README.md#ssl-setup)
3. ✅ [Enable Application Insights](./azure/README.md#monitoring)
4. ✅ [Set up CI/CD pipeline](./azure/README.md#cicd-setup)
5. ✅ [Configure Azure AD groups](./azure/README.md#azure-ad-groups)

## Support & Resources

- 📖 [Full Azure Deployment Guide](./azure/README.md)
- 🔧 [Azure AD B2B Documentation](https://docs.microsoft.com/en-us/azure/active-directory/external-identities/what-is-b2b)
- 💬 [GitHub Issues](https://github.com/mfts/papermark/issues)
- 🌐 [Papermark Documentation](https://papermark.io/docs)

---

**Made with ❤️ for Azure enterprise deployments**
