#!/usr/bin/env python3
"""
Verification script for Portainer deployment.

This script tests the GitHub Actions deployment configuration by:
1. Authenticating with Portainer using API Access Token
2. Verifying stack exists
3. Triggering a redeploy
4. Checking production health

Usage:
    python3 scripts/verify-deploy.py

Environment variables required:
    PORTAINER_URL       - Portainer API URL (e.g., https://portainer.farm-mafia.cash)
    PORTAINER_TOKEN     - API Access Token (from Portainer UI)
    PORTAINER_STACK_ID  - Stack ID (95 for ipqs-checker)
    PORTAINER_ENDPOINT_ID - Endpoint ID (3 for admin server)

Or run interactively to be prompted for values.
"""

import os
import sys
import time

try:
    import httpx
except ImportError:
    print("Installing httpx...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "httpx", "-q"])
    import httpx


def get_env_or_prompt(name: str, default: str = None, secret: bool = False) -> str:
    """Get environment variable or prompt user."""
    value = os.environ.get(name)
    if value:
        return value

    prompt = f"{name}"
    if default:
        prompt += f" [{default}]"
    prompt += ": "

    if secret:
        import getpass
        value = getpass.getpass(prompt)
    else:
        value = input(prompt)

    return value.strip() or default


def main():
    print("=" * 60)
    print("Portainer Deployment Verification Script")
    print("=" * 60)
    print()

    # Get configuration
    portainer_url = get_env_or_prompt(
        "PORTAINER_URL",
        default="https://portainer.farm-mafia.cash"
    )
    portainer_token = get_env_or_prompt(
        "PORTAINER_TOKEN",
        secret=True
    )
    stack_id = get_env_or_prompt("PORTAINER_STACK_ID", default="95")
    endpoint_id = get_env_or_prompt("PORTAINER_ENDPOINT_ID", default="3")

    # Normalize URL
    api_url = portainer_url.rstrip("/")
    if not api_url.endswith("/api"):
        api_url += "/api"

    print()
    print(f"Configuration:")
    print(f"  Portainer URL: {api_url}")
    print(f"  Stack ID: {stack_id}")
    print(f"  Endpoint ID: {endpoint_id}")
    print()

    headers = {"X-API-Key": portainer_token}

    with httpx.Client(timeout=60.0, verify=True) as client:
        # Step 1: Verify authentication
        print("Step 1: Verifying API authentication...")
        try:
            r = client.get(f"{api_url}/stacks/{stack_id}", headers=headers)
            if r.status_code == 401:
                print("  ✗ Authentication failed - invalid API token")
                return 1
            elif r.status_code == 403:
                print("  ✗ Forbidden - token may lack permissions")
                print(f"    Response: {r.text[:200]}")
                return 1
            elif r.status_code == 404:
                print(f"  ✗ Stack {stack_id} not found")
                return 1
            elif r.status_code == 200:
                stack = r.json()
                print(f"  ✓ Authentication successful")
                print(f"  ✓ Stack found: {stack.get('Name')}")
                print(f"  ✓ Git URL: {stack.get('GitConfig', {}).get('URL', 'N/A')}")
            else:
                print(f"  ? Unexpected status: {r.status_code}")
                print(f"    Response: {r.text[:200]}")
        except Exception as e:
            print(f"  ✗ Error: {e}")
            return 1

        # Step 2: Trigger redeploy
        print()
        print("Step 2: Triggering stack redeploy...")
        try:
            r = client.post(
                f"{api_url}/stacks/{stack_id}/git/redeploy",
                params={"endpointId": endpoint_id},
                headers=headers,
                json={}
            )
            if r.status_code in (200, 204):
                print("  ✓ Redeploy triggered successfully!")
            elif r.status_code == 405:
                print("  ⚠ Stack is not Git-based, trying compose update...")
                # Fallback to compose update
                file_r = client.get(f"{api_url}/stacks/{stack_id}/file", headers=headers)
                if file_r.status_code == 200:
                    content = file_r.json().get("StackFileContent", "")
                    update_r = client.put(
                        f"{api_url}/stacks/{stack_id}",
                        params={"endpointId": endpoint_id},
                        headers=headers,
                        json={
                            "id": int(stack_id),
                            "StackFileContent": content,
                            "Prune": False,
                            "PullImage": True
                        }
                    )
                    if update_r.status_code == 200:
                        print("  ✓ Compose update successful!")
                    else:
                        print(f"  ✗ Update failed: {update_r.status_code}")
                        print(f"    Response: {update_r.text[:200]}")
                        return 1
            else:
                print(f"  ✗ Redeploy failed: {r.status_code}")
                print(f"    Response: {r.text[:300]}")
                return 1
        except Exception as e:
            print(f"  ✗ Error: {e}")
            return 1

        # Step 3: Wait and verify health
        print()
        print("Step 3: Waiting for deployment to complete...")
        time.sleep(5)  # Give time for container restart

        print()
        print("Step 4: Verifying production health...")
        health_url = "https://check.maxbob.xyz/health"
        max_retries = 5
        for attempt in range(max_retries):
            try:
                r = client.get(health_url, timeout=10)
                if r.status_code == 200:
                    print(f"  ✓ Health check passed: {r.text[:100]}")
                    break
                else:
                    print(f"  ⚠ Health check returned {r.status_code}")
            except Exception as e:
                print(f"  ⚠ Attempt {attempt + 1}/{max_retries}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(3)
        else:
            print("  ✗ Health check failed after retries")
            return 1

    print()
    print("=" * 60)
    print("✓ VERIFICATION COMPLETE - Deployment works correctly!")
    print("=" * 60)
    print()
    print("GitHub Secrets to configure:")
    print(f"  PORTAINER_URL = {portainer_url}")
    print(f"  PORTAINER_TOKEN = [your API access token]")
    print(f"  PORTAINER_STACK_ID = {stack_id}")
    print(f"  PORTAINER_ENDPOINT_ID = {endpoint_id}")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
