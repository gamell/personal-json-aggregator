import { S3Client, PutObjectCommand, PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";
import axios from "axios";
import MarkdownIt from "markdown-it";
import Parser from "rss-parser";
import pako from "pako";
import hash from "object-hash";
import opengraphio from "opengraph-io";
import striptags from "striptags";
import truncateHtml from "truncate-html";
import { getPinnedRepos } from "./gh-pinned-repos.js";
import type { AggregatedData, Article, Picture, Config, Markdowns } from "./types.js";
import { readFile, writeFile } from 'fs/promises';

// Constants
const jsonUrl = "https://s3.amazonaws.com/gamell-io/data.json";
const markdownUrls = {
  intro: "https://raw.githubusercontent.com/gamell/gamell.io-v2/master/content/intro.md",
  announcements: "https://raw.githubusercontent.com/gamell/gamell.io-v2/master/content/announcements.md",
  contact: "https://raw.githubusercontent.com/gamell/gamell.io-v2/master/content/contact.md",
};

// Environment
const env = process.env.ENVIRONMENT || "local";

// Load config
const loadConfig = async (): Promise<Config> => {
  try {
    const configFile = await readFile(new URL('../.keys.json', import.meta.url), 'utf-8');
    return JSON.parse(configFile);
  } catch (err) {
    return {
      instagramToken: process.env.INSTAGRAM_TOKEN || '',
      opengraphIoAppIds: [process.env.OPENGRAPH_IO_APP_ID_1 || '', process.env.OPENGRAPH_IO_APP_ID_2 || '', process.env.OPENGRAPH_IO_APP_ID_3 || '']
    };
  }
};

const config = await loadConfig();

const pictureUrl = `https://graph.instagram.com/v16.0/17841401070704167/media?fields=caption,permalink,media_url,media_type&access_token=${config.instagramToken}`;
const mediumArticlesUrl = "https://medium.com/feed/@gamell";
const gmsArticlesUrl = "https://graymatters.substack.com/feed";

console.log("Current environment:", env);
const credentials = fromIni({ profile: "default" });
console.log("Found credentials:", !!credentials);

const parser = new Parser();
const md = new MarkdownIt({ html: true });

const opengraphIdToUse = config.opengraphIoAppIds[
  Math.floor(Math.random() * config.opengraphIoAppIds.length)
];

const opengraph = opengraphio({
  appId: opengraphIdToUse,
  cacheOk: false,
});

function trimPictureInfo(data: any): Picture[] {
  console.log("Trimming picture info");
  return data.data
    .reduce((acc: Picture[], curr: any) => {
      if (curr.media_type !== "VIDEO") {
        acc.push({
          id: curr.id,
          caption: curr.caption,
          imageUrl: curr.media_url,
          url: curr.permalink,
        });
      }
      return acc;
    }, [])
    .slice(0, 18);
}

interface ArticleError {
  error: string;
}

type ArticleResult = Article[] | Article | ArticleError;

function isArticleError(article: ArticleResult): article is ArticleError {
  return 'error' in article;
}

function trimFeed(data: any, source: string): Article[] {
  console.log("Trimming RSS feed");
  const result = data.items.map((e: any): Article => {
    const content = truncateHtml(
      striptags(e["content:encoded"], ["b", "strong", "i", "em", "img"], ""),
      { length: 50, byWords: true }
    );

    return {
      link: e.link,
      title: e.title,
      date: e.pubDate,
      categories: e.categories,
      content,
    };
  });

  if (source.includes("medium")) {
    return result.filter((e: Article) => Array.isArray(e.categories));
  }
  return result;
}

async function uploadToS3(data: Buffer): Promise<PutObjectCommandOutput> {
  const s3 = new S3Client({
    region: "us-east-1",
    credentials: env !== "prod" ? credentials : undefined
  });
  try {
    const result = await s3.send(new PutObjectCommand({
      Bucket: "gamell-io",
      Key: "data.json",
      Body: data,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "max-age=86400",
      ContentEncoding: "gzip",
      ACL: "public-read",
    }));
    return result;
  } catch (err) {
    throw new Error(`Upload to S3 failed: ${err}`);
  }
}

interface ArticlesResponse {
  items: any[];
}

async function fetchArticles(oldArticlesArg: AggregatedData): Promise<Article[]> {
  console.log("Fetching article feeds");
  const articlesFromSeveralSourcesPromise = [
    mediumArticlesUrl,
    gmsArticlesUrl,
  ].map((url) =>
    parser
      .parseURL(url)
      .catch((reason) => ({
        error: `Error while fetching articles from ${url} \n\n Reason: ${reason}`,
      }))
      .then((data) => trimFeed(data, url))
      .catch((reason) => ({
        error: `Error while trimming articles from ${url} \n\n Reason: ${reason}`,
      }))
  );

  const mergedArticles = await Promise.all(articlesFromSeveralSourcesPromise).then(
    (articlesFromSeveralSources) => {
      if (articlesFromSeveralSources.length === 1) {
        const result = articlesFromSeveralSources[0];
        return isArticleError(result) ? [] : result;
      }
      if (articlesFromSeveralSources.length === 0) return [];

      const validArticles = articlesFromSeveralSources
        .flat()
        .filter((a): a is Article => !isArticleError(a));

      return validArticles
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10);
    }
  );

  const oldArticles = oldArticlesArg.data?.articles || [];
  const oldHashTable: Record<string, Article> = {};
  oldArticles.forEach((a) => (oldHashTable[hash(a)] = a));

  return Promise.all(
    mergedArticles.map(async (article) => {
      const maybeOldArticle = oldHashTable[hash(article)];
      if (!maybeOldArticle) {
        console.log("New article found! Fetching metadata from opengraph-io");
        const embedInfo = await opengraph.getSiteInfo(article.link);
        return { ...article, embedInfo };
      }
      console.log("Old article found, not fetching metadata from opengraph-io");
      return maybeOldArticle;
    })
  );
}

