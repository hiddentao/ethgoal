const { ADDRESS_ZERO, extractEventArgs } = require('./utils')
const { events } = require('../')

import { ensureSettingsIsDeployed } from '../migrations/modules/settings'
import { ensureMintableTokenIsDeployed } from '../migrations/modules/mintableToken'
import { ensureDevChaiIsDeployed } from '../migrations/modules/devChai'

const IBank = artifacts.require("./IBank")
const Bank = artifacts.require("./Bank")
const BankImpl = artifacts.require("./BankImpl")
const TestProxyImpl1 = artifacts.require("./test/TestProxyImpl1")
const IProxyImpl = artifacts.require('./IProxyImpl')

contract('Bank', accounts => {
  let settings
  let mintableToken
  let chai

  let proxyImpl
  let bankImpl
  let bankProxy
  let bank

  beforeEach(async () => {
    settings = await ensureSettingsIsDeployed({ artifacts })
    mintableToken = await ensureMintableTokenIsDeployed({ artifacts }, settings.address)
    await settings.setPaymentUnit(mintableToken.address)

    chai = await ensureDevChaiIsDeployed({ artifacts }, settings.address)
    await settings.setChai(chai.address)

    bankImpl = await BankImpl.new(settings.address)
    bankProxy = await Bank.new(bankImpl.address, settings.address)
    proxyImpl = await IProxyImpl.at(bankProxy.address)
    bank = await IBank.at(bankProxy.address)
  })

  it('must be deployed with a valid implementation', async () => {
    await Bank.new(ADDRESS_ZERO, settings.address).should.be.rejectedWith('implementation must be valid')
  })

  it('can be deployed', async () => {
    expect(bankProxy.address).to.exist
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
      await bankProxy.setImplementation(impl2.address, { from: accounts[1] }).should.be.rejectedWith('not the owner')
    })

    it('but not to an empty address', async () => {
      await bankProxy.setImplementation(ADDRESS_ZERO).should.be.rejectedWith('implementation must be valid')
    })

    it.skip('but not to the existing implementation', async () => {
      await bankProxy.setImplementation(bankImpl.address).should.be.rejectedWith('already this implementation')
    })

    it('and points to the new implementation', async () => {
      await bankProxy.setImplementation(impl2.address)
      await proxyImpl.getImplementationVersion().should.eventually.eq('test1')
    })
  })

  describe('deposits', () => {
    beforeEach(async () => {
      await settings.setController(accounts[0])
    })

    it('must be from controller', async () => {
      await bank.deposit(accounts[0], 1, { from: accounts[2] }).should.be.rejectedWith('must be controller')
    })

    it('need token authorization', async () => {
      await bank.deposit(accounts[0], 1).should.be.rejectedWith('exceeds allowance')
    })

    it('need enough balance', async () => {
      await mintableToken.approve(bank.address, 1)
      await bank.deposit(accounts[0], 1).should.be.rejectedWith('exceeds balance')
    })

    it('work', async () => {
      await mintableToken.mint(1)
      await mintableToken.approve(bank.address, 1)
      await bank.deposit(accounts[0], 1).should.be.fulfilled
    })

    it('get sent to chai', async () => {
      await mintableToken.mint(1)
      await mintableToken.approve(bank.address, 1)
      await bank.deposit(accounts[0], 1)

      await mintableToken.balanceOf(bank.address).should.eventually.eq(0)
      await mintableToken.balanceOf(chai.address).should.eventually.eq(6)
    })

    it('increment the deposit total', async () => {
      await mintableToken.mint(5)
      await mintableToken.approve(bank.address, 5)
      await bank.deposit(accounts[0], 1)
      await bank.deposit(accounts[0], 4)

      await bank.getUserDepositTotal().should.eventually.eq(5)
    })

    it('result in bank profit', async () => {
      await mintableToken.mint(100)
      await mintableToken.approve(bank.address, 100)
      await bank.deposit(accounts[0], 1)
      await bank.deposit(accounts[0], 4)
      await bank.deposit(accounts[0], 3)

      const ret = await bank.emitProfit()

      expect(extractEventArgs(ret, events.Profit)).to.include({
        amount: '15'
      })
    })
  })

  describe('withdrawals', () => {
    beforeEach(async () => {
      await settings.setController(accounts[0])

      await mintableToken.mint(6)
      await mintableToken.approve(bank.address, 6)
      await bank.deposit(accounts[0], 1)
      await bank.deposit(accounts[0], 2)
      await bank.deposit(accounts[0], 3)
      await mintableToken.balanceOf(accounts[0]).should.eventually.eq(0)
    })

    it('must be from controller', async () => {
      await bank.withdraw(accounts[0], 1, { from: accounts[2] }).should.be.rejectedWith('must be controller')
    })

    it('need enough balance', async () => {
      await bank.withdraw(accounts[0], 7).should.be.rejected
    })

    it('work', async () => {
      await bank.withdraw(accounts[0], 6).should.be.fulfilled
      await mintableToken.balanceOf(accounts[0]).should.eventually.eq(6)
    })

    it('get taken from chai', async () => {
      await bank.withdraw(accounts[0], 1)

      await mintableToken.balanceOf(bank.address).should.eventually.eq(0)
      await mintableToken.balanceOf(chai.address).should.eventually.eq(20)
    })

    it('decrement the deposit total', async () => {
      await bank.getUserDepositTotal().should.eventually.eq(6)
      await bank.withdraw(accounts[0], 1)
      await bank.getUserDepositTotal().should.eventually.eq(5)
    })

    it('do not affect the bank profit', async () => {
      await bank.withdraw(accounts[0], 1)

      const ret = await bank.emitProfit()

      expect(extractEventArgs(ret, events.Profit)).to.include({
        amount: '15'
      })
    })
  })
})
