# GitHub Actions Deployment Setup Guide

This guide explains how to set up automated deployment to production via Portainer.

## Verified Configuration

The following values have been verified for the ipqs-checker stack:

| Secret | Value | Description |
|--------|-------|-------------|
| `PORTAINER_URL` | `https://portainer.farm-mafia.cash` | Portainer instance URL |
| `PORTAINER_STACK_ID` | `95` | ipqs-checker stack ID |
| `PORTAINER_ENDPOINT_ID` | `3` | Admin server endpoint ID |
| `PORTAINER_TOKEN` | **Create manually** | API Access Token (see below) |

## Step 1: Create API Access Token in Portainer

1. Open Portainer: https://portainer.farm-mafia.cash
2. Login as admin
3. Go to **Settings** (bottom left) → **Users**
4. Click on your user (admin)
5. Scroll to **Access tokens** section
6. Click **Add access token**
7. Description: `GitHub Actions Deploy - ipqs-checker`
8. Click **Add access token**
9. **IMPORTANT**: Copy the token immediately! It won't be shown again.

## Step 2: Configure GitHub Secrets

1. Go to repository: https://github.com/mazamaka/ipqs-checker
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each:

   | Name | Value |
   |------|-------|
   | `PORTAINER_URL` | `https://portainer.farm-mafia.cash` |
   | `PORTAINER_TOKEN` | `[your API access token from step 1]` |
   | `PORTAINER_STACK_ID` | `95` |
   | `PORTAINER_ENDPOINT_ID` | `3` |

## Step 3: Verify Configuration

Run the verification script to test the deployment:

```bash
# Set environment variables
export PORTAINER_URL="https://portainer.farm-mafia.cash"
export PORTAINER_TOKEN="your-api-token-here"
export PORTAINER_STACK_ID="95"
export PORTAINER_ENDPOINT_ID="3"

# Run verification
python3 scripts/verify-deploy.py
```

Or run interactively:
```bash
python3 scripts/verify-deploy.py
```

## Step 4: Test Deployment

After merging to main:

1. Go to **Actions** tab in GitHub
2. Select **Deploy to Production** workflow
3. Click **Run workflow** (manual trigger)
4. Watch the workflow run
5. Verify production: https://check.maxbob.xyz/health

## How It Works

1. **On push to main**: Workflow automatically triggers
2. **Manual trigger**: Use Actions tab → Run workflow
3. **Portainer API**: GitHub Action calls redeploy endpoint
4. **Stack updates**: Portainer pulls latest image and restarts container

## Workflow File

The deployment workflow is at `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Redeploy Portainer Stack
        uses: wirgen/portainer-stack-redeploy-action@v1.1
        with:
          portainerUrl: ${{ secrets.PORTAINER_URL }}
          accessToken: ${{ secrets.PORTAINER_TOKEN }}
          stackId: ${{ secrets.PORTAINER_STACK_ID }}
          endpointId: ${{ secrets.PORTAINER_ENDPOINT_ID }}
```

## Troubleshooting

### Authentication Failed
- Ensure API token is correct (not JWT)
- Token must be created via Portainer UI, not API

### Stack Not Found
- Verify PORTAINER_STACK_ID is correct (should be `95`)
- Check stack exists in Portainer UI

### Redeploy Failed
- Check PORTAINER_ENDPOINT_ID (should be `3`)
- Ensure token has permissions to manage stacks

### Health Check Failed
- Wait 30-60 seconds for container to start
- Check Portainer logs for errors
- Verify production URL: https://check.maxbob.xyz/health

## Production URLs

- **Health Check**: https://check.maxbob.xyz/health
- **Main App**: https://check.maxbob.xyz/
- **Portainer**: https://portainer.farm-mafia.cash
