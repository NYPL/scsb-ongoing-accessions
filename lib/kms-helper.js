const { KMSClient, DecryptCommand } = require('@aws-sdk/client-kms')

/**
 *  Given an encrypted string, returns the decrypted string.
 * */
const decrypt = async (encrypted) => {
  let client
  let response
  const config = {
    region: process.env.AWS_REGION || 'us-east-1'
  }
  try {
    client = new KMSClient(config)
  } catch (e) {
    throw new Error('Error instantiating KMS client', { cause: e })
  }
  const command = new DecryptCommand({
    CiphertextBlob: Buffer.from(encrypted, 'base64')
  })
  try {
    response = await client.send(command)
  } catch (e) {
    const isCredentialsError = e.name === 'CredentialsProviderError'
    const message = isCredentialsError
      ? `${e.name} error: Try setting AWS_PROFILE=...`
      : `${e.name} during decrypt command`
    throw new Error(message, { cause: e })
  }
  if (!response?.Plaintext) {
    throw new Error('Invalid KMS response')
  }
  const decoded = Buffer.from(response.Plaintext, 'binary')
    .toString('utf8')
  return decoded
}

function decryptNyplOauthSecret () {
  if (!process.env.NYPL_OAUTH_SECRET) throw new Error('Missing NYPL_OAUTH_SECRET env variable; aborting.')

  const encrypted = process.env.NYPL_OAUTH_SECRET
  return decrypt(encrypted)
}

module.exports = { decryptNyplOauthSecret }
