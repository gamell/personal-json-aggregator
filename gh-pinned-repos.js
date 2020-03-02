/* form https://github.com/egoist/gh-pinned-repos/blob/master/index.js */

const axios = require("axios");
const cheerio = require("cheerio");

exports.get = function(username) {
  return axios
    .get(`https://github.com/${username}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.122 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
      }
    })
    .then(response => cheerio.load(response.data))
    .then($ => {
      console.log("entering github");
      const pinned = $(".js-pinned-items-reorder-list li");
      if (!pinned || pinned.length === 0)
        throw Error(`Couldn't get Github pinned repos!`);

      const results = Array.from(pinned).map(item => {
        const language = $(item)
          .find('span[itemprop="programmingLanguage"]')
          .text()
          .trim();
        const forks = $(item)
          .find('a[href*="network/members"]')
          .text()
          .trim();
        const stars = $(item)
          .find('a[href*="stargazers"]')
          .text()
          .trim();
        const description = $(item)
          .find(".pinned-item-desc")
          .text()
          .trim();
        const name = $(item)
          .find("span.js-pinnable-item")
          .text()
          .trim();
        const link = `https://github.com${$(item)
          .find(".pinned-item-list-item-content a.text-bold")
          .attr("href")
          .trim()}`;
        return {
          name,
          description,
          stars,
          forks,
          link,
          language
        };
      });
      return results;
    });
};
