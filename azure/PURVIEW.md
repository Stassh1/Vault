# Azure Purview Integration for Papermark

This guide explains how to set up Azure Purview (Microsoft Purview) for comprehensive audit logging, data governance, and compliance tracking.

## What is Azure Purview?

**Azure Purview** (now **Microsoft Purview**) is a unified data governance service that provides:

- 📝 **Audit Logging**: Track all user actions and system events
- 🔍 **Data Discovery**: Catalog and classify your documents
- 📊 **Data Lineage**: Track document relationships and transformations
- ⚖️ **Compliance**: Meet GDPR, HIPAA, and other regulatory requirements
- 🔒 **Data Classification**: Automatically classify sensitive data
- 📈 **Analytics**: Query and visualize audit data

## What Gets Logged?

Papermark logs **every important action**:

### Authentication Events
- ✅ User login/logout
- ✅ User signup
- ✅ Azure B2B guest invitations
- ✅ Failed login attempts

### Document Events
- ✅ Document created/uploaded
- ✅ Document viewed (who, when, how long)
- ✅ Document downloaded
- ✅ Document shared
- ✅ Document deleted

### Link Events
- ✅ Link created
- ✅ Link accessed
- ✅ Link expired
- ✅ Link revoked

### Dataroom Events
- ✅ Dataroom created
- ✅ Dataroom accessed
- ✅ Documents added/removed
- ✅ Viewers invited

### Security Events
- ✅ Unauthorized access attempts
- ✅ Rate limit violations
- ✅ Suspicious activity

### Compliance Events
- ✅ Data exports (GDPR)
- ✅ Account deletions (Right to be forgotten)
- ✅ Privacy requests

## Setup Instructions

### 1. Create Microsoft Purview Account

```bash
# Using Azure CLI
RESOURCE_GROUP="papermark-rg"
PURVIEW_ACCOUNT="papermark-purview"
LOCATION="eastus"

# Create Purview account
az purview account create \
  --resource-group $RESOURCE_GROUP \
  --name $PURVIEW_ACCOUNT \
  --location $LOCATION \
  --managed-group-name "${PURVIEW_ACCOUNT}-managed-rg"
```

### 2. Set Up Azure Monitor Data Collection

```bash
# Create Log Analytics workspace
az monitor log-analytics workspace create \
  --resource-group $RESOURCE_GROUP \
  --workspace-name papermark-logs \
  --location $LOCATION

# Create Data Collection Endpoint
az monitor data-collection endpoint create \
  --resource-group $RESOURCE_GROUP \
  --name papermark-dce \
  --location $LOCATION

# Create Data Collection Rule
az monitor data-collection rule create \
  --resource-group $RESOURCE_GROUP \
  --name papermark-dcr \
  --location $LOCATION \
  --endpoint-id "/subscriptions/{sub-id}/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Insights/dataCollectionEndpoints/papermark-dce"
```

### 3. Grant Permissions

```bash
# Get your Web App's managed identity
APP_PRINCIPAL_ID=$(az webapp identity show \
  --name your-app-name \
  --resource-group $RESOURCE_GROUP \
  --query principalId -o tsv)

# Grant Data Curator role on Purview
az role assignment create \
  --assignee $APP_PRINCIPAL_ID \
  --role "Purview Data Curator" \
  --scope "/subscriptions/{sub-id}/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Purview/accounts/$PURVIEW_ACCOUNT"

# Grant Monitoring Metrics Publisher role
az role assignment create \
  --assignee $APP_PRINCIPAL_ID \
  --role "Monitoring Metrics Publisher" \
  --scope "/subscriptions/{sub-id}/resourceGroups/$RESOURCE_GROUP"
```

### 4. Configure Environment Variables

Add to your Azure App Service configuration:

