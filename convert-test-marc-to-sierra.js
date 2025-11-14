const convert2Scsb = require('./lib/convert-2-scsb-module')
const H = require('highland')
const marc = require('marcjs')
const fs = require('fs')
const xml2js = require('xml2js')
const builder = new xml2js.Builder({ renderOpts: { pretty: false }, headless: true })

const barcodes = [{ barcode: 'NYPLTST67891', customercode: 'NA', m876o: '2', m876s: '211', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67892', customercode: 'NA', m876o: '2', m876s: '212', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67893', customercode: 'NA', m876o: '2', m876s: '211', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67894', customercode: 'NA', m876o: '2', m876s: '211', m876y: '57', boundwith: false }, { barcode: 'NYPLTST67895', customercode: 'NA', m876o: '2', m876s: '211', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67896', customercode: 'NA', m876o: '2', m876s: '227', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67881', customercode: 'NA', m876o: '2', m876s: '211', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67882', customercode: 'NB', m876o: '2', m876s: '211', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67883', customercode: 'NH', m876o: '2', m876s: '211', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67884', customercode: 'NP', m876o: '2', m876s: '211', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67885', customercode: 'NW', m876o: 'u', m876s: '210', m876y: '', boundwith: false }, { barcode: 'NYPLTST67886', customercode: 'NX', m876o: '2', m876s: '211', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67887', customercode: 'GN', m876o: '2', m876s: '211', m876y: '55', boundwith: false }, { barcode: 'NYPLTST67888', customercode: 'NN', m876o: '2', m876s: '211', m876y: '65', boundwith: false }, { barcode: 'NYPLTST67889', customercode: 'NO', m876o: '2', m876s: '211', m876y: '61', boundwith: false }, { barcode: 'NYPLTST67880', customercode: 'NQ', m876o: 'p', m876s: '211', m876y: '37', boundwith: false }, { barcode: 'NYPLTST67870', customercode: 'NR', m876o: '4', m876s: '211', m876y: '66', boundwith: false }]
const barcodesBoundWith = [{ barcode: 'NYPLTST67897', customercode: 'NA', m876o: '2', m876s: '211', m876y: '55', boundwith: true }, { barcode: 'NYPLTST67897', customercode: 'NA', m876o: '2', m876s: '211', m876y: '55', boundwith: true }, { barcode: 'NYPLTST67897', customercode: 'NA', m876o: '2', m876s: '211', m876y: '55', boundwith: true }]
let counter = 90000000
const exmapleData = {}

convert2Scsb.parseMrc.nonNumericBarcodesOkay = true

barcodes.forEach((b) => {
  convert2Scsb.parseMrc.barcodes.set(b.barcode, b.customercode)
})

barcodesBoundWith.forEach((b) => {
  convert2Scsb.parseMrc.barcodes.set(b.barcode, b.customercode)
})

H(new marc.Iso2709Reader(fs.createReadStream('data/NYPLTEST.mrc')))
  .map((record) => {
    record = convert2Scsb.parseMrc.convertToJsonCheckSize(record)

    record.bNumber = convert2Scsb.parseMrc.extractBnumber(record.mij) // 907|a
    record.bNumber = `.b${++counter}`
    let barcode = null

    if (counter < 90000013) {
      barcode = barcodes.shift()
    } else {
      // this random assignment is not neeed in this case the bound with is only one barcode...
      barcode = barcodesBoundWith[Math.floor(Math.random() * (3 - 0) + 0)]
    }

    const inumber = `.i${Math.floor(Math.random() * (99999999 - 10000000) + 10000000)}`
    const callnumber = `JFA-${Math.floor(Math.random() * (9999 - 100) + 100)}`

    record.mij.fields.push({
      852: {
        ind1: ' ',
        ind2: ' ',
        subfields: [
          {
            a: inumber
          },
          {
            b: 'rcxx2'
          },
          {
            h: '*ZZ-27060'
          }
        ]
      }
    })

    record.mij.fields.push({
      876: {
        ind1: ' ',
        ind2: ' ',
        subfields: [
          {
            a: inumber
          },
          {
            j: '-'
          },
          {
            h: callnumber
          },
          {
            k: 'rcxx2'
          },
          {
            o: barcode.m876o
          },
          {
            p: barcode.barcode
          },
          {
            s: barcode.m876s
          },
          {
            t: '1'
          },
          {
            y: barcode.m876y
          }
        ]
      }
    })

    record.mij.fields.push({
      952: {
        ind1: ' ',
        ind2: ' ',
        subfields: [
          {
            h: callnumber
          }
        ]
      }
    })

    // console.log(JSON.stringify(record.mij, null, 2))

    // <datafield ind1=" " ind2=" " tag="852">
    //   <subfield code="a">.i276858591</subfield>
    //   <subfield code="b">rcxx2</subfield>
    //   <subfield code="h">*ZZ-27060 r. 9</subfield>
    //   <subfield code="3">no. 139-180</subfield>
    //   <subfield code="y">228</subfield>
    // </datafield>

    // <datafield ind1=" " ind2=" " tag="876">
    //   <subfield code="a">.i276858591</subfield>
    //   <subfield code="j">p</subfield>
    //   <subfield code="k">rcxx2</subfield>
    //   <subfield code="o">4</subfield>
    //   <subfield code="p">33433005774819</subfield>
    //   <subfield code="s">228</subfield>
    //   <subfield code="t">1</subfield>
    //   <subfield code="y">27</subfield>
    // </datafield>

    // <datafield ind1=" " ind2=" " tag="952">
    //   <subfield code="h">JPB 83-155 no. 179</subfield>
    // </datafield>
    // pull out all the data we are going to need

    record.oclcNumber = convert2Scsb.parseMrc.extractOclc(record.mij)
    record.bibCallNumber = convert2Scsb.parseMrc.extractBibCallNumber(record.mij)
    record.itemData = convert2Scsb.parseMrc.extractItemFields(record.mij) // 852 + 876
    record.holdingData = convert2Scsb.parseMrc.extractHoldingFields(record.mij) // 866 data
    record.controlFields = convert2Scsb.parseMrc.extractControlFields(record.mij) // control fields in mij format
    record.dataFields = convert2Scsb.parseMrc.extractDataFields(record) // data fields in mij format

    // build the new data structures
    record.items = convert2Scsb.parseMrc.buildItems(record)
    record.recordObj = convert2Scsb.parseMrc.buildRecord(record)
    // the XML
    record.xml = builder.buildObject(record.recordObj) + '\n'
    if (!exmapleData[barcode.barcode]) exmapleData[barcode.barcode] = []

    // pull out the data we need for the sheet
    record.dataFields.forEach((df) => {
      if (df['245']) {
        let title = ''

        df['245'].subfields.forEach((sf) => {
          if (sf.a) title = title + sf.a
          if (sf.b) title = title + sf.b
        })
        console.log(barcode.barcode + ',' + title + ',"' + record.mij.leader.substr(7, 1) + '"')
      }
    })
    exmapleData[barcode.barcode].push(record.xml)
    return null
  })
  .done(() => {
    fs.writeFile('data/mock.json', JSON.stringify(exmapleData, null, 2), function (err) {
      if (err) return console.log(err)
    })
  })
