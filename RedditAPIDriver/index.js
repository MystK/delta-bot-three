import 'colors'
import formurlencoded from 'form-urlencoded'
import fetch from 'node-fetch'
import promisify from 'promisify-node'
import fs from 'fs'
import _ from 'lodash'

fs.readFile = promisify(fs.readFile)

module.exports = class RedditAPIDriver {
  constructor(credentials, version, sessionPath, flags) {
    this.sessionPath = sessionPath
    this.credentials = credentials
    this.flags = flags
    this.headers = {}
    this.baseURL = 'https://oauth.reddit.com'
    this.version = version
  }
  async connect(options = { type: 'FIRST_CONNECTION' }) {
    let json
    const { type } = options
    if (type === 'GET_NEW_SESSION') {
      const { username, password, clientID, clientSecret } = this.credentials
      const auth = new Buffer(`${clientID}:${clientSecret}`).toString('base64')
      const res = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'user-agent': `DB3/v${this.version} by MystK`,
          'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Authorization: `Basic ${auth}`,
        },
        body: formurlencoded({ grant_type: 'password', username, password }),
      })
      json = await res.json()
      fs.writeFile(`${this.sessionPath}session.json`, JSON.stringify(json, null, 2))
    } else if (type === 'FIRST_CONNECTION') {
      try {
        json = JSON.parse(await fs.readFile(`${this.sessionPath}session.json`, 'utf-8'))
      } catch (err) {
        return this.connect({ type: 'GET_NEW_SESSION' })
      }
    } else throw Error('This should never happen. Unhandled type for RedditAPIDriver.connect()')
    console.log('Getting session token!'.yellow)
    if (typeof json === 'object') console.log('Got token'.green)
    else throw Error('JSON was not an object')
    console.log(`${JSON.stringify(json, null, 2)}`.yellow)
    const [tokenType, accessToken] = [json.token_type, json.access_token]
    this.headers = {
      authorization: `${tokenType} ${accessToken}`,
      'user-agent': `DB3/v${this.version} by MystK`,
    }
    this.headersNoAuth = {
      'user-agent': `DB3/v${this.version} by MystK`,
    }
    return true
  }
  async query(params, noOauth, wiki, count = 0) {
    try {
      return await new Promise(async (res, rej) => {
        let gotResponse
        const retry = (resRetry, rejRetry, useCount) => {
          console.log('Retrying in 10 seconds! R_API')
          if (useCount && count >= 5) rejRetry(Error('Something happened! There was 5 404s!'))
          else {
            setTimeout(async () => {
              resRetry(await this.query(params, noOauth, wiki, count + 1))
            }, 10000)
          }
        }
        setTimeout(() => {
          if (!gotResponse) {
            console.log('10 second timeout'.red)
            retry(res, rej)
          }
        }, 10000)
        const headers = this.headers
        const headersNoAuth = this.headersNoAuth
        let response
        if (typeof params === 'string') {
          if (noOauth) {
            const URL = `https://www.reddit.com${params}`
            console.log(`REDDITAPI: QUERYING: GET ${URL}`.yellow)
            response = await fetch(URL, { headersNoAuth })
          } else {
            const URL = `${this.baseURL}${params}`
            console.log(`REDDITAPI: QUERYING: GET ${URL}`.yellow)
            response = await fetch(URL, { headers })
          }
        } else {
          const { URL, method, body } = params
          console.log(`REDDITAPI: QUERYING: ${method} ${this.baseURL}${URL}`.yellow)
          response = await fetch(`${this.baseURL}${URL}`, { headers, method, body })
        }
        const statusCode = response.status
        gotResponse = true
        if (statusCode !== 200 && !wiki) {
          console.log(await response.text())
          console.log(`Status Code: ${statusCode}`.red)
        }
        if (statusCode === 200) {
          try {
            if (wiki) res(await response.text())
            else res(await response.json())
            const rateHeaders = _.pick(
              response.headers.raw(), [
                'x-ratelimit-used',
                'x-ratelimit-remaining',
                'x-ratelimit-reset',
              ]
            )
            if (Object.keys(headers).length) console.log(rateHeaders)
          } catch (error) {
            retry(res, rej)
          }
        } else if (statusCode === 401 || statusCode === 403) {
          console.log('75 R_API (status was 401 or 403)')
          if (this.flags.isDebug) {
            console.log(response)
          }
          await this.connect({ type: 'GET_NEW_SESSION' })
          retry(res, rej)
        } else if (statusCode === 404) {
          retry(res, rej, true)
        } else {
          if (wiki) res(await response.text())
          retry(res, rej)
        }
      })
    } catch (err) {
      console.log('89 R_API')
      console.log(err)
      return false
    }
  }
}
