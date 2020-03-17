pragma solidity >=0.6.1;

import "./IChai.sol";
import "./SafeMath.sol";
import "./IMintableToken.sol";
import "./SettingsControl.sol";
import "./Ownable.sol";

/**
 * Dev version of Chai
 */
contract DevChai is SettingsControl, IChai, Ownable {
  using SafeMath for *;

  mapping (address => uint256) private balances;

  constructor (address _settings) SettingsControl(_settings) Ownable() public {}

  // IChai

  // deposit
  function join(address dst, uint wad) public override {
    IERC20 token = settings().getPaymentUnit();

    // hold the amount for them
    token.transferFrom(dst, address(this), wad);
    // mint some "interest"
    IMintableToken(address(token)).mint(5);
    // add to their local balance
    balances[dst] = balances[dst].add(wad).add(5);
  }

  // withdraw
  function draw(address src, uint wad) override public {
    IERC20 token = settings().getPaymentUnit();

    // check balance
    require(balances[src] >= wad, 'not enough balance');
    // update balance
    balances[src] = balances[src].sub(wad);
    // give them the exact amount back.
    token.transfer(src, wad);
  }

  // get total DAI
  function dai(address usr) public override returns (uint wad) {
    return balances[usr];
  }
}
