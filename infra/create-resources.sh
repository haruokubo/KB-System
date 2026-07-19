#!/usr/bin/env bash
# GENERATED SCRIPT — review every resource name/SKU/tag before running.
# Requires explicit user approval per Fornida policy before any resource creation or deploy.
# Fill in the owner tag before running.
set -euo pipefail

RG=rg-kbplatform-pilot
LOCATION=southcentralus
TAGS="project=kb-platform env=pilot owner=<fill-in-before-running>"

az group create --name "$RG" --location "$LOCATION" --tags $TAGS

az postgres flexible-server create \
  --resource-group "$RG" --name kbplatform-pilot-pg \
  --location "$LOCATION" --tier Burstable --sku-name Standard_B1ms \
  --tags $TAGS

az storage account create \
  --resource-group "$RG" --name kbplatformpilotsa \
  --location "$LOCATION" --sku Standard_LRS \
  --tags $TAGS

az search service create \
  --resource-group "$RG" --name kbplatform-pilot-search \
  --sku basic --location "$LOCATION" \
  --tags $TAGS

az cognitiveservices account create \
  --resource-group "$RG" --name kbplatform-pilot-openai \
  --kind OpenAI --sku S0 --location "$LOCATION" \
  --tags $TAGS

az keyvault create \
  --resource-group "$RG" --name kbplatform-pilot-kv \
  --location "$LOCATION" --tags $TAGS

az monitor app-insights component create \
  --resource-group "$RG" --app kbplatform-pilot-ai \
  --location "$LOCATION" --tags $TAGS

az appservice plan create \
  --resource-group "$RG" --name kbplatform-pilot-plan \
  --location "$LOCATION" --is-linux --sku B1 --tags $TAGS

az webapp create \
  --resource-group "$RG" --plan kbplatform-pilot-plan \
  --name kb-platform-pilot --runtime "NODE:24-lts" --tags $TAGS

az webapp deployment slot create \
  --resource-group "$RG" --name kb-platform-pilot --slot staging

echo "Resources created. Next: populate Key Vault secrets, wire App Service settings to Key Vault references, deploy the Azure OpenAI embeddings model via the Azure AI Foundry portal (no CLI GA for model deployment as of this writing — verify before running). Also verify 'NODE:24-lts' is listed in 'az webapp list-runtimes --os-type linux' for this subscription before running — Azure's supported Node runtime stacks can lag behind upstream Node LTS releases. The Azure AI Search index schema (fields/vector/semantic config) is created by application code at runtime (src/lib/search.ts createIndexIfNotExists/createOrUpdateIndex, wired into the publish pipeline) — do not add 'az search index create' here."
