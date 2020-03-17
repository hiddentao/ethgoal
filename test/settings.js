const { ADDRESS_ZERO } = require('./utils')

const ISettings = artifacts.require("./ISettings")
const Settings = artifacts.require("./Settings")
const SettingsImpl = artifacts.require("./SettingsImpl")
const TestProxyImpl1 = artifacts.require("./test/TestProxyImpl1")
const IProxyImpl = artifacts.require('./IProxyImpl')

contract('Settings', accounts => {
  let proxyImpl
  let settingsImpl
  let settingsProxy
  let settings

  beforeEach(async () => {
    settingsImpl = await SettingsImpl.new()
    settingsProxy = await Settings.new(settingsImpl.address)
    proxyImpl = await IProxyImpl.at(settingsProxy.address)
    settings = await ISettings.at(settingsProxy.address)
  })

  it('must be deployed with a valid implementation', async () => {
    await Settings.new(ADDRESS_ZERO).should.be.rejectedWith('implementation must be valid')
  })

  it('can be deployed', async () => {
    expect(settingsProxy.address).to.exist
  })

  it('can return its implementation version', async () => {
    await proxyImpl.getImplementationVersion().should.eventually.eq('v1')
  })

  describe('it can be upgraded', async () => {
    let impl2

    beforeEach(async () => {
      // deploy new implementation
      impl2 = await TestProxyImpl1.new()
    })

    it('but not just by anyone', async () => {
      await settingsProxy.setImplementation(impl2.address, { from: accounts[1] }).should.be.rejectedWith('not the owner')
    })

    it('but not to an empty address', async () => {
      await settingsProxy.setImplementation(ADDRESS_ZERO).should.be.rejectedWith('implementation must be valid')
    })

    it.skip('but not to the existing implementation', async () => {
      await settingsProxy.setImplementation(settingsImpl.address).should.be.rejectedWith('already this implementation')
    })

    it('and points to the new implementation', async () => {
      await settingsProxy.setImplementation(impl2.address)
      await proxyImpl.getImplementationVersion().should.eventually.eq('test1')
    })
  })

  it('can return current block time', async () => {
    await settings.getTime().should.eventually.not.eq(0)
  })

  describe('can have controller set', () => {
    it('but not just by anyone', async () => {
      await settings.setController(accounts[2], { from: accounts[2] }).should.be.rejectedWith('not the owner');
    })

    it('by owner', async () => {
      await settings.setController(accounts[2]).should.be.fulfilled
      await settings.getController().should.eventually.eq(accounts[2])
    })
  })

  describe('can have payment unit set', () => {
    it('but not just by anyone', async () => {
      await settings.setPaymentUnit(accounts[2], { from: accounts[2] }).should.be.rejectedWith('not the owner');
    })

    it('by owner', async () => {
      await settings.setPaymentUnit(accounts[2]).should.be.fulfilled
      await settings.getPaymentUnit().should.eventually.eq(accounts[2])
    })
  })

  describe('can have bank set', () => {
    it('but not just by anyone', async () => {
      await settings.setBank(accounts[2], { from: accounts[2] }).should.be.rejectedWith('not the owner');
    })

    it('by owner', async () => {
      await settings.setBank(accounts[2]).should.be.fulfilled
      await settings.getBank().should.eventually.eq(accounts[2])
    })
  })

  describe('can have chai set', () => {
    it('but not just by anyone', async () => {
      await settings.setChai(accounts[2], { from: accounts[2] }).should.be.rejectedWith('not the owner');
    })

    it('by owner', async () => {
      await settings.setChai(accounts[2]).should.be.fulfilled
      await settings.getChai().should.eventually.eq(accounts[2])
    })
  })
})