import { execSync } from 'child_process';
import { load } from 'js-yaml';
import { existsSync } from 'fs';
import { join } from 'path';

// Type definition for our secrets structure (nested format)
// Note: Spaces credentials are managed by Terraform, not SOPS
export interface SecretsStructure {
  stripe: {
    STRIPE_SECRET_KEY: string;
    STRIPE_PRICE_ID: string;
  };
  litellm: {
    LITELLM_MASTER_KEY: string;
    [key: string]: string; // Allow arbitrary API keys
  };
}

// Type for flat format (legacy)
type FlatSecrets = Record<string, string>;

/**
 * Load and decrypt secrets from SOPS-encrypted YAML file
 * Supports both flat format (legacy) and nested format (new)
 */
export function loadSecrets(): SecretsStructure {
  const secretsPath = join(__dirname, '..', '..', '..', 'secrets', 'secrets.yaml');

  if (!existsSync(secretsPath)) {
    throw new Error(`Secrets file not found: ${secretsPath}`);
  }

  try {
    // Decrypt using SOPS
    const decrypted = execSync(`sops -d "${secretsPath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'inherit'], // Show sops errors on stderr
    });

    // Parse YAML
    const parsed = load(decrypted) as SecretsStructure | FlatSecrets;

    // Detect format: if has top-level keys like 'stripe', it's nested; otherwise it's flat
    const isNested = 'stripe' in parsed || 'litellm' in parsed;

    let secrets: SecretsStructure;

    if (isNested) {
      // New nested format
      secrets = parsed as SecretsStructure;
    } else {
      // Legacy flat format - convert to nested
      const flat = parsed as FlatSecrets;

      // Extract litellm keys
      const litellmKeys: Record<string, string> = {};
      for (const [key, value] of Object.entries(flat)) {
        if (key !== 'STRIPE_SECRET_KEY' && key !== 'STRIPE_PRICE_ID') {
          litellmKeys[key] = value;
        }
      }

      // Ensure LITELLM_MASTER_KEY exists
      if (!litellmKeys.LITELLM_MASTER_KEY) {
        litellmKeys.LITELLM_MASTER_KEY = '';
      }

      secrets = {
        stripe: {
          STRIPE_SECRET_KEY: flat.STRIPE_SECRET_KEY || '',
          STRIPE_PRICE_ID: flat.STRIPE_PRICE_ID || '',
        },
        litellm: litellmKeys as { LITELLM_MASTER_KEY: string; [key: string]: string },
      };
    }

    // Validate required secrets exist
    if (!secrets.stripe?.STRIPE_SECRET_KEY) {
      throw new Error('Missing required secret: STRIPE_SECRET_KEY');
    }
    if (!secrets.stripe?.STRIPE_PRICE_ID) {
      throw new Error('Missing required secret: STRIPE_PRICE_ID');
    }

    // Add default LITELLM_MASTER_KEY for dev if missing
    if (!secrets.litellm) {
      secrets.litellm = {
        LITELLM_MASTER_KEY: 'sk-1234-dummy-dev-key-replace-in-production',
      };
      console.warn('⚠️  LITELLM_MASTER_KEY not found in secrets, using dummy value for dev');
    } else if (!secrets.litellm.LITELLM_MASTER_KEY) {
      secrets.litellm.LITELLM_MASTER_KEY = 'sk-1234-dummy-dev-key-replace-in-production';
      console.warn('⚠️  LITELLM_MASTER_KEY not found in secrets, using dummy value for dev');
    }

    return secrets;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load secrets: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Flatten secrets structure into key-value pairs for Kubernetes Secret
 * Example: { stripe: { STRIPE_SECRET_KEY: 'sk_...' } } -> { STRIPE_SECRET_KEY: 'sk_...' }
 */
export function flattenSecrets(secrets: SecretsStructure): Record<string, string> {
  const flattened: Record<string, string> = {};

  // Flatten all sections
  for (const section of Object.values(secrets)) {
    Object.assign(flattened, section);
  }

  return flattened;
}
