const { ADDRESS_ZERO, extractEventArgs } = require('./utils')
const { events } = require('../')

const IProxyImpl = artifacts.require("./IProxyImpl")
const TestProxy = artifacts.require("./test/TestProxy")
const ITestProxyImpl = artifacts.require("./test/ITestProxyImpl")
const TestProxyImpl1 = artifacts.require("./test/TestProxyImpl1")
const TestProxyImpl2 = artifacts.require("./test/TestProxyImpl2")

contract('Proxy', accounts => {
  let testProxy
  let testProxyImpl1
  let testProxyImpl2
  let proxyImpl
  let int

  beforeEach(async () => {
    testProxyImpl1 = await TestProxyImpl1.new()
    testProxyImpl2 = await TestProxyImpl2.new()
    testProxy = await TestProxy.new(testProxyImpl1.address)
    int = await ITestProxyImpl.at(testProxy.address)
    proxyImpl = await IProxyImpl.at(testProxy.address)
  })

  it('default implementation works', async () => {
    await testProxy.owner().should.eventually.eq(accounts[0])
    await int.getValue().should.eventually.eq(124)
    await proxyImpl.getImplementationVersion().should.eventually.eq('test1')
  })

  it('can have implementation frozen by owner', async () => {
    await testProxy.isImplementationFrozen().should.eventually.eq(false)
    await testProxy.freezeImplementation({ from: accounts[1] }).should.be.rejectedWith('not the owner')
    await testProxy.freezeImplementation().should.be.fulfilled
    await testProxy.isImplementationFrozen().should.eventually.eq(true)
  })

  it('cannot be upgraded to zero address', async () => {
    await testProxy.setImplementation(ADDRESS_ZERO).should.be.rejectedWith('implementation must be valid')
  })

  it('cannot be upgraded to same implementation again', async () => {
    await testProxy.setImplementation(testProxyImpl1.address).should.be.rejectedWith('already this implementation')
  })

  it('cannot be upgraded if not the owner', async () => {
    await testProxy.setImplementation(testProxyImpl2.address, { from: accounts[1] }).should.be.rejectedWith('not the owner')
  })

  it('cannot be upgraded if implementation frozen', async () => {
    await testProxy.freezeImplementation()
    await testProxy.setImplementation(testProxyImpl2.address).should.be.rejectedWith('already frozen')
  })

  it('can be upgraded if the owner and a new implementation', async () => {
    await testProxy.setImplementation(testProxyImpl2.address).should.be.fulfilled
    await int.getValue().should.eventually.eq(125)
    await proxyImpl.getImplementationVersion().should.eventually.eq('test2')
  })

  it('and emits an event', async () => {
    const ret = await testProxy.setImplementation(testProxyImpl2.address).should.be.fulfilled

    expect(extractEventArgs(ret, events.Upgraded)).to.include({
      implementation: testProxyImpl2.address,
      version: 'test2'
    })
  })
})
