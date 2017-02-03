import _ from 'lodash'
import { stringify } from 'query-string'
import moment from 'moment'
import Api from './reddit-api-driver'
import {
  escapeUnderscore,
  getParsedDate,
  getWikiContent,
  parseHiddenParams,
  stringifyObjectToBeHidden,
} from './utils'

class DeltaBoards {
  constructor({ subreddit, credentials, version, flags }) {
    this.subreddit = subreddit
    this.credentials = credentials // this is used to log into the Reddit API
    this.version = version // this is used to mark the headers of the API calls
    this.flags = flags // can be used to read the `isDebug` flag, used in RedditAPIDriver as well
  }
  // this method is called by DB3 main code. It starts
  // the whole process of updating the Delta Boards
  async initialStart() {
    // first, grab the credentials and bot version from this
    const { credentials, version } = this

    // instantiate a new reddit API with the credentials and version
    this.api = new Api(credentials, version, 'delta-boards', this.flags)

    // make the api a variable so we don't access it from 'this' all the time
    const { api } = this
    await api.connect()

    // start the scheduled time job
    this.updateDailyWeeklyMonthlyDeltaboards()
    this.updateYearlyDeltaboard()
  }

  async updateDailyWeeklyMonthlyDeltaboards() {
    const { api, subreddit } = this
    // define methods on top of scope of where it will be used
    const deltaBoards = await this.getNewDeltaboards()

    // parse the data to be .map friendly
    const newHiddenParams = {
      daily: _(deltaBoards.daily)
        .map((data, username) => _.assign({ username }, data))
        .orderBy(['deltaCount', 'newestDeltaTime'], ['desc', 'asc'])
        .take(10)
        .value(),
      weekly: _(deltaBoards.weekly)
        .map((data, username) => _.assign({ username }, data))
        .orderBy(['deltaCount', 'newestDeltaTime'], ['desc', 'asc'])
        .take(10)
        .value(),
      monthly: _(deltaBoards.monthly)
        .map((data, username) => _.assign({ username }, data))
        .orderBy(['deltaCount', 'newestDeltaTime'], ['desc', 'asc'])
        .take(10)
        .value(),
    }

    // get the Date string ready
    const parsedDate = getParsedDate()

    // check if wiki and sidebar need to be updated
    try {
      // grab the newHiddenParams from the wiki page
      const wikiPage = 'deltaboards'
      const deltaBoardsWikiContent = await getWikiContent({ api, subreddit, wikiPage })
      const oldHiddenParams = parseHiddenParams(deltaBoardsWikiContent)

      // copy the yearly hidden data
      newHiddenParams.yearly = oldHiddenParams.yearly

      if (!oldHiddenParams.updateTimes) {
        newHiddenParams.updateTimes = {
          yearly: parsedDate,
          monthly: parsedDate,
          weekly: parsedDate,
          daily: parsedDate,
        }
      } else {
        newHiddenParams.updateTimes = oldHiddenParams.updateTimes
      }

      if (!_.isEqual(_.get(oldHiddenParams, 'monthly'), newHiddenParams.monthly)) {
        newHiddenParams.updateTimes.monthly = parsedDate
      }
      if (!_.isEqual(_.get(oldHiddenParams, 'weekly'), newHiddenParams.weekly)) {
        newHiddenParams.updateTimes.weekly = parsedDate
      }
      if (!_.isEqual(_.get(oldHiddenParams, 'daily'), newHiddenParams.daily)) {
        newHiddenParams.updateTimes.daily = parsedDate
      }

      // if the monthly data has changed, update the sidebar
      if (!_.isEqual(_.get(oldHiddenParams, 'monthly'), newHiddenParams.monthly)) {
        await this.saveSidebarDeltaboard(newHiddenParams, parsedDate)
      } else {
        console.log('Monthly Deltaboard data hasn\'t changed. Won\'t update the sidebar')
      }

      // if any data has changed, update the wiki
      if (!_.isEqual(oldHiddenParams, newHiddenParams)) {
        await this.saveDailyWeeklyMonthlyDeltaboards(newHiddenParams)
      } else {
        console.log('No Deltaboard data has changed. Won\'t update the wiki')
      }
    } catch (error) {
      console.log(error)
    }

    // set the timeout here in case it takes long or hangs,
    // so it doesn't fire off multiple time at once
    setTimeout(() => this.updateDailyWeeklyMonthlyDeltaboards(), 60000)
  }

