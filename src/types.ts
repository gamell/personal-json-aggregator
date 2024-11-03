export interface Markdowns {
  [key: string]: string | {
    [key: string]: string;
  };
  hashes: {
    [key: string]: string;
  };
}

export interface Picture {
  id: string;
  caption: string;
  imageUrl: string;
  url: string;
}

export interface Article {
  link: string;
  title: string;
  date: string;
  categories?: string[];
  content: string;
  embedInfo?: any;
}

export interface Repository {
  name: string;
  description: string;
  stars: string;
  forks: string;
  link: string;
  language: string;
}

export interface AggregatedData {
  name: string;
  contents: string;
  timestamp: Date;
  data: {
    pictures: Picture[];
    articles: Article[];
    repos: Repository[];
  };
  markdowns: Markdowns;
}

export interface Config {
  instagramToken: string;
  opengraphIoAppIds: string[];
}
