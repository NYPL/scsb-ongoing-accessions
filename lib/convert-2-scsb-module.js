const parseMrc = require('./parsemrc')
const parseApi = require('./parseapi')
const xml2js = require('xml2js')
const builder = new xml2js.Builder({ renderOpts: { pretty: false }, headless: true })

function Convert2Scsb () {
  // expose all the old parselib methods
  this.parseMrc = parseMrc
  // expose the old parseApi methods
  this.parseApi = parseApi

  /**
   * convert a passed MARC file, needs to be a marcjs module record, shoudl have 852/876/866 from the item records in the MARC
   *
   * @param  {record} object - the record parsed by the marcjs module https://github.com/fredericd/marcjs
   */
  this.parseMarc2SCSB = function (record) {
    const self = this

    record = self.parseMrc.convertToJsonCheckSize(record)
    record.bNumber = self.parseMrc.extractBnumber(record.mij) // 907|a

    // pull out all the data we are going to need
    record.oclcNumber = self.parseMrc.extractOclc(record.mij)
    record.bibCallNumber = self.parseMrc.extractBibCallNumber(record.mij)
    record.itemData = self.parseMrc.extractItemFields(record.mij) // 852 + 876
    record.holdingData = self.parseMrc.extractHoldingFields(record.mij) // 866 data
    record.controlFields = self.parseMrc.extractControlFields(record.mij) // control fields in mij format
    record.dataFields = self.parseMrc.extractDataFields(record) // data fields in mij format

    // build the new data structures
    record.items = self.parseMrc.buildItems(record)
    record.recordObj = self.parseMrc.buildRecord(record)
    // the XML
    record.xml = builder.buildObject(record.recordObj) + '\n'
    return record
  }

  /**
   * convert Sierra API reponses to a SCSB format XML result
   *
   * @param  {bib} object - the Bib response from Sierra API
   * @param  {items} array - the Items response from Sierra API
   */
  this.parseSierraApi2SCSB = function (bib, items, customerCode = 'NA') {
    const self = this

    bib = self.parseApi.modifyBib(bib)
    bib = self.parseApi.convertToMiJFormat(bib)
    const itemsMiJ = self.parseApi.convertItemsToMiJ(items)
    bib.fields = bib.fields.concat(itemsMiJ)
    const record = { mij: bib }
    record.bNumber = self.parseMrc.extractBnumber(record.mij) // 907|a
    record.oclcNumber = self.parseMrc.extractOclc(record.mij)
    record.bibCallNumber = self.parseMrc.extractBibCallNumber(record.mij)
    record.itemData = self.parseMrc.extractItemFields(record.mij) // 852 + 876
    record.holdingData = self.parseMrc.extractHoldingFields(record.mij) // 866 data
    record.controlFields = self.parseMrc.extractControlFields(record.mij) // control fields in mij format
    record.dataFields = self.parseMrc.extractDataFields(record) // data fields in mij format

    // Build map relating padded item ids to fieldTag 'l' values, which may read "CGD Committed"
    record.fieldTagL = self.parseMrc.extractFieldTagL(items)

    // build the new data structures
    record.items = self.parseMrc.buildItems(record, customerCode)
    record.recordObj = self.parseMrc.buildRecord(record)

    record.xml = builder.buildObject(record.recordObj) + '\n'

    return record
  }
}

module.exports = exports = new Convert2Scsb()
