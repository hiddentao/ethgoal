const Migrations = artifacts.require("Migrations")
const Controller = artifacts.require("Controller")

module.exports = async deployer => {
  await deployer.deploy(Migrations)
  await deployer.deploy(Controller, 1000 /* 0.1% fee */, 604800 /* 7 days judgemenet period */)
}
