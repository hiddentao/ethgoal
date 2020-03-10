pragma solidity >=0.6.1;

import "./IChai.sol";
import "./SafeMath.sol";
import "./IERC20.sol";
import "./IMintableToken.sol";
import "./SettingsControl.sol";
import "./Ownable.sol";

/**
 * Dev version of Chai
 */
contract DevChai is SettingsControl, IChai, Ownable, IERC20 {
  using SafeMath for *;

  mapping (address => uint256) private balances;
  uint8 public constant override decimals = 18;
  uint256 public override totalSupply;

  constructor (address _settings) SettingsControl(_settings) Ownable() public {}

  // IERC20

  function name() external view override returns (string memory) {
    return "DevChai";
  }

  function symbol() external view override returns (string memory) {
    return "DEVCHAI";
  }

  function balanceOf(address account) public view override returns (uint256) {
      return balances[account];
  }

  function transfer(address /*recipient*/, uint256 /*amount*/) public override returns (bool) {
    revert('not allowed');
  }

  function allowance(address /*owner*/, address /*spender*/) public view override returns (uint256) {
    return 0;
  }

  function approve(address /*spender*/, uint256 /*amount*/) public override returns (bool) {
    revert('not allowed');
  }

  function transferFrom(address /*sender*/, address /*recipient*/, uint256 /*amount*/) public override returns (bool) {
    revert('not allowed');
  }

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
    // check balance
    require(balances[src] >= wad, 'not enough');
    // update balance
    balances[src] = balances[src].sub(wad);
    // give them the exact amount back.
    settings().getPaymentUnit().transfer(src, wad);
  }

  // get total DAI
  function dai(address usr) public override returns (uint wad) {
    return balances[usr];
  }
}
