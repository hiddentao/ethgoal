import { sha3 } from './utils/web3'
import { ADDRESS_ZERO, hdWallet } from './utils'

const TestProxy = artifacts.require("./test/TestProxy")
const ITestProxyImpl = artifacts.require("./test/ITestProxyImpl")
const TestProxyImpl1 = artifacts.require("./test/TestProxyImpl1")
const TestProxyImpl2 = artifacts.require("./test/TestProxyImpl2")

contract('Proxy', accounts => {
  let testProxy
  let testProxyImpl1
  let testProxyImpl2
  let int

  beforeEach(async () => {
    testProxyImpl1 = await TestProxyImpl1.new()
    testProxyImpl2 = await TestProxyImpl2.new()
    testProxy = await TestProxy.new(testProxyImpl1.address)
    int = await ITestProxyImpl.at(testProxy.address)
  })

  it('default implementation works', async () => {
    await testProxy.owner().should.eventually.eq(accounts[0])
    await int.getValue().should.eventually.eq(124)
  })

  it('cannot be upgraded to zero address', async () => {
    await testProxy.setImplementation(ADDRESS_ZERO).should.be.rejectedWith('implementation must be valid')
  })

  it('cannot be upgraded to same implementation again', async () => {
    await testProxy.setImplementation(testProxyImpl1.address).should.be.rejectedWith('already this implementation')
  })

  it('cannot be upgraded if not the owner', async () => {
    await testProxy.setImplementation(testProxyImpl2.address, { from: accounts[1] }).should.be.rejectedWith('Ownable: caller is not the owner')
  })

  it('can be upgraded if the owner and a new implementation', async () => {
    await testProxy.setImplementation(testProxyImpl2.address).should.be.fulfilled
    await int.getValue().should.eventually.eq(125)
  })
})
