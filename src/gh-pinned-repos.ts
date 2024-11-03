import axios from "axios";
import * as cheerio from "cheerio";
import type { Repository } from "./types.js";

interface GithubResponse {
  results: Repository[];
  errors: Error[];
}

export async function getPinnedRepos(username: string): Promise<GithubResponse> {
  try {
    const response = await axios.get(`https://github.com/${username}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.122 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      },
    });

    const $ = cheerio.load(response.data);
    console.log("Response back from repos");

    const pinned = $(".js-pinned-items-reorder-list li");
    if (!pinned || pinned.length === 0) {
      throw new Error(`Couldn't get Github pinned repos!`);
    }

    const errors: Error[] = [];
    const results = Array.from(pinned).map((item): Repository => {
      const language = $(item)
        .find('span[itemprop="programmingLanguage"]')
        .text()
        .trim();
      if (!language) errors.push(new Error(`Couldn't get Github repo language!`));

      const forks = $(item).find('a[href*="network/members"]').text().trim();
      const stars = $(item).find('a[href*="stargazers"]').text().trim();
      const description = $(item).find(".pinned-item-desc").text().trim();

      if (!description) {
        errors.push(new Error(`Couldn't get Github repo description!`));
      }

      const name = $(item).find("a").first().text().trim();
      if (!name) errors.push(new Error(`Couldn't get Github repo name!`));

      const link = `https://github.com${$(item)
        .find(".pinned-item-list-item-content a.text-bold")
        .attr("href")
        ?.trim()}`;

      if (!link) errors.push(new Error(`Couldn't get Github repo link!`));

      return {
        name,
        description,
        stars,
        forks,
        link,
        language,
      };
    });

    return { results, errors };
  } catch (error) {
    throw new Error(`Failed to fetch GitHub repos: ${error}`);
  }
}
