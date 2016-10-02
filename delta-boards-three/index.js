import _ from 'lodash'
import { stringify } from 'query-string'
import Api from './../RedditAPIDriver'
import parseHiddenParams from './../parse-hidden-params'
import getWikiContent from './../get-wiki-content'

class DeltaBoardsThree {
  constructor({ credentials, version }) {
    this.credentials = credentials // this is used to log into the Reddit API
    this.version = version // this is used to mark the headers of the API calls
  }
  // this method is called by DB3 main code. It starts
  // the whole process of updating the Delta Boards
  async initialStart() {
    // first, grab the credentials and bot version from this
    const { credentials, version } = this

    // instantiate a new reddit API with the credentials and version
    this.api = new Api(credentials, version, './delta-boards-three/')

    // make the api a variable so we don't access it from 'this' all the time
    const { api } = this
    await api.connect()

    // start the scheduled time job
    this.startJob()
  }
  async startJob() {
    // define methods on top of scope of where it will be used

    // this method return a string that allows us to add metadata
    // to a listing without being seen by anybody other than DB3
    const stringifyObjectToBeHidden = input => (
      `[​](HTTP://DB3PARAMSSTART\n${JSON.stringify(input, null, 2)}\nDB3PARAMSEND)`
    )

    // get the date variables ready
    const now = new Date()
    const nowDayOfTheMonth = now.getDate()
    const nowDayOfTheWeek = now.getDay()
    const nowMonth = now.getMonth()
    const nowYear = now.getFullYear()
    // commented it out in case it's needed
    // const dateOfThisSunday = new Date(nowYear, nowMonth, nowDayOfTheMonth - nowDayOfTheWeek)
    const dateOfFirstDayOfThisMonth = new Date(nowYear, nowMonth)

    // prep the object for the deltaBoards
    const deltaBoards = {
      daily: {}, // updates every minute
      weekly: {}, // updates every minute
      monthly: {}, // updates every hour
      yearly: {}, // updates not yet
    }

    // set when to stop getting new comments by date
    const stopBeforeThisDate = dateOfFirstDayOfThisMonth

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
      const commentJson = await api.query(`/user/${this.credentials.username}/comments?${stringify(commentQuery)}`)
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
        const childYear = childDate.getFullYear()
        const newHiddenParams = parseHiddenParams(body)

        // continue only if hidden params
        if (newHiddenParams) {
          const { issues, parentUserName } = newHiddenParams
          const issueCount = Object.keys(issues).length

          // waterfall add deltas to the objects if it is a valid delta
          if (issueCount === 0) {
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
              // add to weekly boards object
              case (
                nowMonth === childMonth &&
                childDateDayOfTheMonth >= (nowDayOfTheMonth - nowDayOfTheWeek)
              ): // weekly boards
                const { weekly } = deltaBoards
                addDelta({
                  board: weekly,
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
              // add to yearly boards object
              case (nowYear === childYear): // yearly boards
                const { yearly } = deltaBoards
                addDelta({
                  board: yearly,
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

    // parse the data to be .map friendly
    const newHiddenParams = {
      daily: _(deltaBoards.daily)
        .map((data, username) => _.assign({ username }, data))
        .sortBy(['deltaCount', 'newestDeltaTime'])
        .reverse()
        .take(10)
        .value(),
      weekly: _(deltaBoards.weekly)
        .map((data, username) => _.assign({ username }, data))
        .sortBy(['deltaCount', 'newestDeltaTime'])
        .reverse()
        .take(10)
        .value(),
      monthly: _(deltaBoards.monthly)
        .map((data, username) => _.assign({ username }, data))
        .sortBy(['deltaCount', 'newestDeltaTime'])
        .reverse()
        .take(10)
        .value(),
    }

    // newHiddenParams the data
    const stringifiedNewHiddenParams = stringifyObjectToBeHidden(newHiddenParams)

    // declare the subreddit
    const subreddit = this.credentials.subreddit

    // get the Date string ready
    const parsedDate = `As of ${now.getMonth() + 1}/${now.getDate()}/` +
    `${now.getFullYear().toString().slice(2)} ` +
    `${_.padStart(now.getHours(), 2, 0)}:${_.padStart(now.getMinutes(), 2, 0)} ` +
    `${now.toString().match(/\(([A-Za-z\s].*)\)/)[1]}`

    // check if wiki and sidebar need to be updated
    try {
      // first start by creating a method which converts the data to line tables
      const mapDataToTable = data => _(data)
        .map((line, index) => {
          const { deltaCount, username } = line
          const rank = index + 1
          return (
            `| ${rank} | ${
              rank === 1 ?
                `**[${username}](/r/${subreddit}/wiki/user/${username})**` :
                `[${username}](/r/${subreddit}/wiki/user/${username})`
            } | ${deltaCount} |`
          )
        })
        .join('\n')

      // grab the api from this
      const { api } = this

      // grab the newHiddenParams from the wiki page
      const deltaBoardsWikiContent = await getWikiContent({ api, subreddit, wikiPage: 'deltaboards' })
      const oldHiddenParams = parseHiddenParams(deltaBoardsWikiContent)

      // if the monthly data has changed, update the sidebar
      if (!_.isEqual(_.get(oldHiddenParams, 'monthly'), newHiddenParams.monthly)) {
        // get the current sidebar data
        const getAboutResponse = await api.query(`/r/${subreddit}/about/edit`)
        let sideBar = _.get(getAboutResponse, 'data.description')

        // create the string that will go into the sidebar
        const newTableToPutIn = `
###### **Monthly Deltaboard**

| Rank | Username | Deltas |
| :------: | :------: | :------: |
${mapDataToTable(newHiddenParams.monthly)}
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
          .replace(/amp;#/g, '#')
          .replace(/amp;\\/g, '\\')
        const currentAboutData = _.get(getAboutResponse, 'data')

        // start params
        const updateSideBarQuery = _.assign({}, currentAboutData, {
          description: newSideBarText,
          sr: currentAboutData.subreddit_id,
          type: currentAboutData.subreddit_type,
          link_type: currentAboutData.content_options,
        })

        // updateSideBar
        await api.query(
          { URL: '/api/site_admin', method: 'POST', body: stringify(updateSideBarQuery) }
        )
      } else console.log('Monthly Deltaboard data hasn\'t changed. Won\'t update the sidebar')

      // if any data has changed, update the wiki
      if (!_.isEqual(oldHiddenParams, newHiddenParams)) {
        // create the wiki output
        const wikiOutput = `[**&#8656; back to main wiki page**](http://reddit.com/r/${subreddit}/wiki)

_____

# Deltaboards

**Daily**

| Rank | Username | Deltas |
| :------: | :------: | :------: |
${mapDataToTable(newHiddenParams.daily)}

**Weekly**

| Rank | Username | Deltas |
| :------: | :------: | :------: |
${mapDataToTable(newHiddenParams.weekly)}

**Monthly**

| Rank | Username | Deltas |
| :------: | :------: | :------: |
${mapDataToTable(newHiddenParams.monthly)}

${parsedDate}${stringifiedNewHiddenParams}
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
      } else console.log('No Deltaboard data has changed. Won\'t update the wiki')
    } catch (error) {
      console.log(error)
    }

    // set the timeout here in case it takes long or hangs,
    // so it doesn't fire off multiple time at once
    setTimeout(() => this.startJob(), 60000)
  }
}

export default DeltaBoardsThree
