#!/bin/bash

# Deployment script for Papermark on Azure
# This script deploys the Bicep template to create all necessary Azure resources

set -e

# Configuration
RESOURCE_GROUP="papermark-rg"
LOCATION="eastus"
DEPLOYMENT_NAME="papermark-deployment-$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Papermark Azure Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed.${NC}"
    echo "Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in to Azure
echo -e "${YELLOW}Checking Azure login status...${NC}"
if ! az account show &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Azure. Initiating login...${NC}"
    az login
fi

# Display current subscription
SUBSCRIPTION=$(az account show --query name -o tsv)
echo -e "${GREEN}Current subscription: ${SUBSCRIPTION}${NC}"

# Confirm deployment
read -p "Do you want to continue with this subscription? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled.${NC}"
    exit 1
fi

# Create resource group if it doesn't exist
echo -e "${YELLOW}Creating resource group '${RESOURCE_GROUP}' in '${LOCATION}'...${NC}"
az group create --name $RESOURCE_GROUP --location $LOCATION

# Validate the Bicep template
echo -e "${YELLOW}Validating Bicep template...${NC}"
az deployment group validate \
    --resource-group $RESOURCE_GROUP \
    --template-file ./main.bicep \
    --parameters ./parameters.json

if [ $? -ne 0 ]; then
    echo -e "${RED}Template validation failed. Please fix the errors and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}Template validation successful!${NC}"

# Deploy the Bicep template
echo -e "${YELLOW}Deploying resources to Azure...${NC}"
echo -e "${YELLOW}This may take 10-15 minutes...${NC}"

az deployment group create \
    --name $DEPLOYMENT_NAME \
    --resource-group $RESOURCE_GROUP \
    --template-file ./main.bicep \
    --parameters ./parameters.json \
    --verbose

if [ $? -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Deployment completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"

    # Get deployment outputs
    echo -e "${YELLOW}Fetching deployment outputs...${NC}"
    WEB_APP_URL=$(az deployment group show \
        --name $DEPLOYMENT_NAME \
        --resource-group $RESOURCE_GROUP \
        --query properties.outputs.webAppUrl.value -o tsv)

    WEB_APP_NAME=$(az deployment group show \
        --name $DEPLOYMENT_NAME \
        --resource-group $RESOURCE_GROUP \
        --query properties.outputs.webAppName.value -o tsv)

    echo -e "${GREEN}Web App URL: ${WEB_APP_URL}${NC}"
    echo -e "${GREEN}Web App Name: ${WEB_APP_NAME}${NC}"

    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Configure your custom domain (optional)"
    echo "2. Set up SSL certificate (automatic with custom domain)"
    echo "3. Run database migrations:"
    echo -e "   ${GREEN}az webapp ssh --name ${WEB_APP_NAME} --resource-group ${RESOURCE_GROUP}${NC}"
    echo -e "   ${GREEN}npm run prisma migrate deploy${NC}"
    echo "4. Configure Azure AD application settings in the Azure Portal"
    echo "5. Add authorized redirect URIs to your Azure AD app:"
    echo -e "   ${GREEN}${WEB_APP_URL}/api/auth/callback/azure-ad${NC}"

else
    echo -e "${RED}Deployment failed. Please check the errors above.${NC}"
    exit 1
fi
