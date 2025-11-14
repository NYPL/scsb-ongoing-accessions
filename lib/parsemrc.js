// 'use strict'
const H = require('highland')
const fs = require('fs')
const marc = require('marcjs')
const util = require('util')

const { mod11 } = require('./parseapi')

module.exports = {
  countBib: 0,
  countBibWithOclc: 0,
  countItem: 0,
  countHolding: 0,
  useRestrictionGroupDesignation: {},
  useRestrictionGroupDesignationCheck: {},
  useRestrictionGroupDesignationReport: {},

  // the lookup for barcodes to customer codes
  barcodes: new Map(),

  dupeCheck: new Map(),

  // this is the basic repeatable format for each SCSB middleware export record
  recordLayout: {
    bibRecord: {
      bib: {
        owningInstitutionId: ['NYPL']
      },
      holdings: {
        holding: []
      }
    }
  },

  /**
   * Sets up a logger

   * @param  {string} barcodeFile - the file lcoation
   * @param  {function} callback
   */
  registerLogger: function (mrcFilename) {
    const logFile = fs.createWriteStream(`${mrcFilename}.log.txt`, { flags: 'w' })
    const logStdout = process.stdout

    console.logToFile = function () {
      logFile.write(util.format.apply(null, arguments) + '\n')
      logStdout.write(util.format.apply(null, arguments) + '\n')
    }
  },

  /**
   * Load the dupecheck file or creat it if it doesn not exist

   * @param  {string} dupeFile - the file lcoation
   * @param  {function} callback
   */
  loadDupeCheck: function (dupefile, callback) {
    const self = this
    let c = 0
    fs.stat(dupefile, (err, stats) => {
      if (err) {
        if (err.code !== 'ENOENT') {
          console.log(err)
        }
      }
      if (!stats) {
        console.log(`${dupefile} Does not exist, creating it`)
        // does not exist yet, build it
        callback()
      } else { // do this
        console.log(`${dupefile} exists, Loading data`)
        H(fs.createReadStream(dupefile))
          .split()
          .map((line) => {
            c++
            if (c % 10000 === 0) process.stdout.write(`DupeCheck Load: ${c.toString()}` + '\r')
            self.dupeCheck.set(parseInt(line), true)
            return null
          })
          .done(() => {
            process.stdout.write('\nDupecheck Loaded\n')
            callback()
          })
      }
    })
  },

  /**
   * Load the barcode file and hold it as a lookup in memory

   * @param  {string} barcodeFile - the file lcoation
   * @param  {function} callback
   */
  loadBarcodes: function (barcodeFile, callback) {
    const self = this
    let c = 0

    H(fs.createReadStream(barcodeFile))
      .split()
      .map((line) => {
        c++
        if (c % 10000 === 0) process.stdout.write(`Barcode Load: ${c.toString()}` + '\r')

        const commaSplit = line.split(',')
        if (commaSplit[0] && commaSplit[1]) {
          const barcode = commaSplit[0]
          const customerCode = commaSplit[1]
          if (!isNaN(barcode) && customerCode.length === 2) {
            self.barcodes.set(parseInt(barcode), customerCode)
          } else {
            console.log('Error loading barcode:', line)
          }
        }
        return null
      })
      .done(() => {
        process.stdout.write('\nBarcodes Loaded\n')
        callback()
      })
  },

  /**
   * Given a subfield array it will extract the requested subfields into an object of arrays with the index being the code

   * @param  {array} subfields - The subfield array
   * @returns {object} su - the bnumber
   */
  convertSubfields: function (subfields) {
    const results = {}

    subfields.forEach((sf) => {
      const code = Object.keys(sf)[0]
      if (!results[code]) results[code] = []
      results[code].push(sf[code])
    })

    return results
  },

  /**
   * Retruns an array of given fields

   * @param  {object} fields - the fields array from the mij object
   * @param  {array} fields - the fields requested
   * @returns {object} - the converted object
   */
  convertFields: function (fields, requestedFields) {
    const results = {}
    if (typeof requestedFields === 'string') requestedFields = [requestedFields]
    requestedFields = requestedFields.map((f) => {
      return f.toString()
    })
    fields.forEach((field) => {
      const thisField = Object.keys(field)[0].toString()
      if (requestedFields.indexOf(thisField) > -1) {
        if (!results[thisField]) results[thisField] = []
        results[thisField].push(field[thisField])
      }
    })
    return results
  },

  /**
   * Given a marc record it will convert to json and add its size in bytes as a property

   * @param  {record} record - the record decoded from the MARC library
   * @returns {object} - the converted object
   */
  convertToJsonCheckSize: function (record) {
    const mij = record.toMiJ()
    const recordOrginal = record
    const recordBinary = marc.Iso2709Writer.format(record)
    const recordSize = Buffer.byteLength(recordBinary, 'utf8')
    return { mij, recordOrginal, recordBinary, recordSize }
  },

  /**
   * Given the MARC in JSON represntation it will extract the bnumber

   * @param  {object} mij - the M-in-J rep
   * @returns {string} bnumber - the bnumber
   */
  extractBnumber: function (mij) {
    const self = this
    const field907 = this.convertFields(mij.fields, '907')
    // there is only one 907 if present
    if (field907['907'] && field907['907'][0]) field907['907'] = field907['907'][0]

    if (field907['907'] && field907['907'].subfields) {
      const subfields = self.convertSubfields(field907['907'].subfields)
      if (subfields.a && subfields.a[0]) {
        return subfields.a[0]
      }
    }
    return false
  },

  /**
   * Given the MARC in JSON represntation it will extract the OCLC number

   * @param  {object} mij - the M-in-J rep
   * @returns {string} OCLC - the OCLC
   */
  extractOclc: function (mij) {
    const self = this
    let field = this.convertFields(mij.fields, '991')
    // there is only one 907 if present
    if (field['991'] && field['991'][0]) field['991'] = field['991'][0]

    if (field['991'] && field['991'].subfields) {
      const subfields = self.convertSubfields(field['991'].subfields)
      if (subfields.y && subfields.y[0]) {
        return subfields.y[0]
      }
    }

    // see if the OCLC is in the 001
    field = this.convertFields(mij.fields, '003')
    if (field['003'] && field['003'][0] && field['003'][0] === 'OCoLC') {
      field = this.convertFields(mij.fields, '001')
      if (field['001'] && field['001'][0]) {
        return field['001'][0]
      }
    }

    field = this.convertFields(mij.fields, '035')
    if (field['035'] && field['035'][0]) {
      if (JSON.stringify(field).search('OCoLC') > -1) {
        for (const x in field) {
          for (const a035 in field[x]) {
            if (field[x][a035].subfields) {
              for (const aSubfield in field[x][a035].subfields) {
                if (field[x][a035].subfields[aSubfield] && field[x][a035].subfields[aSubfield].a) {
                  if (field[x][a035].subfields[aSubfield].a.search('(OCoLC)') > -1) {
                    const oclcNum = field[x][a035].subfields[aSubfield].a.match(/\(OCoLC\)([0-9]+)/)
                    if (oclcNum && oclcNum[1]) {
                      return oclcNum[1]
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return false
  },
  /**
   * Given the MARC in JSON represntation it will extract the Bib level call number number

   * @param  {object} mij - the M-in-J rep
   * @returns {array} bnumber - the bnumber
   */
  extractBibCallNumber: function (mij) {
    const self = this
    const results = []
    const field = this.convertFields(mij.fields, '952')

    if (field[952]) {
      field[952].forEach((aField) => {
        if (aField.subfields) {
          const subfields = self.convertSubfields(aField.subfields)
          if (subfields.h && subfields.h[0]) results.push(subfields.h[0])
        }
      })
    }

    return results
  },

  /**
   * Given the MARC in JSON represntation it will extract the item subfields

   * @param  {object} mij - the M-in-J rep
   * @returns {object} results - object, key is field number, array of subfieds
   */
  extractItemFields: function (mij) {
    const self = this
    const fields = this.convertFields(mij.fields, ['852', '876'])

    const results = {
      852: [],
      876: []
    }
    Object.keys(fields).forEach((fieldNumber) => {
      fields[fieldNumber].forEach((aField) => {
        if (aField.subfields) {
          const r = self.convertSubfields(aField.subfields)
          if (r) results[fieldNumber].push(r)
        }
      })
    })

    return results
  },

  /**
   * Given the MARC in JSON represntation it will extract the holdings 866 subfields

   * @param  {object} mij - the M-in-J rep
   * @returns {object} results - object, key is field number, array of subfieds
   */
  extractHoldingFields: function (mij) {
    const self = this
    const fields = this.convertFields(mij.fields, ['866'])

    const results = {
      866: []
    }
    Object.keys(fields).forEach((fieldNumber) => {
      fields[fieldNumber].forEach((aField) => {
        if (aField.subfields) {
          const r = self.convertSubfields(aField.subfields)
          if (r) results[fieldNumber].push(r)
        }
      })
    })

    return results
  },

  /**
   * Given the MARC in JSON represntation it will extract the data

   * @param  {object} mij - the M-in-J rep
   * @returns {array} fields - the array of control fields in mij format
   */
  extractDataFields: function (record) {
    const results = []
    record.mij.fields.forEach((field) => {
      const number = parseInt(Object.keys(field)[0])
      // no controle fields, no item fields, no 35 oclc control number field
      if (number > 9 && [866, 852, 876].indexOf(number) === -1 && number !== 35) {
        results.push(field)
      }
    })

    if (record.oclcNumber) {
      results.push({ '035': { subfields: [{ a: `(OCoLC)${record.oclcNumber}` }], ind1: ' ', ind2: ' ' } })
      this.countBibWithOclc++
    }

    // looks like this:
    // [ { '001': 'NYPG003001594-B' },
    //   { '005': '20001116192456.4' },
    //   { '008': '850325s1981    ii a     b    000 1 hin d' } ]

    return results
  },

  /**
   * Given the MARC in JSON represntation it will extract the control fields

   * @param  {object} mij - the M-in-J rep
   * @returns {array} fields - the array of control fields in mij format
   */
  extractControlFields: function (mij) {
    const results = []
    mij.fields.forEach((field) => {
      const number = Object.keys(field)[0]
      if (parseInt(number) < 10) {
        results.push(field)
      }
    })
    // looks like this:
    // [ { '001': 'NYPG003001594-B' },
    //   { '005': '20001116192456.4' },
    //   { '008': '850325s1981    ii a     b    000 1 hin d' } ]

    return results
  },
  /**
   * Given the record record it will make sure the 001 field is correct

   * @param  {object} record - data record
   * @returns {object} record - the whole record with modified controledfields
   */
  fix001: function (record) {
    const field001 = this.convertFields(record.controlFields, ['001'])
    if (!field001['001']) {
      // if there is a oclc number use that and add a 003
      if (record.oclcNumber) {
        record.controlFields.push({ '001': record.oclcNumber })
        record.controlFields.push({ '003': 'OCoLC' })
        const field003 = this.convertFields(record.controlFields, ['003'])
        if (field003['003'].length > 1) {
          if (console.logToFile) console.logToFile(`Too many 003 fields added, ${record.bNumber}`)
        }
      } else if (record.bNumber) {
        record.controlFields.push({ '001': `NYPL${record.bNumber}` })
      }
    }

    return record
  },

  /**
   * Given the record with all the data extracted it will build the final items in xml2js format ready to be exported, index by call number

   * @param  {object} record - the whole record data
   * @returns {object} items - the items by call number index in xml2js format
   */
  buildItems: function (record, customercode = 'NA') {
    const self = this
    const itemIds = []
    const data852 = {}
    const data876 = {}
    const regAllDigits = /^\d+$/
    const barcodesUsed = []
    record.itemCount = 0
    record.itemXmlJsObj = {}
    record.locationCodeIndex = {} // kind of hacky

    // convert the arrays of data keyed on .i number
    record.itemData['852'].forEach((item) => {
      if (item.a) {
        if (itemIds.indexOf(item.a[0]) === -1) itemIds.push(item.a[0])
        if (!data852[item.a[0]]) data852[item.a[0]] = {}
        Object.keys(item).forEach((code) => {
          data852[item.a][code] = item[code][0]
        })
      } else {
        if (console.logToFile) console.logToFile(`852 missing inumber,${record.bNumber}`)
      }
    })

    record.itemData['876'].forEach((item) => {
      if (item.a) {
        if (itemIds.indexOf(item.a[0]) === -1) itemIds.push(item.a[0])
        if (!data876[item.a[0]]) data876[item.a[0]] = {}
        Object.keys(item).forEach((code) => {
          data876[item.a][code] = item[code][0]
        })
      } else {
        if (console.logToFile) console.logToFile(`876 missing inumber,${record.bNumber}`)
      }
    })

    // loop through each item and build the final item object
    itemIds.forEach((i) => {
      let customerCode
      // we want to exlude some items here because they are not supposed to be in the extract because they are not ReCAP or other reasons
      if (data852[i] && data876[i]) {
        // check if this is a ReCAP item
        if (data852[i].b && data876[i].k) {
          if (data852[i].b.substring(0, 2) !== 'rc' || data876[i].k.substring(0, 2) !== 'rc') {
            if (console.logToFile) console.logToFile(`Not in ReCAP, ${record.bNumber}`)
            return false
          }
        } else {
          if (!data852[i].b) {
            if (console.logToFile) console.logToFile(`852|b missing,${i} in ${record.bNumber}`)
          } else {
            if (console.logToFile) console.logToFile(`876|k missing,${i} in ${record.bNumber}`)
          }
          return false
        }

        // check if it has bad values we are excluding for now
        // if (data852[i].y && [43, 209].indexOf(parseInt(data852[i].y)) > -1) {
        //   if (data876[i].s && [43, 209].indexOf(parseInt(data876[i].s)) > -1) {
        //     return false
        //   }
        // }
      } else {
        if (!data852[i]) {
          if (console.logToFile) console.logToFile(`852 missing,${i} in ${record.bNumber}`)
        } else {
          if (console.logToFile) console.logToFile(`876 missing,${i} in ${record.bNumber}`)
        }
        return false
      }

      // if it got here all the data is good and we want to hopefully turn it into an item
      // check the barcode and get the customer codes
      if (!data876[i].p) {
        if (console.logToFile) console.logToFile(`Missing barcode: no 876|p, ${i} in ${record.bNumber}`)
        return false
      } else {
        data876[i].p = data876[i].p.trim()

        // see if we only have numbers in there
        if (!data876[i].p.match(regAllDigits)) {
          if (console.logToFile) console.logToFile(`Non numeric barcode found, ${data876[i].p}, item: ${i} in ${record.bNumber}`)
          return false
        }

        // see if we have a duplicate barcode in this file
        if (barcodesUsed.indexOf(parseInt(data876[i].p)) !== -1) {
          if (console.logToFile) console.logToFile(`Duplicate barcode found in single record, ${data876[i].p}, item: ${i} in ${record.bNumber}`)
          return false
        }

        customerCode = self.barcodes.get(parseInt(data876[i].p))
        if (!customerCode) {
          if (customercode) {
            customerCode = customercode
          } else {
            console.logToFile(`Barcode not found anywhere, ${data876[i].p}, item: ${i} in ${record.bNumber}`)
            return false
          }
        } else {
          barcodesUsed.push(parseInt(data876[i].p))
        }
      }

      const useRestriction = self.buildUseRestriction(data852[i], data876[i], customerCode, record.fieldTagL[i])

      if (!self.useRestrictionGroupDesignation[useRestriction.useRestriction]) self.useRestrictionGroupDesignation[useRestriction.useRestriction] = 0
      if (!self.useRestrictionGroupDesignation[useRestriction.groupDesignation]) self.useRestrictionGroupDesignation[useRestriction.groupDesignation] = 0
      if (!self.useRestrictionGroupDesignationReport[useRestriction.ruleGroup]) self.useRestrictionGroupDesignationReport[useRestriction.ruleGroup] = 0

      self.useRestrictionGroupDesignation[useRestriction.useRestriction]++
      self.useRestrictionGroupDesignation[useRestriction.groupDesignation]++
      self.useRestrictionGroupDesignationReport[useRestriction.ruleGroup]++

      // build the basic structure, we know we have the barcode
      const new876 = {
        $: {
          ind1: ' ',
          ind2: ' ',
          tag: '876'
        },
        subfield: [
          {
            _: data876[i].p,
            $: { code: 'p' }
          }
        ]
      }

      if (useRestriction.groupDesignation) {
        new876.subfield.push({ _: useRestriction.useRestriction, $: { code: 'h' } })
      } else {
        console.error(`groupDesignation not found, ${i}`)
      }

      if (data876[i].a) {
        new876.subfield.push({ _: data876[i].a, $: { code: 'a' } })
      } else {
        console.error(`Missing 876|a,${i}`)
      }

      if (data876[i].j) {
        if (data876[i].j.trim().toLowerCase() === 'o' || data876[i].j.trim().toLowerCase() === '-') {
          new876.subfield.push({ _: 'Available', $: { code: 'j' } })
        } else if (data876[i].j.trim().length === 1) {
          new876.subfield.push({ _: 'Not Available', $: { code: 'j' } })
        } else if (data876[i].j.search('/') > -1) {
          new876.subfield.push({ _: 'Loaned', $: { code: 'j' } })
        } else {
          console.error(`Bad 876|j,${i},${data876[i].j}`)
        }
      } else {
        console.error(`Missing 876|j,${i}`)
      }

      if (data876[i].t) {
        new876.subfield.push({ _: data876[i].t, $: { code: 't' } })
      } else {
        console.error(`Missing 876|t,${i}`)
      }

      if (data852[i]['3']) {
        new876.subfield.push({ _: data852[i]['3'], $: { code: '3' } })
      } else {
        // this is very common
        // console.error(`Missing 852|3,${i}`)
      }

      // the middleware Item is composed of the 876 and a 900
      const new900 = {
        $: {
          ind1: ' ',
          ind2: ' ',
          tag: '900'
        },
        subfield: [
          {
            _: useRestriction.groupDesignation,
            $: { code: 'a' }
          },
          {
            _: customerCode,
            $: { code: 'b' }
          }
        ]
      }

      // we need to add this in by callnumber, if there is no callnumber use the bib level callnumber
      let callnumber = (data852[i].h) ? data852[i].h : record.bibCallNumber[0]

      // if we did not find a callnumber use a fake callnumber based on the bnumber
      if (!callnumber) {
        callnumber = `ReCAP ${record.bNumber}`
      }
      callnumber = callnumber.trim()

      if (!record.itemXmlJsObj[callnumber]) record.itemXmlJsObj[callnumber] = []
      if (!record.locationCodeIndex[callnumber]) record.locationCodeIndex[callnumber] = []

      if (data876[i].k && record.locationCodeIndex[callnumber].indexOf(data876[i].k.trim()) === -1) {
        record.locationCodeIndex[callnumber].push(data876[i].k.trim())
      }

      // this record count
      record.itemCount++
      self.countItem++
      self.useRestrictionGroupDesignationCheck[i] = `${useRestriction.groupDesignation} | ${useRestriction.useRestriction}`

      record.itemXmlJsObj[callnumber].push({ 876: new876, 900: new900 })
    })

    return record.itemXmlJsObj
  },

  /**
   * Given the record with all the data extracted it will build the final holdings in xml2js format ready to be exported, index by call number

   * @param  {object} record - the whole record data
   * @returns {object} items - the items by call number index in xml2js format
   */
  buildRecord: function (record) {
    const self = this
    // build the general bib
    const bib = this.buildBibRecord(record)
    const holdings = []

    // build the data for each one
    Object.keys(record.items).forEach((callnumber) => {
      const aHolding = self.buildHoldings852and866andItems(record, callnumber)
      if (aHolding) {
        holdings.push(aHolding)
        self.countHolding++
      }
    })

    // put it together
    const final = {
      bibRecord: {
        bib,
        holdings
      }
    }
    return final
  },

  /**
   * Given the record with all the data extracted it will build the bib data consiting of leader/control/data fields in xml2js format

   * @param  {object} record - the whole record data
   * @returns {object} items - the items by call number index in xml2js format
   */
  buildBibRecord: function (record) {
    const bib = {
      owningInstitutionId: 'NYPL',
      owningInstitutionBibId: record.bNumber,
      content: {
        collection: {
          $: { xmlns: 'http://www.loc.gov/MARC21/slim' },
          record: {
            controlfield: [],
            datafield: []

          }
        }
      }

    }

    // the leader
    if (record.mij.leader) bib.content.collection.record.leader = record.mij.leader

    // the control fields
    record.controlFields.forEach((cf) => {
      const tag = Object.keys(cf)[0]
      bib.content.collection.record.controlfield.push({
        _: cf[tag],
        $: { tag }
      })
    })

    // the data fields
    record.dataFields.forEach((df) => {
      const tag = Object.keys(df)[0]

      const newField = {
        $: {
          ind1: df[tag].ind1,
          ind2: df[tag].ind2,
          tag
        },
        subfield: df[tag].subfields.map((sf) => {
          const code = Object.keys(sf)[0]
          return {
            _: sf[code],
            $: { code }
          }
        })
      }

      bib.content.collection.record.datafield.push(newField)
    })

    return bib
  },

  /**
   * Given the record with all the data extracted it will build the the holdings 866 and 852 fields

   * @param  {object} record - the whole record data
   * @param  {string} callnumber - Which callnumber do we want to build for?
   * @returns {object} holdingfield - the holding field in xml2js format
   */
  buildHoldings852and866andItems: function (record, callnumber) {
    let textualHoldings = ''
    let textualHoldingsFromItems = ''
    let holdingsId = ''
    let itemsAddedToHoldings = 0
    let textualHoldingsAry = []
    // the 852 comes from the item
    if (record.items[callnumber]) {
      // build the 866 textual statement if there is any

      if (record.holdingData['866']) {
        const holdingsIdAry = []
        record.holdingData['866'].forEach((h) => {
          if (h.y && h.y[0]) holdingsIdAry.push(h.y[0])
          if (h.a && h.a[0]) textualHoldingsAry.push(h.a[0])
        })
        textualHoldings = textualHoldingsAry.join(', ')
        holdingsId = holdingsIdAry.join('')
      }
    } else {
      if (console.logToFile) console.logToFile(`Missing callnumber in items,${callnumber}`)
    }

    // Also make textualHoldings by using the items data
    textualHoldingsAry = []
    record.items[callnumber].forEach((aItem) => {
      if (aItem['876'] && aItem['876'].subfield) {
        aItem['876'].subfield.forEach((subfield) => {
          if (subfield && subfield.$ && subfield.$.code && subfield.$.code.toString() === '3') {
            if (subfield._) textualHoldingsAry.push(subfield._)
          }
        })
      }
    })
    textualHoldingsFromItems = textualHoldingsAry.join(', ')

    // if there is more than one call number we cannot use the holdings information
    if (Object.keys(record.items).length > 1) {
      textualHoldings = ''
      holdingsId = ''
    }

    const aHolding = {
      holding: {
        owningInstitutionHoldingsId: holdingsId,
        content: {
          collection: {
            $: { xmlns: 'http://www.loc.gov/MARC21/slim' },
            record: [
              {
                datafield: [
                  {
                    $: {
                      ind1: '8',
                      ind2: ' ',
                      tag: '852'
                    },
                    subfield: (() => {
                      let s = []

                      // add in all the locations
                      if (record.locationCodeIndex[callnumber]) {
                        s = record.locationCodeIndex[callnumber].map((location) => {
                          return {
                            _: location,
                            $: { code: 'b' }
                          }
                        })
                      }
                      // and the call number
                      s.push({
                        _: callnumber,
                        $: { code: 'h' }
                      })
                      return s
                    }).call()
                  },
                  {
                    $: {
                      ind1: ' ',
                      ind2: ' ',
                      tag: '866'
                    },
                    subfield: [
                      {
                        _: (textualHoldings !== '') ? textualHoldings : textualHoldingsFromItems,
                        $: { code: 'a' }
                      }
                    ]
                  }
                ]

              }
            ]

          }
        },
        items: {
          content: {
            collection: {
              $: { xmlns: 'http://www.loc.gov/MARC21/slim' },
              record: (() => {
                // build the items here in line
                const items = []
                // Object.keys(record.items).forEach((cn) => {
                // inspect(cn)
                record.items[callnumber].forEach((record) => {
                  itemsAddedToHoldings++
                  items.push({
                    datafield: [record['876'], record['900']]
                  })
                })
                // })
                return items
              }).call()
            }
          }
        }
      }

    }

    // inspect(aHolding)
    if (itemsAddedToHoldings > 0) {
      return aHolding
    } else {
      return false
    }
  },

  /**
   * PAssed the 852 and 876

   * @param {object} data852 - the 852 data object
   * @param {object} data876 - the 876 data object
   * @returns {object} results - the data object with useRestriction and groupDesignation properties
   */
  buildUseRestriction: function (data852, data876, customerCode, fieldTagL) {
    // blank by default
    const results = { useRestriction: '', groupDesignation: '' }
    const self = this

    if (['u'].indexOf(data876.o.toString()) !== -1) {
      results.useRestriction = 'Supervised Use'
      results.groupDesignation = self.determineCGD(data852, data876, customerCode, fieldTagL)
    } else {
      if ([2, 3, 4, 5, 6, 7, 25, 26, 32, 33, 34, 35, 42, 43, 52, 53, 60, 61, 65, 67].indexOf(parseInt(data876.y)) !== -1) {
        results.useRestriction = 'In Library Use'
        results.groupDesignation = self.determineCGD(data852, data876, customerCode, fieldTagL)
      } else {
        if ([55, 57].indexOf(parseInt(data876.y)) !== -1) {
          results.useRestriction = ''
          results.groupDesignation = self.determineCGD(data852, data876, customerCode, fieldTagL)
        } else {
          results.groupDesignation = 'Private'
          results.useRestriction = 'In Library Use'
        }
      }
    }

    return results
  },

  /**
   * PAssed the 852 and 876

   * @param {object} data852 - the 852 data object
   * @param {object} data876 - the 876 data object
   * @returns single string value representing the object's group designation
   */
  determineCGD: function (data852, data876, customerCode, fieldTagL) {
    // When fieldTag 'l' is 'CGD Committed', that overrides all else:
    if (fieldTagL === 'CGD Committed') {
      return 'Committed'
    }

    if (data876.d && ['p', 's'].indexOf(data876.d.toString()) !== -1) {
      return 'Private'
    }

    if (['JO', 'ND', 'NL', 'NN', 'NO', 'NP', 'NQ', 'NR', 'NS', 'NU', 'NV', 'NX', 'NZ'].indexOf(customerCode) > -1) {
      return 'Private'
    }

    if (['4', 'a', 'p', 'o'].indexOf(data876.o.toString()) !== -1) {
      return 'Private'
    }

    if ([0, 1, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 27, 28, 29, 30, 31, 37, 38, 41, 51, 66, 68].indexOf(parseInt(data876.y)) !== -1) {
      return 'Private'
    }

    return 'Shared'
  },

  /**
   * Given the MARC in JSON represntation it will extract the bnumber

   * @param  {object} mij - the M-in-J rep
   * @returns {string} bnumber - the bnumber
   */
  template: function (mij) {},

  /**
   * Given an array of items, returns a hash relating padded item numbers to
   * the items' fieldTag 'l' values (which may indicate Committed CGD)
   * */
  extractFieldTagL: function (items) {
    return items
      .reduce((h, item) => {
        const paddedId = mod11(`.i${item.id}`)

        h[paddedId] = null

        if (item.varFields) {
          const fieldTagL = item.varFields
            .find((varfield) => varfield.fieldTag === 'l')
          h[paddedId] = fieldTagL?.content
        }
        return h
      }, {})
  }
}