```bash
az webapp config appsettings set \
  --name your-app-name \
  --resource-group $RESOURCE_GROUP \
  --settings \
    PURVIEW_ENABLED=true \
    PURVIEW_ACCOUNT_NAME=$PURVIEW_ACCOUNT \
    PURVIEW_USE_MANAGED_IDENTITY=true \
    PURVIEW_MONITOR_ENABLED=true \
    PURVIEW_DATA_COLLECTION_ENDPOINT="https://papermark-dce.eastus.monitor.azure.com" \
    PURVIEW_DATA_COLLECTION_RULE_ID="dcr-xxxxx" \
    PURVIEW_STREAM_NAME="Custom-AuditLogs"
```

## Usage Examples

### In Your Code

```typescript
import { audit, AuditEventType } from '@/lib/purview';

// Log document view
await audit.logDocument({
  eventType: AuditEventType.DOCUMENT_VIEWED,
  documentId: doc.id,
  documentName: doc.name,
  userId: user.id,
  userEmail: user.email,
  teamId: team.id,
  classification: "confidential",
  req,
  metadata: {
    duration: 120, // seconds
    pagesViewed: 5,
  }
});

// Log B2B guest access
await audit.logAuth({
  eventType: AuditEventType.AZURE_B2B_GUEST_ACCEPTED,
  userId: user.id,
  email: user.email,
  userType: "guest",
  azureTenantId: user.azureTenantId,
  req,
  metadata: {
    externalEmail: user.externalEmail,
  }
});

// Track data lineage
await audit.trackLineage({
  assetId: document.id,
  assetName: document.name,
  assetType: "document",
  createdBy: user.email,
  upstreamAssets: [
    {
      id: originalDoc.id,
      name: originalDoc.name,
      type: "document",
      relationshipType: "copied_from"
    }
  ]
});
```

## Querying Audit Logs

### Via API

```bash
# Check Purview health
curl https://your-app.azurewebsites.net/api/health/purview

# Get audit log query information
curl https://your-app.azurewebsites.net/api/audit/logs
```

### Via Azure Portal

1. Go to **Azure Portal** > **Monitor** > **Logs**
2. Select your Log Analytics workspace
3. Run KQL queries:

```kql
// All audit events in last 24 hours
AuditLogs
| where TimeGenerated > ago(24h)
| order by TimeGenerated desc

// Document views by user
AuditLogs
| where EventType == "DOCUMENT_VIEWED"
| where ActorEmail == "user@example.com"
| summarize ViewCount = count() by TargetName
| order by ViewCount desc

// B2B guest activity
AuditLogs
| where ActorType == "guest"
| summarize Events = count() by EventType, AzureTenantId
| order by Events desc

// Security events
AuditLogs
| where Severity in ("WARNING", "CRITICAL", "ERROR")
| where EventType in ("UNAUTHORIZED_ACCESS_ATTEMPT", "RATE_LIMIT_EXCEEDED")
| order by TimeGenerated desc

// Data lineage for a document
AuditLogs
| where TargetId == "doc_123"
| where EventType in ("DOCUMENT_CREATED", "DOCUMENT_SHARED", "LINK_CREATED")
| project TimeGenerated, EventType, ActorEmail, Description
| order by TimeGenerated asc
```

### Via Microsoft Purview Studio

