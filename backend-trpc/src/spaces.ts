import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

export interface SpacesConfig {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint: string;
  cdnEndpoint: string;
  pathPrefix: string;
}

export class SpacesClient {
  private client: S3Client;
  private config: SpacesConfig;

  constructor(config: SpacesConfig) {
    if (!config.accessKeyId) {
      throw new Error('SpacesClient: accessKeyId is required');
    }
    if (!config.secretAccessKey) {
      throw new Error('SpacesClient: secretAccessKey is required');
    }
    if (!config.bucket) {
      throw new Error('SpacesClient: bucket is required');
    }
    if (!config.region) {
      throw new Error('SpacesClient: region is required');
    }
    if (!config.endpoint) {
      throw new Error('SpacesClient: endpoint is required');
    }
    if (!config.cdnEndpoint) {
      throw new Error('SpacesClient: cdnEndpoint is required');
    }
    if (!config.pathPrefix) {
      throw new Error('SpacesClient: pathPrefix is required');
    }

    this.config = config;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: false,
    });
  }

  private getFullKey(key: string): string {
    if (key.startsWith('/')) {
      throw new Error(`SpacesClient: key must not start with slash: ${key}`);
    }
    return `${this.config.pathPrefix}/${key}`;
  }

  async uploadFile(
    key: string,
    content: Buffer | string,
    contentType: string
  ): Promise<void> {
    const fullKey = this.getFullKey(key);

    const body = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: fullKey,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read',
    });

    try {
      await this.client.send(command);
      console.log(`[Spaces] Uploaded: ${fullKey}`);
    } catch (error) {
      console.error(`[Spaces] Upload failed for ${fullKey}:`, error);
      throw new Error(`Failed to upload ${fullKey}: ${error}`);
    }
  }

  getPublicUrl(key: string): string {
    const fullKey = this.getFullKey(key);
    return `${this.config.cdnEndpoint}/${fullKey}`;
  }

  async downloadFile(key: string): Promise<Buffer> {
    const fullKey = this.getFullKey(key);

    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: fullKey,
    });

    try {
      const response = await this.client.send(command);
      if (!response.Body) {
        throw new Error('Empty response body');
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error(`[Spaces] Download failed for ${fullKey}:`, error);
      throw new Error(`Failed to download ${fullKey}: ${error}`);
    }
  }

  async fileExists(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);

    const command = new HeadObjectCommand({
      Bucket: this.config.bucket,
      Key: fullKey,
    });

    try {
      await this.client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }
}
