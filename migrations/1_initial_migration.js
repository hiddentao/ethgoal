const Migrations = artifacts.require("Migrations")
const Goals = artifacts.require("Goals")

module.exports = deployer => {
  deployer.deploy(Migrations)
  deployer.deploy(Goals)
}