async function fetchMarkdowns(oldMarkdowns: Markdowns = { hashes: {} }): Promise<Markdowns> {
  console.log("Fetching markdowns");
  const markdownResults = await Promise.all(
    Object.entries(markdownUrls).map(async ([name, url]) => {
      try {
        const response = await axios.get(url);
        const currHash = hash(response.data);
        const oldHash = oldMarkdowns.hashes[name];

        if (currHash === oldHash) {
          console.log(`Returning old markdown content for ${name} as it hasn't changed`);
          return { [name]: oldMarkdowns[name], hashes: { [name]: currHash } };
        } else {
          return {
            [name]: md.render(response.data),
            hashes: { [name]: currHash }
          };
        }
      } catch (error) {
        throw new Error(`Error while trying to get content from ${url}: ${error}`);
      }
    })
  );

  return markdownResults.reduce<Markdowns>(
    (acc, curr) => ({ ...acc, ...curr, hashes: { ...acc.hashes, ...curr.hashes } }),
    { hashes: {} }
  );
}

export async function handler(
  event: any,
  context: string,
  callback: (error: Error | string | null, result?: string) => void
): Promise<void> {
  try {
    console.log("Starting process");

    // Fetch old data
    console.log("Fetching old info");
    const oldData = await axios
      .get<AggregatedData>(jsonUrl)
      .then((res) => res.data)
      .catch(() => ({
        name: "@gamell",
        contents: "Instagram pictures, Medium articles, Github pinned repos",
        timestamp: new Date(),
        data: { pictures: [], articles: [], repos: [] },
        markdowns: { hashes: {} }
      } as AggregatedData));

    // Fetch all data in parallel
    const [pictures, articles, repoResponse, markdowns] = await Promise.all([
      // Pictures
      axios
        .get(pictureUrl)
        .then((res) => trimPictureInfo(res.data))
        .catch((error) => {
          console.error("Error fetching pictures:", error);
          return oldData.data.pictures;
        }),

      // Articles
      fetchArticles(oldData).catch((error) => {
        console.error("Error fetching articles:", error);
        return oldData.data.articles;
      }),

      // Repos
      getPinnedRepos("gamell").catch((error) => {
        console.error("Error fetching repos:", error);
        return { results: oldData.data.repos, errors: [error] };
      }),

      // Markdowns
      fetchMarkdowns(oldData.markdowns).catch((error) => {
        console.error("Error fetching markdowns:", error);
        return oldData.markdowns;
      })
    ]);

    const data: AggregatedData = {
      name: "@gamell",
      contents: "Instagram pictures, Medium articles, Github pinned repos",
      timestamp: new Date(),
      data: {
        pictures,
        articles,
        repos: repoResponse.results
      },
      markdowns
    };

    if (
      JSON.stringify(oldData.data) === JSON.stringify(data.data) &&
      JSON.stringify(oldData.markdowns) === JSON.stringify(data.markdowns)
    ) {
      callback(null, "success - no changes");
      return;
    }

    if (context === "local") {
      console.log("Local mode, not uploading to S3");
      // write to file
      const json = JSON.stringify(data, null, 2);
      await writeFile("data.json", json);
      return;
    }

    const json = JSON.stringify(data, null, 2);
    const gzipped = Buffer.from(pako.gzip(json));

    await uploadToS3(gzipped);
    callback(null, "success - changes uploaded to S3");
  } catch (error) {
    callback(`ERROR!!! ${error}`);
  }
}
