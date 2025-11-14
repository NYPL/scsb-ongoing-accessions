# SCSB Ongoing Accessions Endpoint

This lambda serves the `/api/v0.1/recap/nypl-bibs` endpoint, which takes a `customerCode` and either a `barcode` or a `bnumber` and returns the identified bib and items formatted as SCSB XML.

## Initialization

To initialize a local config to run the lambda:

 * git clone this repo
 * `npm i`
 * `cp config/sample.env config/[environment].env`
 * Fill in the required details in `config/[environment].env` via a co-worker

Note that `NYPL_OAUTH_SECRET` must be encrypted using KMS.

To encrypt a plaintext secret:
 * Look up the account's KMS encryption key ARN:
   * Log into sandbox if you're encrypting a qa key, nypl-digital-dev if you're encrypting a production key
   * IAM > Encryption Keys > lambda-default (or 'lambda-rds' in sandbox)
   * Copy ARN
 * `AWS_DEFAULT_REGION=us-east-1 aws kms encrypt --key-id "[encryption key arn]" --plaintext "[plaintext secret]" --profile nypl-{digital-dev||sandbox}`

## Run Locally

To run the endpoint as a standalone express server (bound to port 3000), three different scripts are registered in package.json:

To run against environment dependencies:

`npm run run-development` (development)

`npm run run-qa` (qa)

`npm run run-production` (production)

## Deploying

CI/CD is configured through GitHub Actions using Terraform. Committing to `production` will deploy to production, committing to `qa` will deploy to QA. For configuration of deployments, see `config/[production|qa]` for environment variables, `.github/workflows/test-and-deploy.yml` for jobs, and `provisioning` directory for information about deployments on AWS.

### Notes About convert-2-scsb-module

This app used to have an external dependency on the `convert-2-scsb-module`, but following upgrade to Node 20 that dependency has been removed, and all the logic for generating the xml has been moved into this repo 

### Running Deploy Scripts

Two deploy scripts are registered in `package.json`:

`npm run deploy-[development|qa|production]`

* deploy-development should deploy to nypl-sandbox
* deploy-qa and deploy-production deploy to nypl-digital-dev

## Testing

The test suite uses [lambda-tester](https://www.npmjs.com/package/lambda-tester) to run tests against the handler interface.

`npm test`

### Test Fixtures

A series of local test fixtures representing responses from the nypl data api, maintained in `./test/data/*.json`. These allow the test suite to run against a fixed set of data. If any fixtures need to be updated or added, a script is provided:

`./scripts/update-test-fixtures [--all|PATH] --envfile config/[environment].env --profile [aws profile]`

For example, to populate a test fixture for the api response for 'bibs/sierra-nypl/123':

`./scripts/update-test-fixtures bibs/sierra-nypl/123 --envfile config/[environment].env --profile [aws profile]`

To update ALL of the test fixtures:

`./scripts/update-test-fixtures --all --envfile config/[environment].env --profile [aws profile]`
