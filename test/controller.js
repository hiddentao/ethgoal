import {
  hdWallet,
  ADDRESS_ZERO,
  extractEventArgs,
  web3EvmIncreaseTime,
  gwei,
  promiseMapSerial,
} from './utils'
import { events } from '../'
import { ensureSettingsIsDeployed } from '../migrations/modules/settings'
import { ensureMintableTokenIsDeployed } from '../migrations/modules/mintableToken'
import { ensureDevChaiIsDeployed } from '../migrations/modules/devChai'
import { ensureBankIsDeployed } from '../migrations/modules/bank'

const Controller = artifacts.require('./Controller')

contract('Controller', accounts => {
  let settings
  let mintableToken
  let chai
  let bank

  let controller
  let currentTime
  let fingerprint
  let preparePledge
  let createPledge
  let setupPledgesAndGetBalances
  let judgementPeriodSeconds
  let getUserBalance
  let getTokenBalance

  beforeEach(async () => {
    settings = await ensureSettingsIsDeployed({ artifacts })

    mintableToken = await ensureMintableTokenIsDeployed({ artifacts }, settings.address)
    await settings.setPaymentUnit(mintableToken.address)

    chai = await ensureDevChaiIsDeployed({ artifacts }, settings.address)
    settings.setChai(chai.address)

    bank = await ensureBankIsDeployed({ artifacts }, settings.address)
    await settings.setBank(bank.address)

    judgementPeriodSeconds = 86400 // 1 day

    controller = await Controller.new(settings.address, judgementPeriodSeconds)
    await settings.setController(controller.address)

    getUserBalance = async a => controller.getUser(a).then(({ balance_ }) => balance_)
    getTokenBalance = async a => mintableToken.balanceOf(a).then(n => n.toNumber())

    const t = await settings.getTime()
    currentTime = parseInt(t.toString())

    preparePledge = async ({ creator, pot, endDate, judges } = {}) => {
      creator = creator || accounts[0]

      const numJudges = (judges ? judges.length : 3)

      const ret = {
        creator,
        pot: pot || gwei(1).toNumber(),
        endDate: endDate || (currentTime + 10000),
        numJudges,
      }

      fingerprint = await controller.calculatePledgeFingerprint(
        ret.creator, ret.pot, ret.endDate, numJudges
      )

      ret.signatures = (judges || accounts.slice(1, 4)).map(j => {
        return hdWallet.sign({ address: j, data: fingerprint })
      })

      return ret
    }

    createPledge = async ({ creator, pot, endDate, numJudges, signatures } = {}, attrs = {}) => {
      return controller.createPledge(
        pot,
        endDate,
        numJudges,
        signatures[0] || "0x0",
        signatures[1] || "0x0",
        signatures[2] || "0x0",
        Object.assign({ from: creator }, attrs)
      )
    }

    setupPledgesAndGetBalances = async pledgeInputs => {
      return promiseMapSerial(pledgeInputs, async p => {
        await createPledge(p, {
          from: p.creator
        })

        const latestPledgeNum = (await controller.getNumPledges()).toNumber()

        return controller.getPledge(latestPledgeNum).then(({ balance_ }) => balance_.toNumber())
      })
    }
  })

  it('is initially unlocked', async () => {
    await controller.isLocked().should.eventually.eq(false)
  })

  describe('can be locked / unlocked', () => {
    it('but not just by anyone', async () => {
      await controller.lock({ from: accounts[1] }).should.be.rejectedWith('not the owner')
      await controller.unlock({ from: accounts[1] }).should.be.rejectedWith('not the owner')
    })

    it('by the admin', async () => {
      await controller.lock().should.be.fulfilled
      await controller.isLocked().should.eventually.eq(true)
      await controller.unlock().should.be.fulfilled
      await controller.isLocked().should.eventually.eq(false)
    })
  })

  describe('a pledge can be created', () => {
    let samplePledgeInputs

    beforeEach(async () => {
      samplePledgeInputs = await preparePledge()
    })

    it('but not when contract is locked', async () => {
      await controller.lock()
      await createPledge(samplePledgeInputs).should.be.rejectedWith('locked')
    })

    it('but not if number of judges is less than 3', async () => {
      samplePledgeInputs.numJudges = 0
      await createPledge(samplePledgeInputs).should.be.rejectedWith('atleast 1 judge needed')
    })

    it('but not if number of judges is more than 3', async () => {
      samplePledgeInputs.numJudges = 4
      await createPledge(samplePledgeInputs).should.be.rejectedWith('max 3 judges allowed')
    })

    it('but not if end date is not in the future', async () => {
      samplePledgeInputs.endDate = ~~(Date.now() / 1000)
      await createPledge(samplePledgeInputs).should.be.rejectedWith('end date must be in future')
    })

    it('but not if pot is less than 1 gwei', async () => {
      samplePledgeInputs.pot = gwei(1).sub(1).toNumber()
      await createPledge(samplePledgeInputs).should.be.rejectedWith('pot amount must be atleast 1 gwei')
    })

    it('but not if a signature is corrupted', async () => {
      samplePledgeInputs.signatures[0] = '0x01'
      await createPledge(samplePledgeInputs).should.be.rejectedWith('invalid judge')
    })

    it('but not if a judge is duplicated', async () => {
      samplePledgeInputs.signatures[2] = samplePledgeInputs.signatures[0]
      await createPledge(samplePledgeInputs).should.be.rejectedWith('duplicate judge found')
    })

    it('but not if creator is a judge', async () => {
      samplePledgeInputs.signatures[1] = hdWallet.sign({ address: samplePledgeInputs.creator, data: fingerprint })
      await createPledge(samplePledgeInputs).should.be.rejectedWith('creator cannot be judge')
    })

    it('but not if creator balance is low', async () => {
      // pot = 100, so let's pass 99 ;)
      const bal = samplePledgeInputs.pot - 1
      await mintableToken.mint(bal)

      await mintableToken.approve(bank.address, bal)
      await createPledge(samplePledgeInputs).should.be.rejectedWith('amount exceeds allowance')

      await getTokenBalance(accounts[0]).should.eventually.eq(bal)
    })

    it('if all checks pass', async () => {
      // now we match the pot
      const bal = samplePledgeInputs.pot
      await mintableToken.mint(bal)

      await mintableToken.approve(bank.address, bal)
      await createPledge(samplePledgeInputs).should.be.fulfilled

      await getTokenBalance(accounts[0]).should.eventually.eq(0)
    })
  })

  describe('when pledges are created', () => {
    let pledgeInputs
    let result

    beforeEach(async () => {
      pledgeInputs = await Promise.all([
        preparePledge({
          creator: accounts[0],
          pot: gwei(100).toNumber(),
          endDate: currentTime + 100,
          judges: [ accounts[1], accounts[2] ],
        }),
        preparePledge({
          creator: accounts[1],
          pot: gwei(50).toNumber(),
          endDate: currentTime + 100,
          judges: [ accounts[2] ],
        }),
      ])

      result = await Promise.all(pledgeInputs.map(async p => {
        await mintableToken.mint(p.pot, { from: p.creator })
        await mintableToken.approve(bank.address, p.pot, { from: p.creator })
        return createPledge(p, { from: p.creator })
      }))
    })

    it('has the correct initial data', async () => {
      await controller.getNumPledges().should.eventually.eq(2)
      await controller.getNumJudgements().should.eventually.eq(0)

      // first pledge
      let c = await controller.getPledge(1)
      expect(c.creator_).to.eq(accounts[0])
      expect(c.numJudges_.toNumber()).to.eq(pledgeInputs[0].numJudges)
      expect(c.numJudgements_.toNumber()).to.eq(0)
      expect(c.numFailedJudgements_.toNumber()).to.eq(0)
      expect(c.pot_.toNumber()).to.eq(pledgeInputs[0].pot)
      expect(c.endDate_.toNumber()).to.eq(pledgeInputs[0].endDate)
      expect(c.balance_.toNumber()).to.eq(c.pot_.toNumber())
      await controller.getPledgeJudge(1, 1).should.eventually.eq(accounts[1])
      await controller.getPledgeJudge(1, 2).should.eventually.eq(accounts[2])

      await controller.isPledgeJudgeable(1).should.eventually.eq(false)
      await controller.isPledgeWithdrawable(1).should.eventually.eq(false)

      // second pledge
      c = await controller.getPledge(2)
      expect(c.creator_).to.eq(accounts[1])
      expect(c.numJudges_.toNumber()).to.eq(pledgeInputs[1].numJudges)
      expect(c.numJudgements_.toNumber()).to.eq(0)
      expect(c.numFailedJudgements_.toNumber()).to.eq(0)
      expect(c.pot_.toNumber()).to.eq(pledgeInputs[1].pot)
      expect(c.endDate_.toNumber()).to.eq(pledgeInputs[1].endDate)
      expect(c.balance_.toNumber()).to.eq(c.pot_.toNumber())
      await controller.getPledgeJudge(2, 1).should.eventually.eq(accounts[2])

      await controller.isPledgeJudgeable(2).should.eventually.eq(false)
      await controller.isPledgeWithdrawable(2).should.eventually.eq(false)

      // accounts[0]
      c = await controller.getUser(accounts[0])
      expect(c.balance_.toNumber()).to.eq(0)
      expect(c.numPledgesCreated_.toNumber()).to.eq(1)
      expect(c.oldestActiveCreatedPledgeIndex_.toNumber()).to.eq(0)
      expect(c.numPledgesJudged_.toNumber()).to.eq(0)
      expect(c.oldestActiveJudgedPledgeIndex_.toNumber()).to.eq(0)

      // accounts[1]
      c = await controller.getUser(accounts[1])
      expect(c.balance_.toNumber()).to.eq(0)
      expect(c.numPledgesCreated_.toNumber()).to.eq(1)
      expect(c.oldestActiveCreatedPledgeIndex_.toNumber()).to.eq(0)
      expect(c.numPledgesJudged_.toNumber()).to.eq(1)
      expect(c.oldestActiveJudgedPledgeIndex_.toNumber()).to.eq(0)

      // accounts[2]
      c = await controller.getUser(accounts[2])
      expect(c.balance_.toNumber()).to.eq(0)
      expect(c.numPledgesCreated_.toNumber()).to.eq(0)
      expect(c.oldestActiveCreatedPledgeIndex_.toNumber()).to.eq(0)
      expect(c.numPledgesJudged_.toNumber()).to.eq(2)
      expect(c.oldestActiveJudgedPledgeIndex_.toNumber()).to.eq(0)
    })

    it('emits events', async () => {
      let { pledgeId: pledgeId1 } = extractEventArgs(result[0], events.NewPledge)
      expect(pledgeId1).to.eq('1')

      let { pledgeId: pledgeId2 } = extractEventArgs(result[1], events.NewPledge)
      expect(pledgeId2).to.eq('2')
    })

    describe('they can be judged', () => {
      it('but not when contract is locked', async () => {
        await controller.lock()
        await controller.judgePledge(1, false).should.be.rejectedWith('locked')
      })

      it('but not by the creator', async () => {
        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, false, { from: accounts[0] }).should.be.rejectedWith('must be a judge')
      })

      it('but not by a random person', async () => {
        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, false, { from: accounts[4] }).should.be.rejectedWith('must be a judge')
      })

      it('but not if pledge is not yet judgeable', async () => {
        await controller.judgePledge(1, false, { from: accounts[1] }).should.be.rejectedWith('not judgeable')
      })

      it('but not if pledge is past the judgement phase', async () => {
        await web3EvmIncreaseTime(web3, 86400 * 14 + 101 /* ~ 2 weeks after end time */)

        await controller.isPledgeJudgeable(1).should.eventually.eq(false)
        await controller.isPledgeWithdrawable(1).should.eventually.eq(true)

        await controller.judgePledge(1, false, { from: accounts[1] }).should.be.rejectedWith('not judgeable')
      })

      it('but not if sender has already judged', async () => {
        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, false, { from: accounts[1] }).should.be.fulfilled
        await controller.judgePledge(1, false, { from: accounts[1] }).should.be.rejectedWith('already judged')
      })

      it('and the verdict can be positive', async () => {
        await web3EvmIncreaseTime(web3, 100)

        await controller.isPledgeJudgeable(1).should.eventually.eq(true)
        await controller.isPledgeWithdrawable(1).should.eventually.eq(false)

        await controller.judgePledge(1, true, { from: accounts[1] }).should.be.fulfilled

        // check pledge
        const p = await controller.getPledge(1)
        expect(p.numJudgements_.toNumber()).to.eq(1)
        expect(p.numFailedJudgements_.toNumber()).to.eq(0)
        await controller.getPledgeJudgement(1, accounts[1]).should.eventually.eq(1)

        // check judgement
        await controller.getNumJudgements().should.eventually.eq(1)
        const j = await controller.getJudgement(1)
        expect(j.judge_).to.eq(accounts[1])
        expect(j.pledgeId_.toNumber()).to.eq(1)
        expect(j.passed_).to.eq(true)
      })

      it('and the verdict can be negative', async () => {
        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, false, { from: accounts[2] }).should.be.fulfilled

        // check pledge
        const p = await controller.getPledge(1)
        expect(p.numJudgements_.toNumber()).to.eq(1)
        expect(p.numFailedJudgements_.toNumber()).to.eq(1)
        await controller.getPledgeJudgement(1, accounts[2]).should.eventually.eq(1)

        // check judgement
        await controller.getNumJudgements().should.eventually.eq(1)
        const j = await controller.getJudgement(1)
        expect(j.judge_).to.eq(accounts[2])
        expect(j.pledgeId_.toNumber()).to.eq(1)
        expect(j.passed_).to.eq(false)
      })

      it('and if a clear majority is not negative then the pledge has not failed', async () => {
        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, true, { from: accounts[1] }).should.be.fulfilled
        await controller.judgePledge(1, false, { from: accounts[2] }).should.be.fulfilled

        // check pledge
        const p = await controller.getPledge(1)
        expect(p.numJudgements_.toNumber()).to.eq(2)
        expect(p.numFailedJudgements_.toNumber()).to.eq(1)
        await controller.getPledgeJudgement(1, accounts[1]).should.eventually.eq(1)
        await controller.getPledgeJudgement(1, accounts[2]).should.eventually.eq(2)

        await controller.isPledgeFailed(1).should.eventually.eq(false)

        // check judgements
        await controller.getNumJudgements().should.eventually.eq(2)
        let j = await controller.getJudgement(1)
        expect(j.judge_).to.eq(accounts[1])
        expect(j.pledgeId_.toNumber()).to.eq(1)
        expect(j.passed_).to.eq(true)
        j = await controller.getJudgement(2)
        expect(j.judge_).to.eq(accounts[2])
        expect(j.pledgeId_.toNumber()).to.eq(1)
        expect(j.passed_).to.eq(false)
      })

      it('and if a clear majority is negative then the pledge has failed and the pot gets paid out', async () => {
        const initialBalance = (await controller.getPledge(1)).balance_.toNumber()

        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(1, false, { from: accounts[1] }).should.be.fulfilled
        await controller.judgePledge(1, false, { from: accounts[2] }).should.be.fulfilled

        // check pledge
        const p = await controller.getPledge(1)
        expect(p.numJudgements_.toNumber()).to.eq(2)
        expect(p.numFailedJudgements_.toNumber()).to.eq(2)
        await controller.getPledgeJudgement(1, accounts[1]).should.eventually.eq(1)
        await controller.getPledgeJudgement(1, accounts[2]).should.eventually.eq(2)

        await controller.isPledgeFailed(1).should.eventually.eq(true)

        // check judgements
        await controller.getNumJudgements().should.eventually.eq(2)
        let j = await controller.getJudgement(1)
        expect(j.judge_).to.eq(accounts[1])
        expect(j.pledgeId_.toNumber()).to.eq(1)
        expect(j.passed_).to.eq(false)
        j = await controller.getJudgement(2)
        expect(j.judge_).to.eq(accounts[2])
        expect(j.pledgeId_.toNumber()).to.eq(1)
        expect(j.passed_).to.eq(false)

        // check the balances
        expect(p.balance_.toNumber()).to.eq(0)

        const payout = initialBalance / p.numJudges_.toNumber()
        await getUserBalance(accounts[0]).should.eventually.eq(0)
        await getUserBalance(accounts[1]).should.eventually.eq(payout)
        await getUserBalance(accounts[2]).should.eventually.eq(payout)
      })

      it('and if there is just one judge then that judge gets the whole payout if pledge fails', async () => {
        const initialBalance = (await controller.getPledge(2)).balance_.toNumber()

        await web3EvmIncreaseTime(web3, 100)
        await controller.judgePledge(2, false, { from: accounts[2] }).should.be.fulfilled

        // check pledge
        const p = await controller.getPledge(2)
        expect(p.numJudgements_.toNumber()).to.eq(1)
        expect(p.numFailedJudgements_.toNumber()).to.eq(1)
        await controller.getPledgeJudgement(2, accounts[2]).should.eventually.eq(1)

        await controller.isPledgeFailed(2).should.eventually.eq(true)

        // // check judgements
        await controller.getNumJudgements().should.eventually.eq(1)
        let j = await controller.getJudgement(1)
        expect(j.judge_).to.eq(accounts[2])
        expect(j.pledgeId_.toNumber()).to.eq(2)
        expect(j.passed_).to.eq(false)

        // // check the balances
        expect(p.balance_.toNumber()).to.eq(0)

        await getUserBalance(accounts[1]).should.eventually.eq(0)
        await getUserBalance(accounts[2]).should.eventually.eq(initialBalance)
      })
    })
  })

  describe('complex balance calculations are possible, e.g', () => {
    beforeEach(async () => {
      await mintableToken.mint(gwei(5000).toNumber(), { from: accounts[0] })
      await mintableToken.mint(gwei(5000).toNumber(), { from: accounts[1] })
      await mintableToken.mint(gwei(5000).toNumber(), { from: accounts[2] })

      await mintableToken.approve(bank.address, gwei(500).toNumber(), { from: accounts[0] })
      await mintableToken.approve(bank.address, gwei(500).toNumber(), { from: accounts[1] })
      await mintableToken.approve(bank.address, gwei(500).toNumber(), { from: accounts[2] })
    })

    it('pledge 1 pass, pledge 2 fail, pledge 3 eventually fail', async () => {
      const pledgeInputs = await Promise.all([
        preparePledge({
          creator: accounts[0],
          pot: gwei(100).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[1], accounts[2]],
        }),
        preparePledge({
          creator: accounts[0],
          pot: gwei(50).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[2]],
        }),
        preparePledge({
          creator: accounts[1],
          pot: gwei(50).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[0], accounts[2]],
        }),
      ])

      // setup and get balances
      const [ pledge1Balance, pledge2Balance, pledge3Balance, ] = await setupPledgesAndGetBalances(pledgeInputs)

      // skip past end time
      await web3EvmIncreaseTime(web3, 100)
      // fail the second pledge
      await controller.judgePledge(2, false, { from: accounts[2] }).should.be.fulfilled
      // partially fail the third plege
      await controller.judgePledge(3, false, { from: accounts[0] }).should.be.fulfilled

      // now check balance
      await getUserBalance(accounts[0]).should.eventually.eq(0)
      await getUserBalance(accounts[1]).should.eventually.eq(0)
      await getUserBalance(accounts[2]).should.eventually.eq(pledge2Balance)

      // fully fail the third pledge
      await controller.judgePledge(3, false, { from: accounts[2] }).should.be.fulfilled

      // wait till withdrawable period
      await web3EvmIncreaseTime(web3, judgementPeriodSeconds)

      // now check balance
      await getUserBalance(accounts[0]).should.eventually.eq(pledge1Balance + pledge3Balance / 2)
      await getUserBalance(accounts[1]).should.eventually.eq(0)
      await getUserBalance(accounts[2]).should.eventually.eq(pledge2Balance + pledge3Balance / 2)
    })

    it('pledges 1, 4 and 6 pass, pledges 2, 3 and 5 fail', async () => {
      const pledgeInputs1 = await Promise.all([
        preparePledge({
          creator: accounts[0],
          pot: gwei(100).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[1], accounts[2]],
        }),
        preparePledge({
          creator: accounts[0],
          pot: gwei(50).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[2]],
        }),
        preparePledge({
          creator: accounts[1],
          pot: gwei(50).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[0], accounts[2]],
        }),
      ])

      const [pledge1Balance, pledge2Balance, pledge3Balance] = await setupPledgesAndGetBalances(pledgeInputs1)

      // skip past end time
      await web3EvmIncreaseTime(web3, 100)
      // fail the second pledge
      await controller.judgePledge(2, false, { from: accounts[2] }).should.be.fulfilled
      // fail the third plege
      await controller.judgePledge(3, false, { from: accounts[0] }).should.be.fulfilled
      await controller.judgePledge(3, false, { from: accounts[2] }).should.be.fulfilled

      // wait till withdrawable period
      await web3EvmIncreaseTime(web3, judgementPeriodSeconds)

      const t = await settings.getTime()
      currentTime = parseInt(t.toString())

      const pledgeInputs2 = await Promise.all([
        preparePledge({
          creator: accounts[0],
          pot: gwei(100).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[1], accounts[2]],
        }),
        preparePledge({
          creator: accounts[1],
          pot: gwei(50).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[0]],
        }),
        preparePledge({
          creator: accounts[2],
          pot: gwei(50).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[0], accounts[1]],
        }),
      ])

      const [pledge4Balance, pledge5Balance, pledge6Balance] = await setupPledgesAndGetBalances(pledgeInputs2)

      // skip past end time
      await web3EvmIncreaseTime(web3, 100)

      // fail the fifth pledge
      await controller.judgePledge(5, false, { from: accounts[0] }).should.be.fulfilled

      // now check balance
      await getUserBalance(accounts[0]).should.eventually.eq(pledge1Balance + pledge3Balance / 2 + pledge5Balance)
      await getUserBalance(accounts[1]).should.eventually.eq(0)
      await getUserBalance(accounts[2]).should.eventually.eq(pledge2Balance + pledge3Balance / 2)

      // wait till withdrawable period
      await web3EvmIncreaseTime(web3, judgementPeriodSeconds)

      // now check balances again
      await getUserBalance(accounts[0]).should.eventually.eq(pledge1Balance + pledge3Balance / 2 + pledge4Balance + pledge5Balance)
      await getUserBalance(accounts[1]).should.eventually.eq(0)
      await getUserBalance(accounts[2]).should.eventually.eq(pledge2Balance + pledge3Balance / 2 + pledge6Balance)
    })
  })

  describe('withdrawals are possible', () => {
    beforeEach(async () => {
      await mintableToken.mint(gwei(5000).toNumber(), { from: accounts[0] })
      await mintableToken.mint(gwei(5000).toNumber(), { from: accounts[1] })
      await mintableToken.mint(gwei(5000).toNumber(), { from: accounts[2] })

      await mintableToken.approve(bank.address, gwei(500).toNumber(), { from: accounts[0] })
      await mintableToken.approve(bank.address, gwei(500).toNumber(), { from: accounts[1] })
      await mintableToken.approve(bank.address, gwei(500).toNumber(), { from: accounts[2] })
    })

    it('and balances reflect updated values afterwards', async () => {
      const pledgeInputs = await Promise.all([
        preparePledge({
          creator: accounts[0],
          pot: gwei(100).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[1], accounts[2]],
        }),
        preparePledge({
          creator: accounts[0],
          pot: gwei(50).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[2]],
        }),
        preparePledge({
          creator: accounts[1],
          pot: gwei(50).toNumber(),
          endDate: currentTime + 100,
          judges: [accounts[0], accounts[2]],
        }),
      ])

      // get balances
      const [ pledge1Balance, pledge2Balance, pledge3Balance ] = await setupPledgesAndGetBalances(pledgeInputs)

      // skip past end time
      await web3EvmIncreaseTime(web3, 100)
      // fail the second pledge
      await controller.judgePledge(2, false, { from: accounts[2] }).should.be.fulfilled
      // (almost) fail the third plege
      await controller.judgePledge(3, false, { from: accounts[0] }).should.be.fulfilled

      // now check balance
      await getUserBalance(accounts[0]).should.eventually.eq(0)

      // now properly fail the third pledge
      await controller.judgePledge(3, false, { from: accounts[2] }).should.be.fulfilled

      // wait till withdrawable period
      await web3EvmIncreaseTime(web3, judgementPeriodSeconds)

      // check balances
      await getUserBalance(accounts[0]).should.eventually.eq(pledge1Balance + pledge3Balance / 2)
      await getUserBalance(accounts[1]).should.eventually.eq(0)
      await getUserBalance(accounts[2]).should.eventually.eq(pledge2Balance + pledge3Balance / 2)

      // now withdraw
      const pre1 = await getTokenBalance(accounts[0])
      await controller.withdraw({ from: accounts[0] })
      const post1 = await getTokenBalance(accounts[0])
      expect(post1 - pre1).to.eq(pledge1Balance + pledge3Balance / 2)

      // now check balances again
      await getUserBalance(accounts[0]).should.eventually.eq(0)
      await getUserBalance(accounts[1]).should.eventually.eq(0)
      await getUserBalance(accounts[2]).should.eventually.eq(pledge2Balance + pledge3Balance / 2)
    })
  })
})