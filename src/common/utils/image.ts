import { LRUCache } from 'lru-cache';

import { ENV } from '../config';

export interface ImageCacheEntry {
  base64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  size: number;
  timestamp: number;
}

export interface ImageCacheOptions {
  maxAge?: number;
  maxSizeInMB?: number;
}

/**
 * Image cache class that caches base64 data based on image URLs
 */
export class ImageCache {
  private cache: LRUCache<string, ImageCacheEntry>;

  public constructor(options: ImageCacheOptions = {}) {
    const {
      maxAge = 1000 * 60 * 60, // 1 hour
      maxSizeInMB = ENV.IMAGE_MEMORY_CACHE_SIZE_MB, // Default from config
    } = options;

    const maxSizeInBytes = maxSizeInMB * 1024 * 1024; // Convert MB to bytes

    this.cache = new LRUCache<string, ImageCacheEntry>({
      maxSize: maxSizeInBytes,
      ttl: maxAge,
      sizeCalculation: (entry) => entry.size,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
  }

  /**
   * Guess MIME type from URL and validate against supported types
   */
  private guessMimeType(
    url: string,
    contentType?: string
  ): ImageCacheEntry['mimeType'] {
    // First check content-type header if available
    if (contentType) {
      if (contentType === 'image/png') return 'image/png';
      if (contentType === 'image/jpeg') return 'image/jpeg';
      if (contentType === 'image/webp') return 'image/webp';
    }

    // Fallback to file extension
    const extension = url.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/png'; // Default fallback
    }
  }

  /**
   * Download image and convert to base64
   */
  private async downloadAndConvert(url: string): Promise<ImageCacheEntry> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const mimeType = this.guessMimeType(url, contentType);
      const base64 = buffer.toString('base64');
      const size = buffer.length;

      return {
        base64,
        mimeType,
        size,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(
        `Failed to download image from ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get base64 data from image URL (from cache if available, otherwise download)
   */
  public async getImageBase64(url: string): Promise<ImageCacheEntry> {
    // Check if cache is disabled
    if (ENV.IMAGE_MEMORY_CACHE_DISABLED) {
      return await this.downloadAndConvert(url);
    }

    // Try to get from cache first
    const cached = this.cache.get(url);
    if (cached) {
      return cached;
    }

    // Not in cache, download and convert
    const entry = await this.downloadAndConvert(url);

    // Store in cache (LRU will handle size limits automatically)
    this.cache.set(url, entry);

    return entry;
  }

  /**
   * Get image as data URI format
   */
  public async getImageDataUri(url: string): Promise<string> {
    const entry = await this.getImageBase64(url);
    return `data:${entry.mimeType};base64,${entry.base64}`;
  }

  /**
   * Delete cache for specific URL
   */
  public delete(url: string): boolean {
    return this.cache.delete(url);
  }

  /**
   * Clear all cache entries
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  public getStats(): {
    entryCount: number;
    memoryUsageBytes: number;
    maxMemoryUsageBytes: number;
  } {
    return {
      entryCount: this.cache.size,
      memoryUsageBytes: this.cache.calculatedSize || 0,
      maxMemoryUsageBytes: this.cache.maxSize || 0,
    };
  }

  /**
   * Check if specific URL is cached
   */
  public has(url: string): boolean {
    return this.cache.has(url);
  }
}

// Default instance
const defaultImageCache = new ImageCache();

/**
 * Get image base64 using the default image cache instance
 */
export async function getImageBase64(url: string): Promise<ImageCacheEntry> {
  return defaultImageCache.getImageBase64(url);
}

/**
 * Get image data URI using the default image cache instance
 */
export async function getImageDataUri(url: string): Promise<string> {
  return defaultImageCache.getImageDataUri(url);
}

/**
 * Default image cache instance
 */
export { defaultImageCache };