  mapDeltaboardDataToTable(data) {
    const { subreddit } = this
    return _(data)
      .map((line, index) => {
        const { deltaCount, username } = line
        const rank = index + 1
        return (
          `| ${rank} | ${
            rank === 1 ?
              `**[${escapeUnderscore(username)}](/r/${subreddit}/wiki/user/${username})**` :
              `[${escapeUnderscore(username)}](/r/${subreddit}/wiki/user/${username})`
            } | ${deltaCount} |`
        )
      })
      .join('\n')
  }

  async saveDailyWeeklyMonthlyDeltaboards(newHiddenParams) {
    const { api, subreddit } = this

    // newHiddenParams the data
    const stringifiedNewHiddenParams = stringifyObjectToBeHidden(newHiddenParams)

    // create the wiki output
    const wikiOutput = `[**&#8656; wiki index**](http://reddit.com/r/${subreddit}/wiki)

_____

# Deltaboards

## Daily

| Rank | Username | Deltas |
| :------: | :------: | :------: |
${this.mapDeltaboardDataToTable(newHiddenParams.daily)}
| |${newHiddenParams.updateTimes.daily}| |

## Weekly

| Rank | Username | Deltas |
| :------: | :------: | :------: |
${this.mapDeltaboardDataToTable(newHiddenParams.weekly)}
| |${newHiddenParams.updateTimes.weekly}| |

## Monthly

| Rank | Username | Deltas |
| :------: | :------: | :------: |
${this.mapDeltaboardDataToTable(newHiddenParams.monthly)}
| |${newHiddenParams.updateTimes.monthly}| |

## Yearly

| Rank | Username | Deltas |
| :------: | :------: | :------: |
${this.mapDeltaboardDataToTable(newHiddenParams.yearly)}
| |${newHiddenParams.updateTimes.yearly}| |

${stringifiedNewHiddenParams}
`

    // define update wiki parameters
    const updateWikiQuery = {
      page: 'deltaboards',
      reason: 'updated deltaboards',
      content: wikiOutput,
    }

    // updateWikiResponse
    await api.query(
      { URL: `/r/${subreddit}/api/wiki/edit`, method: 'POST', body: stringify(updateWikiQuery) }
    )
  }

  async saveSidebarDeltaboard(newHiddenParams, parsedDate) {
    const { api, subreddit } = this

    // get the current sidebar data
    const getAboutResponse = await api.query(`/r/${subreddit}/about/edit`)
    let sideBar = _.get(getAboutResponse, 'data.description')

    // create the string that will go into the sidebar
    const newTableToPutIn = `
###### Monthly Deltaboard

| Rank | Username | Deltas |
| :------: | :------: | :------: |
${this.mapDeltaboardDataToTable(newHiddenParams.monthly)}
| |${parsedDate}| |
| |[More Deltaboards](/r/${subreddit}/wiki/deltaboards)| |`
    let textToReplace
    try {
      textToReplace = sideBar.match(
        new RegExp(
          '\\[.\\]\\(HTTP://(?:DB3PARAMSSTART )?DB3 AUTO UPDATES START HERE(?: DB3PARAMSEND)?\\)' +
          '([^]+)' +
          '\\[.\\]\\(HTTP://(?:DB3PARAMSSTART )?DB3 AUTO UPDATES END HERE(?: DB3PARAMSEND)?\\)'
        )
      )[1]
    } catch (err) {
      sideBar += '[​](HTTP://DB3 AUTO UPDATES START HERE)' +
        '([^]+)' +
        '[​](HTTP://DB3 AUTO UPDATES END HERE)'
      textToReplace = sideBar.match(
        new RegExp(
          '\\[.\\]\\(HTTP://(?:DB3PARAMSSTART )?DB3 AUTO UPDATES START HERE(?: DB3PARAMSEND)?\\)' +
          '([^]+)' +
          '\\[.\\]\\(HTTP://(?:DB3PARAMSSTART )?DB3 AUTO UPDATES END HERE(?: DB3PARAMSEND)?\\)'
        )
      )[1]
    }
    // replace the old deltaboards sidebar with the new one
    // also change &gt; to >
    const newSideBarText = sideBar
      .replace(textToReplace, newTableToPutIn)
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/amp;\\/g, '\\')
    const currentAboutData = _.get(getAboutResponse, 'data')

