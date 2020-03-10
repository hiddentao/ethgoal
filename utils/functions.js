import chalk from 'chalk'

export const deploy = async (deployer, Contract, ...constructorArgs) => {
  if (deployer) {
    await deployer.deploy(Contract, ...constructorArgs)
    return await Contract.deployed()
  } else {
    return await Contract.new(...constructorArgs)
  }
}

export const createLog = enableLogger => {
  if (enableLogger) {
    return msg => console.log(chalk.blue(msg))
  } else {
    return msg => () => {}
  }
}
