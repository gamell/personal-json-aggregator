declare module 'opengraph-io' {
  interface OpengraphOptions {
    appId: string;
    cacheOk?: boolean;
  }

  interface OpengraphResponse {
    hybridGraph: {
      title: string;
      description: string;
      url: string;
      image: string;
    };
  }

  interface OpengraphClient {
    getSiteInfo(url: string): Promise<OpengraphResponse>;
  }

  function opengraphio(options: OpengraphOptions): OpengraphClient;

  export default opengraphio;
}