    // start params
    const updateSideBarQuery = _.assign({ allow_top: true }, currentAboutData, {
      description: newSideBarText,
      sr: currentAboutData.subreddit_id,
      type: currentAboutData.subreddit_type,
      link_type: currentAboutData.content_options,
    })

    // updateSideBar
    await api.query(
      { URL: '/api/site_admin', method: 'POST', body: stringify(updateSideBarQuery) }
    )
  }

  async getNewDeltaboards() {
    // get the date variables ready
    const now = new Date()
    const nowDayOfTheMonth = now.getDate()
    const nowMonth = now.getMonth()
    const nowYear = now.getFullYear()
    const dateOfThisMonday = new Date(
      moment().set({ hour: 0, minute: 0, second: 0, millisecond: 0 }).isoWeekday(1).format()
    )
    const dateOfThisSunday = new Date(
      moment().set({ hour: 23, minute: 59, second: 59, millisecond: 0 }).isoWeekday(7).format()
    )
    const dateOfFirstDayOfThisMonth = new Date(nowYear, nowMonth)

    // prep the object for the deltaBoards
    const deltaBoards = {
      daily: {}, // updates every minute
      weekly: {}, // updates every minute
      monthly: {}, // updates every hour
    }

    // set when to stop getting new comments by date
    const stopBeforeThisDate = (
      dateOfFirstDayOfThisMonth > dateOfThisMonday ? dateOfThisMonday : dateOfFirstDayOfThisMonth
    )

    // set up variable for while loop
    let oldestDateParsed = now
    let after
    let noMoreComments

    // begin grabbing and parsing comments to be ready to be used
    while (oldestDateParsed >= stopBeforeThisDate && !noMoreComments) {
      // make a call to get the comments
      const commentQuery = {
        limit: '1000',
        after,
      }
      const { api } = this
      const commentJson = await api.query(
        `/user/${this.credentials.username}/comments?${stringify(commentQuery)}`
      )
      after = _.get(commentJson, 'data.after')
      if (!after) noMoreComments = true

      // grab the relevant data into a variable
      const children = _.get(commentJson, 'data.children')

      // loop through each comment
      for (const child of children) {
        // define methods on top of scope of where it will be used

        // this adds a delta to the deltaBoards. This mutates the board object
        const addDelta = ({ board, username, time }) => {
          // if the username is there already, up the deltacount
          if (username in board) ++board[username].deltaCount
          // if it is not there, create the base
          // because it is looping oldest first, the newestDeltaTime is the first one
          // it sees.
          else {
            board[username] = {
              deltaCount: 1,
              newestDeltaTime: time,
            }
          }
        }

        // grab data from the response and put into variables
        const { body, created_utc: createdUtc } = child.data

        // get the date variables ready
        const childDate = new Date(createdUtc * 1000) // createdUtc is seconds. Date accepts ms
        const childDateDayOfTheMonth = childDate.getDate()
        const childMonth = childDate.getMonth()
        const newHiddenParams = parseHiddenParams(body)

        // continue only if hidden params
        if (newHiddenParams) {
          const { issues, parentUserName } = newHiddenParams
          const issueCount = Object.keys(issues).length

          // waterfall add deltas to the objects if it is a valid delta
          if (issueCount === 0) {
            // weekly deltaboard is unique, remove it from the waterfall
            // because it could be before or after the monthly deltaboards.
            // add to weekly boards object
            if (
              dateOfThisMonday <= childDate &&
              dateOfThisSunday >= childDate
            ) { // weekly boards
              const { weekly } = deltaBoards
              addDelta({
                board: weekly,
                username: parentUserName,
                time: createdUtc,
              })
            }
            // set up the waterfall delta date check
            switch (true) {
              // add to daily boards object
              case (nowDayOfTheMonth === childDateDayOfTheMonth): // daily boards
                const { daily } = deltaBoards
                addDelta({
                  board: daily,
                  username: parentUserName,
                  time: createdUtc,
                })
              // add to monthly boards object
              case (nowMonth === childMonth): // monthly boards
                const { monthly } = deltaBoards
                addDelta({
                  board: monthly,
                  username: parentUserName,
                  time: createdUtc,
                })
                break
              default:
                break
            }
          }
        }

        // set the oldestDateParsed
        oldestDateParsed = childDate

        // break when all comments needed are parsed
        if (oldestDateParsed <= stopBeforeThisDate) {
          console.log('broke out of the for loop because oldestDateParsed >= stopBeforeThisDate')
          break
        }
      }
    }

    return deltaBoards
  }

  async updateYearlyDeltaboard() {
    const now = new Date()
    const topTenYear = await this.getPeriodTopTen(now.getFullYear())

    const yearly = []

    for (const user of topTenYear) {
      yearly.push({ username: user[0], deltaCount: user[1], newestDeltaTime: 0 })
    }

    await this.saveYearlyDeltaboard(yearly)

    setTimeout(() => this.updateYearlyDeltaboard(), 3 * 3600 * 1000) // run again in 3 hours
  }

  async getPeriodTopTen(year, month = null) {
    const total = await this.getPeriodDeltasTotal(year, month)

    const totalList = []
    // eslint-disable-next-line
    for (const user in total) {
      totalList.push([user, total[user]])
    }

    totalList.sort((a, b) => b[1] - a[1])

    return totalList.slice(0, 10)
  }

  async getPeriodDeltasTotal(year, month = null) {
    const { api, credentials } = this

    // get the date variables ready
    let startOfPeriod
    let endOfPeriod
    if (month === null) {
      startOfPeriod = new Date(year, 0)
      endOfPeriod = new Date(year + 1, 0)
    } else {
      startOfPeriod = new Date(year, month - 1)
      endOfPeriod = new Date(year, month)
    }

    const threadUrls = await this.getPeriodThreadUrls(startOfPeriod, endOfPeriod)
    const deltas = []

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
            if (child.data.author === credentials.username) {
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

  async getPeriodThreadUrls(start, end) {
    const { api } = this

    const threadUrls = []
    let finished = false

    // subtract 6 months, as threads in last 6 months of last year can have deltas from this year
    const startTimestamp = (start.getTime() / 1000) - (3600 * 24 * 31 * 6)
    let endOfPeriod = end

    // crawl the specified time period for threads
    while (!finished) {
      const threadQuery = {
        limit: '100',
        sort: 'new',
        q: `timestamp:${startTimestamp}..${endOfPeriod.getTime() / 1000}`,
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
        if (childDate < endOfPeriod) {
          endOfPeriod = childDate
        }
      }
    }

    return threadUrls
  }

  async saveYearlyDeltaboard(yearly) {
    const { api, subreddit } = this

    // grab the newHiddenParams from the wiki page
    const wikiPage = 'deltaboards'
    const deltaBoardsWikiContent = await getWikiContent({ api, subreddit, wikiPage })
    const hiddenParams = parseHiddenParams(deltaBoardsWikiContent)

    if (hiddenParams.updateTimes && !_.isEqual(hiddenParams.yearly, yearly)) {
      hiddenParams.updateTimes.yearly = getParsedDate()
    }

    hiddenParams.yearly = yearly

    const hiddenSection = deltaBoardsWikiContent.match(/DB3PARAMSSTART[^]+DB3PARAMSEND/)[0].slice(
      'DB3PARAMSSTART'.length, -'DB3PARAMSEND'.length
    )

    const newWikiContent = deltaBoardsWikiContent.replace(
      hiddenSection, JSON.stringify(hiddenParams, null, 2).replace(/\)/g, '-paren---')
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
  }
}

export default DeltaBoards
