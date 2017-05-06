/* form https://github.com/egoist/gh-pinned-repos/blob/master/index.js */

const aimer = require('aimer')

exports.get = function(username) {
  return aimer(`https://github.com/${username}`)
    .then($ => {
      const pinned = $('.pinned-repo-item.public')
      if (!pinned || pinned.length === 0) return []

      const result = []
      pinned.each((index, item) => {
        let language = $(item).find('p.mb-0').contents().get(2)
        language = language && language.data.trim()

        let owner = $(item).find('.owner').text().trim()
        owner = owner || username

        const forks = $(item).find('a[href$="/network"]').text().trim()
        result[index] = {
          repo: $(item).find('.repo').text(),
          owner,
          description: $(item).find('.pinned-repo-desc').html().trim(),
          language: language || undefined,
          stars: $(item).find('a[href$="/stargazers"]').text().trim(),
          forks: forks ? forks : 0
        }
      })
      return result
    })
}
