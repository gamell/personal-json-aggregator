declare module 'truncate-html' {
  interface TruncateOptions {
    length?: number;
    byWords?: boolean;
    stripTags?: boolean;
    ellipsis?: string;
    decodeEntities?: boolean;
    excludes?: string[];
  }

  function truncate(html: string, options?: TruncateOptions): string;

  export = truncate;
}
