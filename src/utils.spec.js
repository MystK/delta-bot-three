/* eslint-env jest */
import path from 'path'

// first, dynamically grab the file name of what we're testing
const fileName = path.basename(__filename)
const componentFileName = fileName.match(/([^]+).spec.js/)[1]

// bring in the component to be used in tests
const component = require(`./${componentFileName}.js`)

describe('utilities', () => {
  it('should escape only underscores', () => {
    const { escapeUnderscore } = component
    expect(escapeUnderscore('__UsName__')).toBe('\\_\\_UsName\\_\\_')
  })
  it('should correctly check for deltas', () => {
    const { checkCommentForDelta } = component
    const createMockCommentClass = bodyHtml => ({ bodyHtml })
    expect(checkCommentForDelta(createMockCommentClass(''))).toBe(false)
    expect(checkCommentForDelta(createMockCommentClass('!delta'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass('!dElTa'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass('Δ'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass('∆'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass('&#8710;'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass('&amp;#8710;'))).toBe(true)
    expect(checkCommentForDelta(createMockCommentClass(
        'blockquote&gt;&amp;#8710;&#8710;∆Δ!delta!dElTa/blockquote&gt;'))).toBe(false)
    expect(checkCommentForDelta(createMockCommentClass(
        'pre&gt;&amp;#8710;&#8710;∆Δ!delta!dElTa/pre&gt;'))).toBe(false)
  })
})
