const parsemrc = require('../lib/parsemrc')

describe('parsemrc', () => {
  describe('extractFieldTagL', () => {
    it('builds hash relating inumbers to fieldTag l', () => {
      const input = [
        {
          id: '123',
          varFields: [
            { fieldTag: 'a' },
            { fieldTag: 'b' },
            { fieldTag: 'l', content: 'fieldtag l content' }
          ]
        },
        {
          id: '456',
          varFields: [
            { fieldTag: 'l', content: 'fieldtag l content (2)' }
          ]
        }
      ]

      expect(parsemrc.extractFieldTagL(input)).to.deep.equal({
        '.i1235': 'fieldtag l content',
        '.i456x': 'fieldtag l content (2)'
      })
    })
  })
})
