import _ from 'lodash'
import { stringify } from 'query-string'
import moment from 'moment'
import Api from './reddit-api-driver'
import parseHiddenParams from './parse-hidden-params'
import stringifyObjectToBeHidden from './stringify-hidden-params'
import getWikiContent from './get-wiki-content'
import { escapeUnderscore } from './utils'
import fs from 'fs'
import promisify from 'promisify-node'
import mkdirp from 'mkdirp'

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
    this.startJob()
  }
  async startJob() {
    // define methods on top of scope of where it will be used

    // get the date variables ready
    const now = new Date()
    const nowYear = now.getFullYear()

    const deltas = []

    // fetch already existing delta files
    const path = './config/deltas/' + nowYear + '/'
    const files = await fs.readdirSync(path)

    mkdirp.sync(path)

    let lastSavedDay = 0

    for (let i = 0; i < files.length; ++i) {
      const file = files[i]
      if (!fs.statSync(path + file).isDirectory()) {
          if (parseInt(file) > lastSavedDay) {
            lastSavedDay = parseInt(file)
          }
      }
    }

    const dateFromDay = function(year, day) {
      let date = new Date(year, 0);
      return new Date(date.setDate(day));
    }
    const dayFromDate = function(date, nowYear) {
        return Math.floor((date - new Date(nowYear, 0, 0)) / (1000 * 3600 * 24))
    }

    const currentDayOfYear = dayFromDate(now, nowYear)

    if (lastSavedDay < currentDayOfYear - 1) {
      const stopBeforeThisDate = dateFromDay(nowYear, lastSavedDay + 1)
      const ignoreAfterThisDate = dateFromDay(nowYear, currentDayOfYear)

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

          // this adds a delta to the delta list
          const addDelta = ({ username, time }) => {
            const day = dayFromDate(time, nowYear)

            if (deltas[day] === undefined) {
              deltas[day] = {}
            }

            if (deltas[day][username] === undefined) {
                deltas[day][username] = 0
            }

            deltas[day][username]++
          }

          // grab data from the response and put into variables
          const { body, created_utc: createdUtc } = child.data

          // get the date variables ready
          const childDate = new Date(createdUtc * 1000) // createdUtc is seconds. Date accepts ms
          const newHiddenParams = parseHiddenParams(body)

          if (childDate > ignoreAfterThisDate) {
            continue
          }

          if (childDate < stopBeforeThisDate) {
              oldestDateParsed = childDate
              break;
          }


          // continue only if hidden params
          if (newHiddenParams) {
              const { issues, parentUserName } = newHiddenParams
              const issueCount = Object.keys(issues).length

              // waterfall add deltas to the objects if it is a valid delta
              if (issueCount === 0) {
                  addDelta({
                      username: parentUserName,
                      time: childDate,
                  })
              }
          }
          // set the oldestDateParsed
          oldestDateParsed = childDate
        }
      }
    }

    // now save the collected delta stats to the corresponding file
    for (let i = lastSavedDay + 1; i < deltas.length; i++) {
      try {
        await fs.writeFile(
          path + i, JSON.stringify(deltas[i])
        )
      } catch (e) {
        console.log(e)
      }
    }

    // set the timeout here in case it takes long or hangs,
    // so it doesn't fire off multiple time at once
    setTimeout(() => this.startJob(), 3600 * 1000)
  }
  getYearTotal(year) {
    const deltas = []

    // fetch already existing delta files
    const path = './config/deltas/' + year + '/'
    const files = fs.readdirSync(path)

    let fileContents = []

    for (let i = 0; i < files.length; ++i) {
      const file = files[i]
      if (!fs.statSync(path + file).isDirectory()) {
        fileContents.push(JSON.parse(fs.readFileSync(path + file, "utf8")))
      }
    }

    let totalDeltas = {}

    for (let i in fileContents) {
      let deltas = fileContents[i]
      for (let user in deltas) {
        let amount = deltas[user]

        if (totalDeltas[user] === undefined) {
          totalDeltas[user] = 0
        }

        totalDeltas[user] += amount
      }
    }

    return totalDeltas
  }
  getYearTopTen(year) {
    let yearTotal = this.getYearTotal(year)

    let yearTotalList = []
    for (let user in yearTotal) {
      yearTotalList.push([user, yearTotal[user]])
    }

    yearTotalList.sort(function (a, b) {
      return b[1] - a[1]
    })

    return yearTotalList.slice(0, 10)
  }
}

export default DeltaBoardsYear