1. Go to [purview.microsoft.com](https://purview.microsoft.com)
2. Select your Purview account
3. Navigate to **Data Catalog** > **Assets**
4. Search for your documents
5. View lineage and classifications

## Data Lineage Visualization

Purview automatically creates lineage graphs showing:

```
Original Document
       ↓
   [Created]
       ↓
   Link Created ──→ Shared with Partner A
       ↓
   Added to Dataroom ──→ Accessed by Viewer 1
       ↓                      ↓
   Downloaded             Downloaded
```

## Compliance Features

### GDPR Compliance

```typescript
// Log data export request
await audit.logCompliance({
  eventType: AuditEventType.DATA_EXPORT,
  userId: user.id,
  userEmail: user.email,
  description: "User requested data export",
  complianceFlags: ["GDPR", "DATA_PORTABILITY"],
  req
});

// Log account deletion (right to be forgotten)
await audit.logCompliance({
  eventType: AuditEventType.DATA_DELETION,
  userId: user.id,
  userEmail: user.email,
  description: "Account deleted per GDPR request",
  complianceFlags: ["GDPR", "RIGHT_TO_BE_FORGOTTEN"],
  req
});
```

### Data Classification

Purview can automatically classify documents:
- **Confidential**: NDAs, contracts
- **Internal**: Team documents
- **Public**: Marketing materials

## Cost Estimate

**Azure Purview Pricing** (East US):
- Data Map: ~$0.25/hour (~$180/month for always-on)
- Scanning: ~$1/vCore hour (only when scanning)
- Data Estate Insights: Included

**Azure Monitor**:
- Log Ingestion: ~$2.76/GB
- Log Retention: ~$0.12/GB/month
- Queries: First 5GB free, then ~$0.63/GB

**Estimated Total**: ~$200-250/month for typical usage

### Cost Optimization

1. **Selective Logging**: Only log important events
2. **Retention Policy**: Keep logs for 90 days, archive older
3. **Sampling**: Sample high-volume events (e.g., 10% of views)
4. **Batching**: Events are batched every 10 seconds (already implemented)

## Monitoring & Alerts

### Set Up Alerts

```bash
# Alert on unauthorized access attempts
az monitor metrics alert create \
  --name "Unauthorized Access Alert" \
  --resource-group $RESOURCE_GROUP \
  --scopes "/subscriptions/{sub}/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.OperationalInsights/workspaces/papermark-logs" \
  --condition "count() > 5" \
  --evaluation-frequency 5m \
  --window-size 15m
```

### Dashboard Example

Create a dashboard in Azure Portal showing:
- Total events by type (pie chart)
- Events over time (line chart)
- Top users by activity (bar chart)
- Security events (table)
- B2B guest activity (map)

## Security Best Practices

1. **Use Managed Identity**: Never store Purview credentials in code
2. **Encrypt at Rest**: All logs are encrypted by default
3. **Network Security**: Use Private Link for Purview
4. **Access Control**: Use RBAC to limit who can view logs
5. **Audit the Auditors**: Track who accesses audit logs

## Troubleshooting

### Purview not receiving events

```bash
# Check health endpoint
curl https://your-app.azurewebsites.net/api/health/purview

# Verify environment variables
az webapp config appsettings list \
  --name your-app-name \
  --resource-group $RESOURCE_GROUP \
  | grep PURVIEW

# Check app logs
az webapp log tail --name your-app-name --resource-group $RESOURCE_GROUP
```

### Common Issues

**Issue**: "Failed to initialize Purview client"
- **Solution**: Verify managed identity has "Purview Data Curator" role

**Issue**: "Data not appearing in Monitor"
- **Solution**: Check Data Collection Rule ID is correct

**Issue**: "High costs"
- **Solution**: Implement sampling for high-volume events

## Integration Checklist

- [ ] Create Purview account
- [ ] Set up Azure Monitor workspace
- [ ] Configure Data Collection Endpoint
- [ ] Grant managed identity permissions
- [ ] Set environment variables
- [ ] Deploy application
- [ ] Verify health endpoint
- [ ] Test audit logging
- [ ] Create KQL queries
- [ ] Set up alerts
- [ ] Configure retention policies
- [ ] Train team on querying

## Support & Resources

- 📖 [Microsoft Purview Documentation](https://docs.microsoft.com/en-us/purview/)
- 📖 [Azure Monitor Documentation](https://docs.microsoft.com/en-us/azure/azure-monitor/)
- 💬 [Papermark GitHub Issues](https://github.com/mfts/papermark/issues)
- 🎓 [Purview Learning Path](https://docs.microsoft.com/en-us/learn/paths/implement-microsoft-purview/)

---

**Questions?** Open an issue with the `purview` label in the repository.
