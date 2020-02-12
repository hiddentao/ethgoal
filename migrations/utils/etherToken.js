const { createLog, deploy } = require('./functions')

export const ensureEtherTokenIsDeployed = async ({ deployer, artifacts, logger }) => {
  const log = createLog(logger)

  log('Deploying EtherToken ...')
  const EtherToken = artifacts.require('./EtherToken')
  const etherToken = await deploy(deployer, EtherToken)
  log(`... deployed at ${etherToken.address}`)

  return etherToken
}