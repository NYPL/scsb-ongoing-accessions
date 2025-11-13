const dotenv = require('dotenv')

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).parse()

if (!argv.profile) throw new Error('--profile [aws profile] is a required flag')
if (!argv.envfile) throw new Error('--envfile config/[environment].env is a required flag')

// Load nypl-data-api-client required config:
dotenv.config({ path: argv.envfile })
