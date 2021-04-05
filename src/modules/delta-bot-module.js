const fsp = require('fs-promise')
const Snoowrap = require('snoowrap')
const _ = require('lodash')
const { getUserAgent } = require('./../utils')

class DeltaBotModule {
  constructor(fileName, legacyRedditApi, stateSchema) {
    const configPath = `${__dirname}/../../config/config.json`
    this.config = fsp.readJsonSync(configPath)
    this.botUserName = 'Not set yet!'
    this.subreddit = this.config.subreddit
    this.fileName = fileName.replace(__dirname, '').slice(1).slice(0, -3)
    this.moduleName = _.startCase(this.fileName)
    this.reddit = 'Not connected yet!'
    this.subredditDriver = 'Not connected yet!'
    this.legacyRedditApi = legacyRedditApi
    this.statePath = `${__dirname}/../../config/state/${this.fileName}-state.json`
    this.stateSchema = stateSchema
  }
  getAndSetCredentials() {
    try {
      const moduleCredentialsPath = `${__dirname}/../../config/credentials${this.fileName}.json`
      return fsp.readJsonSync(moduleCredentialsPath)
    } catch (expectedError) {
      const defaultCredentialsPath = `${__dirname}/../../config/credentials/credentials.json`
      return fsp.readJsonSync(defaultCredentialsPath)
    }
  }
  get state() {
    try {
      if (!this.stateObj) this.stateObj = fsp.readJsonSync(this.statePath)
      if (this.stateSchema) {
        Object.keys(this.stateSchema).forEach((key) => {
          if (!(key in this.stateObj)) {
            throw Error(`${key} not found in state object. Resetting to default. ${this.stateObj}`)
          }
          if (typeof this.stateSchema[key] !== typeof this.stateObj[key]) {
            throw Error(
              `Type of ${key} in state object is not correct. ` +
              `Should be type, ${typeof this.stateSchema[key]}, but ` +
              `it is type, ${this.stateObj[key]}. Resetting to default. ${this.stateObj}`
            )
          }
        })
      }
    } catch (err) {
      console.log(`No state.json file found for ${this.fileName} module. Going to create one!`)
      this.stateObj = this.stateSchema || {}
      fsp.writeJsonSync(this.statePath, this.stateObj)
    }
    return this.stateObj
  }
  set state(newState) {
    return (async () => {
      const oldState = this.stateObj
      try {
        this.stateObj = newState
        await fsp.writeJson(this.statePath, newState)
      } catch (error) {
        this.state = oldState
        await fsp.writeJson(this.statePath, oldState)
      }
    })()
  }
  async login() {
    const credentials = this.getAndSetCredentials()
    this.botUsername = credentials.username
    const userAgent = getUserAgent(this.moduleName)
    this.reddit = new Snoowrap(_.assign(credentials, { userAgent }))
    this.reddit.config({
      requestDelay: 1000,
      continueAfterRatelimitError: true,
      maxRetryAttempts: 5,
    })
    this.subredditDriver = await this.reddit.getSubreddit(this.subreddit)
  }
  async bootstrap() {
    await this.login()
  }
}
module.exports = DeltaBotModule
