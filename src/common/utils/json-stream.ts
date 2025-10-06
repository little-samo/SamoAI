import { fixJson } from './json';

/**
 * Parses a streaming JSON array in the format [{...}, {...}, {...}]
 * and yields complete objects as they arrive
 */
export class JsonArrayStreamParser {
  private buffer = '';
  private depth = 0;
  private inString = false;
  private escaped = false;
  private arrayStarted = false;
  private objectStartIndex = -1;
  private yieldedCount = 0;

  /**
   * Processes a chunk of text and yields any complete objects found
   */
  public *processChunk(
    chunk: string
  ): Generator<{ json: string; index: number }> {
    this.buffer += chunk;

    for (
      let i = this.buffer.length - chunk.length;
      i < this.buffer.length;
      i++
    ) {
      const char = this.buffer[i];

      if (this.escaped) {
        this.escaped = false;
        continue;
      }

      if (char === '\\' && this.inString) {
        this.escaped = true;
        continue;
      }

      if (char === '"' && !this.inString) {
        this.inString = true;
        continue;
      }

      if (char === '"' && this.inString) {
        this.inString = false;
        continue;
      }

      // Skip characters inside strings
      if (this.inString) {
        continue;
      }

      // Track array start
      if (char === '[' && this.depth === 0 && !this.arrayStarted) {
        this.arrayStarted = true;
        continue;
      }

      // Track object boundaries
      if (char === '{') {
        if (this.depth === 0 && this.arrayStarted) {
          this.objectStartIndex = i;
        }
        this.depth++;
      } else if (char === '}') {
        this.depth--;
        if (this.depth === 0 && this.objectStartIndex !== -1) {
          // We have a complete object
          const objectJson = this.buffer.substring(
            this.objectStartIndex,
            i + 1
          );
          yield { json: objectJson, index: this.yieldedCount };
          this.yieldedCount++;
          this.objectStartIndex = -1;
        }
      }
    }
  }

  /**
   * Finalizes parsing and yields any remaining complete objects
   */
  public *finalize(): Generator<{ json: string; index: number }> {
    // If we have a partial object at the end, try to fix and yield it
    if (this.objectStartIndex !== -1 && this.depth > 0) {
      const partialJson = this.buffer.substring(this.objectStartIndex);
      try {
        const fixedJson = fixJson(partialJson);
        // Verify it's valid JSON before yielding
        JSON.parse(fixedJson);
        yield { json: fixedJson, index: this.yieldedCount };
        this.yieldedCount++;
      } catch {
        // If we can't fix it, just skip it
      }
    }
  }

  /**
   * Gets the total count of objects yielded
   */
  public getYieldedCount(): number {
    return this.yieldedCount;
  }

  /**
   * Gets the current buffer content
   */
  public getBuffer(): string {
    return this.buffer;
  }
}
