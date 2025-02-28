import { EventEmitter } from 'events';

export class AsyncEventEmitter extends EventEmitter {
  public async emitAsync(
    event: string | symbol,
    ...args: unknown[]
  ): Promise<unknown[]> {
    return Promise.all(
      this.listeners(event).map((listener) =>
        Promise.resolve(listener(...args))
      )
    );
  }
}
