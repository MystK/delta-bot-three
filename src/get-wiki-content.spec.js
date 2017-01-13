/* eslint-env jest */
//
// Unit tests for get-wiki-content
//

import { default as getwiki } from './get-wiki-content'

// Mocked out API to allow unit test to 'contact' reddit
const mockApi = {
  queryReturn: null,
  expectedUrl: null,
  query(url) {
    expect(url).toBe(this.expectedUrl)
    return this.queryReturn
  },
}

describe('get-wiki-content', () => {
  beforeEach(() => {
    mockApi.queryReturn = null
    mockApi.expectedUrl = null
  })

  it('should extract the contents of the <textarea> element of the wiki page', async () => {
    mockApi.queryReturn = '<textarea readonly class="source" rows="20" cols="20">' +
                           '<h1>test</h1>' +
                          '</textarea>'
    mockApi.expectedUrl = '/r/subreddit/wiki/wikipage'
    const res = await getwiki({
      api: mockApi,
      subreddit: 'subreddit',
      wikiPage: 'wikipage',
    })
    expect(res).toBe('<h1>test</h1>')
  })

  it('should return false when extraction fails', async () => {
    mockApi.queryReturn = null
    mockApi.expectedUrl = '/r/subreddit/wiki/wikipage'
    const res = await getwiki({
      api: mockApi,
      subreddit: 'subreddit',
      wikiPage: 'wikipage',
    })
    expect(res).toBe(false)
  })
})
