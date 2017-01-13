/* eslint-env jest */
//
// Unit tests of parse-hidden-params.js
//

import { default as parser } from './parse-hidden-params'

describe('parse-hidden-params', () => {
  it('should extract JSON from within the hidden params', () => {
    const res = parser('DB3PARAMSSTART { "dummy_val": true } DB3PARAMSEND')
    expect(res.dummy_val).toBe(true)
  })
  it('should fail to extract JSON that doesnt contain the start and end strings', () => {
    const res = parser('{ "dummy_val": true}')
    expect(res).toBe(false)
  })
  it('should handle JSON containing HTML entities', () => {
    const res = parser('DB3PARAMSSTART { &quot;dummy_val&quot;:' +
    '&quot;&lt;&gt;&amp;&copy;&reg;&quot; } DB3PARAMSEND')
    // Should resolve to :
    // {"dummy_val": "<>&©®"}
    expect(res.dummy_val).toBe('<>&©®')
  })
  it('should handle malformed JSON', () => {
    const res = parser('DB3PARAMSSTART { BADJSON } DB3PARAMSEND')
    expect(res).toBe(false)
  })
})
