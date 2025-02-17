export abstract class Context {
  public static readonly FORMAT: string;

  public abstract build(): string;
}
