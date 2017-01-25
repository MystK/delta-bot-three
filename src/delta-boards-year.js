import { stringify } from 'query-string'
import fs from 'fs'
import promisify from 'promisify-node'
import Api from './reddit-api-driver'
import parseHiddenParams from './parse-hidden-params'
import stringifyObjectToBeHidden from './stringify-hidden-params'
import getWikiContent from './get-wiki-content'

fs.writeFile = promisify(fs.writeFile)

class DeltaBoardsYear {
  constructor({ subreddit, credentials, version, flags }) {
    this.subreddit = subreddit
    this.credentials = credentials // this is used to log into the Reddit API
    this.version = version // this is used to mark the headers of the API calls
    this.flags = flags // can be used to read the `isDebug` flag, used in RedditAPIDriver as well
  }
  // this method is called by DB3 main code. It starts
  // the process of updating the yearly Delta Boards
  async initialStart() {
    // first, grab the credentials and bot version from this
    const { credentials, version } = this

    // instantiate a new reddit API with the credentials and version
    this.api = new Api(credentials, version, 'delta-boards-years', this.flags)

    // make the api a variable so we don't access it from 'this' all the time
    const { api } = this
    await api.connect()

    // start the scheduled time job
    this.updateYearlyDeltaboard()
  }
  async updateYearlyDeltaboard() {
    const now = new Date()
    const topTenYear = await this.getTopTen(now.getFullYear())

    const { api, subreddit } = this
    // grab the newHiddenParams from the wiki page
    const wikiPage = 'deltaboards'
    const deltaBoardsWikiContent = await getWikiContent({ api, subreddit, wikiPage })
    const hiddenParams = parseHiddenParams(deltaBoardsWikiContent)

    const yearly = []

    for (const user of topTenYear) {
      yearly.push({ username: user[0], deltaCount: user[1], newestDeltaTime: 0 })
    }

    hiddenParams.yearly = yearly

    const hiddenSection = deltaBoardsWikiContent.match(/DB3PARAMSSTART[^]+DB3PARAMSEND/)[0].slice(
      'DB3PARAMSSTART'.length, -'DB3PARAMSEND'.length
    )

    const newWikiContent = deltaBoardsWikiContent.replace(
      hiddenSection, stringifyObjectToBeHidden(hiddenParams)
    )

    // define update wiki parameters
    const updateWikiQuery = {
      page: 'deltaboards',
      reason: 'updated yearly deltaboard',
      content: newWikiContent,
    }

    // updateWikiResponse
    await api.query(
      { URL: `/r/${subreddit}/api/wiki/edit`, method: 'POST', body: stringify(updateWikiQuery) }
    )

    setTimeout(() => this.updateYearlyDeltaboard(), 24 * 3600 * 1000) // run again in 24 hours
  }
  async getDeltasTotal(year, month = null) {
    const { api } = this

    const threadUrls = []
    const deltas = []
    let finished = false

    // get the date variables ready
    const startOfPeriod = new Date(year, month - 1)
    const start = (startOfPeriod.getTime() / 1000) - (3600 * 24 * 7)
    let end = new Date(year, month)

    // crawl the specified time period for threads
    while (!finished) {
      const threadQuery = {
        limit: '100',
        sort: 'new',
        q: `timestamp:${start}..${end.getTime() / 1000}`,
        syntax: 'cloudsearch',
        restrict_sr: 'on',
      }

      const response = await api.query(
        `/r/${this.subreddit}/search.json?${stringify(threadQuery)}`,
        true
      )

      if (response.data.children.length === 0) {
        finished = true
      }

      for (const child of response.data.children) {
        threadUrls.push(`/r/${this.subreddit}/comments/${child.data.id}.json`)

        const { created_utc: createdUtc } = child.data
        const childDate = new Date(createdUtc * 1000)
        if (childDate < end) {
          end = childDate
        }
      }
    }

    // fetch the comments of all threads and analyse if there were deltas given out
    for (const threadUrl of threadUrls) {
      const response = await api.query(threadUrl, true)

      if (response[1].data.children) {
        // recursively check comments and replies to them for deltas
        const checkAllChildren = function checkAllChildren(data) {
          if (!data.children) {
            return
          }

          for (const child of data.children) {
            if (child.data.replies) {
              checkAllChildren(child.data.replies.data)
            }
            if (child.data.author === this.credentials.username) {
              // grab data from the response and put into variables
              const { body, created_utc: createdUtc } = child.data

              // get the date variables ready
              const childDate = new Date(createdUtc * 1000) // convert from s to ms
              const newHiddenParams = parseHiddenParams(body)

              if (childDate >= startOfPeriod) {
                // continue only if hidden params
                if (newHiddenParams) {
                  const { issues, parentUserName } = newHiddenParams
                  const issueCount = Object.keys(issues).length

                  if (issueCount === 0 && parentUserName !== undefined) {
                    if (deltas[parentUserName] === undefined) {
                      deltas[parentUserName] = 0
                    }

                    deltas[parentUserName]++
                  }
                }
              }
            }
          }
        }

        checkAllChildren(response[1].data)
      }
    }

    return deltas
  }
  async getTopTen(year, month = null) {
    const total = await this.getDeltasTotal(year, month)

    const totalList = []
    // eslint-disable-next-line
    for (const user in total) {
      totalList.push([user, total[user]])
    }

    totalList.sort((a, b) => b[1] - a[1])

    return totalList.slice(0, 10)
  }
}

export default DeltaBoardsYear
