const { createLog, deploy } = require('../../utils/functions')

export const ensureMintableTokenIsDeployed = async ({ deployer, artifacts, logger }) => {
  const log = createLog(logger)

  log('Deploying MintableToken ...')
  const MintableToken = artifacts.require('./MintableToken')
  const mintableToken = await deploy(deployer, MintableToken)
  log(`... deployed at ${mintableToken.address}`)

  return mintableToken
}